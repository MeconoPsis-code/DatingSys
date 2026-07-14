import { randomUUID } from "crypto";
import sharp from "sharp";
import { buildImageProxyUrl } from "@/lib/image-proxy";
import { deleteFile, StorageOperationError, uploadFile } from "@/lib/storage";
import {
  acquireImageProcessingSlot,
  IMAGE_PROCESSING_TIMEOUT_SECONDS,
  ImageProcessingUnavailableError,
  MAX_IMAGE_INPUT_PIXELS,
  MAX_IMAGE_OUTPUT_EDGE,
} from "@/lib/image-processing";

export const MAX_REPORT_EVIDENCE_FILES = 6;
export const MAX_REPORT_EVIDENCE_FILE_SIZE = 5 * 1024 * 1024; // 5MB
export const MAX_REPORT_EVIDENCE_BODY_SIZE =
  MAX_REPORT_EVIDENCE_FILES * MAX_REPORT_EVIDENCE_FILE_SIZE + 2 * 1024 * 1024;
export const REPORT_EVIDENCE_ALLOWED_TYPES = ["image/jpeg", "image/png", "image/webp"];

export interface ReportEvidenceItem {
  key: string;
  url: string;
}

export class ReportEvidenceError extends Error {
  code: string;
  status: number;

  constructor(code: string, message: string, status = 422) {
    super(message);
    this.name = "ReportEvidenceError";
    this.code = code;
    this.status = status;
  }
}

export function parseReportEvidenceKeys(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return value.filter((key): key is string => typeof key === "string" && key.length > 0);
}

export async function getReportEvidenceUrls(
  value: unknown,
  viewerId: string
): Promise<ReportEvidenceItem[]> {
  const keys = parseReportEvidenceKeys(value);
  return keys.map((key) => ({
    key,
    url: buildImageProxyUrl(key, {
      viewerId,
      variant: "large",
    }),
  }));
}

export async function deleteReportEvidence(keys: string[]): Promise<void> {
  await Promise.all(keys.map((key) => deleteFile(key).catch(() => {})));
}

export interface ReportEvidenceUploadOptions {
  signal?: AbortSignal;
  /**
   * Used when the route acquired the shared slot before parsing multipart data.
   * Limiter releases are idempotent, so the route may also keep a finally guard.
   */
  releaseHeldImageProcessingSlot?: () => void;
}

export async function uploadReportEvidenceFiles(
  files: File[],
  reporterId: string,
  options: ReportEvidenceUploadOptions = {}
): Promise<string[]> {
  const { signal } = options;
  const processedFiles: Buffer[] = [];
  const uploadedKeys: string[] = [];
  let releaseImageProcessing = options.releaseHeldImageProcessingSlot;

  try {
    if (files.length > MAX_REPORT_EVIDENCE_FILES) {
      throw new ReportEvidenceError(
        "TOO_MANY_EVIDENCE_FILES",
        `最多上传 ${MAX_REPORT_EVIDENCE_FILES} 张证据图片`
      );
    }

    for (const file of files) {
      if (!REPORT_EVIDENCE_ALLOWED_TYPES.includes(file.type)) {
        throw new ReportEvidenceError(
          "INVALID_EVIDENCE_TYPE",
          "证据图片仅支持 JPEG、PNG、WebP 格式"
        );
      }

      if (file.size > MAX_REPORT_EVIDENCE_FILE_SIZE) {
        throw new ReportEvidenceError("EVIDENCE_TOO_LARGE", "单张证据图片不能超过 5MB");
      }
    }

    if (files.length > 0 && !releaseImageProcessing) {
      try {
        releaseImageProcessing = await acquireImageProcessingSlot(signal);
      } catch (err) {
        if (err instanceof ImageProcessingUnavailableError) {
          throw new ReportEvidenceError(err.code, "图片处理服务繁忙，请稍后重试", 503);
        }
        throw err;
      }
    }

    // Convert the complete multipart batch while holding one shared slot.
    for (const file of files) {
      try {
        // Buffer.from(ArrayBuffer) does not copy the uploaded bytes.
        const rawBuffer = Buffer.from(await file.arrayBuffer());
        processedFiles.push(
          await sharp(rawBuffer, {
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
            .webp({ quality: 82 })
            .toBuffer()
        );
      } catch {
        throw new ReportEvidenceError(
          "EVIDENCE_PROCESSING_FAILED",
          "证据图片处理失败，请确认上传的是有效图片"
        );
      }
    }

    // The caller no longer needs the original File objects after conversion,
    // but the lease remains held while the WebP output buffers upload.
    files.length = 0;

    while (processedFiles.length > 0) {
      const webpBuffer = processedFiles.shift();
      if (!webpBuffer) break;
      const key = `reports/${reporterId}/${randomUUID()}.webp`;
      // Register the unique key before putObject. A timeout may mean MinIO
      // committed the object but the client never received the response.
      uploadedKeys.push(key);
      try {
        await uploadFile(key, webpBuffer, "image/webp", undefined, { signal });
      } catch (err) {
        if (err instanceof StorageOperationError) {
          throw new ReportEvidenceError(err.code, "图片存储暂时不可用，请稍后重试", 503);
        }
        throw new ReportEvidenceError(
          "EVIDENCE_UPLOAD_FAILED",
          "证据图片上传失败，请稍后重试",
          500
        );
      }
    }

    return uploadedKeys;
  } catch (err) {
    // Keep the lease through failure cleanup as well. Otherwise another image
    // batch could enter while this request still owns output/storage buffers.
    await deleteReportEvidence(uploadedKeys);

    if (err instanceof ReportEvidenceError) throw err;
    throw err;
  } finally {
    files.length = 0;
    processedFiles.length = 0;
    releaseImageProcessing?.();
  }
}
