import { db } from "@/lib/db";
import { requireAuth } from "@/lib/auth";
import { uploadFile, deleteFile, StorageOperationError } from "@/lib/storage";
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
import {
  acquireImageProcessingSlot,
  IMAGE_PROCESSING_TIMEOUT_SECONDS,
  ImageProcessingUnavailableError,
  MAX_IMAGE_INPUT_PIXELS,
  MAX_IMAGE_OUTPUT_EDGE,
} from "@/lib/image-processing";

const MAX_PHOTOS = 6;
const MAX_FILE_SIZE = 5 * 1024 * 1024; // 5 MB
const MAX_MULTIPART_BODY_SIZE = 6 * 1024 * 1024; // file plus multipart metadata
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
  const contentLength = Number(req.headers.get("content-length"));

  // Reject clearly oversized requests before formData() buffers the multipart
  // body in the Node.js process.
  if (Number.isFinite(contentLength) && contentLength > MAX_MULTIPART_BODY_SIZE) {
    return error("PAYLOAD_TOO_LARGE", "照片大小不能超过 5MB", 413);
  }

  // Serialize the complete mutation, not only Sharp. This protects the photo
  // count/order and keeps multipart/output buffers bounded through storage.
  let releaseImageProcessing: () => void;
  try {
    releaseImageProcessing = await acquireImageProcessingSlot(req.signal);
  } catch (err) {
    if (!(err instanceof ImageProcessingUnavailableError)) throw err;
    const response = error(err.code, "图片处理服务繁忙，请稍后重试", 503);
    response.headers.set("Retry-After", "2");
    return response;
  }

  const key = `photos/${session.id}/${randomUUID()}.webp`;
  const mimeType = "image/webp";
  let formData: FormData | null = null;
  let file: File | null = null;
  let webpBuffer: Buffer | null = null;
  let webpName = "";
  let webpSizeBytes = 0;
  let objectUploaded = false;
  let storageReferenced = false;

  const cleanupUnreferencedUpload = async (force = false) => {
    if (storageReferenced || (!force && !objectUploaded)) return;

    if (!force) {
      try {
        // A lost DB response is commit-ambiguous. Re-read both published and
        // draft references before deleting; on verification failure, retain an
        // orphan rather than break a possibly committed profile reference.
        const [publishedReference, profileReference] = await Promise.all([
          db.profilePhoto.findFirst({
            where: { storageKey: key },
            select: { id: true },
          }),
          db.profile.findUnique({
            where: { userId: session.id },
            select: { draftData: true },
          }),
        ]);
        const persistedDraft = readProfileDraftData(profileReference?.draftData);
        const draftReference = persistedDraft.photos?.some(
          (photo) => photo.storageKey === key
        );

        if (publishedReference || draftReference) {
          storageReferenced = true;
          return;
        }
      } catch (referenceCheckError) {
        console.error(
          "[Photo Upload] Unable to verify storage references; retaining object:",
          referenceCheckError
        );
        return;
      }
    }

    try {
      await deleteFile(key);
      objectUploaded = false;
    } catch (cleanupError) {
      console.error("[Photo Upload] Failed to remove unreferenced object:", cleanupError);
    }
  };

  try {
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

    // 3. Parse and transform while retaining the mutation lease.
    try {
      formData = await req.formData();
    } catch {
      return error("VALIDATION_ERROR", "无效的上传数据", 422);
    }

    const uploadedFile = formData.get("file");
    if (!uploadedFile || !(uploadedFile instanceof File)) {
      return error("VALIDATION_ERROR", "请选择要上传的照片", 422);
    }
    file = uploadedFile;

    if (!ALLOWED_TYPES.includes(file.type)) {
      return error("VALIDATION_ERROR", "仅支持 JPEG、PNG、WebP 格式", 422);
    }

    if (file.size > MAX_FILE_SIZE) {
      return error("VALIDATION_ERROR", "照片大小不能超过 5MB", 422);
    }

    webpName = file.name;
    if (webpName) {
      const lastDotIdx = webpName.lastIndexOf(".");
      webpName =
        lastDotIdx !== -1
          ? `${webpName.substring(0, lastDotIdx)}.webp`
          : `${webpName}.webp`;
    }

    try {
      // Buffer.from(ArrayBuffer) is a zero-copy view over the uploaded bytes.
      const rawBuffer = Buffer.from(await file.arrayBuffer());
      webpBuffer = await sharp(rawBuffer, {
        failOn: "error",
        limitInputPixels: MAX_IMAGE_INPUT_PIXELS,
        sequentialRead: true,
      })
        .rotate()
        .resize({
          width: MAX_IMAGE_OUTPUT_EDGE,
          height: MAX_IMAGE_OUTPUT_EDGE,
          fit: "inside",
          withoutEnlargement: true,
        })
        .timeout({ seconds: IMAGE_PROCESSING_TIMEOUT_SECONDS })
        .webp({ quality: 80 })
        .toBuffer();
    } catch (err) {
      console.error("[Photo Upload] Image processing error:", err);
      return error(
        "VALIDATION_ERROR",
        "照片处理失败，请确认上传的是有效且尺寸合理的图片",
        422
      );
    }

    // The original multipart objects are no longer needed after conversion.
    // Drop them explicitly, but keep the shared lease while the output Buffer
    // is still owned by the MinIO request.
    formData = null;
    file = null;

    // Storage has a hard deadline and follows client aborts. The image lease
    // remains held until putObject settles so output buffers cannot accumulate.
    try {
      await uploadFile(key, webpBuffer, mimeType, undefined, {
        signal: req.signal,
      });
      objectUploaded = true;
    } catch (err) {
      console.error("[Photo Upload] MinIO error:", err);
      // A timeout can race with the server committing the object. The key is
      // unique and has no DB reference yet, so deletion is always safe here.
      await cleanupUnreferencedUpload(true);
      if (err instanceof StorageOperationError) {
        const response = error(err.code, "图片存储暂时不可用，请稍后重试", 503);
        response.headers.set("Retry-After", "2");
        return response;
      }
      return error("INTERNAL_ERROR", "照片上传失败，请稍后重试", 500);
    }

    webpSizeBytes = webpBuffer.length;
    webpBuffer = null;

    // 4. Create photo record. Active-profile drafts keep photos in draftData until publish.
    const nextOrder = currentPhotoCount;
    const draftPhoto: DraftPhotoRecord = {
      id: `draft_${randomUUID()}`,
      storageKey: key,
      order: nextOrder,
      originalName: webpName || null,
      mimeType,
      sizeBytes: webpSizeBytes,
      source: "draft",
    };

    let photo: { id: string; order: number; originalName: string | null };
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
      photo = draftPhoto;
      storageReferenced = true;
    } else {
      photo = await db.profilePhoto.create({
        data: {
          profileId: profile.id,
          storageKey: key,
          order: nextOrder,
          originalName: webpName || null,
          mimeType,
          sizeBytes: webpSizeBytes,
        },
      });
      storageReferenced = true;
    }

    // The storage object and DB/draft reference are now consistent. Release
    // the mutation lease before non-critical audit/response work; finally is
    // intentionally a second, idempotent safety net.
    releaseImageProcessing();

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
  } catch (err) {
    // Compensate only while no DB/draft reference was established.
    await cleanupUnreferencedUpload();
    throw err;
  } finally {
    formData = null;
    file = null;
    webpBuffer = null;
    releaseImageProcessing();
  }
});

/**
 * DELETE /api/profile/photos
 *
 * Delete a photo by id. Expects JSON body: { photoId: string }
 */
export const DELETE = apiHandler(async (req) => {
  const session = await requireAuth();

  let releasePhotoMutation: () => void;
  try {
    releasePhotoMutation = await acquireImageProcessingSlot(req.signal);
  } catch (err) {
    if (!(err instanceof ImageProcessingUnavailableError)) throw err;
    const response = error(err.code, "照片服务繁忙，请稍后重试", 503);
    response.headers.set("Retry-After", "2");
    return response;
  }

  try {
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
          return error("NOT_FOUND", "照片不存在", 404);
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

        return success({ message: "照片已删除" });
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
  } finally {
    releasePhotoMutation();
  }
});
