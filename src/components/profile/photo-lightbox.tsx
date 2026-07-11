"use client";

import { useCallback, useEffect, useState } from "react";

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

const MIN_SCALE = 0.5;
const MAX_SCALE = 3;
const SCALE_STEP = 0.25;

function clampScale(scale: number): number {
  return Math.min(MAX_SCALE, Math.max(MIN_SCALE, scale));
}

function ControlButton({
  label,
  disabled = false,
  onClick,
  children,
}: {
  label: string;
  disabled?: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      aria-label={label}
      title={label}
      disabled={disabled}
      onClick={onClick}
      className="flex h-10 min-w-10 items-center justify-center rounded-xl border border-white/10 bg-white/10 px-2 text-white shadow-sm backdrop-blur-sm transition-all hover:bg-white/20 active:scale-95 disabled:cursor-not-allowed disabled:opacity-30 disabled:active:scale-100"
    >
      {children}
    </button>
  );
}

export function PhotoLightbox({ photos, initialIndex, onClose }: PhotoLightboxProps) {
  const [idx, setIdx] = useState(initialIndex);
  const [scale, setScale] = useState(1);
  const [rotation, setRotation] = useState(0);
  const [loadedPhotoId, setLoadedPhotoId] = useState<string | null>(null);
  const [failedPhotoId, setFailedPhotoId] = useState<string | null>(null);
  const photo = photos[idx];
  const imageFailed = photo ? failedPhotoId === photo.id : false;
  const imageLoading = photo
    ? loadedPhotoId !== photo.id && !imageFailed
    : false;

  const resetTransform = useCallback(() => {
    setScale(1);
    setRotation(0);
  }, []);

  const showPhoto = useCallback((nextIndex: number) => {
    setIdx(nextIndex);
    resetTransform();
  }, [resetTransform]);

  const zoomBy = useCallback((delta: number) => {
    setScale((current) => clampScale(current + delta));
  }, []);

  useEffect(() => {
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";

    function handleKey(event: KeyboardEvent) {
      if (event.key === "Escape") onClose();
      if (event.key === "ArrowLeft" && idx > 0) showPhoto(idx - 1);
      if (event.key === "ArrowRight" && idx < photos.length - 1) showPhoto(idx + 1);
      if (event.key === "+" || event.key === "=") zoomBy(SCALE_STEP);
      if (event.key === "-") zoomBy(-SCALE_STEP);
      if (event.key === "0") resetTransform();
    }

    window.addEventListener("keydown", handleKey);
    return () => {
      window.removeEventListener("keydown", handleKey);
      document.body.style.overflow = previousOverflow;
    };
  }, [idx, photos.length, onClose, resetTransform, showPhoto, zoomBy]);

  if (!photo) return null;

  return (
    <div
      data-testid="photo-lightbox"
      role="dialog"
      aria-modal="true"
      aria-label="照片详情"
      className="fixed inset-0 z-50 bg-black/90 p-2 backdrop-blur-sm sm:p-4"
      onClick={onClose}
    >
      <div
        className="mx-auto flex h-full w-full max-w-7xl flex-col gap-2"
        onClick={(event) => event.stopPropagation()}
      >
        <header className="flex min-h-11 shrink-0 items-center justify-between gap-3 px-1 text-white">
          <div className="min-w-0">
            <p className="truncate text-sm font-medium text-white/90">
              {photo.originalName || `照片 ${photo.order + 1}`}
            </p>
            <p className="text-xs text-white/55">
              {idx + 1} / {photos.length}
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-white/10 text-white shadow-lg backdrop-blur-sm transition-all hover:bg-white/20 active:scale-95"
            aria-label="关闭"
          >
            <svg className="h-5 w-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </header>

        <div
          className="relative min-h-0 flex-1 overflow-hidden rounded-2xl bg-black/30"
          aria-busy={imageLoading}
        >
          <div className="absolute inset-0 overflow-auto overscroll-contain">
            <div className="flex min-h-full min-w-full items-center justify-center p-3 sm:p-6">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                key={photo.id}
                data-testid="photo-lightbox-image"
                src={photo.url}
                alt={photo.originalName || `照片 ${photo.order + 1}`}
                draggable={false}
                onLoad={() => {
                  setLoadedPhotoId(photo.id);
                  setFailedPhotoId(null);
                }}
                onError={() => {
                  setLoadedPhotoId(null);
                  setFailedPhotoId(photo.id);
                }}
                onDoubleClick={() => setScale((current) => (current === 1 ? 2 : 1))}
                className={`max-h-full max-w-full select-none rounded-xl border border-white/10 object-contain shadow-2xl transition-[transform,opacity] duration-200 ${
                  imageLoading || imageFailed ? "opacity-0" : "opacity-100"
                }`}
                style={{ transform: `rotate(${rotation}deg) scale(${scale})` }}
              />
            </div>
          </div>

          {imageLoading ? (
            <div
              data-testid="photo-loading-indicator"
              role="status"
              aria-live="polite"
              className="pointer-events-none absolute inset-0 z-10 flex flex-col items-center justify-center gap-3 text-white"
            >
              <span className="h-11 w-11 animate-spin rounded-full border-4 border-white/25 border-t-white" />
              <span className="rounded-full bg-black/45 px-3 py-1.5 text-sm font-medium backdrop-blur-sm">
                照片加载中...
              </span>
            </div>
          ) : null}

          {imageFailed ? (
            <div
              role="alert"
              className="pointer-events-none absolute inset-0 z-10 flex flex-col items-center justify-center gap-2 px-6 text-center text-white"
            >
              <span className="text-3xl">!</span>
              <p className="text-sm font-semibold">照片加载失败</p>
              <p className="text-xs text-white/60">请稍后重试或切换其他照片</p>
            </div>
          ) : null}

          {photos.length > 1 ? (
            <div className="pointer-events-none absolute inset-y-0 left-2 right-2 flex items-center justify-between sm:left-4 sm:right-4">
              <button
                type="button"
                disabled={idx <= 0}
                onClick={() => showPhoto(idx - 1)}
                className="pointer-events-auto flex h-11 w-11 items-center justify-center rounded-full bg-black/55 text-white shadow-lg backdrop-blur-sm transition-all hover:bg-black/75 active:scale-95 disabled:pointer-events-none disabled:opacity-20"
                aria-label="上一张"
              >
                <svg className="h-6 w-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M15 19l-7-7 7-7" />
                </svg>
              </button>
              <button
                type="button"
                disabled={idx >= photos.length - 1}
                onClick={() => showPhoto(idx + 1)}
                className="pointer-events-auto flex h-11 w-11 items-center justify-center rounded-full bg-black/55 text-white shadow-lg backdrop-blur-sm transition-all hover:bg-black/75 active:scale-95 disabled:pointer-events-none disabled:opacity-20"
                aria-label="下一张"
              >
                <svg className="h-6 w-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M9 5l7 7-7 7" />
                </svg>
              </button>
            </div>
          ) : null}
        </div>

        <div className="flex shrink-0 flex-wrap items-center justify-center gap-1.5 rounded-2xl border border-white/10 bg-black/35 p-2 sm:gap-2">
          <ControlButton label="向左旋转" onClick={() => setRotation((current) => current - 90)}>
            <svg className="h-5 w-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 7v6h6M5.5 16a8 8 0 1 0 1-9.5L3 10" />
            </svg>
          </ControlButton>
          <ControlButton
            label="缩小"
            disabled={scale <= MIN_SCALE}
            onClick={() => zoomBy(-SCALE_STEP)}
          >
            <svg className="h-5 w-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <circle cx="11" cy="11" r="7" strokeWidth={2} />
              <path strokeLinecap="round" strokeWidth={2} d="M8 11h6M16.5 16.5 21 21" />
            </svg>
          </ControlButton>
          <span
            data-testid="photo-zoom-level"
            className="flex h-10 min-w-14 items-center justify-center rounded-xl bg-white/10 px-2 text-xs font-semibold tabular-nums text-white"
            aria-live="polite"
          >
            {Math.round(scale * 100)}%
          </span>
          <ControlButton
            label="放大"
            disabled={scale >= MAX_SCALE}
            onClick={() => zoomBy(SCALE_STEP)}
          >
            <svg className="h-5 w-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <circle cx="11" cy="11" r="7" strokeWidth={2} />
              <path strokeLinecap="round" strokeWidth={2} d="M8 11h6M11 8v6M16.5 16.5 21 21" />
            </svg>
          </ControlButton>
          <ControlButton label="向右旋转" onClick={() => setRotation((current) => current + 90)}>
            <svg className="h-5 w-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 7v6h-6M18.5 16a8 8 0 1 1-1-9.5L21 10" />
            </svg>
          </ControlButton>
          <ControlButton label="重置" onClick={resetTransform}>
            <span className="px-1 text-xs font-semibold">重置</span>
          </ControlButton>
        </div>
      </div>
    </div>
  );
}
