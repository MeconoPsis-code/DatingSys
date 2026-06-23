import { randomUUID } from "crypto";
import sharp from "sharp";
import { deleteFile, getSignedUrl, uploadFile } from "@/lib/storage";

export const MAX_REPORT_EVIDENCE_FILES = 6;
export const MAX_REPORT_EVIDENCE_FILE_SIZE = 5 * 1024 * 1024; // 5MB
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

export async function getReportEvidenceUrls(value: unknown): Promise<ReportEvidenceItem[]> {
  const keys = parseReportEvidenceKeys(value);
  const items = await Promise.all(
    keys.map(async (key) => {
      try {
        return { key, url: await getSignedUrl(key, 3600) };
      } catch {
        return null;
      }
    }),
  );

  return items.filter((item): item is ReportEvidenceItem => item !== null);
}

export async function deleteReportEvidence(keys: string[]): Promise<void> {
  await Promise.all(keys.map((key) => deleteFile(key).catch(() => {})));
}

export async function uploadReportEvidenceFiles(
  files: File[],
  reporterId: string,
): Promise<string[]> {
  if (files.length > MAX_REPORT_EVIDENCE_FILES) {
    throw new ReportEvidenceError(
      "TOO_MANY_EVIDENCE_FILES",
      `最多上传 ${MAX_REPORT_EVIDENCE_FILES} 张证据图片`,
    );
  }

  const uploadedKeys: string[] = [];

  try {
    for (const file of files) {
      if (!REPORT_EVIDENCE_ALLOWED_TYPES.includes(file.type)) {
        throw new ReportEvidenceError(
          "INVALID_EVIDENCE_TYPE",
          "证据图片仅支持 JPEG、PNG、WebP 格式",
        );
      }

      if (file.size > MAX_REPORT_EVIDENCE_FILE_SIZE) {
        throw new ReportEvidenceError(
          "EVIDENCE_TOO_LARGE",
          "单张证据图片不能超过 5MB",
        );
      }

      let webpBuffer: Buffer;
      try {
        const rawBuffer = Buffer.from(await file.arrayBuffer());
        webpBuffer = await sharp(rawBuffer)
          .rotate()
          .resize({
            width: 1920,
            height: 1920,
            fit: "inside",
            withoutEnlargement: true,
          })
          .webp({ quality: 82 })
          .toBuffer();
      } catch {
        throw new ReportEvidenceError(
          "EVIDENCE_PROCESSING_FAILED",
          "证据图片处理失败，请确认上传的是有效图片",
        );
      }

      const key = `reports/${reporterId}/${randomUUID()}.webp`;
      try {
        await uploadFile(key, webpBuffer, "image/webp");
      } catch {
        throw new ReportEvidenceError(
          "EVIDENCE_UPLOAD_FAILED",
          "证据图片上传失败，请稍后重试",
          500,
        );
      }
      uploadedKeys.push(key);
    }
  } catch (err) {
    await deleteReportEvidence(uploadedKeys);

    if (err instanceof ReportEvidenceError) throw err;
    throw err;
  }

  return uploadedKeys;
}
