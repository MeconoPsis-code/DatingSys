import { db } from "@/lib/db";
import { requireAuth } from "@/lib/auth";
import { uploadFile, deleteFile, getSignedUrl } from "@/lib/storage";
import { logAudit, AUDIT_ACTIONS, getClientIp } from "@/lib/audit";
import { success, error } from "@/lib/api-response";
import { Prisma } from "@prisma/client";
import { randomUUID } from "crypto";

const MAX_PHOTOS = 6;
const MAX_FILE_SIZE = 5 * 1024 * 1024; // 5 MB
const ALLOWED_TYPES = ["image/jpeg", "image/png", "image/webp"];

/**
 * GET /api/profile/photos
 *
 * Returns the current user's photos with signed URLs.
 */
export async function GET() {
  const session = await requireAuth();

  const profile = await db.profile.findUnique({
    where: { userId: session.id },
    include: { photos: { orderBy: { order: "asc" } } },
  });

  if (!profile) {
    return success({ photos: [] });
  }

  // Generate signed URLs for each photo
  const photosWithUrls = await Promise.all(
    profile.photos.map(async (p) => ({
      id: p.id,
      order: p.order,
      originalName: p.originalName,
      url: await getSignedUrl(p.storageKey, 3600),
    }))
  );

  return success({ photos: photosWithUrls });
}

/**
 * POST /api/profile/photos
 *
 * Upload a new profile photo. Accepts multipart/form-data with a single "file" field.
 * Max 6 photos per profile. Max 5MB per file. JPEG/PNG/WebP only.
 */
export async function POST(req: Request) {
  const session = await requireAuth();

  // 1. Must have a profile
  const profile = await db.profile.findUnique({
    where: { userId: session.id },
    include: { photos: true },
  });

  if (!profile) {
    return error("NOT_FOUND", "请先创建资料再上传照片", 404);
  }

  // 2. Check photo limit
  if (profile.photos.length >= MAX_PHOTOS) {
    return error("LIMIT_EXCEEDED", `最多上传 ${MAX_PHOTOS} 张照片`, 400);
  }

  // 3. Parse form data
  let formData: FormData;
  try {
    formData = await req.formData();
  } catch {
    return error("VALIDATION_ERROR", "无效的上传数据", 422);
  }

  const file = formData.get("file");
  if (!file || !(file instanceof File)) {
    return error("VALIDATION_ERROR", "请选择要上传的照片", 422);
  }

  // 4. Validate file
  if (!ALLOWED_TYPES.includes(file.type)) {
    return error("VALIDATION_ERROR", "仅支持 JPEG、PNG、WebP 格式", 422);
  }

  if (file.size > MAX_FILE_SIZE) {
    return error("VALIDATION_ERROR", "照片大小不能超过 5MB", 422);
  }

  // 5. Read file buffer
  const arrayBuf = await file.arrayBuffer();
  const buffer = Buffer.from(arrayBuf);

  // 6. Generate storage key
  const ext = file.type.split("/")[1] === "jpeg" ? "jpg" : file.type.split("/")[1];
  const key = `photos/${session.id}/${randomUUID()}.${ext}`;

  // 7. Upload to MinIO
  try {
    await uploadFile(key, buffer, file.type);
  } catch (err) {
    console.error("[Photo Upload] MinIO error:", err);
    return error("INTERNAL_ERROR", "照片上传失败，请稍后重试", 500);
  }

  // 8. Create DB record
  const nextOrder = profile.photos.length;
  const photo = await db.profilePhoto.create({
    data: {
      profileId: profile.id,
      storageKey: key,
      order: nextOrder,
      originalName: file.name || null,
      mimeType: file.type,
      sizeBytes: file.size,
    },
  });

  // 9. Audit log
  await logAudit({
    actorId: session.id,
    action: AUDIT_ACTIONS.PROFILE_UPDATE,
    targetType: "ProfilePhoto",
    targetId: photo.id,
    metadata: { action: "upload", key } as Prisma.InputJsonValue,
    ip: getClientIp(req),
    userAgent: req.headers.get("user-agent"),
  });

  // 10. Return photo with signed URL
  const url = await getSignedUrl(key, 3600);

  return success({
    photo: {
      id: photo.id,
      order: photo.order,
      originalName: photo.originalName,
      url,
    },
  });
}

/**
 * DELETE /api/profile/photos
 *
 * Delete a photo by id. Expects JSON body: { photoId: string }
 */
export async function DELETE(req: Request) {
  const session = await requireAuth();

  let body;
  try {
    body = await req.json();
  } catch {
    return error("VALIDATION_ERROR", "无效的请求体", 422);
  }

  const { photoId } = body as { photoId?: string };
  if (!photoId) {
    return error("VALIDATION_ERROR", "缺少 photoId", 422);
  }

  // 1. Find photo and verify ownership
  const photo = await db.profilePhoto.findUnique({
    where: { id: photoId },
    include: { profile: true },
  });

  if (!photo || photo.profile.userId !== session.id) {
    return error("NOT_FOUND", "照片不存在", 404);
  }

  // 2. Delete from MinIO
  try {
    await deleteFile(photo.storageKey);
  } catch (err) {
    console.error("[Photo Delete] MinIO error:", err);
    // Continue even if MinIO delete fails — we still remove the DB record
  }

  // 3. Delete DB record
  await db.profilePhoto.delete({ where: { id: photoId } });

  // 4. Re-order remaining photos
  const remaining = await db.profilePhoto.findMany({
    where: { profileId: photo.profileId },
    orderBy: { order: "asc" },
  });

  await db.$transaction(
    remaining.map((p, idx) =>
      db.profilePhoto.update({ where: { id: p.id }, data: { order: idx } })
    )
  );

  // 5. Audit log
  await logAudit({
    actorId: session.id,
    action: AUDIT_ACTIONS.PROFILE_UPDATE,
    targetType: "ProfilePhoto",
    targetId: photoId,
    metadata: { action: "delete", key: photo.storageKey } as Prisma.InputJsonValue,
    ip: getClientIp(req),
    userAgent: req.headers.get("user-agent"),
  });

  return success({ message: "照片已删除" });
}
