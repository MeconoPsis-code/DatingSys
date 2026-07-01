"use client";

import { useState, useEffect, useCallback } from "react";
import Link from "next/link";
import { PhotoLightbox } from "@/components/profile/photo-lightbox";
import { ClearModal } from "@/components/profile/clear-modal";
import { ATTRIBUTE_LABELS } from "@/data/attributes";
import { getProvinceName, getCityName } from "@/data/regions";
import { LOCATION_TYPE_LABELS } from "@/data/location-types";
import { formatBmi } from "@/lib/bmi";

/* ─── Types ──────────────────────────────────────────── */

type ProfileStatus = "DRAFT" | "ACTIVE" | "CLEARED" | "HIDDEN" | "FROZEN";
type Attribute = "ONE" | "ZERO" | "HALF" | "LEAN_ONE" | "LEAN_ZERO" | "SIDE" | "OTHER";
type LocationType = "RESIDENCE" | "HOMETOWN" | "SCHOOL" | "WORK" | "TRAVEL" | "OTHER";

interface RatingInfo {
  ratingStatus: string;
  finalScore: number | null;
  scoreCompletedAt: string | null;
}

interface Profile {
  id: string;
  status: ProfileStatus;
  birthDate: string;
  heightCm: number;
  weightKg: number;
  provinceCode: string;
  cityCode: string;
  attribute: Attribute;
  customAttribute: string | null;
  locationType: LocationType;
  mbti: string | null;
  selfIntro: string | null;
  photoMatchPref: string | null;
  highScoreOnly: boolean;
  draftData?: Record<string, unknown> | null;
}

interface Preference {
  ageMin: number;
  ageMax: number;
  heightMinCm: number;
  heightMaxCm: number;
  weightMinKg: number;
  weightMaxKg: number;

  expectedAttributes: Attribute[];
  expectedCustomAttribute: string | null;
}

/* ─── Constants ──────────────────────────────────────── */

const STATUS_LABELS: Record<ProfileStatus, { label: string; color: string }> = {
  DRAFT: { label: "草稿", color: "bg-gray-500/15 text-gray-400 border-gray-500/30" },
  ACTIVE: { label: "已发布", color: "bg-emerald-500/15 text-emerald-400 border-emerald-500/30" },
  CLEARED: { label: "已清空", color: "bg-red-500/15 text-red-400 border-red-500/30" },
  HIDDEN: { label: "已隐藏", color: "bg-yellow-500/15 text-yellow-400 border-yellow-500/30" },
  FROZEN: { label: "已冻结", color: "bg-red-500/15 text-red-400 border-red-500/30" },
};



function getAttrLabel(attr: Attribute, customText?: string | null): string {
  if (attr === "OTHER" && customText) return `其他: ${customText}`;
  return ATTRIBUTE_LABELS[attr] ?? attr;
}

function formatDate(dateStr: string): string {
  const d = new Date(dateStr);
  const y = d.getFullYear();
  const m = d.getMonth() + 1;
  const day = d.getDate();
  return `${y}年${String(m).padStart(2, "0")}月${String(day).padStart(2, "0")}日`;
}

/* ─── Component ──────────────────────────────────────── */

interface PhotoItem {
  id: string;
  order: number;
  originalName: string | null;
  url: string;
}

export default function ProfilePage() {
  const [profile, setProfile] = useState<Profile | null>(null);
  const [preference, setPreference] = useState<Preference | null>(null);
  const [lightboxIdx, setLightboxIdx] = useState<number | null>(null);
  const [photos, setPhotos] = useState<PhotoItem[]>([]);
  const [ratingInfo, setRatingInfo] = useState<RatingInfo | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [clearOpen, setClearOpen] = useState(false);
  const [clearing, setClearing] = useState(false);

  const fetchProfile = useCallback(async () => {
    try {
      setLoading(true);
      setError(null);
      const res = await fetch("/api/profile/me");
      if (!res.ok) {
        if (res.status === 401) {
          window.location.href = "/login";
          return;
        }
        throw new Error("获取资料失败");
      }
      const data = await res.json();
      setProfile(data.data?.profile ?? null);
      setPreference(data.data?.preference ?? null);
      setRatingInfo(data.data?.ratingProfile ?? null);

      // Load photos
      if (data.data?.profile) {
        try {
          const photoRes = await fetch("/api/profile/photos");
          if (photoRes.ok) {
            const photoData = await photoRes.json();
            setPhotos(photoData.data?.photos || []);
          }
        } catch {
          // Photos are optional
        }
      } else {
        setPhotos([]);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "获取资料失败");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    let cancelled = false;
    queueMicrotask(() => {
      if (cancelled) return;
      void fetchProfile();
    });
    return () => {
      cancelled = true;
    };
  }, [fetchProfile]);

  async function handleClear() {
    try {
      setClearing(true);
      const res = await fetch("/api/profile/clear", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ confirmation: "确认清空我的资料" }),
      });
      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error?.message || "清空失败");
      }
      setClearOpen(false);
      await fetchProfile();
    } catch (err) {
      setError(err instanceof Error ? err.message : "清空失败");
    } finally {
      setClearing(false);
    }
  }

  /* ── Loading ── */
  if (loading) {
    return (
      <div className="flex flex-col items-center justify-center py-20">
        <div className="h-8 w-8 animate-spin rounded-full border-2 border-[hsl(var(--primary))] border-t-transparent" />
        <p className="mt-3 text-sm text-[hsl(var(--muted-foreground))]">加载中...</p>
      </div>
    );
  }

  /* ── Error ── */
  if (error) {
    return (
      <div className="flex flex-col gap-4">
        <h1 className="flex items-center gap-2 text-2xl font-bold">
          <svg viewBox="0 0 24 24" className="h-6 w-6 fill-none stroke-current stroke-2 stroke-linecap-round stroke-linejoin-round text-brand-blue">
            <path d="M19 21v-2a4 4 0 0 0-4-4H9a4 4 0 0 0-4 4v2" />
            <circle cx="12" cy="7" r="4" />
          </svg>
          我的资料
        </h1>
        <div className="rounded-lg border border-[hsl(0,62%,50%/0.3)] bg-[hsl(0,62%,50%/0.1)] px-4 py-3 text-sm text-[hsl(0,62%,70%)]">
          {error}
        </div>
        <button
          onClick={fetchProfile}
          className="w-fit rounded-lg border border-[hsl(var(--border))] px-4 py-2 text-sm text-[hsl(var(--foreground))] transition-colors hover:bg-[hsl(var(--secondary))]"
        >
          重试
        </button>
      </div>
    );
  }

  /* ── No profile ── */
  if (!profile) {
    return (
      <div className="flex flex-col gap-4">
        <h1 className="flex items-center gap-2 text-2xl font-bold">
          <svg viewBox="0 0 24 24" className="h-6 w-6 fill-none stroke-current stroke-2 stroke-linecap-round stroke-linejoin-round text-brand-blue">
            <path d="M19 21v-2a4 4 0 0 0-4-4H9a4 4 0 0 0-4 4v2" />
            <circle cx="12" cy="7" r="4" />
          </svg>
          我的资料
        </h1>
        <div className="rounded-2xl border border-[hsl(var(--border))] bg-[hsl(var(--card))] p-6 text-center sm:p-8">
          <div className="mb-4 flex justify-center text-[hsl(var(--muted-foreground))]">
            <svg viewBox="0 0 24 24" className="h-14 w-14 fill-none stroke-current stroke-2 stroke-linecap-round stroke-linejoin-round text-brand-blue">
              <path d="M19 21v-2a4 4 0 0 0-4-4H9a4 4 0 0 0-4 4v2" />
              <circle cx="12" cy="7" r="4" />
            </svg>
          </div>
          <h2 className="mb-2 text-lg font-semibold text-[hsl(var(--foreground))]">
            还没有资料
          </h2>
          <p className="mb-6 text-sm text-[hsl(var(--muted-foreground))]">
            创建你的个人资料，开始匹配之旅
          </p>
          <Link
            href="/profile/edit"
            className="inline-block rounded-lg bg-brand-blue px-6 py-2.5 text-sm font-semibold text-white shadow-md shadow-brand-blue/20 transition-all hover:scale-[1.02] hover:bg-brand-blue/90 active:scale-[0.98]"
          >
            创建资料
          </Link>
        </div>
      </div>
    );
  }

  /* ── Has profile ── */
  const statusInfo = STATUS_LABELS[profile.status];

  return (
    <div className="flex flex-col gap-6">
      <h1 className="flex items-center gap-2 text-2xl font-bold">
        <svg viewBox="0 0 24 24" className="h-6 w-6 fill-none stroke-current stroke-2 stroke-linecap-round stroke-linejoin-round text-brand-blue">
          <path d="M19 21v-2a4 4 0 0 0-4-4H9a4 4 0 0 0-4 4v2" />
          <circle cx="12" cy="7" r="4" />
        </svg>
        我的资料
      </h1>

      {/* Profile card */}
      <div className="rounded-2xl border border-[hsl(var(--border))] bg-[hsl(var(--card))] p-4 sm:p-6">
        {/* Badges */}
        <div className="mb-5 flex flex-wrap items-center gap-2">
          <span className={`rounded-full border px-3 py-1 text-xs font-medium ${statusInfo.color}`}>
            {statusInfo.label}
          </span>
          {ratingInfo?.finalScore !== null && ratingInfo?.finalScore !== undefined && (
            <span className="inline-flex items-center gap-1 rounded-full border border-amber-500/30 bg-amber-500/15 px-3 py-1 text-xs font-medium text-amber-400">
              <svg viewBox="0 0 24 24" className="h-3.5 w-3.5 fill-none stroke-amber-500 stroke-2 stroke-linecap-round stroke-linejoin-round text-amber-500">
                <polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2" />
              </svg>
              颜值分: {ratingInfo.finalScore.toFixed(1)}
            </span>
          )}
          {ratingInfo && (ratingInfo.ratingStatus === "PENDING" || ratingInfo.ratingStatus === "SCORING" || ratingInfo.ratingStatus === "REVIEW") && (
            <span className="inline-flex items-center gap-1 rounded-full border border-blue-500/30 bg-blue-500/15 px-3 py-1 text-xs font-medium text-blue-400">
              <svg viewBox="0 0 24 24" className="h-3.5 w-3.5 fill-none stroke-current stroke-2 stroke-linecap-round stroke-linejoin-round">
                <circle cx="12" cy="12" r="10" />
                <polyline points="12 6 12 12 16 14" />
              </svg>
              评分中
            </span>
          )}
          {photos.length > 0 && (
            <span className="inline-flex items-center gap-1 rounded-full border border-brand-blue/30 bg-blue-1 px-3 py-1 text-xs font-medium text-brand-blue">
              <svg viewBox="0 0 24 24" className="h-3.5 w-3.5 fill-none stroke-current stroke-2 stroke-linecap-round stroke-linejoin-round">
                <path d="M14.5 4h-5L7 7H4a2 2 0 0 0-2 2v9a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2V9a2 2 0 0 0-2-2h-3l-2.5-3z" />
                <circle cx="12" cy="13" r="3" />
              </svg>
              有照片
            </span>
          )}
        </div>

        {/* Draft banner */}
        {profile.draftData && profile.status === 'ACTIVE' && (
          <div className="mb-5 flex items-center gap-2 rounded-xl border border-blue-500/25 bg-blue-500/10 p-3">
            <svg viewBox="0 0 100 100" className="h-4 w-4 shrink-0 text-blue-400" fill="none">
              <circle cx="50" cy="50" r="45" stroke="currentColor" strokeWidth={6} />
              <path d="M50 20V60" stroke="currentColor" strokeWidth={8} strokeLinecap="round" />
              <circle cx="50" cy="78" r="4" fill="currentColor" />
            </svg>
            <span className="flex-1 text-xs text-blue-300">你有未发布的修改草稿</span>
            <Link
              href="/profile/edit"
              className="shrink-0 text-xs font-medium text-blue-400 transition-colors hover:text-blue-300 hover:underline"
            >
              前往编辑
            </Link>
          </div>
        )}

        {/* Fields */}
        <div className="space-y-4">
          <InfoRow label="出生日期" value={formatDate(profile.birthDate)} />
          <InfoRow label="身高" value={`${profile.heightCm} cm`} />
          <InfoRow label="体重" value={`${profile.weightKg} kg`} />
          <InfoRow label="BMI" value={formatBmi(profile.heightCm, profile.weightKg)} />
          <InfoRow
            label="所在地"
            value={`${getProvinceName(profile.provinceCode)} · ${getCityName(profile.provinceCode, profile.cityCode)}`}
          />
          <InfoRow label="地址类型" value={LOCATION_TYPE_LABELS[profile.locationType] || profile.locationType} />
          <InfoRow label="属性" value={getAttrLabel(profile.attribute, profile.customAttribute)} />
          {profile.mbti && <InfoRow label="MBTI" value={profile.mbti} />}

          {/* Self intro */}
          {profile.selfIntro && (
            <div>
              <span className="text-xs font-medium text-[hsl(var(--muted-foreground))]">自我介绍</span>
              <p className="mt-1 whitespace-pre-wrap rounded-lg bg-[hsl(var(--secondary))] px-3 py-2.5 text-sm text-[hsl(var(--foreground))]">
                {profile.selfIntro}
              </p>
            </div>
          )}
        </div>

        {/* Photos section */}
        {photos.length > 0 && (
          <div className="mt-6">
            <h3 className="mb-3 flex items-center gap-1.5 text-sm font-semibold text-[hsl(var(--foreground))]">
              <svg viewBox="0 0 24 24" className="h-4 w-4 fill-none stroke-current stroke-2 stroke-linecap-round stroke-linejoin-round text-brand-blue">
                <path d="M14.5 4h-5L7 7H4a2 2 0 0 0-2 2v9a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2V9a2 2 0 0 0-2-2h-3l-2.5-3z" />
                <circle cx="12" cy="13" r="3" />
              </svg>
              照片
            </h3>
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
              {photos.map((photo) => (
                <div
                  key={photo.id}
                  className="aspect-[4/3] overflow-hidden rounded-xl border border-[hsl(var(--border))] bg-[hsl(var(--secondary))]"
                >
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img
                    src={photo.url}
                    alt={photo.originalName || `照片 ${photo.order + 1}`}
                    onClick={() => setLightboxIdx(photos.findIndex((p) => p.id === photo.id))}
                    className="h-full w-full object-cover cursor-pointer transition-transform hover:scale-105"
                  />
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Preference sub-card */}
        {preference && (
          <div className="mt-6 rounded-xl border border-[hsl(var(--border))] bg-[hsl(var(--secondary))] p-4 sm:p-5">
            <h3 className="mb-4 text-sm font-semibold text-[hsl(var(--foreground))]">
              匹配偏好
            </h3>
            <div className="space-y-3">
              <InfoRow label="年龄范围" value={`${preference.ageMin} ~ ${preference.ageMax} 岁`} />
              <InfoRow label="身高范围" value={`${preference.heightMinCm} ~ ${preference.heightMaxCm} cm`} />
              <InfoRow label="体重范围" value={`${preference.weightMinKg} ~ ${preference.weightMaxKg} kg`} />

              <InfoRow
                label="期望属性"
                value={
                  preference.expectedAttributes?.length
                    ? preference.expectedAttributes
                        .map((a) =>
                          a === "OTHER" && preference.expectedCustomAttribute
                            ? `其他: ${preference.expectedCustomAttribute}`
                            : getAttrLabel(a)
                        )
                        .join("、")
                    : "未设置"
                }
              />
            </div>
          </div>
        )}

        {/* Action buttons */}
        <div className="mt-6 flex flex-col gap-3 sm:flex-row">
          <Link
            href="/profile/edit"
            className="flex-1 rounded-lg bg-brand-blue px-4 py-2.5 text-center text-sm font-semibold text-white shadow-md shadow-brand-blue/20 transition-all hover:scale-[1.02] hover:bg-brand-blue/90 active:scale-[0.98]"
          >
            编辑资料
          </Link>
          {profile.status !== "CLEARED" && (
            <button
              onClick={() => setClearOpen(true)}
              className="flex-1 rounded-lg border border-[hsl(0,62%,50%/0.5)] bg-[hsl(0,62%,50%/0.1)] px-4 py-2.5 text-sm font-semibold text-[hsl(0,62%,70%)] transition-all hover:bg-[hsl(0,62%,50%/0.2)] active:scale-[0.98]"
            >
              清空资料
            </button>
          )}
        </div>
      </div>

      {/* Clear modal */}
      <ClearModal
        open={clearOpen}
        onClose={() => setClearOpen(false)}
        onConfirm={handleClear}
        loading={clearing}
      />

      {/* Lightbox photo viewer */}
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

/* ─── Helpers ────────────────────────────────────────── */

function InfoRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex flex-col gap-1 sm:flex-row sm:items-start sm:justify-between sm:gap-4">
      <span className="text-xs font-medium text-[hsl(var(--muted-foreground))] sm:shrink-0">
        {label}
      </span>
      <span className="break-words text-left text-sm text-[hsl(var(--foreground))] sm:text-right">
        {value}
      </span>
    </div>
  );
}
