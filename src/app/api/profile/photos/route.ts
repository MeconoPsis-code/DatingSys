import { db } from "@/lib/db";
import { requireAuth } from "@/lib/auth";
import { uploadFile, deleteFile } from "@/lib/storage";
import { logAudit, AUDIT_ACTIONS, getClientIp } from "@/lib/audit";
import { success, error } from "@/lib/api-response";
import { Prisma } from "@prisma/client";
import { randomUUID } from "crypto";
import sharp from "sharp";
import { buildImageProxyUrl } from "@/lib/image-proxy";
import {
  orderDraftPhotos,
  publishedPhotosToDraftPhotos,
  readProfileDraftData,
  toDraftJson,
  type DraftPhotoRecord,
} from "@/lib/profile-draft";
import { apiHandler } from "@/lib/api-handler";

const MAX_PHOTOS = 6;
const MAX_FILE_SIZE = 5 * 1024 * 1024; // 5 MB
const ALLOWED_TYPES = ["image/jpeg", "image/png", "image/webp"];

/**
 * GET /api/profile/photos
 *
 * Returns the current user's photos with signed URLs.
 */
export const GET = apiHandler(async (req) => {
  const session = await requireAuth();
  const mode = new URL(req.url).searchParams.get("mode");

  const profile = await db.profile.findUnique({
    where: { userId: session.id },
    include: { photos: { orderBy: { order: "asc" } } },
  });

  if (!profile) {
    return success({ photos: [] });
  }

  const draftData = readProfileDraftData(profile.draftData);
  const sourcePhotos =
    mode === "draft" && profile.status === "ACTIVE"
      ? (draftData.photos ??
        (draftData.deleteAllPhotos ? [] : publishedPhotosToDraftPhotos(profile.photos)))
      : publishedPhotosToDraftPhotos(profile.photos);

  // Generate per-user image proxy URLs for each photo.
  const photosWithUrls = sourcePhotos.map((p) => ({
    id: p.id,
    order: p.order,
    originalName: p.originalName,
    url: buildImageProxyUrl(p.storageKey, {
      viewerId: session.id,
      variant: "large",
    }),
    thumbUrl: buildImageProxyUrl(p.storageKey, {
      viewerId: session.id,
      variant: "thumb",
    }),
    source: p.source,
  }));

  return success({ photos: photosWithUrls });
});

/**
 * POST /api/profile/photos
 *
 * Upload a new profile photo. Accepts multipart/form-data with a single "file" field.
 * Max 6 photos per profile. Max 5MB per file. JPEG/PNG/WebP only.
 */
export const POST = apiHandler(async (req) => {
  const session = await requireAuth();
  const mode = new URL(req.url).searchParams.get("mode");

  // 1. Find or auto-create a DRAFT profile so photos can be uploaded
  //    during the profile creation flow (before the form is saved).
  let profile = await db.profile.findUnique({
    where: { userId: session.id },
    include: { photos: true },
  });

  if (!profile) {
    // Create a minimal DRAFT profile — placeholder values will be
    // overwritten when the user submits the profile form (PUT /api/profile/me).
    profile = await db.profile.create({
      data: {
        userId: session.id,
        birthDate: new Date("2000-01-01"),
        heightCm: 170,
        weightKg: 60,
        provinceCode: "000000",
        cityCode: "000000",
        attribute: "OTHER",
        status: "DRAFT",
      },
      include: { photos: true },
    });
  }

  const draftData = readProfileDraftData(profile.draftData);
  const isActiveDraftMode = mode === "draft" && profile.status === "ACTIVE";
  const currentDraftPhotos = isActiveDraftMode
    ? (draftData.photos ??
      (draftData.deleteAllPhotos ? [] : publishedPhotosToDraftPhotos(profile.photos)))
    : [];
  const currentPhotoCount = isActiveDraftMode
    ? currentDraftPhotos.length
    : profile.photos.length;

  // 2. Check photo limit
  if (currentPhotoCount >= MAX_PHOTOS) {
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

  // 5. Read file buffer and convert/compress to WebP
  let webpBuffer: Buffer;
  let webpName = file.name;
  if (webpName) {
    const lastDotIdx = webpName.lastIndexOf(".");
    if (lastDotIdx !== -1) {
      webpName = webpName.substring(0, lastDotIdx) + ".webp";
    } else {
      webpName = webpName + ".webp";
    }
  }

  try {
    const arrayBuf = await file.arrayBuffer();
    const rawBuffer = Buffer.from(arrayBuf);
    webpBuffer = await sharp(rawBuffer).webp({ quality: 80 }).toBuffer();
  } catch (err) {
    console.error("[Photo Upload] Image processing error:", err);
    return error("VALIDATION_ERROR", "照片处理失败，请确保上传有效的图片文件", 422);
  }

  // 6. Generate storage key for webp
  const key = `photos/${session.id}/${randomUUID()}.webp`;
  const mimeType = "image/webp";

  // 7. Upload to MinIO
  try {
    await uploadFile(key, webpBuffer, mimeType);
  } catch (err) {
    console.error("[Photo Upload] MinIO error:", err);
    return error("INTERNAL_ERROR", "照片上传失败，请稍后重试", 500);
  }

  // 8. Create photo record. Active-profile drafts keep photos in draftData until publish.
  const nextOrder = currentPhotoCount;
  const draftPhoto: DraftPhotoRecord = {
    id: `draft_${randomUUID()}`,
    storageKey: key,
    order: nextOrder,
    originalName: webpName || null,
    mimeType,
    sizeBytes: webpBuffer.length,
    source: "draft",
  };

  const photo = isActiveDraftMode
    ? draftPhoto
    : await db.profilePhoto.create({
        data: {
          profileId: profile.id,
          storageKey: key,
          order: nextOrder,
          originalName: webpName || null,
          mimeType: mimeType,
          sizeBytes: webpBuffer.length,
        },
      });

  if (isActiveDraftMode) {
    await db.profile.update({
      where: { id: profile.id },
      data: {
        draftData: toDraftJson({
          ...draftData,
          photos: orderDraftPhotos([...currentDraftPhotos, draftPhoto]),
          deleteAllPhotos: false,
        }),
      },
    });
  }

  // 9. Audit log
  await logAudit({
    actorId: session.id,
    action: AUDIT_ACTIONS.PROFILE_UPDATE,
    targetType: "ProfilePhoto",
    targetId: photo.id,
    metadata: {
      action: isActiveDraftMode ? "draft_upload" : "upload",
      key,
    } as Prisma.InputJsonValue,
    ip: getClientIp(req),
    userAgent: req.headers.get("user-agent"),
  });

  // 10. Return photo with signed URL
  const url = buildImageProxyUrl(key, {
    viewerId: session.id,
    variant: "large",
  });

  return success({
    photo: {
      id: photo.id,
      order: photo.order,
      originalName: photo.originalName,
      url,
      thumbUrl: buildImageProxyUrl(key, {
        viewerId: session.id,
        variant: "thumb",
      }),
      source: isActiveDraftMode ? "draft" : "published",
    },
  });
});

/**
 * DELETE /api/profile/photos
 *
 * Delete a photo by id. Expects JSON body: { photoId: string }
 */
export const DELETE = apiHandler(async (req) => {
  const session = await requireAuth();
  const mode = new URL(req.url).searchParams.get("mode");

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

  if (mode === "draft") {
    const profile = await db.profile.findUnique({
      where: { userId: session.id },
      include: { photos: { orderBy: { order: "asc" } } },
    });

    if (profile?.status === "ACTIVE") {
      const draftData = readProfileDraftData(profile.draftData);
      const currentDraftPhotos =
        draftData.photos ??
        (draftData.deleteAllPhotos ? [] : publishedPhotosToDraftPhotos(profile.photos));
      const photo = currentDraftPhotos.find((p) => p.id === photoId);

      if (!photo) {
        return error("NOT_FOUND", "ç…§ç‰‡ä¸å­˜åœ¨", 404);
      }

      if (photo.source === "draft") {
        try {
          await deleteFile(photo.storageKey);
        } catch (err) {
          console.error("[Photo Delete] Draft MinIO error:", err);
        }
      }

      const remaining = orderDraftPhotos(
        currentDraftPhotos.filter((p) => p.id !== photoId)
      );
      await db.profile.update({
        where: { id: profile.id },
        data: {
          draftData: toDraftJson({
            ...draftData,
            photos: remaining,
            deleteAllPhotos: remaining.length === 0,
          }),
        },
      });

      await logAudit({
        actorId: session.id,
        action: AUDIT_ACTIONS.PROFILE_UPDATE,
        targetType: "ProfilePhoto",
        targetId: photoId,
        metadata: {
          action: "draft_delete",
          key: photo.storageKey,
        } as Prisma.InputJsonValue,
        ip: getClientIp(req),
        userAgent: req.headers.get("user-agent"),
      });

      return success({ message: "ç…§ç‰‡å·²åˆ é™¤" });
    }
  }

  // 1. Find photo and verify ownership
  const photo = await db.profilePhoto.findUnique({
    where: { id: photoId },
    include: { profile: true },
  });

  if (!photo || photo.profile.userId !== session.id) {
    return error("NOT_FOUND", "照片不存在", 404);
  }

  // 1b. Block deletion if profile is ACTIVE — must go through publish or clear
  if (photo.profile.status === "ACTIVE") {
    return error(
      "FORBIDDEN",
      "已发布的资料不能直接删除照片。请通过「发布资料」或「清空资料」来修改。",
      403
    );
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
});
