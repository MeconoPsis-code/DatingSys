export const PHOTO_REPORT_REASONS = [
  "非本人",
  "多人同框",
  "过度 P 图",
  "照片模糊",
  "遮挡五官",
  "非正脸",
  "非真实照片",
  "内容违规",
] as const;

export type PhotoReportReason = (typeof PHOTO_REPORT_REASONS)[number];

export function isPhotoReportReason(value: string): value is PhotoReportReason {
  return (PHOTO_REPORT_REASONS as readonly string[]).includes(value);
}
