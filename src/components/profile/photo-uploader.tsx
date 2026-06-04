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

  const canUpload = photos.length < maxPhotos && !uploading;

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
            onClick={() => fileRef.current?.click()}
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
    </div>
  );
}
