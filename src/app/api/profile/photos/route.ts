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
import { notify } from "@/lib/notifications";
import {
  enqueueRatingTaskPhotos,
  getRatingTaskQueueAssignment,
  removePhotoFromRatingTasks,
} from "@/lib/rating-task-queue";
import type { ScoringTaskTimeline } from "@/lib/scoring";
import { lockRatingUserTasks } from "@/lib/rating-profile-sync";
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
    const profile = await db.$transaction(async (tx) => {
      await lockRatingUserTasks(tx, session.id);
      const existingProfile = await tx.profile.findUnique({
        where: { userId: session.id },
        include: { photos: true },
      });
      if (existingProfile) return existingProfile;

      // Create a minimal DRAFT profile — placeholder values will be
      // overwritten when the user submits the profile form (PUT /api/profile/me).
      return tx.profile.create({
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
    });

    const draftData = readProfileDraftData(profile.draftData);
    const initialActiveDraftMode = mode === "draft" && profile.status === "ACTIVE";
    const currentDraftPhotos = initialActiveDraftMode
      ? (draftData.photos ??
        (draftData.deleteAllPhotos ? [] : publishedPhotosToDraftPhotos(profile.photos)))
      : [];
    const currentPhotoCount = initialActiveDraftMode
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

    // 4. Persist the upload and enqueue it for scoring atomically. The upload
    // window, rather than a later profile-publish action, owns the batch.
    const uploadedAt = new Date();
    const nextOrder = currentPhotoCount;
    const draftPhoto: DraftPhotoRecord = {
      id: `draft_${randomUUID()}`,
      storageKey: key,
      order: nextOrder,
      originalName: webpName || null,
      mimeType,
      sizeBytes: webpSizeBytes,
      uploadedAt: uploadedAt.toISOString(),
      source: "draft",
    };

    const assignment = await getRatingTaskQueueAssignment({
      ratedUserId: session.id,
      queuedAt: uploadedAt,
    });

    const persisted = await db.$transaction(async (tx) => {
      await lockRatingUserTasks(tx, session.id);
      const currentProfile = await tx.profile.findUnique({
        where: { id: profile.id },
        include: { photos: true },
      });
      if (!currentProfile || currentProfile.userId !== session.id) {
        throw new Error("Profile disappeared while persisting a photo upload");
      }

      // Re-read the mutable draft only after acquiring the user lock. A slow
      // storage upload must not overwrite a draft that was discarded or edited
      // while the object was being processed.
      const currentProfileDraft = readProfileDraftData(currentProfile.draftData);
      const activeDraftMode = mode === "draft" && currentProfile.status === "ACTIVE";
      const lockedDraftPhotos = activeDraftMode
        ? (currentProfileDraft.photos ??
          (currentProfileDraft.deleteAllPhotos
            ? []
            : publishedPhotosToDraftPhotos(currentProfile.photos)))
        : [];
      const lockedPhotoCount = activeDraftMode
        ? lockedDraftPhotos.length
        : currentProfile.photos.length;
      if (lockedPhotoCount >= MAX_PHOTOS) {
        return { outcome: "limit" as const };
      }

      const persistedDraftPhoto: DraftPhotoRecord = {
        ...draftPhoto,
        order: lockedPhotoCount,
      };

      if (activeDraftMode) {
        await tx.profile.update({
          where: { id: currentProfile.id },
          data: {
            draftData: toDraftJson({
              ...currentProfileDraft,
              photos: orderDraftPhotos([...lockedDraftPhotos, persistedDraftPhoto]),
              deleteAllPhotos: false,
            }),
          },
        });
        const queueResult = await enqueueRatingTaskPhotos(tx, {
          ratedUserId: session.id,
          photoObjectKeys: [key],
          assignment,
          taskCreatedAt: uploadedAt,
        });
        return {
          outcome: "persisted" as const,
          activeDraftMode,
          photo: persistedDraftPhoto,
          queueResult,
        };
      }

      const createdPhoto = await tx.profilePhoto.create({
        data: {
          profileId: currentProfile.id,
          storageKey: key,
          order: lockedPhotoCount,
          originalName: webpName || null,
          mimeType,
          sizeBytes: webpSizeBytes,
          createdAt: uploadedAt,
        },
      });
      const queueResult = await enqueueRatingTaskPhotos(tx, {
        ratedUserId: session.id,
        photoObjectKeys: [key],
        assignment,
        taskCreatedAt: uploadedAt,
      });
      return {
        outcome: "persisted" as const,
        activeDraftMode,
        photo: createdPhoto,
        queueResult,
      };
    });

    if (persisted.outcome === "limit") {
      await cleanupUnreferencedUpload(true);
      return error("LIMIT_EXCEEDED", `最多上传 ${MAX_PHOTOS} 张照片`, 400);
    }
    const { activeDraftMode, photo, queueResult } = persisted;
    const queuedTask: { id: string; createdAt: Date } = queueResult.task;
    const queuedTimeline: ScoringTaskTimeline = assignment.timeline;
    const queueChanged = queueResult.created || queueResult.reset;
    storageReferenced = true;

    // The storage object and DB/draft reference are now consistent. Release
    // the mutation lease before non-critical audit/response work; finally is
    // intentionally a second, idempotent safety net.
    releaseImageProcessing();

    if (queueChanged && queuedTask && queuedTimeline) {
      const queueAhead = await db.ratingTask.count({
        where: {
          status: { in: ["PENDING", "SCORING"] },
          ratedUserId: { not: session.id },
          createdAt: { lt: queuedTask.createdAt },
        },
      });
      await notify.scoringQueued(session.id, queueAhead, queuedTimeline);
    }

    // 9. Audit log
    await logAudit({
      actorId: session.id,
      action: AUDIT_ACTIONS.PROFILE_UPDATE,
      targetType: "ProfilePhoto",
      targetId: photo.id,
      metadata: {
        action: activeDraftMode ? "draft_upload" : "upload",
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
        source: activeDraftMode ? "draft" : "published",
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
      const draftDeletion = await db.$transaction(async (tx) => {
        await lockRatingUserTasks(tx, session.id);
        const profile = await tx.profile.findUnique({
          where: { userId: session.id },
          include: { photos: { orderBy: { order: "asc" } } },
        });
        if (!profile || profile.status !== "ACTIVE") {
          return { outcome: "not_active" as const };
        }

        const draftData = readProfileDraftData(profile.draftData);
        const currentDraftPhotos =
          draftData.photos ??
          (draftData.deleteAllPhotos ? [] : publishedPhotosToDraftPhotos(profile.photos));
        const photo = currentDraftPhotos.find((candidate) => candidate.id === photoId);
        if (!photo) {
          return { outcome: "not_found" as const };
        }

        const remaining = orderDraftPhotos(
          currentDraftPhotos.filter((candidate) => candidate.id !== photoId)
        );
        await tx.profile.update({
          where: { id: profile.id },
          data: {
            draftData: toDraftJson({
              ...draftData,
              photos: remaining,
              deleteAllPhotos: remaining.length === 0,
            }),
          },
        });
        if (photo.source === "draft") {
          await removePhotoFromRatingTasks(tx, {
            ratedUserId: session.id,
            storageKey: photo.storageKey,
          });
        }

        return { outcome: "deleted" as const, photo };
      });

      if (draftDeletion.outcome === "not_found") {
        return error("NOT_FOUND", "照片不存在", 404);
      }
      if (draftDeletion.outcome === "deleted") {
        const { photo } = draftDeletion;
        if (photo.source === "draft") {
          try {
            await deleteFile(photo.storageKey);
          } catch (err) {
            console.error("[Photo Delete] Draft MinIO error:", err);
          }
        }

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

    // Validate and mutate under the same per-user advisory lock used by uploads,
    // profile clearing, and task queue changes. This prevents a stale pre-lock
    // lookup from deleting a newly published photo or a newly queued task.
    const deletion = await db.$transaction(async (tx) => {
      await lockRatingUserTasks(tx, session.id);

      const photo = await tx.profilePhoto.findUnique({
        where: { id: photoId },
        include: { profile: true },
      });
      if (!photo || photo.profile.userId !== session.id) {
        return { outcome: "not_found" as const };
      }
      if (photo.profile.status === "ACTIVE") {
        return { outcome: "active" as const };
      }

      await tx.profilePhoto.delete({ where: { id: photoId } });

      const remaining = await tx.profilePhoto.findMany({
        where: { profileId: photo.profileId },
        orderBy: { order: "asc" },
      });
      for (const [index, remainingPhoto] of remaining.entries()) {
        if (remainingPhoto.order === index) continue;
        await tx.profilePhoto.update({
          where: { id: remainingPhoto.id },
          data: { order: index },
        });
      }

      await removePhotoFromRatingTasks(tx, {
        ratedUserId: session.id,
        storageKey: photo.storageKey,
      });

      if (remaining.length === 0) {
        await tx.ratingTask.deleteMany({ where: { ratedUserId: session.id } });
        await tx.ratingProfile.deleteMany({ where: { userId: session.id } });
      }

      return {
        outcome: "deleted" as const,
        storageKey: photo.storageKey,
      };
    });

    if (deletion.outcome === "not_found") {
      return error("NOT_FOUND", "照片不存在", 404);
    }
    if (deletion.outcome === "active") {
      return error(
        "FORBIDDEN",
        "已发布的资料不能直接删除照片。请通过「发布资料」或「清空资料」来修改。",
        403
      );
    }

    // The database is authoritative. Remove the now-unreferenced object only
    // after the transaction commits so storage failure cannot break a live row.
    try {
      await deleteFile(deletion.storageKey);
    } catch (err) {
      console.error("[Photo Delete] MinIO error:", err);
    }

    // 5. Audit log
    await logAudit({
      actorId: session.id,
      action: AUDIT_ACTIONS.PROFILE_UPDATE,
      targetType: "ProfilePhoto",
      targetId: photoId,
      metadata: {
        action: "delete",
        key: deletion.storageKey,
      } as Prisma.InputJsonValue,
      ip: getClientIp(req),
      userAgent: req.headers.get("user-agent"),
    });

    return success({ message: "照片已删除" });
  } finally {
    releasePhotoMutation();
  }
});
