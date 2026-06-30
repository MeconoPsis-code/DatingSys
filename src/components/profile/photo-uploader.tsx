"use client";

import { useState, useRef, useCallback } from "react";
import { PhotoLightbox } from "./photo-lightbox";

interface PhotoItem {
  id: string;
  order: number;
  originalName: string | null;
  url: string;
}

interface PhotoUploaderProps {
  photos: PhotoItem[];
  onPhotosChange: (photos: PhotoItem[]) => void;
  maxPhotos?: number;
  readOnly?: boolean;
  mode?: "published" | "draft";
}

const MAX_FILE_SIZE = 5 * 1024 * 1024; // 5MB
const ALLOWED_TYPES = ["image/jpeg", "image/png", "image/webp"];

/**
 * Photo upload component — supports up to 6 photos.
 * Displays a grid of thumbnails with upload/delete functionality.
 * Requires user consent before the first upload.
 */
export function PhotoUploader({
  photos,
  onPhotosChange,
  maxPhotos = 6,
  readOnly = false,
  mode = "published",
}: PhotoUploaderProps) {
  const fileRef = useRef<HTMLInputElement>(null);
  const [uploading, setUploading] = useState(false);
  const [uploadProgress, setUploadProgress] = useState<{ done: number; total: number } | null>(null);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [lightboxIdx, setLightboxIdx] = useState<number | null>(null);

  // Consent gate: skip if user already has photos (they've previously consented)
  const [hasConsented, setHasConsented] = useState(photos.length > 0);
  const [showConsentModal, setShowConsentModal] = useState(false);

  const canUpload = photos.length < maxPhotos && !uploading && !readOnly;
  const endpoint = mode === "draft" ? "/api/profile/photos?mode=draft" : "/api/profile/photos";

  function handleUploadClick() {
    if (!hasConsented) {
      setShowConsentModal(true);
      return;
    }
    fileRef.current?.click();
  }

  function handleConsentAgree() {
    setHasConsented(true);
    setShowConsentModal(false);
    // Trigger file picker after consent
    setTimeout(() => fileRef.current?.click(), 100);
  }

  const handleFileSelect = useCallback(
    async (e: React.ChangeEvent<HTMLInputElement>) => {
      const selectedFiles = Array.from(e.target.files ?? []);
      if (selectedFiles.length === 0) return;

      // Reset input so same file can be re-selected
      e.target.value = "";

      const remainingSlots = maxPhotos - photos.length;
      if (remainingSlots <= 0) {
        setError(`最多上传 ${maxPhotos} 张照片`);
        return;
      }

      const filesToUpload: File[] = [];
      const skippedMessages: string[] = [];
      let skippedForLimit = 0;

      for (const file of selectedFiles) {
        if (!ALLOWED_TYPES.includes(file.type)) {
          skippedMessages.push(`${file.name || "未命名照片"} 格式不支持`);
          continue;
        }

        if (file.size > MAX_FILE_SIZE) {
          skippedMessages.push(`${file.name || "未命名照片"} 超过 5MB`);
          continue;
        }

        if (filesToUpload.length >= remainingSlots) {
          skippedForLimit++;
          continue;
        }

        filesToUpload.push(file);
      }

      if (skippedForLimit > 0) {
        skippedMessages.push(`已达到最多 ${maxPhotos} 张，跳过 ${skippedForLimit} 张`);
      }

      if (filesToUpload.length === 0) {
        setError(skippedMessages.join("；") || "请选择有效的照片");
        return;
      }

      setError(null);
      setUploading(true);
      setUploadProgress({ done: 0, total: filesToUpload.length });

      let nextPhotos = [...photos];
      const failedMessages: string[] = [];
      let processedCount = 0;

      try {
        for (const file of filesToUpload) {
          try {
            const formData = new FormData();
            formData.append("file", file);

            const res = await fetch(endpoint, {
              method: "POST",
              body: formData,
            });

            const data = await res.json();

            if (!res.ok) {
              throw new Error(data.error?.message || "上传失败");
            }

            const newPhoto = data.data.photo as PhotoItem;
            nextPhotos = [...nextPhotos, newPhoto];
            onPhotosChange(nextPhotos);
          } catch (err) {
            const message = err instanceof Error ? err.message : "上传失败";
            failedMessages.push(`${file.name || "未命名照片"}：${message}`);
          } finally {
            processedCount++;
            setUploadProgress({ done: processedCount, total: filesToUpload.length });
          }
        }

        const resultMessages = [
          ...skippedMessages,
          ...(failedMessages.length > 0 ? [`${failedMessages.length} 张上传失败：${failedMessages.join("；")}`] : []),
        ];
        setError(resultMessages.length > 0 ? resultMessages.join("；") : null);
      } finally {
        setUploading(false);
        setUploadProgress(null);
      }
    },
    [endpoint, maxPhotos, photos, onPhotosChange]
  );

  const handleDelete = useCallback(
    async (photoId: string) => {
      setDeletingId(photoId);
      setError(null);

      try {
        const res = await fetch(endpoint, {
          method: "DELETE",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ photoId }),
        });

        if (!res.ok) {
          const data = await res.json();
          throw new Error(data.error?.message || "删除失败");
        }

        onPhotosChange(photos.filter((p) => p.id !== photoId));
      } catch (err) {
        setError(err instanceof Error ? err.message : "删除失败");
      } finally {
        setDeletingId(null);
      }
    },
    [endpoint, photos, onPhotosChange]
  );

  return (
    <div className="space-y-3">
      {/* Error message */}
      {error && (
        <div className="rounded-lg border border-[hsl(0,62%,50%/0.3)] bg-[hsl(0,62%,50%/0.1)] px-3 py-2 text-xs text-[hsl(0,62%,70%)]">
          {error}
        </div>
      )}

      {/* Photo grid */}
      <div className="grid grid-cols-3 gap-3">
        {/* Existing photos */}
        {photos.map((photo) => (
          <div
            key={photo.id}
            className="group relative aspect-[4/3] overflow-hidden rounded-xl border border-[hsl(var(--border))] bg-[hsl(var(--secondary))]"
          >
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={photo.url}
              alt={photo.originalName || "照片"}
              onClick={() => setLightboxIdx(photos.findIndex((p) => p.id === photo.id))}
              className="h-full w-full object-cover transition-transform group-hover:scale-105 cursor-pointer"
            />

            {/* Order badge */}
            <div className="absolute left-2 top-2 flex h-6 w-6 items-center justify-center rounded-full bg-black/60 text-xs font-bold text-white">
              {photo.order + 1}
            </div>

            {/* Delete button — hidden when readOnly (ACTIVE profile) */}
            {!readOnly && (
            <button
              type="button"
              onClick={() => handleDelete(photo.id)}
              disabled={deletingId === photo.id}
              className="absolute right-2 top-2 flex h-7 w-7 items-center justify-center rounded-full bg-black/60 text-white opacity-0 backdrop-blur-sm transition-all hover:bg-[hsl(var(--destructive))] group-hover:opacity-100 disabled:opacity-50"
            >
              {deletingId === photo.id ? (
                <span className="h-3.5 w-3.5 animate-spin rounded-full border-2 border-white border-t-transparent" />
              ) : (
                <svg
                  className="h-4 w-4"
                  fill="none"
                  stroke="currentColor"
                  viewBox="0 0 24 24"
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={2}
                    d="M6 18L18 6M6 6l12 12"
                  />
                </svg>
              )}
            </button>
            )}

            {/* Hover overlay */}
            <div className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/60 to-transparent p-2 opacity-0 transition-opacity group-hover:opacity-100">
              <p className="truncate text-xs text-white/80">
                {photo.originalName || `照片 ${photo.order + 1}`}
              </p>
            </div>
          </div>
        ))}

        {/* Upload button */}
        {canUpload && (
          <button
            type="button"
            onClick={handleUploadClick}
            disabled={uploading}
            className="group flex aspect-[4/3] flex-col items-center justify-center gap-2 rounded-xl border-2 border-dashed border-[hsl(var(--border))] bg-[hsl(var(--secondary)/0.5)] text-[hsl(var(--muted-foreground))] transition-all hover:border-[hsl(var(--primary)/0.5)] hover:bg-[hsl(var(--primary)/0.05)] hover:text-[hsl(var(--primary))] disabled:opacity-50"
          >
            {uploading ? (
              <>
                <span className="h-8 w-8 animate-spin rounded-full border-2 border-current border-t-transparent" />
                <span className="text-xs">
                  {uploadProgress ? `上传 ${uploadProgress.done}/${uploadProgress.total}...` : "上传中..."}
                </span>
              </>
            ) : (
              <>
                <svg
                  className="h-8 w-8 transition-transform group-hover:scale-110"
                  fill="none"
                  stroke="currentColor"
                  viewBox="0 0 24 24"
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={1.5}
                    d="M12 4v16m8-8H4"
                  />
                </svg>
                <span className="text-xs font-medium">添加照片</span>
                <span className="text-[10px] opacity-60">
                  {photos.length}/{maxPhotos}
                </span>
              </>
            )}
          </button>
        )}
      </div>

      {/* Info text */}
      <p className="text-xs text-[hsl(var(--muted-foreground))]">
        支持一次选择多张 JPEG、PNG、WebP，单张不超过 5MB，最多 {maxPhotos} 张
      </p>

      {/* Hidden file input */}
      <input
        ref={fileRef}
        type="file"
        accept="image/jpeg,image/png,image/webp"
        multiple
        onChange={handleFileSelect}
        className="hidden"
      />

      {/* ─── Photo Consent Modal ─── */}
      {showConsentModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
          <div className="w-full max-w-md rounded-2xl border border-[hsl(var(--border))] bg-[hsl(var(--card))] shadow-xl max-h-[85vh] flex flex-col">
            {/* Header */}
            <div className="flex items-center gap-2 px-6 pt-6 pb-4">
              <svg viewBox="0 0 24 24" className="h-5 w-5 shrink-0 fill-none stroke-current stroke-2 stroke-linecap-round stroke-linejoin-round text-brand-blue">
                <path d="M14.5 4h-5L7 7H4a2 2 0 0 0-2 2v9a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2V9a2 2 0 0 0-2-2h-3l-2.5-3z" />
                <circle cx="12" cy="13" r="3" />
              </svg>
              <h3 className="text-base font-semibold text-[hsl(var(--foreground))]">
                照片上传须知
              </h3>
            </div>

            {/* Scrollable content */}
            <div className="flex-1 overflow-y-auto px-6 pb-2">
              <p className="mb-4 text-sm text-[hsl(var(--muted-foreground))]">
                上传照片前，请先了解以下几点：
              </p>

              {/* Section 1 */}
              <div className="mb-4 rounded-xl border border-[hsl(var(--border))] bg-[hsl(var(--secondary)/0.3)] p-4">
                <h4 className="mb-2 flex items-center gap-2 text-sm font-semibold text-[hsl(var(--foreground))]">
                  <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-brand-blue/15 text-[11px] font-bold text-brand-blue">1</span>
                  上传即视为同意接受评分
                </h4>
                <div className="space-y-1.5 pl-7 text-xs leading-relaxed text-[hsl(var(--muted-foreground))]">
                  <p>我们会从五个维度（轮廓、皮肤、五官、造型、眼缘）进行评估。</p>
                  <p>评分将展示在你的资料卡上。</p>
                  <p className="rounded-lg bg-amber-500/10 px-3 py-2 text-amber-600 dark:text-amber-400">
                    如果你不想被评分，请勿上传照片，仍可使用基础匹配功能。
                  </p>
                </div>
              </div>

              {/* Section 2 */}
              <div className="mb-4 rounded-xl border border-[hsl(var(--border))] bg-[hsl(var(--secondary)/0.3)] p-4">
                <h4 className="mb-2 flex items-center gap-2 text-sm font-semibold text-[hsl(var(--foreground))]">
                  <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-brand-blue/15 text-[11px] font-bold text-brand-blue">2</span>
                  照片要求
                </h4>
                <p className="mb-2 pl-7 text-xs text-[hsl(var(--muted-foreground))]">
                  为了顺利通过审核，请确保：
                </p>
                <ul className="space-y-1.5 pl-7 text-xs leading-relaxed text-[hsl(var(--muted-foreground))]">
                  <li className="flex gap-2"><span className="mt-px shrink-0 text-brand-blue">·</span><span>本人正脸，面部清晰可见，无墨镜、口罩或大面积阴影遮挡</span></li>
                  <li className="flex gap-2"><span className="mt-px shrink-0 text-brand-blue">·</span><span>单人照，无多人同框</span></li>
                  <li className="flex gap-2"><span className="mt-px shrink-0 text-brand-blue">·</span><span>真实照片，非AI生成、非翻拍、非网图</span></li>
                  <li className="flex gap-2"><span className="mt-px shrink-0 text-brand-blue">·</span><span>不过度修图或滤镜过重，保留真实肤质和五官细节</span></li>
                  <li className="flex gap-2"><span className="mt-px shrink-0 text-brand-blue">·</span><span>光线自然，不逆光、不过暗</span></li>
                  <li className="flex gap-2"><span className="mt-px shrink-0 text-brand-blue">·</span><span>内容合规，不涉及色情、暴力、政治敏感等违规内容</span></li>
                </ul>
              </div>

              {/* Section 3 */}
              <div className="mb-4 rounded-xl border border-[hsl(var(--border))] bg-[hsl(var(--secondary)/0.3)] p-4">
                <h4 className="mb-2 flex items-center gap-2 text-sm font-semibold text-[hsl(var(--foreground))]">
                  <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-brand-blue/15 text-[11px] font-bold text-brand-blue">3</span>
                  评分是为了帮你找到更合适的匹配视角
                </h4>
                <div className="space-y-1.5 pl-7 text-xs leading-relaxed text-[hsl(var(--muted-foreground))]">
                  <p>分数不是定义，只是看待魅力的其中一个角度。</p>
                  <p>我们相信每个人都有自己独特的吸引力。</p>
                </div>
              </div>
            </div>

            {/* Buttons */}
            <div className="flex gap-3 px-6 pb-6 pt-3 border-t border-[hsl(var(--border))]">
              <button
                type="button"
                onClick={() => setShowConsentModal(false)}
                className="flex-1 rounded-lg border border-[hsl(var(--border))] py-2.5 text-sm font-medium text-[hsl(var(--foreground))] transition-colors hover:bg-[hsl(var(--secondary))]"
              >
                取消
              </button>
              <button
                type="button"
                onClick={handleConsentAgree}
                className="flex-1 rounded-lg bg-brand-blue py-2.5 text-sm font-semibold text-white transition-all hover:bg-brand-blue/90"
              >
                我已了解，继续上传
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Photo Lightbox for raw viewing */}
      {lightboxIdx !== null && (
        <PhotoLightbox
          photos={photos}
          initialIndex={lightboxIdx}
          onClose={() => setLightboxIdx(null)}
        />
      )}
    </div>
  );
}
