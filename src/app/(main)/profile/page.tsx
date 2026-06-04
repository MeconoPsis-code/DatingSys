"use client";

import { useState, useEffect, useCallback } from "react";
import Link from "next/link";
import { ClearModal } from "@/components/profile/clear-modal";
import { ATTRIBUTE_LABELS } from "@/data/attributes";
import { getProvinceName, getCityName } from "@/data/regions";
import { LOCATION_TYPE_LABELS } from "@/data/location-types";

/* ─── Types ──────────────────────────────────────────── */

type PoolType = never; // removed — single pool
type ProfileStatus = "DRAFT" | "ACTIVE" | "CLEARED" | "HIDDEN" | "FROZEN";
type Attribute = "ONE" | "ZERO" | "HALF" | "LEAN_ONE" | "LEAN_ZERO" | "SIDE" | "OTHER";
type LocationScope = "ANY" | "PROVINCE" | "CITY";
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
}

interface Preference {
  ageMin: number;
  ageMax: number;
  heightMinCm: number;
  heightMaxCm: number;
  weightMinKg: number;
  weightMaxKg: number;
  locationScope: LocationScope;
  expectedAttributes: Attribute[];
  expectedCustomAttribute: string | null;
}

/* ─── Constants ──────────────────────────────────────── */

const PHOTO_MATCH_LABELS: Record<string, string> = {
  PHOTO_ONLY: "仅匹配有照片用户",
  ALL: "匹配所有用户",
};

const STATUS_LABELS: Record<ProfileStatus, { label: string; color: string }> = {
  DRAFT: { label: "草稿", color: "bg-gray-500/15 text-gray-400 border-gray-500/30" },
  ACTIVE: { label: "已发布", color: "bg-emerald-500/15 text-emerald-400 border-emerald-500/30" },
  CLEARED: { label: "已清空", color: "bg-red-500/15 text-red-400 border-red-500/30" },
  HIDDEN: { label: "已隐藏", color: "bg-yellow-500/15 text-yellow-400 border-yellow-500/30" },
  FROZEN: { label: "已冻结", color: "bg-red-500/15 text-red-400 border-red-500/30" },
};

const LOCATION_SCOPE_LABELS: Record<LocationScope, string> = {
  ANY: "不限",
  PROVINCE: "同省",
  CITY: "同市",
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
    fetchProfile();
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
        <h1 className="text-2xl font-bold">我的资料</h1>
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
        <h1 className="text-2xl font-bold">我的资料</h1>
        <div className="rounded-2xl border border-[hsl(var(--border))] bg-[hsl(var(--card))] p-8 text-center">
          <div className="mb-4 text-5xl">👤</div>
          <h2 className="mb-2 text-lg font-semibold text-[hsl(var(--foreground))]">
            还没有资料
          </h2>
          <p className="mb-6 text-sm text-[hsl(var(--muted-foreground))]">
            创建你的个人资料，开始匹配之旅
          </p>
          <Link
            href="/profile/edit"
            className="inline-block rounded-lg bg-gradient-to-r from-[hsl(262,83%,58%)] to-[hsl(290,70%,55%)] px-6 py-2.5 text-sm font-semibold text-white shadow-lg shadow-[hsl(262,83%,58%)/0.25] transition-all hover:scale-[1.02] hover:shadow-xl active:scale-[0.98]"
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
      <h1 className="text-2xl font-bold">我的资料</h1>

      {/* Profile card */}
      <div className="rounded-2xl border border-[hsl(var(--border))] bg-[hsl(var(--card))] p-6">
        {/* Badges */}
        <div className="mb-5 flex flex-wrap items-center gap-2">
          <span className={`rounded-full border px-3 py-1 text-xs font-medium ${statusInfo.color}`}>
            {statusInfo.label}
          </span>
          {ratingInfo?.finalScore !== null && ratingInfo?.finalScore !== undefined && (
            <span className="rounded-full border border-amber-500/30 bg-amber-500/15 px-3 py-1 text-xs font-medium text-amber-400">
              ⭐ 颜值分: {ratingInfo.finalScore.toFixed(1)}
            </span>
          )}
          {ratingInfo && ratingInfo.ratingStatus === "PENDING" && (
            <span className="rounded-full border border-blue-500/30 bg-blue-500/15 px-3 py-1 text-xs font-medium text-blue-400">
              ⏳ 评分中
            </span>
          )}
          {photos.length > 0 && (
            <span className="rounded-full border border-purple-500/30 bg-purple-500/15 px-3 py-1 text-xs font-medium text-purple-400">
              📷 有照片
            </span>
          )}
        </div>

        {/* Fields */}
        <div className="space-y-4">
          <InfoRow label="出生日期" value={formatDate(profile.birthDate)} />
          <InfoRow label="身高" value={`${profile.heightCm} cm`} />
          <InfoRow label="体重" value={`${profile.weightKg} kg`} />
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
            <h3 className="mb-3 text-sm font-semibold text-[hsl(var(--foreground))]">
              📸 照片
            </h3>
            <div className="grid grid-cols-3 gap-3">
              {photos.map((photo) => (
                <div
                  key={photo.id}
                  className="aspect-[3/4] overflow-hidden rounded-xl border border-[hsl(var(--border))] bg-[hsl(var(--secondary))]"
                >
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img
                    src={photo.url}
                    alt={photo.originalName || `照片 ${photo.order + 1}`}
                    className="h-full w-full object-cover"
                  />
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Preference sub-card */}
        {preference && (
          <div className="mt-6 rounded-xl border border-[hsl(var(--border))] bg-[hsl(var(--secondary))] p-5">
            <h3 className="mb-4 text-sm font-semibold text-[hsl(var(--foreground))]">
              匹配偏好
            </h3>
            <div className="space-y-3">
              <InfoRow label="年龄范围" value={`${preference.ageMin} ~ ${preference.ageMax} 岁`} />
              <InfoRow label="身高范围" value={`${preference.heightMinCm} ~ ${preference.heightMaxCm} cm`} />
              <InfoRow label="体重范围" value={`${preference.weightMinKg} ~ ${preference.weightMaxKg} kg`} />
              <InfoRow label="地区偏好" value={LOCATION_SCOPE_LABELS[preference.locationScope]} />
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
            className="flex-1 rounded-lg bg-gradient-to-r from-[hsl(262,83%,58%)] to-[hsl(290,70%,55%)] px-4 py-2.5 text-center text-sm font-semibold text-white shadow-lg shadow-[hsl(262,83%,58%)/0.25] transition-all hover:scale-[1.02] hover:shadow-xl active:scale-[0.98]"
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
    </div>
  );
}

/* ─── Helpers ────────────────────────────────────────── */

function InfoRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-start justify-between gap-4">
      <span className="shrink-0 text-xs font-medium text-[hsl(var(--muted-foreground))]">
        {label}
      </span>
      <span className="text-right text-sm text-[hsl(var(--foreground))]">
        {value}
      </span>
    </div>
  );
}
