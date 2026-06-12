"use client";

import { useState, useEffect, useCallback, use } from "react";
import { getProvinceName, getCityName } from "@/data/regions";
import { ATTRIBUTE_LABELS } from "@/data/attributes";
import Link from "next/link";

/* ─── Types ──────────────────────────────────────────── */

interface MatchPhoto {
  id: string;
  url: string;
  order: number;
}

interface MatchDetail {
  userId: string;
  qqNumber: string | null;
  nickname: string | null;
  age: number;
  heightCm: number;
  weightKg: number;
  provinceCode: string;
  cityCode: string;
  locationType: string;
  attribute: string;
  customAttribute: string | null;
  mbti: string | null;
  selfIntro: string | null;
  hasPhotos: boolean;
  photoApproved: boolean;
  finalScore: number | null;
  photos: MatchPhoto[];
}

/* ─── Helpers ────────────────────────────────────────── */

function getAttrLabel(attr: string, custom?: string | null): string {
  if (attr === "OTHER" && custom) return `其他: ${custom}`;
  return (ATTRIBUTE_LABELS as Record<string, string>)[attr] ?? attr;
}

const LOCATION_TYPE_LABELS: Record<string, string> = {
  RESIDENCE: "常住地",
  HOMETOWN: "家乡",
  SCHOOL: "就读地",
  WORK: "工作地",
  TRAVEL: "旅居地",
  OTHER: "其他",
};

/* ─── Component ──────────────────────────────────────── */

export default function MatchDetailPage({
  params,
}: {
  params: Promise<{ userId: string }>;
}) {
  const { userId } = use(params);
  const [detail, setDetail] = useState<MatchDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [photoIndex, setPhotoIndex] = useState(0);
  const [copied, setCopied] = useState(false);
  const [photoRequesting, setPhotoRequesting] = useState(false);
  const [photoRequestError, setPhotoRequestError] = useState<string | null>(null);

  const fetchDetail = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`/api/matches/${userId}`);
      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error?.message || "加载失败");
      }
      const data = await res.json();
      setDetail(data.data);
    } catch (err) {
      setError(err instanceof Error ? err.message : "加载失败");
    } finally {
      setLoading(false);
    }
  }, [userId]);

  useEffect(() => {
    fetchDetail();
  }, [fetchDetail]);

  function handleCopyQQ() {
    if (!detail?.qqNumber) return;
    navigator.clipboard.writeText(detail.qqNumber).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    });
  }

  async function handleRequestPhoto() {
    setPhotoRequesting(true);
    setPhotoRequestError(null);
    try {
      const res = await fetch("/api/view-requests", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ targetUserId: userId }),
      });
      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error?.message || "申请失败");
      }
      // Refresh detail to reflect new state
      await fetchDetail();
    } catch (err) {
      setPhotoRequestError(err instanceof Error ? err.message : "申请失败");
    } finally {
      setPhotoRequesting(false);
    }
  }

  if (loading) {
    return (
      <div className="flex flex-col gap-6">
        <Link href="/matches/mutual" className="text-sm text-[hsl(var(--muted-foreground))] hover:text-[hsl(var(--foreground))]">
          ← 返回匹配列表
        </Link>
        <div className="flex items-center justify-center py-20">
          <div className="h-8 w-8 animate-spin rounded-full border-2 border-[hsl(var(--primary))] border-t-transparent" />
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="flex flex-col gap-6">
        <Link href="/matches/mutual" className="text-sm text-[hsl(var(--muted-foreground))] hover:text-[hsl(var(--foreground))]">
          ← 返回匹配列表
        </Link>
        <div className="flex flex-col items-center justify-center rounded-2xl border border-[hsl(var(--border))] bg-[hsl(var(--card))] py-16">
          <div className="mb-3 text-4xl">🔒</div>
          <p className="text-sm text-[hsl(var(--muted-foreground))]">{error}</p>
        </div>
      </div>
    );
  }

  if (!detail) return null;

  const sortedPhotos = [...detail.photos].sort((a, b) => a.order - b.order);

  return (
    <div className="flex flex-col gap-5">
      {/* Back link */}
      <Link href="/matches/mutual" className="text-sm text-[hsl(var(--muted-foreground))] hover:text-[hsl(var(--foreground))] transition-colors">
        ← 返回匹配列表
      </Link>

      {/* Copied toast */}
      {copied && (
        <div className="fixed right-4 top-4 z-50 rounded-lg bg-emerald-500 px-4 py-2 text-sm font-medium text-white shadow-lg">
          ✅ QQ号已复制
        </div>
      )}

      {/* Profile card */}
      <div className="rounded-2xl border border-[hsl(var(--border))] bg-[hsl(var(--card))] overflow-hidden">
        {/* Photos */}
        {sortedPhotos.length > 0 && (
          <div className="relative bg-black/30">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={sortedPhotos[photoIndex]?.url}
              alt="用户照片"
              className="mx-auto h-[24rem] w-full object-contain"
            />
            {sortedPhotos.length > 1 && (
              <>
                <button
                  onClick={() => setPhotoIndex((i) => (i > 0 ? i - 1 : sortedPhotos.length - 1))}
                  className="absolute left-2 top-1/2 -translate-y-1/2 flex h-10 w-10 items-center justify-center rounded-full bg-black/50 text-white/80 backdrop-blur-sm transition-all hover:bg-black/70"
                >
                  ‹
                </button>
                <button
                  onClick={() => setPhotoIndex((i) => (i < sortedPhotos.length - 1 ? i + 1 : 0))}
                  className="absolute right-2 top-1/2 -translate-y-1/2 flex h-10 w-10 items-center justify-center rounded-full bg-black/50 text-white/80 backdrop-blur-sm transition-all hover:bg-black/70"
                >
                  ›
                </button>
                <div className="absolute top-3 right-3 rounded-full bg-black/60 px-3 py-1 text-xs text-white/90 backdrop-blur-sm">
                  {photoIndex + 1} / {sortedPhotos.length}
                </div>
                <div className="absolute bottom-3 left-0 right-0 flex justify-center gap-1.5">
                  {sortedPhotos.map((_, i) => (
                    <button
                      key={i}
                      onClick={() => setPhotoIndex(i)}
                      className={`h-2 w-2 rounded-full transition-all ${
                        photoIndex === i ? "bg-white scale-125" : "bg-white/40"
                      }`}
                    />
                  ))}
                </div>
              </>
            )}
          </div>
        )}

        {/* Photos not approved placeholder */}
        {detail.hasPhotos && !detail.photoApproved && sortedPhotos.length === 0 && (
          <div className="flex flex-col items-center justify-center bg-[hsl(var(--secondary)/0.5)] py-12">
            <div className="mb-3 text-4xl">🔒</div>
            <p className="mb-1 text-sm font-medium text-[hsl(var(--foreground))]">该用户有照片</p>
            <p className="mb-4 text-xs text-[hsl(var(--muted-foreground))]">需经对方授权后才能查看</p>
            <button
              type="button"
              onClick={handleRequestPhoto}
              disabled={photoRequesting}
              className="rounded-lg bg-brand-blue px-4 py-2 text-xs font-semibold text-white shadow-md shadow-brand-blue/20 transition-all hover:scale-[1.02] hover:bg-brand-blue/90 active:scale-[0.98] disabled:opacity-50"
            >
              {photoRequesting ? "申请中..." : "📷 申请查看照片"}
            </button>
            {photoRequestError && (
              <p className="mt-2 text-xs text-[hsl(0,60%,65%)]">{photoRequestError}</p>
            )}
          </div>
        )}

        {/* Profile info */}
        <div className="p-6">
          {/* Name + badges */}
          <div className="mb-4 flex items-center gap-3">
            <h2 className="text-xl font-bold text-[hsl(var(--foreground))]">
              {detail.nickname || "匿名用户"}
            </h2>
            {detail.hasPhotos && (
              <span className="rounded-full border border-brand-blue/30 bg-blue-1 px-2 py-0.5 text-[10px] font-medium text-brand-blue">
                📷 有照片
              </span>
            )}
            {detail.finalScore !== null && (
              <span className="rounded-full border border-amber-500/30 bg-amber-500/15 px-2 py-0.5 text-[10px] font-medium text-amber-400">
                ⭐ {detail.finalScore.toFixed(1)}
              </span>
            )}
          </div>

          {/* Stats grid */}
          <div className="mb-4 grid grid-cols-2 gap-3">
            <InfoItem label="年龄" value={`${detail.age} 岁`} />
            <InfoItem label="身高" value={`${detail.heightCm} cm`} />
            <InfoItem label="体重" value={`${detail.weightKg} kg`} />
            <InfoItem label="属性" value={getAttrLabel(detail.attribute, detail.customAttribute)} />
            <InfoItem
              label={LOCATION_TYPE_LABELS[detail.locationType] || "所在地"}
              value={`${getProvinceName(detail.provinceCode)} · ${getCityName(detail.provinceCode, detail.cityCode)}`}
            />
            {detail.mbti && <InfoItem label="MBTI" value={detail.mbti} />}
          </div>

          {/* Self intro */}
          {detail.selfIntro && (
            <div className="mb-4">
              <div className="mb-1 text-xs text-[hsl(var(--muted-foreground))]">自我介绍</div>
              <p className="rounded-lg bg-[hsl(var(--secondary)/0.5)] px-3 py-2.5 text-sm leading-relaxed text-[hsl(var(--foreground))]">
                {detail.selfIntro}
              </p>
            </div>
          )}

          {/* QQ button */}
          {detail.qqNumber && (
            <button
              type="button"
              onClick={handleCopyQQ}
              className="w-full rounded-xl bg-brand-blue px-4 py-3 text-sm font-bold text-white shadow-md shadow-brand-blue/20 transition-all hover:scale-[1.01] hover:bg-brand-blue/90 active:scale-[0.99]"
            >
              QQ: {detail.qqNumber} · 点击复制
            </button>
          )}
        </div>
      </div>
    </div>
  );
}

/* ─── Info Item ──────────────────────────────────────── */

function InfoItem({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-lg bg-[hsl(var(--secondary))] px-3 py-2">
      <div className="text-[10px] text-[hsl(var(--muted-foreground))]">{label}</div>
      <div className="text-sm font-medium text-[hsl(var(--foreground))]">{value}</div>
    </div>
  );
}
