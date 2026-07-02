"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { getMatchPrefCooldown } from "@/lib/match-pref-cooldown";

type PhotoMatchPref = "ALL" | "PHOTO_ONLY";

interface ProfileData {
  hasPhotos: boolean;
  photoMatchPref: PhotoMatchPref | null;
  highScoreOnly: boolean;
  matchPrefUpdatedAt: string | null;
  matchPrefCooldownEndsAt?: string | null;
  cooldownBypassed?: boolean;
  ratingProfile: {
    ratingStatus: string;
    finalScore: number | null;
    scoreCompletedAt: string | null;
  } | null;
}

function formatCooldownEnd(date: Date): string {
  return date.toLocaleString("zh-CN", {
    month: "long",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  });
}

function buildCooldownMessage(nextChangeAt: Date | null): string {
  if (!nextChangeAt) return "匹配偏好每天最多修改一次，避免频繁切换造成服务压力。";
  return `今天已修改过，${formatCooldownEnd(nextChangeAt)} 后可再次调整。`;
}

function getPreferenceLabel(
  photoMatchPref: PhotoMatchPref | null,
  highScoreOnly: boolean
) {
  if (photoMatchPref === "PHOTO_ONLY") {
    return highScoreOnly ? "仅与高分有照片用户匹配" : "仅与有照片用户匹配";
  }
  if (photoMatchPref === "ALL") return "与所有用户匹配";
  return "尚未设置";
}

export default function MatchPreferencesPage() {
  const router = useRouter();

  const [loading, setLoading] = useState(true);
  const [profileData, setProfileData] = useState<ProfileData | null>(null);
  const [fetchError, setFetchError] = useState<string | null>(null);
  const [cooldownNow, setCooldownNow] = useState(() => new Date());

  const [selected, setSelected] = useState<PhotoMatchPref | null>(null);
  const [highScoreOnly, setHighScoreOnly] = useState(false);

  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [showSuccess, setShowSuccess] = useState(false);

  useEffect(() => {
    (async () => {
      try {
        const res = await fetch("/api/profile/me");
        const payload = await res.json();
        if (!res.ok) {
          throw new Error(payload.error?.message || "加载失败");
        }

        const data = payload.data;
        const currentPref = (data.profile?.photoMatchPref ??
          null) as PhotoMatchPref | null;
        const currentHighScoreOnly =
          currentPref === "PHOTO_ONLY" && Boolean(data.profile?.highScoreOnly);

        setProfileData({
          hasPhotos: data.hasPhotos,
          photoMatchPref: currentPref,
          highScoreOnly: currentHighScoreOnly,
          matchPrefUpdatedAt: data.profile?.matchPrefUpdatedAt ?? null,
          cooldownBypassed: Boolean(data.cooldowns?.cooldownBypassed),
          ratingProfile: data.ratingProfile,
        });
        setSelected(currentPref);
        setHighScoreOnly(currentHighScoreOnly);
      } catch (err) {
        setFetchError(err instanceof Error ? err.message : "加载失败");
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  useEffect(() => {
    if (loading || !profileData) return;

    if (!profileData.hasPhotos) {
      router.replace("/profile/edit");
      return;
    }
    if (
      !profileData.ratingProfile ||
      profileData.ratingProfile.ratingStatus !== "COMPLETED"
    ) {
      router.replace("/profile");
    }
  }, [loading, profileData, router]);

  useEffect(() => {
    if (!profileData?.matchPrefUpdatedAt) return;

    const intervalId = window.setInterval(() => {
      setCooldownNow(new Date());
    }, 60 * 1000);

    return () => window.clearInterval(intervalId);
  }, [profileData?.matchPrefUpdatedAt]);

  const finalScore = profileData?.ratingProfile?.finalScore ?? 0;
  const canHighScore = finalScore >= 7.0;
  const selectedHighScoreOnly = selected === "PHOTO_ONLY" && highScoreOnly;

  const cooldown = useMemo(
    () => getMatchPrefCooldown(profileData?.matchPrefUpdatedAt, cooldownNow),
    [profileData?.matchPrefUpdatedAt, cooldownNow]
  );
  const cooldownBypassed = Boolean(profileData?.cooldownBypassed);
  const matchPrefCooldownActive =
    Boolean(profileData?.photoMatchPref) && !cooldownBypassed && cooldown.isActive;
  const currentHighScoreOnly =
    profileData?.photoMatchPref === "PHOTO_ONLY" &&
    Boolean(profileData.highScoreOnly);
  const preferenceUnchanged =
    Boolean(profileData?.photoMatchPref) &&
    selected === profileData?.photoMatchPref &&
    selectedHighScoreOnly === currentHighScoreOnly;
  const submitDisabled =
    !selected || submitting || matchPrefCooldownActive || preferenceUnchanged;
  const cooldownHint = cooldownBypassed
    ? "超级管理员账号不受修改冷却限制。"
    : matchPrefCooldownActive
      ? buildCooldownMessage(cooldown.nextChangeAt)
      : "匹配偏好每天最多修改一次，避免频繁切换造成服务压力。";

  async function handleSubmit() {
    if (!selected || submitDisabled) return;
    setSubmitting(true);
    setSubmitError(null);

    try {
      const res = await fetch("/api/profile/match-pref", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          photoMatchPref: selected,
          highScoreOnly: selected === "PHOTO_ONLY" && highScoreOnly,
        }),
      });
      const payload = await res.json();

      if (!res.ok) {
        throw new Error(payload.error?.message || "保存失败");
      }

      const settings = payload.data;
      const nextPref = settings.photoMatchPref as PhotoMatchPref;
      const nextHighScoreOnly =
        nextPref === "PHOTO_ONLY" && Boolean(settings.highScoreOnly);

      setProfileData((prev) =>
        prev
          ? {
              ...prev,
              photoMatchPref: nextPref,
              highScoreOnly: nextHighScoreOnly,
              matchPrefUpdatedAt: settings.matchPrefUpdatedAt ?? null,
              matchPrefCooldownEndsAt:
                settings.matchPrefCooldownEndsAt ?? null,
              cooldownBypassed: Boolean(settings.cooldownBypassed),
            }
          : prev
      );
      setSelected(nextPref);
      setHighScoreOnly(nextHighScoreOnly);
      setCooldownNow(new Date());
      setShowSuccess(true);
      setTimeout(() => {
        router.push("/matches/mutual");
      }, 1200);
    } catch (err) {
      setSubmitError(err instanceof Error ? err.message : "保存失败");
    } finally {
      setSubmitting(false);
    }
  }

  function scoreColor(s: number) {
    if (s >= 8) return "text-emerald-400";
    if (s >= 7) return "text-brand-blue";
    if (s >= 5) return "text-amber-400";
    return "text-[hsl(0,60%,65%)]";
  }

  function scoreBgColor(s: number) {
    if (s >= 8) return "bg-green-1";
    if (s >= 7) return "bg-blue-1";
    if (s >= 5) return "bg-gold-1";
    return "bg-red-1";
  }

  function submitLabel() {
    if (submitting) return "保存中...";
    if (matchPrefCooldownActive) return "今日已修改";
    if (preferenceUnchanged) return "当前设置";
    return profileData?.photoMatchPref ? "确认修改" : "确认选择";
  }

  if (loading) {
    return (
      <div className="flex flex-col items-center justify-center py-24">
        <div className="h-8 w-8 animate-spin rounded-full border-2 border-[hsl(var(--primary))] border-t-transparent" />
        <p className="mt-3 text-sm text-[hsl(var(--muted-foreground))]">
          加载中...
        </p>
      </div>
    );
  }

  if (fetchError) {
    return (
      <div className="flex flex-col items-center justify-center py-24">
        <div className="mb-3 text-[hsl(var(--muted-foreground))]">
          <svg
            viewBox="0 0 24 24"
            className="h-12 w-12 fill-none stroke-current stroke-2 stroke-linecap-round stroke-linejoin-round"
          >
            <circle cx="12" cy="12" r="10" />
            <line x1="12" y1="8" x2="12" y2="12" />
            <line x1="12" y1="16" x2="12.01" y2="16" />
          </svg>
        </div>
        <p className="text-sm text-[hsl(var(--muted-foreground))]">
          {fetchError}
        </p>
      </div>
    );
  }

  if (
    !profileData?.hasPhotos ||
    !profileData?.ratingProfile ||
    profileData.ratingProfile.ratingStatus !== "COMPLETED"
  ) {
    return (
      <div className="flex flex-col items-center justify-center py-24">
        <div className="h-8 w-8 animate-spin rounded-full border-2 border-[hsl(var(--primary))] border-t-transparent" />
        <p className="mt-3 text-sm text-[hsl(var(--muted-foreground))]">
          正在跳转...
        </p>
      </div>
    );
  }

  if (showSuccess) {
    return (
      <div className="flex flex-col items-center justify-center py-24">
        <div className="relative flex h-20 w-20 items-center justify-center">
          <div className="absolute inset-0 animate-ping rounded-full bg-emerald-500/20" />
          <div className="relative flex h-16 w-16 items-center justify-center rounded-full bg-gradient-to-br from-emerald-400 to-emerald-600 shadow-lg shadow-emerald-500/30">
            <svg
              viewBox="0 0 24 24"
              className="h-8 w-8 fill-none stroke-white stroke-[3] stroke-linecap-round stroke-linejoin-round"
              style={{
                strokeDasharray: 30,
                strokeDashoffset: 0,
                animation: "draw-check 0.4s ease-out forwards",
              }}
            >
              <polyline points="20 6 9 17 4 12" />
            </svg>
          </div>
        </div>
        <p className="mt-4 text-base font-semibold text-[hsl(var(--foreground))]">
          设置成功！
        </p>
        <p className="mt-1 text-sm text-[hsl(var(--muted-foreground))]">
          正在跳转到匹配页面...
        </p>
        <style>{`
          @keyframes draw-check {
            from { stroke-dashoffset: 30; }
            to { stroke-dashoffset: 0; }
          }
        `}</style>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-5">
      <div>
        <h1 className="flex items-center gap-2 text-2xl font-bold">
          <svg
            viewBox="0 0 24 24"
            className="h-6 w-6 fill-none stroke-current stroke-2 stroke-linecap-round stroke-linejoin-round text-brand-blue"
          >
            <path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2" />
            <circle cx="9" cy="7" r="4" />
            <path d="M22 21v-2a4 4 0 0 0-3-3.87" />
            <path d="M16 3.13a4 4 0 0 1 0 7.75" />
          </svg>
          匹配偏好设置
        </h1>
        <p className="mt-1 text-sm font-semibold text-brand-muted">
          {profileData.photoMatchPref
            ? "你可以每天修改一次匹配偏好。"
            : "你的颜值评分已完成，请选择你的匹配偏好。"}
        </p>
      </div>

      <div className="relative overflow-hidden rounded-2xl border border-brand-line bg-white shadow-sm">
        <div className="absolute inset-x-0 top-0 h-1 bg-gradient-to-r from-brand-blue via-brand-cyan to-emerald-400" />
        <div className="flex items-center gap-4 px-5 py-5">
          <div
            className={`flex h-16 w-16 shrink-0 items-center justify-center rounded-2xl ${scoreBgColor(finalScore)}`}
          >
            <span className={`text-2xl font-bold ${scoreColor(finalScore)}`}>
              {finalScore}
            </span>
          </div>
          <div>
            <p className="text-sm font-semibold text-brand-text">
              你的颜值评分
            </p>
            <p className="mt-1 text-[13px] font-medium leading-5 text-brand-muted">
              完成评分后可配置照片匹配偏好。
            </p>
          </div>
        </div>
      </div>

      {profileData.photoMatchPref && (
        <div
          className={`rounded-2xl border bg-white px-4 py-3 shadow-sm ${
            matchPrefCooldownActive
              ? "border-amber-300"
              : "border-emerald-300"
          }`}
        >
          <div className="flex items-start gap-3">
            <div
              className={`mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-lg ${
                matchPrefCooldownActive
                  ? "bg-gold-1 text-amber-600"
                  : "bg-green-1 text-emerald-600"
              }`}
            >
              <svg
                viewBox="0 0 24 24"
                className="h-4 w-4 fill-none stroke-current stroke-2 stroke-linecap-round stroke-linejoin-round"
              >
                <path d="M12 6v6l4 2" />
                <circle cx="12" cy="12" r="10" />
              </svg>
            </div>
            <div className="min-w-0">
              <p className="text-sm font-bold text-brand-text">
                当前设置：{getPreferenceLabel(profileData.photoMatchPref, currentHighScoreOnly)}
              </p>
              <p
                className={`mt-1 text-[13px] font-medium leading-5 ${
                  matchPrefCooldownActive
                    ? "text-amber-700"
                    : "text-brand-muted"
                }`}
              >
                {cooldownHint}
              </p>
            </div>
          </div>
        </div>
      )}

      <div className="space-y-3">
        <h2 className="text-sm font-bold text-brand-text">
          选择匹配方式
        </h2>

        <button
          type="button"
          disabled={matchPrefCooldownActive}
          onClick={() => {
            setSelected("ALL");
            setHighScoreOnly(false);
          }}
          className={`group flex w-full items-start gap-3.5 rounded-2xl border bg-white p-4 text-left shadow-sm transition-all disabled:cursor-not-allowed ${
            selected === "ALL"
              ? "border-brand-blue shadow-[0_8px_20px_rgba(22,119,255,0.10)] ring-2 ring-brand-blue/10"
              : "border-brand-line hover:border-brand-blue/30"
          }`}
        >
          <div className="mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center">
            <div
              className={`flex h-[18px] w-[18px] items-center justify-center rounded-full border-2 transition-all ${
                selected === "ALL"
                  ? "border-brand-blue"
                  : "border-[hsl(var(--muted-foreground)/0.4)]"
              }`}
            >
              {selected === "ALL" && (
                <div className="h-2.5 w-2.5 rounded-full bg-brand-blue" />
              )}
            </div>
          </div>
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-2">
              <svg
                viewBox="0 0 24 24"
                className={`h-4 w-4 fill-none stroke-current stroke-2 stroke-linecap-round stroke-linejoin-round ${
                  selected === "ALL"
                    ? "text-brand-blue"
                    : "text-brand-muted"
                }`}
              >
                <path d="M18 21a8 8 0 0 0-16 0" />
                <circle cx="10" cy="8" r="5" />
                <path d="M22 20c0-3.37-2-6.5-4-8a5 5 0 0 0-.45-8.3" />
              </svg>
              <span className="text-sm font-bold text-brand-text">
                与所有用户匹配
              </span>
            </div>
            <p className="mt-1 text-[13px] font-medium leading-5 text-brand-muted">
              包括没有上传照片的用户，获得最多的匹配机会
            </p>
          </div>
        </button>

        <div>
          <button
            type="button"
            disabled={matchPrefCooldownActive}
            onClick={() => setSelected("PHOTO_ONLY")}
            className={`group flex w-full items-start gap-3.5 rounded-2xl border bg-white p-4 text-left shadow-sm transition-all disabled:cursor-not-allowed ${
              selected === "PHOTO_ONLY"
                ? "border-brand-blue shadow-[0_8px_20px_rgba(22,119,255,0.10)] ring-2 ring-brand-blue/10"
                : "border-brand-line hover:border-brand-blue/30"
            } ${selected === "PHOTO_ONLY" ? "rounded-b-xl" : ""}`}
          >
            <div className="mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center">
              <div
                className={`flex h-[18px] w-[18px] items-center justify-center rounded-full border-2 transition-all ${
                  selected === "PHOTO_ONLY"
                    ? "border-brand-blue"
                    : "border-[hsl(var(--muted-foreground)/0.4)]"
                }`}
              >
                {selected === "PHOTO_ONLY" && (
                  <div className="h-2.5 w-2.5 rounded-full bg-brand-blue" />
                )}
              </div>
            </div>
            <div className="min-w-0 flex-1">
              <div className="flex items-center gap-2">
                <svg
                  viewBox="0 0 24 24"
                  className={`h-4 w-4 fill-none stroke-current stroke-2 stroke-linecap-round stroke-linejoin-round ${
                    selected === "PHOTO_ONLY"
                      ? "text-brand-blue"
                      : "text-brand-muted"
                  }`}
                >
                  <path d="M14.5 4h-5L7 7H4a2 2 0 0 0-2 2v9a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2V9a2 2 0 0 0-2-2h-3l-2.5-3z" />
                  <circle cx="12" cy="13" r="3" />
                </svg>
                <span className="text-sm font-bold text-brand-text">
                  仅与有照片用户匹配
                </span>
              </div>
              <p className="mt-1 text-[13px] font-medium leading-5 text-brand-muted">
                只与上传了照片的用户匹配，确保双方都有颜值参考
              </p>
            </div>
          </button>

          {selected === "PHOTO_ONLY" && canHighScore && (
            <div className="ml-7 mt-1.5">
              <button
                type="button"
                disabled={matchPrefCooldownActive}
                onClick={() => setHighScoreOnly(!highScoreOnly)}
                className={`flex w-full items-start gap-3 rounded-xl border bg-white p-3.5 text-left shadow-sm transition-all disabled:cursor-not-allowed ${
                  highScoreOnly
                    ? "border-amber-400 ring-2 ring-amber-400/10"
                    : "border-brand-line hover:border-amber-400/40"
                }`}
              >
                <div className="mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center">
                  <div
                    className={`flex h-[18px] w-[18px] items-center justify-center rounded-md border-2 transition-all ${
                      highScoreOnly
                        ? "border-amber-400 bg-amber-400"
                        : "border-[hsl(var(--muted-foreground)/0.4)]"
                    }`}
                  >
                    {highScoreOnly && (
                      <svg
                        viewBox="0 0 24 24"
                        className="h-3 w-3 fill-none stroke-white stroke-[3] stroke-linecap-round stroke-linejoin-round"
                      >
                        <polyline points="20 6 9 17 4 12" />
                      </svg>
                    )}
                  </div>
                </div>
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2">
                    <svg
                      viewBox="0 0 24 24"
                      className={`h-4 w-4 fill-none stroke-current stroke-2 stroke-linecap-round stroke-linejoin-round ${
                        highScoreOnly
                          ? "text-amber-500"
                          : "text-brand-muted"
                      }`}
                    >
                      <polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2" />
                    </svg>
                    <span className="text-sm font-bold text-brand-text">
                      仅与高分用户匹配
                    </span>
                    <span className="rounded-md bg-gold-1 px-1.5 py-0.5 text-[10px] font-bold text-amber-600">
                      ≥ 7.0
                    </span>
                  </div>
                  <p className="mt-1 text-[13px] font-medium leading-5 text-brand-muted">
                    只匹配颜值评分 7.0 及以上的优质用户
                  </p>
                </div>
              </button>
            </div>
          )}
        </div>
      </div>

      {submitError && (
        <div className="rounded-lg border border-[hsl(0,62%,50%/0.3)] bg-[hsl(0,62%,50%/0.1)] px-4 py-3 text-sm text-[hsl(0,62%,45%)]">
          {submitError}
        </div>
      )}

      <button
        type="button"
        disabled={submitDisabled}
        onClick={handleSubmit}
        className={`flex items-center justify-center gap-2 rounded-xl py-3 text-sm font-semibold transition-all ${
          !submitDisabled
            ? "bg-brand-blue text-white shadow-[0_10px_24px_rgba(22,119,255,0.20)] hover:scale-[1.01] hover:bg-brand-blue/95 active:scale-[0.99]"
            : "cursor-not-allowed bg-white text-brand-muted shadow-sm ring-1 ring-brand-line"
        } disabled:opacity-100`}
      >
        {submitting ? (
          <div className="h-4 w-4 animate-spin rounded-full border-2 border-current border-t-transparent" />
        ) : (
          <svg
            viewBox="0 0 24 24"
            className="h-4 w-4 fill-none stroke-current stroke-2 stroke-linecap-round stroke-linejoin-round"
          >
            <polyline points="20 6 9 17 4 12" />
          </svg>
        )}
        {submitLabel()}
      </button>

      <p
        className={`text-center text-xs ${
          matchPrefCooldownActive
            ? "text-amber-700"
            : "font-semibold text-brand-muted"
        }`}
      >
        {cooldownHint}
      </p>
    </div>
  );
}
