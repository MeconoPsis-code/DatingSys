"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";

/* ─── Types ──────────────────────────────────────────── */

type PhotoMatchPref = "ALL" | "PHOTO_ONLY";

interface ProfileData {
  hasPhotos: boolean;
  ratingProfile: {
    ratingStatus: string;
    finalScore: number | null;
    scoreCompletedAt: string | null;
  } | null;
}

/* ─── Component ──────────────────────────────────────── */

export default function MatchPreferencesPage() {
  const router = useRouter();

  const [loading, setLoading] = useState(true);
  const [profileData, setProfileData] = useState<ProfileData | null>(null);
  const [fetchError, setFetchError] = useState<string | null>(null);

  const [selected, setSelected] = useState<PhotoMatchPref | null>(null);
  const [highScoreOnly, setHighScoreOnly] = useState(false);

  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [showSuccess, setShowSuccess] = useState(false);

  // Fetch profile data on mount
  useEffect(() => {
    (async () => {
      try {
        const res = await fetch("/api/profile/me");
        if (!res.ok) {
          const data = await res.json();
          throw new Error(data.error?.message || "加载失败");
        }
        const { data } = await res.json();
        setProfileData({
          hasPhotos: data.hasPhotos,
          ratingProfile: data.ratingProfile,
        });
      } catch (err) {
        setFetchError(err instanceof Error ? err.message : "加载失败");
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  // Redirect if not eligible
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
      return;
    }
  }, [loading, profileData, router]);

  const finalScore = profileData?.ratingProfile?.finalScore ?? 0;
  const canHighScore = finalScore >= 7.0;

  // Reset highScoreOnly when switching away from PHOTO_ONLY
  useEffect(() => {
    if (selected !== "PHOTO_ONLY") {
      setHighScoreOnly(false);
    }
  }, [selected]);

  async function handleSubmit() {
    if (!selected) return;
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

      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error?.message || "保存失败");
      }

      // Show success animation, then redirect
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

  /* ─── Loading state ──────────────────────────────── */
  if (loading) {
    return (
      <div className="flex flex-col items-center justify-center py-24">
        <div className="h-8 w-8 animate-spin rounded-full border-2 border-[hsl(var(--primary))] border-t-transparent" />
        <p className="mt-3 text-sm text-[hsl(var(--muted-foreground))]">
          加载中…
        </p>
      </div>
    );
  }

  /* ─── Fetch error state ──────────────────────────── */
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

  /* ─── Ineligible — will redirect ─────────────────── */
  if (
    !profileData?.hasPhotos ||
    !profileData?.ratingProfile ||
    profileData.ratingProfile.ratingStatus !== "COMPLETED"
  ) {
    return (
      <div className="flex flex-col items-center justify-center py-24">
        <div className="h-8 w-8 animate-spin rounded-full border-2 border-[hsl(var(--primary))] border-t-transparent" />
        <p className="mt-3 text-sm text-[hsl(var(--muted-foreground))]">
          正在跳转…
        </p>
      </div>
    );
  }

  /* ─── Success overlay ────────────────────────────── */
  if (showSuccess) {
    return (
      <div className="flex flex-col items-center justify-center py-24">
        <div className="relative flex h-20 w-20 items-center justify-center">
          {/* Animated ring */}
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
          正在跳转到匹配页面…
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

  /* ─── Score color helper ─────────────────────────── */
  function scoreColor(s: number) {
    if (s >= 8) return "text-emerald-400";
    if (s >= 7) return "text-brand-blue";
    if (s >= 5) return "text-amber-400";
    return "text-[hsl(0,60%,65%)]";
  }

  function scoreBgColor(s: number) {
    if (s >= 8) return "bg-emerald-500/10";
    if (s >= 7) return "bg-brand-blue/10";
    if (s >= 5) return "bg-amber-500/10";
    return "bg-[hsl(0,60%,50%/0.1)]";
  }

  /* ─── Main UI ────────────────────────────────────── */
  return (
    <div className="flex flex-col gap-5">
      {/* Header */}
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
        <p className="mt-1 text-sm text-[hsl(var(--muted-foreground))]">
          你的颜值评分已完成，请选择你的匹配偏好。
        </p>
      </div>

      {/* Score display card */}
      <div className="relative overflow-hidden rounded-2xl border border-[hsl(var(--border))] bg-[hsl(var(--card))]">
        {/* Decorative gradient bar */}
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
            <p className="text-sm font-medium text-[hsl(var(--foreground))]">
              你的颜值评分
            </p>
          </div>
        </div>
      </div>

      {/* Options */}
      <div className="space-y-3">
        <h2 className="text-sm font-semibold text-[hsl(var(--foreground))]">
          选择匹配方式
        </h2>

        {/* Option 1: ALL */}
        <button
          type="button"
          onClick={() => setSelected("ALL")}
          className={`group flex w-full items-start gap-3.5 rounded-2xl border p-4 text-left transition-all ${
            selected === "ALL"
              ? "border-brand-blue/30 bg-brand-blue/10 shadow-[0_4px_12px_rgba(22,119,255,0.08)]"
              : "border-[hsl(var(--border))] bg-[hsl(var(--card))] hover:border-[hsl(var(--primary)/0.3)]"
          }`}
        >
          {/* Radio indicator */}
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
                    : "text-[hsl(var(--muted-foreground))]"
                }`}
              >
                <path d="M18 21a8 8 0 0 0-16 0" />
                <circle cx="10" cy="8" r="5" />
                <path d="M22 20c0-3.37-2-6.5-4-8a5 5 0 0 0-.45-8.3" />
              </svg>
              <span className="text-sm font-semibold text-[hsl(var(--foreground))]">
                与所有用户匹配
              </span>
            </div>
            <p className="mt-1 text-xs text-[hsl(var(--muted-foreground))]">
              包括没有上传照片的用户，获得最多的匹配机会
            </p>
          </div>
        </button>

        {/* Option 2: PHOTO_ONLY */}
        <div>
          <button
            type="button"
            onClick={() => setSelected("PHOTO_ONLY")}
            className={`group flex w-full items-start gap-3.5 rounded-2xl border p-4 text-left transition-all ${
              selected === "PHOTO_ONLY"
                ? "border-brand-blue/30 bg-brand-blue/10 shadow-[0_4px_12px_rgba(22,119,255,0.08)]"
                : "border-[hsl(var(--border))] bg-[hsl(var(--card))] hover:border-[hsl(var(--primary)/0.3)]"
            } ${selected === "PHOTO_ONLY" ? "rounded-b-xl" : ""}`}
          >
            {/* Radio indicator */}
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
                      : "text-[hsl(var(--muted-foreground))]"
                  }`}
                >
                  <path d="M14.5 4h-5L7 7H4a2 2 0 0 0-2 2v9a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2V9a2 2 0 0 0-2-2h-3l-2.5-3z" />
                  <circle cx="12" cy="13" r="3" />
                </svg>
                <span className="text-sm font-semibold text-[hsl(var(--foreground))]">
                  仅与有照片用户匹配
                </span>
              </div>
              <p className="mt-1 text-xs text-[hsl(var(--muted-foreground))]">
                只与上传了照片的用户匹配，确保双方都有颜值参考
              </p>
            </div>
          </button>

          {/* Sub-option: High score only — visible only when PHOTO_ONLY selected + score >= 7 */}
          {selected === "PHOTO_ONLY" && canHighScore && (
            <div className="ml-7 mt-1.5">
              <button
                type="button"
                onClick={() => setHighScoreOnly(!highScoreOnly)}
                className={`flex w-full items-start gap-3 rounded-xl border p-3.5 text-left transition-all ${
                  highScoreOnly
                    ? "border-amber-400/30 bg-amber-500/10"
                    : "border-[hsl(var(--border))] bg-[hsl(var(--card))] hover:border-amber-400/20"
                }`}
              >
                {/* Checkbox indicator */}
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
                          ? "text-amber-400"
                          : "text-[hsl(var(--muted-foreground))]"
                      }`}
                    >
                      <polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2" />
                    </svg>
                    <span className="text-sm font-semibold text-[hsl(var(--foreground))]">
                      仅与高分用户匹配
                    </span>
                    <span className="rounded-md bg-amber-500/15 px-1.5 py-0.5 text-[10px] font-semibold text-amber-400">
                      ≥ 7.0
                    </span>
                  </div>
                  <p className="mt-1 text-xs text-[hsl(var(--muted-foreground))]">
                    只匹配颜值评分 7.0 及以上的优质用户
                  </p>
                </div>
              </button>
            </div>
          )}
        </div>
      </div>

      {/* Submit error */}
      {submitError && (
        <div className="rounded-lg border border-[hsl(0,62%,50%/0.3)] bg-[hsl(0,62%,50%/0.1)] px-4 py-3 text-sm text-[hsl(0,62%,70%)]">
          {submitError}
        </div>
      )}

      {/* Submit button */}
      <button
        type="button"
        disabled={!selected || submitting}
        onClick={handleSubmit}
        className={`flex items-center justify-center gap-2 rounded-xl py-3 text-sm font-semibold transition-all ${
          selected
            ? "bg-brand-blue text-white shadow-brand-blue/20 hover:bg-brand-blue/95 hover:scale-[1.01] active:scale-[0.99]"
            : "cursor-not-allowed bg-[hsl(var(--secondary))] text-[hsl(var(--muted-foreground))]"
        } disabled:opacity-60`}
      >
        {submitting ? (
          <>
            <div className="h-4 w-4 animate-spin rounded-full border-2 border-white border-t-transparent" />
            保存中…
          </>
        ) : (
          <>
            <svg
              viewBox="0 0 24 24"
              className="h-4 w-4 fill-none stroke-current stroke-2 stroke-linecap-round stroke-linejoin-round"
            >
              <polyline points="20 6 9 17 4 12" />
            </svg>
            确认选择
          </>
        )}
      </button>

      {/* Info note */}
      <p className="text-center text-xs text-[hsl(var(--muted-foreground))]">
        你可以随时在个人资料编辑页面中修改匹配偏好。
      </p>
    </div>
  );
}
