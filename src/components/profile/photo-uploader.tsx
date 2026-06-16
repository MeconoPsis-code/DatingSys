"use client";

import { useState, useRef, useCallback } from "react";

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
}: PhotoUploaderProps) {
  const fileRef = useRef<HTMLInputElement>(null);
  const [uploading, setUploading] = useState(false);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  // Consent gate: skip if user already has photos (they've previously consented)
  const [hasConsented, setHasConsented] = useState(photos.length > 0);
  const [showConsentModal, setShowConsentModal] = useState(false);

  const canUpload = photos.length < maxPhotos && !uploading;

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
      const file = e.target.files?.[0];
      if (!file) return;

      // Reset input so same file can be re-selected
      e.target.value = "";

      // Client-side validation
      if (!ALLOWED_TYPES.includes(file.type)) {
        setError("仅支持 JPEG、PNG、WebP 格式");
        return;
      }
      if (file.size > MAX_FILE_SIZE) {
        setError("照片大小不能超过 5MB");
        return;
      }

      setError(null);
      setUploading(true);

      try {
        const formData = new FormData();
        formData.append("file", file);

        const res = await fetch("/api/profile/photos", {
          method: "POST",
          body: formData,
        });

        const data = await res.json();

        if (!res.ok) {
          throw new Error(data.error?.message || "上传失败");
        }

        const newPhoto = data.data.photo as PhotoItem;
        onPhotosChange([...photos, newPhoto]);
      } catch (err) {
        setError(err instanceof Error ? err.message : "上传失败");
      } finally {
        setUploading(false);
      }
    },
    [photos, onPhotosChange]
  );

  const handleDelete = useCallback(
    async (photoId: string) => {
      setDeletingId(photoId);
      setError(null);

      try {
        const res = await fetch("/api/profile/photos", {
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
    [photos, onPhotosChange]
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
            className="group relative aspect-[3/4] overflow-hidden rounded-xl border border-[hsl(var(--border))] bg-[hsl(var(--secondary))]"
          >
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={photo.url}
              alt={photo.originalName || "照片"}
              className="h-full w-full object-cover transition-transform group-hover:scale-105"
            />

            {/* Order badge */}
            <div className="absolute left-2 top-2 flex h-6 w-6 items-center justify-center rounded-full bg-black/60 text-xs font-bold text-white">
              {photo.order + 1}
            </div>

            {/* Delete button */}
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
            className="group flex aspect-[3/4] flex-col items-center justify-center gap-2 rounded-xl border-2 border-dashed border-[hsl(var(--border))] bg-[hsl(var(--secondary)/0.5)] text-[hsl(var(--muted-foreground))] transition-all hover:border-[hsl(var(--primary)/0.5)] hover:bg-[hsl(var(--primary)/0.05)] hover:text-[hsl(var(--primary))] disabled:opacity-50"
          >
            {uploading ? (
              <>
                <span className="h-8 w-8 animate-spin rounded-full border-2 border-current border-t-transparent" />
                <span className="text-xs">上传中...</span>
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
        支持 JPEG、PNG、WebP，单张不超过 5MB，最多 {maxPhotos} 张
      </p>

      {/* Hidden file input */}
      <input
        ref={fileRef}
        type="file"
        accept="image/jpeg,image/png,image/webp"
        onChange={handleFileSelect}
        className="hidden"
      />

      {/* ─── Photo Consent Modal ─── */}
      {showConsentModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
          <div className="w-full max-w-sm rounded-2xl border border-[hsl(var(--border))] bg-[hsl(var(--card))] p-6 shadow-xl">
            <div className="mb-4 flex items-center gap-2">
              <svg viewBox="0 0 24 24" className="h-5 w-5 shrink-0 fill-none stroke-current stroke-2 stroke-linecap-round stroke-linejoin-round text-amber-400">
                <path d="M10.29 3.86 1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z" />
                <line x1="12" y1="9" x2="12" y2="13" />
                <line x1="12" y1="17" x2="12.01" y2="17" />
              </svg>
              <h3 className="text-base font-semibold text-[hsl(var(--foreground))]">
                照片上传须知
              </h3>
            </div>

            <div className="mb-5 space-y-3 text-sm text-[hsl(var(--muted-foreground))]">
              <p>在上传照片前，请确认你了解并同意以下事项：</p>
              <ul className="space-y-2 pl-1">
                <li className="flex gap-2">
                  <span className="mt-0.5 shrink-0 text-brand-blue">•</span>
                  <span>你的照片将对群内的<strong className="text-[hsl(var(--foreground))]">其他用户可见</strong>，可能出现在匹配结果中</span>
                </li>
                <li className="flex gap-2">
                  <span className="mt-0.5 shrink-0 text-brand-blue">•</span>
                  <span>你的照片将由<strong className="text-[hsl(var(--foreground))]">评分官进行评分</strong>，评分结果将影响匹配排序</span>
                </li>
                <li className="flex gap-2">
                  <span className="mt-0.5 shrink-0 text-brand-blue">•</span>
                  <span>你可以随时在个人资料中<strong className="text-[hsl(var(--foreground))]">删除已上传的照片</strong></span>
                </li>
              </ul>
            </div>

            <div className="flex gap-3">
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
    </div>
  );
}
