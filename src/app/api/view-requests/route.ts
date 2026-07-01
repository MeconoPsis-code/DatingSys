import { requireAuth } from '@/lib/auth';
import { db } from '@/lib/db';
import { success, error, paginated } from '@/lib/api-response';
import { notify } from '@/lib/notifications';
import { getMaskedIdentity } from '@/lib/pseudonymous-identity';

const REJECTION_COOLDOWN_MS = 7 * 24 * 60 * 60 * 1000; // 7 days

/**
 * POST /api/view-requests — Send a view request
 */
export async function POST(req: Request) {
  try {
    const session = await requireAuth();
    const body = await req.json();
    const { targetUserId, message } = body;
    const normalizedTargetUserId =
      typeof targetUserId === 'string' ? targetUserId.trim() : '';

    // Validate targetUserId is provided
    if (!normalizedTargetUserId) {
      return error('VALIDATION', '缺少目标用户ID', 400);
    }

    // Cannot request self
    if (normalizedTargetUserId === session.id) {
      return error('VALIDATION', '不能向自己发送查看申请', 400);
    }

    // Check active requests in both directions. Approval is mutual, and
    // a pending incoming request should be handled rather than duplicated.
    const activeRequests = await db.viewRequest.findMany({
      where: {
        status: { in: ['PENDING', 'APPROVED'] },
        OR: [
          { requesterId: session.id, targetUserId: normalizedTargetUserId },
          { requesterId: normalizedTargetUserId, targetUserId: session.id },
        ],
      },
      orderBy: { createdAt: 'desc' },
    });
    const activeRequest =
      activeRequests.find((request) => request.status === 'APPROVED') ??
      activeRequests.find((request) => request.status === 'PENDING');
    if (activeRequest?.status === 'APPROVED') {
      return error('ALREADY_APPROVED', '你们已经可以互相查看资料', 400);
    }
    if (activeRequest?.status === 'PENDING') {
      if (activeRequest.requesterId === session.id) {
        return error('DUPLICATE', '已有待处理的查看申请', 400);
      }
      return error('INCOMING_PENDING', '对方已向你发起申请，请前往「收到的申请」处理', 400);
    }

    // 7-day cooldown after rejection
    const lastRejected = await db.viewRequest.findFirst({
      where: {
        requesterId: session.id,
        targetUserId: normalizedTargetUserId,
        status: 'REJECTED',
      },
      orderBy: { respondedAt: 'desc' },
    });

    if (lastRejected?.respondedAt) {
      const cooldownEnd = lastRejected.respondedAt.getTime() + REJECTION_COOLDOWN_MS;
      if (Date.now() < cooldownEnd) {
        const daysLeft = Math.ceil((cooldownEnd - Date.now()) / (1000 * 60 * 60 * 24));
        return error('COOLDOWN', `被拒绝后需等待 ${daysLeft} 天才能再次申请`, 400);
      }
    }

    // Verify the target user exists and has an active profile
    const targetUser = await db.user.findUnique({
      where: { id: normalizedTargetUserId },
      include: { profile: { select: { status: true } } },
    });

    if (!targetUser || targetUser.status === 'DELETED') {
      return error('NOT_FOUND', '目标用户不存在', 404);
    }

    if (!targetUser.profile || targetUser.profile.status !== 'ACTIVE') {
      return error('INVALID_TARGET', '目标用户资料未激活', 400);
    }

    // Create ViewRequest
    const request = await db.viewRequest.create({
      data: {
        requesterId: session.id,
        targetUserId: normalizedTargetUserId,
        message: message || null,
        expiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000), // 7 days
      },
    });

    await notify.viewRequestReceived(
      normalizedTargetUserId,
      getMaskedIdentity(session.id).name
    );

    return success(request, 201);
  } catch (err) {
    if (err && typeof err === 'object' && 'code' in err) throw err;
    return error('INTERNAL', '发送查看申请失败', 500);
  }
}

/**
 * GET /api/view-requests — List view requests
 * Query: ?type=incoming|outgoing&status=pending|all&page=1&pageSize=20
 */
export async function GET(req: Request) {
  try {
    const session = await requireAuth();
    const { searchParams } = new URL(req.url);

    const type = searchParams.get('type') || 'incoming';
    const status = searchParams.get('status') || 'all';
    const page = Math.max(1, parseInt(searchParams.get('page') || '1', 10));
    const pageSize = Math.min(50, Math.max(1, parseInt(searchParams.get('pageSize') || '20', 10)));

    // Build where clause
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const where: Record<string, any> = {};

    if (type === 'outgoing') {
      where.requesterId = session.id;
    } else {
      // Default to incoming
      where.targetUserId = session.id;
    }

    if (status === 'pending') {
      where.status = 'PENDING';
    }

    // Count total
    const total = await db.viewRequest.count({ where });

    // Query with pagination
    const requests = await db.viewRequest.findMany({
      where,
      include: {
        requester: {
          include: {
            authIdentities: { select: { nickname: true }, take: 1 },
            profile: {
              select: {
                birthDate: true,
                heightCm: true,
                weightKg: true,
                provinceCode: true,
                cityCode: true,
                attribute: true,
                customAttribute: true,
                mbti: true,
                selfIntro: true,
              },
            },
          },
        },
        target: {
          include: {
            authIdentities: { select: { nickname: true }, take: 1 },
          },
        },
      },
      orderBy: { createdAt: 'desc' },
      skip: (page - 1) * pageSize,
      take: pageSize,
    });

    // Map results
    const mapped = requests.map((r) => {
      const identityUnlocked = r.status === 'APPROVED';

      return {
        id: r.id,
        requesterId: r.requesterId,
        targetUserId: r.targetUserId,
        status: r.status,
        message: r.message,
        respondedAt: r.respondedAt,
        expiresAt: r.expiresAt,
        createdAt: r.createdAt,
        updatedAt: r.updatedAt,
        requesterNickname: identityUnlocked
          ? (r.requester.authIdentities[0]?.nickname ?? null)
          : null,
        requesterQQ: identityUnlocked ? (r.requester.qqNumber ?? null) : null,
        targetNickname: identityUnlocked
          ? (r.target.authIdentities[0]?.nickname ?? null)
          : null,
        targetQQ: identityUnlocked ? (r.target.qqNumber ?? null) : null,
        // Include requester profile summary for incoming requests (so target can see who's asking)
        ...(type === 'incoming' && r.requester.profile ? {
          requesterProfile: {
            age: Math.floor((Date.now() - new Date(r.requester.profile.birthDate).getTime()) / (365.25 * 24 * 60 * 60 * 1000)),
            heightCm: r.requester.profile.heightCm,
            weightKg: r.requester.profile.weightKg,
            provinceCode: r.requester.profile.provinceCode,
            cityCode: r.requester.profile.cityCode,
            attribute: r.requester.profile.attribute,
            customAttribute: r.requester.profile.customAttribute,
            mbti: r.requester.profile.mbti,
          },
        } : {}),
      };
    });

    return paginated(mapped, total, page, pageSize);
  } catch (err) {
    if (err && typeof err === 'object' && 'code' in err) throw err;
    return error('INTERNAL', '获取查看申请列表失败', 500);
  }
}
