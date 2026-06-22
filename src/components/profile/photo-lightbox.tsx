"use client";

import { useState, useEffect } from "react";

interface LightboxPhoto {
  id: string;
  url: string;
  order: number;
  originalName?: string | null;
}

interface PhotoLightboxProps {
  photos: LightboxPhoto[];
  initialIndex: number;
  onClose: () => void;
}

export function PhotoLightbox({ photos, initialIndex, onClose }: PhotoLightboxProps) {
  const [idx, setIdx] = useState(initialIndex);
  const photo = photos[idx];

  useEffect(() => {
    function handleKey(e: KeyboardEvent) {
      if (e.key === "Escape") onClose();
      if (e.key === "ArrowLeft" && idx > 0) setIdx(idx - 1);
      if (e.key === "ArrowRight" && idx < photos.length - 1) setIdx(idx + 1);
    }
    window.addEventListener("keydown", handleKey);
    return () => window.removeEventListener("keydown", handleKey);
  }, [idx, photos.length, onClose]);

  if (!photo) return null;

  return (
    <div
      className="fixed inset-0 z-50 flex flex-col items-center justify-center bg-black/85 p-4 backdrop-blur-sm"
      onClick={onClose}
    >
      <div
        className="relative max-h-[85vh] max-w-[90vw]"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Close button */}
        <button
          type="button"
          onClick={onClose}
          className="absolute -right-2 -top-12 z-10 flex h-9 w-9 items-center justify-center rounded-full bg-white/10 text-white shadow-lg backdrop-blur-sm transition-all hover:bg-white/20 hover:scale-105 active:scale-95"
          aria-label="关闭"
        >
          <svg className="h-5 w-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M6 18L18 6M6 6l12 12" />
          </svg>
        </button>

        {/* Uncropped raw photo */}
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src={photo.url}
          alt={photo.originalName || `照片 ${photo.order + 1}`}
          className="max-h-[80vh] max-w-[90vw] rounded-2xl object-contain shadow-2xl border border-white/10"
        />

        {/* Navigation arrows */}
        {photos.length > 1 && (
          <div className="absolute inset-y-0 -left-6 -right-6 flex items-center justify-between pointer-events-none">
            <button
              type="button"
              disabled={idx <= 0}
              onClick={() => setIdx(idx - 1)}
              className="pointer-events-auto flex h-10 w-10 items-center justify-center rounded-full bg-white/10 text-white shadow-lg backdrop-blur-sm transition-all hover:bg-white/20 hover:scale-105 active:scale-95 disabled:opacity-20 disabled:scale-100 disabled:pointer-events-none"
              aria-label="上一张"
            >
              <svg className="h-6 w-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M15 19l-7-7 7-7" />
              </svg>
            </button>
            <button
              type="button"
              disabled={idx >= photos.length - 1}
              onClick={() => setIdx(idx + 1)}
              className="pointer-events-auto flex h-10 w-10 items-center justify-center rounded-full bg-white/10 text-white shadow-lg backdrop-blur-sm transition-all hover:bg-white/20 hover:scale-105 active:scale-95 disabled:opacity-20 disabled:scale-100 disabled:pointer-events-none"
              aria-label="下一张"
            >
              <svg className="h-6 w-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M9 5l7 7-7 7" />
              </svg>
            </button>
          </div>
        )}
      </div>

      {/* Info and Counter */}
      <div className="mt-4 flex flex-col items-center gap-1 select-none pointer-events-none">
        {photo.originalName && (
          <span className="text-xs text-white/60 truncate max-w-xs">
            {photo.originalName}
          </span>
        )}
        <span className="rounded-full bg-white/10 px-3 py-1 text-xs font-medium text-white/80 backdrop-blur-sm">
          {idx + 1} / {photos.length}
        </span>
      </div>
    </div>
  );
}
