"use client";

import { useState, useEffect, useMemo } from "react";
import { useRouter } from "next/navigation";
import { PROVINCES, getCities, isOverseas } from "@/data/regions";
import { MAIN_ATTRIBUTE_OPTIONS, ATTRIBUTE_OPTIONS } from "@/data/attributes";
import { LOCATION_TYPE_OPTIONS } from "@/data/location-types";
import { MBTI_OPTIONS } from "@/data/mbti";
import { ConfirmModal } from "@/components/ui/confirm-modal";
import { PhotoUploader } from "@/components/profile/photo-uploader";
import { DualRangeSlider } from "@/components/DualRangeSlider";
import { MeasurementSlider } from "@/components/MeasurementSlider";
import { AlertModal } from "@/components/ui/alert-modal";
import {
  HEIGHT_DEFAULT_CM,
  HEIGHT_MAX_CM,
  HEIGHT_MIN_CM,
  WEIGHT_DEFAULT_KG,
  WEIGHT_MAX_KG,
  WEIGHT_MIN_KG,
} from "@/lib/profile-limits";
import { formatBmi } from "@/lib/bmi";

interface PhotoItem {
  id: string;
  order: number;
  originalName: string | null;
  url: string;
}

/* ─── Types ──────────────────────────────────────────── */

type Attribute = "ONE" | "ZERO" | "HALF" | "LEAN_ONE" | "LEAN_ZERO" | "SIDE" | "OTHER";
type LocationType = "RESIDENCE" | "HOMETOWN" | "SCHOOL" | "WORK" | "TRAVEL" | "OTHER";
type PhotoMatchPref = "PHOTO_ONLY" | "ALL";

/* Shared select styling — ensures placeholder and options are visible in dark mode */
const SELECT_CLS =
  "w-full rounded-lg border border-[hsl(var(--input))] bg-[hsl(var(--card))] px-3 py-2.5 text-sm text-[hsl(var(--foreground))] focus:border-[hsl(var(--ring))] focus:outline-none focus:ring-1 focus:ring-[hsl(var(--ring))]";
const SELECT_CLS_EMPTY =
  `${SELECT_CLS} text-[hsl(var(--muted-foreground))]`;

interface FormState {
  // Basic info
  birthYear: string;
  birthMonth: string;
  birthDay: string;
  heightCm: string;
  weightKg: string;
  // Location
  provinceCode: string;
  cityCode: string;
  locationType: LocationType;
  // Attribute
  attribute: Attribute | "";
  isSide: boolean;
  isOther: boolean;
  customAttribute: string;
  // MBTI
  mbti: string;
  // Self intro
  selfIntro: string;
  // Photo matching
  photoMatchPref: PhotoMatchPref | "";
  highScoreOnly: boolean;
  // Preference
  ageMin: string;
  ageMax: string;
  heightMinCm: string;
  heightMaxCm: string;
  weightMinKg: string;
  weightMaxKg: string;

  expectedAttributes: Attribute[];
  expectedCustomAttribute: string;
  // Consent
  consent: boolean;
}

const INITIAL_FORM: FormState = {
  birthYear: "",
  birthMonth: "",
  birthDay: "",
  heightCm: "170",
  weightKg: "60",
  provinceCode: "",
  cityCode: "",
  locationType: "RESIDENCE",
  attribute: "",
  isSide: false,
  isOther: false,
  customAttribute: "",
  mbti: "",
  selfIntro: "",
  photoMatchPref: "",
  highScoreOnly: false,
  ageMin: "18",
  ageMax: "35",
  heightMinCm: "150",
  heightMaxCm: "200",
  weightMinKg: "40",
  weightMaxKg: "100",

  expectedAttributes: [],
  expectedCustomAttribute: "",
  consent: false,
};

/* ─── Helpers ────────────────────────────────────────── */

function range(start: number, end: number): number[] {
  const arr: number[] = [];
  for (let i = start; i <= end; i++) arr.push(i);
  return arr;
}

const YEARS = range(1960, 2010).reverse();
const MONTHS = range(1, 12);
const DAYS = range(1, 31);

function isUnder18(birthYear: number, birthMonth: number, birthDay: number): boolean {
  const today = new Date();
  const year = today.getFullYear();
  const month = today.getMonth() + 1; // 1-indexed
  const day = today.getDate();

  const age = year - birthYear;
  if (age < 18) return true;
  if (age > 18) return false;

  if (month < birthMonth) return true;
  if (month > birthMonth) return false;
  return day < birthDay;
}

function resolveSelectedAttribute(
  attribute: Attribute | "",
  isSide: boolean,
  isOther: boolean,
): Attribute | "" {
  if (attribute) return attribute;
  if (isSide) return "SIDE";
  if (isOther) return "OTHER";
  return "";
}



/* ─── Component ──────────────────────────────────────── */

export default function ProfileEditPage() {
  const router = useRouter();
  const [form, setForm] = useState<FormState>(INITIAL_FORM);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [isExisting, setIsExisting] = useState(false); // whether profile already exists
  const [originalProfileStatus, setOriginalProfileStatus] = useState<string>("DRAFT");

  // Cooldown state from API
  const [cooldowns, setCooldowns] = useState<{
    canPublish: boolean;
    publishCooldownRemaining: number;
    canEdit: boolean;
    editCooldownRemaining: number;
    editCooldownRemainingText?: string;
    isPhotoRevokeCooldown?: boolean;
  }>({ canPublish: true, publishCooldownRemaining: 0, canEdit: true, editCooldownRemaining: 0 });

  // Confirm modal state
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [pendingStatus, setPendingStatus] = useState<"DRAFT" | "ACTIVE">("DRAFT");
  const [showAgeAlert, setShowAgeAlert] = useState(false);

  // Photo state
  const [photos, setPhotos] = useState<PhotoItem[]>([]);
  const [wantPhotos, setWantPhotos] = useState(false);
  const [showClearPhotosConfirm, setShowClearPhotosConfirm] = useState(false);
  const [deleteAllPhotos, setDeleteAllPhotos] = useState(false);
  const [hasDraft, setHasDraft] = useState(false);

  // Cities based on selected province
  const cities = useMemo(
    () => (form.provinceCode ? getCities(form.provinceCode) : []),
    [form.provinceCode]
  );
  const bmiValue = useMemo(
    () => formatBmi(Number(form.heightCm), Number(form.weightKg)),
    [form.heightCm, form.weightKg]
  );

  /* ── Fetch existing profile ── */
  useEffect(() => {
    function populateForm(
      profileSrc: Record<string, unknown>,
      prefSrc: Record<string, unknown> | null
    ) {
      const bd = new Date(profileSrc.birthDate as string);
      setForm((prev) => ({
        ...prev,
        birthYear: String(bd.getFullYear()),
        birthMonth: String(bd.getMonth() + 1),
        birthDay: String(bd.getDate()),
        heightCm: String(profileSrc.heightCm),
        weightKg: String(profileSrc.weightKg),
        provinceCode: (profileSrc.provinceCode as string) || "",
        cityCode: (profileSrc.cityCode as string) || "",
        locationType: ((profileSrc.locationType as string) || "RESIDENCE") as LocationType,
        attribute: ((profileSrc.attribute as string) || "") as Attribute,
        isSide: (profileSrc.isSide as boolean) ?? false,
        isOther: (profileSrc.isOther as boolean) ?? false,
        customAttribute: (profileSrc.customAttribute as string) || "",
        mbti: (profileSrc.mbti as string) || "",
        selfIntro: (profileSrc.selfIntro as string) || "",
        photoMatchPref: ((profileSrc.photoMatchPref as string) || "") as "" | PhotoMatchPref,
        highScoreOnly: (profileSrc.highScoreOnly as boolean) ?? false,
        consent: (profileSrc.consentProfileVisibility as boolean) ?? false,
        ...(prefSrc
          ? {
              ageMin: String(prefSrc.ageMin ?? 18),
              ageMax: String(prefSrc.ageMax ?? 35),
              heightMinCm: String(prefSrc.heightMinCm ?? 150),
              heightMaxCm: String(prefSrc.heightMaxCm ?? 200),
              weightMinKg: String(prefSrc.weightMinKg ?? 40),
              weightMaxKg: String(prefSrc.weightMaxKg ?? 100),
              expectedAttributes: Array.isArray(prefSrc.expectedAttributes)
                ? (prefSrc.expectedAttributes as Attribute[])
                : [],
              expectedCustomAttribute:
                (prefSrc.expectedCustomAttribute as string) || "",
            }
          : {}),
      }));
    }

    async function load() {
      try {
        const res = await fetch("/api/profile/me");
        if (!res.ok) {
          if (res.status === 401) {
            window.location.href = "/login";
            return;
          }
          throw new Error("加载资料失败");
        }
        const data = await res.json();
        const profile = data.data?.profile;
        const pref = data.data?.preference;
        const cd = data.data?.cooldowns;

        if (cd) setCooldowns(cd);

        if (profile) {
          setIsExisting(true);
          setOriginalProfileStatus(profile.status || "DRAFT");

          // Check if there's saved draft data for an ACTIVE profile
          const draft = profile.draftData as {
            profile?: Record<string, unknown>;
            preference?: Record<string, unknown>;
            deleteAllPhotos?: boolean;
          } | null;

          if (draft && profile.status === "ACTIVE" && draft.profile) {
            // Load form from draft data
            setHasDraft(true);
            populateForm(draft.profile, draft.preference ?? null);
            if (draft.deleteAllPhotos) {
              setDeleteAllPhotos(true);
              setWantPhotos(false);
            }
          } else {
            // Load form from published profile
            populateForm(profile, pref);
          }

          // Always load published preference if not loaded from draft
          if (!draft?.preference && pref) {
            setForm((prev) => ({
              ...prev,
              ageMin: String(pref.ageMin ?? 18),
              ageMax: String(pref.ageMax ?? 35),
              heightMinCm: String(pref.heightMinCm ?? 150),
              heightMaxCm: String(pref.heightMaxCm ?? 200),
              weightMinKg: String(pref.weightMinKg ?? 40),
              weightMaxKg: String(pref.weightMaxKg ?? 100),
              expectedAttributes: Array.isArray(pref.expectedAttributes)
                ? pref.expectedAttributes
                : [],
              expectedCustomAttribute: pref.expectedCustomAttribute || "",
            }));
          }
        }

        // Load photos — always from server (published photos, not draft)
        if (profile) {
          try {
            const photoRes = await fetch(
              profile.status === "ACTIVE" ? "/api/profile/photos?mode=draft" : "/api/profile/photos"
            );
            if (photoRes.ok) {
              const photoData = await photoRes.json();
              const loadedPhotos = photoData.data?.photos || [];
              setPhotos(loadedPhotos);
              if (loadedPhotos.length > 0) {
                setWantPhotos(true);
              }
            }
          } catch {
            // Photos are optional, don't block on error
          }
        }
      } catch (err) {
        setError(err instanceof Error ? err.message : "加载失败");
      } finally {
        setLoading(false);
      }
    }
    load();
  }, []);

  /* ── Form updaters ── */
  function updateField<K extends keyof FormState>(key: K, value: FormState[K]) {
    setForm((prev) => ({ ...prev, [key]: value }));
  }

  function toggleExpectedAttr(attr: Attribute) {
    setForm((prev) => {
      const has = prev.expectedAttributes.includes(attr);
      return {
        ...prev,
        expectedAttributes: has
          ? prev.expectedAttributes.filter((a) => a !== attr)
          : [...prev.expectedAttributes, attr],
      };
    });
  }

  // Reset city when province changes
  function handleProvinceChange(code: string) {
    setForm((prev) => ({ ...prev, provinceCode: code, cityCode: "" }));
  }

  /* ── Validation ── */
  function validate(status: "DRAFT" | "ACTIVE"): string | null {
    if (!form.birthYear || !form.birthMonth || !form.birthDay) return "请选择出生日期";
    if (!form.heightCm) return "请输入身高";
    const hVal = Number(form.heightCm);
    if (isNaN(hVal) || hVal < HEIGHT_MIN_CM || hVal > HEIGHT_MAX_CM) {
      return `身高范围: ${HEIGHT_MIN_CM}-${HEIGHT_MAX_CM}cm`;
    }
    if (!form.weightKg) return "请输入体重";
    const wVal = Number(form.weightKg);
    if (isNaN(wVal) || wVal < WEIGHT_MIN_KG || wVal > WEIGHT_MAX_KG) {
      return `体重范围: ${WEIGHT_MIN_KG}-${WEIGHT_MAX_KG}kg`;
    }
    if (!form.provinceCode) return "请选择地区";
    if (!form.cityCode) return isOverseas(form.provinceCode) ? "请选择国家" : "请选择城市";
    if (!resolveSelectedAttribute(form.attribute, form.isSide, form.isOther)) return "请选择属性";

    // Age >= 18 (only validated for ACTIVE status)
    const bd = new Date(
      Number(form.birthYear),
      Number(form.birthMonth) - 1,
      Number(form.birthDay)
    );
    const today = new Date();
    let age = today.getFullYear() - bd.getFullYear();
    const monthDiff = today.getMonth() - bd.getMonth();
    if (monthDiff < 0 || (monthDiff === 0 && today.getDate() < bd.getDate())) {
      age--;
    }
    if (status === "ACTIVE" && age < 18) return "必须年满 18 岁";

    // Preference ranges
    const ageMin = Number(form.ageMin);
    const ageMax = Number(form.ageMax);
    if (ageMin > ageMax) return "期望年龄范围无效（最小值不能大于最大值）";

    const hMin = Number(form.heightMinCm);
    const hMax = Number(form.heightMaxCm);
    if (hMin > hMax) return "期望身高范围无效（最小值不能大于最大值）";

    const wMin = Number(form.weightMinKg);
    const wMax = Number(form.weightMaxKg);
    if (wMin > wMax) return "期望体重范围无效（最小值不能大于最大值）";

    if (form.expectedAttributes.length === 0) return "请至少选择一个期望属性";


    if (status === "ACTIVE" && !form.consent) return "发布资料需要勾选同意条款";

    return null;
  }

  /* ── Submit (called after confirmation) ── */
  async function doSubmit(status: "DRAFT" | "ACTIVE") {
    setSubmitting(true);
    setError(null);

    const birthDate = `${form.birthYear}-${String(form.birthMonth).padStart(2, "0")}-${String(form.birthDay).padStart(2, "0")}`;
    const resolvedAttribute = resolveSelectedAttribute(
      form.attribute,
      form.isSide,
      form.isOther,
    );

    const body = {
      deleteAllPhotos,
      profile: {
        poolType: undefined, // removed — single pool
        birthDate,
        heightCm: Number(form.heightCm),
        weightKg: Number(form.weightKg),
        provinceCode: form.provinceCode,
        cityCode: form.cityCode,
        locationType: form.locationType,
        attribute: resolvedAttribute,
        isSide: form.isSide,
        isOther: form.isOther,
        customAttribute: null,
        mbti: form.mbti || null,
        selfIntro: form.selfIntro || null,
        consentProfileVisibility: form.consent,
        status,
        photoMatchPref: null,
        highScoreOnly: false,
      },
      preference: {
        ageMin: Number(form.ageMin),
        ageMax: Number(form.ageMax),
        heightMinCm: Number(form.heightMinCm),
        heightMaxCm: Number(form.heightMaxCm),
        weightMinKg: Number(form.weightMinKg),
        weightMaxKg: Number(form.weightMaxKg),

        expectedAttributes: form.expectedAttributes,
        expectedCustomAttribute: form.expectedAttributes.includes("OTHER" as Attribute)
          ? form.expectedCustomAttribute.trim() || null
          : null,
      },
    };

    try {
      const res = await fetch("/api/profile/me", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });

      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error?.message || "保存失败");
      }

      const refreshRes = await fetch("/api/auth/refresh", { method: "POST", cache: "no-store" });
      if (!refreshRes.ok) {
        throw new Error("登录状态刷新失败，请刷新页面后重试");
      }
      router.refresh();

      router.push("/profile");
    } catch (err) {
      setError(err instanceof Error ? err.message : "保存失败");
      window.scrollTo({ top: 0, behavior: "smooth" });
    } finally {
      setSubmitting(false);
    }
  }

  /* ── Request confirmation before submit ── */
  function handleSubmit(status: "DRAFT" | "ACTIVE") {
    const under18 = isUnder18(
      Number(form.birthYear),
      Number(form.birthMonth),
      Number(form.birthDay)
    );

    if (status === "ACTIVE" && under18) {
      setShowAgeAlert(true);
      return;
    }

    const err = validate(status);
    if (err) {
      setError(err);
      window.scrollTo({ top: 0, behavior: "smooth" });
      return;
    }
    if (status === "DRAFT") {
      // Draft saves skip confirmation
      doSubmit("DRAFT");
    } else {
      setPendingStatus(status);
      setConfirmOpen(true);
    }
  }

  const photoApiUrl = originalProfileStatus === "ACTIVE"
    ? "/api/profile/photos?mode=draft"
    : "/api/profile/photos";

  function handlePhotosChange(nextPhotos: PhotoItem[]) {
    setPhotos(nextPhotos);
    setDeleteAllPhotos(originalProfileStatus === "ACTIVE" && nextPhotos.length === 0);
    if (nextPhotos.length > 0) {
      setWantPhotos(true);
    }
  }

  async function handleClearPhotos() {
    const photosToClear = photos;
    setShowClearPhotosConfirm(false);
    setDeleteAllPhotos(true);
    setPhotos([]);
    setWantPhotos(false);

    try {
      for (const photo of photosToClear) {
        const res = await fetch(photoApiUrl, {
          method: "DELETE",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ photoId: photo.id }),
        });

        if (!res.ok) {
          const data = await res.json().catch(() => null);
          throw new Error(data?.error?.message || "删除照片失败");
        }
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "删除照片失败");
      setPhotos(photosToClear);
      setWantPhotos(photosToClear.length > 0);
    }
  }

  // Confirmation text depends on action
  const confirmText = isExisting
    ? (pendingStatus === "ACTIVE" ? "确认修改并发布我的资料" : "确认修改我的资料")
    : (pendingStatus === "ACTIVE" ? "确认提交并发布我的资料" : "确认提交我的资料");

  const confirmDesc = isExisting
    ? `修改后 ${7} 天内不能再次修改，请确认所有信息无误。`
    : `提交后 ${7} 天内不能修改，请确认所有信息无误。`;

  /* ── Loading state ── */
  if (loading) {
    return (
      <div className="flex flex-col items-center justify-center py-20">
        <div className="h-8 w-8 animate-spin rounded-full border-2 border-[hsl(var(--primary))] border-t-transparent" />
        <p className="mt-3 text-sm text-[hsl(var(--muted-foreground))]">加载中...</p>
      </div>
    );
  }

  /* ── Form rendering ── */
  return (
    <div className="flex flex-col gap-6 pb-28">
      <h1 className="text-2xl font-bold">编辑资料</h1>

      {/* Cooldown warnings */}
      {!cooldowns.canEdit && (
        <div className="flex items-start gap-2 rounded-xl border border-[hsl(var(--border))] bg-white px-4 py-3 text-sm text-amber-600 shadow-sm">
          <svg viewBox="0 0 110 110" className="h-4 w-4 shrink-0 mt-0.5" fill="none">
            <path d="M55 10L100 95H10L55 10Z" stroke="currentColor" strokeWidth={6} strokeLinejoin="round" />
            <path d="M55 35V65" stroke="currentColor" strokeWidth={8} strokeLinecap="round" />
            <circle cx="55" cy="80" r="4" fill="currentColor" />
          </svg>
          <span>
            {cooldowns.isPhotoRevokeCooldown
              ? `照片被撤销后需要等待 ${cooldowns.editCooldownRemainingText || `${cooldowns.editCooldownRemaining}天`} 才能重新发布。`
              : `发布后 ${7} 天内不能再次修改发布。还需等待 ${cooldowns.editCooldownRemainingText || `${cooldowns.editCooldownRemaining}天`}。`}
            可先保存草稿，草稿不影响已发布资料。
          </span>
        </div>
      )}
      {!cooldowns.canPublish && (
        <div className="flex items-start gap-2 rounded-lg border border-[hsl(0,62%,50%/0.3)] bg-[hsl(0,62%,50%/0.08)] px-4 py-3 text-sm text-[hsl(0,62%,70%)]">
          <svg viewBox="0 0 24 24" className="h-4 w-4 shrink-0 fill-none stroke-current stroke-2 stroke-linecap-round stroke-linejoin-round mt-0.5">
            <path d="m21.73 18-8-14a2 2 0 0 0-3.48 0l-8 14A2 2 0 0 0 4 21h16a2 2 0 0 0 1.73-3Z" />
            <line x1="12" y1="9" x2="12" y2="13" />
            <line x1="12" y1="17" x2="12.01" y2="17" />
          </svg>
          <span>清空资料后 30 天内不能发布。还需等待 {cooldowns.publishCooldownRemaining} 天。</span>
        </div>
      )}

      {/* Error banner */}
      {error && (
        <div className="rounded-lg border border-[hsl(0,62%,50%/0.3)] bg-[hsl(0,62%,50%/0.1)] px-4 py-3 text-sm text-[hsl(0,62%,70%)]">
          {error}
        </div>
      )}

      {/* Draft info banner — shown when editing from a saved draft */}
      {hasDraft && originalProfileStatus === "ACTIVE" && (
        <div className="flex items-center justify-between gap-3 rounded-xl border border-[hsl(var(--border))] bg-white px-4 py-3 shadow-sm">
          <div className="flex items-center gap-2 text-sm font-medium text-blue-600">
            <svg className="h-4 w-4 shrink-0" viewBox="0 0 100 100" fill="none">
              <circle cx="50" cy="50" r="45" stroke="currentColor" strokeWidth={6} />
              <path d="M50 20V60" stroke="currentColor" strokeWidth={8} strokeLinecap="round" />
              <circle cx="50" cy="78" r="4" fill="currentColor" />
            </svg>
            <span>当前显示的是未发布的草稿内容，已发布资料不受影响。</span>
          </div>
          <button
            type="button"
            onClick={async () => {
              try {
                await fetch("/api/profile/me", { method: "DELETE" });
                window.location.reload();
              } catch { /* ignore */ }
            }}
            className="shrink-0 rounded-lg border border-[hsl(var(--border))] px-3 py-1.5 text-xs font-medium text-[hsl(var(--muted-foreground))] transition-all hover:bg-[hsl(var(--secondary))]"
          >
            放弃草稿
          </button>
        </div>
      )}

      {/* Section 1: Basic Info */}
      <section className="rounded-2xl border border-[hsl(var(--border))] bg-[hsl(var(--card))] p-6">
        <div className="mb-5 flex items-center justify-between gap-3">
          <h2 className="text-base font-semibold text-[hsl(var(--foreground))]">基本信息</h2>
          <BmiBadge value={bmiValue} />
        </div>

        {/* Birth date */}
        <div className="mb-4">
          <label className="mb-1.5 block text-sm font-medium text-[hsl(var(--foreground))]">
            出生日期 <span className="text-[hsl(var(--destructive))]">*</span>
          </label>
          <div className="grid grid-cols-3 gap-2">
            <select
              value={form.birthYear}
              onChange={(e) => updateField("birthYear", e.target.value)}
              className={form.birthYear ? SELECT_CLS : SELECT_CLS_EMPTY}
            >
              <option value="">年</option>
              {YEARS.map((y) => (
                <option key={y} value={y}>{y}年</option>
              ))}
            </select>
            <select
              value={form.birthMonth}
              onChange={(e) => updateField("birthMonth", e.target.value)}
              className={form.birthMonth ? SELECT_CLS : SELECT_CLS_EMPTY}
            >
              <option value="">月</option>
              {MONTHS.map((m) => (
                <option key={m} value={m}>{m}月</option>
              ))}
            </select>
            <select
              value={form.birthDay}
              onChange={(e) => updateField("birthDay", e.target.value)}
              className={form.birthDay ? SELECT_CLS : SELECT_CLS_EMPTY}
            >
              <option value="">日</option>
              {DAYS.map((d) => (
                <option key={d} value={d}>{d}日</option>
              ))}
            </select>
          </div>
        </div>

        <MeasurementSlider
          className="mb-4"
          label="身高"
          required
          value={form.heightCm}
          min={HEIGHT_MIN_CM}
          max={HEIGHT_MAX_CM}
          defaultValue={HEIGHT_DEFAULT_CM}
          unit="cm"
          onChange={(v) => updateField("heightCm", v)}
        />

        <MeasurementSlider
          label="体重"
          required
          value={form.weightKg}
          min={WEIGHT_MIN_KG}
          max={WEIGHT_MAX_KG}
          defaultValue={WEIGHT_DEFAULT_KG}
          unit="kg"
          detail={(v) => `= ${v * 2} 斤`}
          onChange={(v) => updateField("weightKg", v)}
        />
      </section>

      {/* Section 2: Location */}
      <section className="rounded-2xl border border-[hsl(var(--border))] bg-[hsl(var(--card))] p-6">
        <h2 className="mb-5 text-base font-semibold text-[hsl(var(--foreground))]">所在地区</h2>

        {/* Province / Region */}
        <div className="mb-4">
          <label className="mb-1.5 block text-sm font-medium text-[hsl(var(--foreground))]">
            {isOverseas(form.provinceCode) ? "地区" : "省份"} <span className="text-[hsl(var(--destructive))]">*</span>
          </label>
          <select
            value={form.provinceCode}
            onChange={(e) => handleProvinceChange(e.target.value)}
            className={form.provinceCode ? SELECT_CLS : SELECT_CLS_EMPTY}
          >
            <option value="">请选择地区</option>
            {PROVINCES.map((p) => (
              <option key={p.code} value={p.code}>{p.name}</option>
            ))}
          </select>
        </div>

        {/* City / Country */}
        <div>
          <label className="mb-1.5 block text-sm font-medium text-[hsl(var(--foreground))]">
            {isOverseas(form.provinceCode) ? "国家" : "城市"} <span className="text-[hsl(var(--destructive))]">*</span>
          </label>
          <select
            value={form.cityCode}
            onChange={(e) => updateField("cityCode", e.target.value)}
            disabled={!form.provinceCode}
            className={`${form.cityCode ? SELECT_CLS : SELECT_CLS_EMPTY} disabled:opacity-50`}
          >
            <option value="">{isOverseas(form.provinceCode) ? "请选择国家" : "请选择城市"}</option>
            {cities.map((c) => (
              <option key={c.code} value={c.code}>{c.name}</option>
            ))}
          </select>
        </div>

        {/* Location Type */}
        <div className="mt-4">
          <label className="mb-1.5 block text-sm font-medium text-[hsl(var(--foreground))]">
            地址类型 <span className="text-[hsl(var(--destructive))]">*</span>
          </label>
          <div className="flex flex-wrap gap-2">
            {LOCATION_TYPE_OPTIONS.map((opt) => (
              <button
                key={opt.value}
                type="button"
                onClick={() => updateField("locationType", opt.value as LocationType)}
                className={`rounded-lg border px-4 py-2 text-sm font-medium transition-all ${
                  form.locationType === opt.value
                    ? "border-[hsl(var(--primary))] bg-[hsl(var(--primary)/0.15)] text-[hsl(var(--primary))]"
                    : "border-[hsl(var(--border))] text-[hsl(var(--foreground))] hover:border-[hsl(var(--primary)/0.5)] hover:text-[hsl(var(--primary))]"
                }`}
              >
                {opt.label}
              </button>
            ))}
          </div>
        </div>
      </section>

      {/* Section 3: MBTI */}
      <section className="rounded-2xl border border-[hsl(var(--border))] bg-[hsl(var(--card))] p-6">
        <h2 className="mb-5 text-base font-semibold text-[hsl(var(--foreground))]">MBTI</h2>
        <select
          value={form.mbti}
          onChange={(e) => updateField("mbti", e.target.value)}
          className={form.mbti ? SELECT_CLS : SELECT_CLS_EMPTY}
        >
          {MBTI_OPTIONS.map((opt) => (
            <option key={opt.value} value={opt.value}>{opt.label}</option>
          ))}
        </select>
      </section>

      {/* Section 4: Attribute */}
      <section className="rounded-2xl border border-[hsl(var(--border))] bg-[hsl(var(--card))] p-6">
        <h2 className="mb-5 text-base font-semibold text-[hsl(var(--foreground))]">
          属性 <span className="text-[hsl(var(--destructive))]">*</span>
        </h2>

        {/* Main attribute (single-select) */}
        <div className="flex flex-wrap gap-2">
          {MAIN_ATTRIBUTE_OPTIONS.map((opt) => (
            <button
              key={opt.value}
              type="button"
              onClick={() =>
                updateField(
                  "attribute",
                  form.attribute === opt.value ? "" : opt.value
                )
              }
              className={`rounded-lg border px-4 py-2 text-sm font-medium transition-all ${
                form.attribute === opt.value
                  ? "border-[hsl(var(--primary))] bg-[hsl(var(--primary)/0.15)] text-[hsl(var(--primary))]"
                  : "border-[hsl(var(--border))] text-[hsl(var(--foreground))] hover:border-[hsl(var(--primary)/0.5)] hover:text-[hsl(var(--primary))]"
              }`}
            >
              {opt.label}
            </button>
          ))}
        </div>

        {/* Extra tags (toggleable) */}
        <div className="mt-3 flex flex-wrap gap-2">
          <button
            type="button"
            onClick={() => updateField("isSide", !form.isSide)}
            className={`rounded-lg border px-4 py-2 text-sm font-medium transition-all ${
              form.isSide
                ? "border-[hsl(var(--primary))] bg-[hsl(var(--primary)/0.15)] text-[hsl(var(--primary))]"
                : "border-[hsl(var(--border))] text-[hsl(var(--foreground))] hover:border-[hsl(var(--primary)/0.5)] hover:text-[hsl(var(--primary))]"
            }`}
          >
            <span className="mr-1">{form.isSide ? "✓" : "+"}</span>side
          </button>
          <button
            type="button"
            onClick={() => updateField("isOther", !form.isOther)}
            className={`rounded-lg border px-4 py-2 text-sm font-medium transition-all ${
              form.isOther
                ? "border-[hsl(var(--primary))] bg-[hsl(var(--primary)/0.15)] text-[hsl(var(--primary))]"
                : "border-[hsl(var(--border))] text-[hsl(var(--foreground))] hover:border-[hsl(var(--primary)/0.5)] hover:text-[hsl(var(--primary))]"
            }`}
          >
            <span className="mr-1">{form.isOther ? "✓" : "+"}</span>其他
          </button>
        </div>

        <p className="mt-2 text-xs text-[hsl(var(--muted-foreground))]">
          上方选择主属性，side 和其他可以同时勾选
        </p>
      </section>

      {/* Section 4: Self Intro */}
      <section className="rounded-2xl border border-[hsl(var(--border))] bg-[hsl(var(--card))] p-6">
        <h2 className="mb-5 text-base font-semibold text-[hsl(var(--foreground))]">自我介绍</h2>
        <div className="relative">
          <textarea
            value={form.selfIntro}
            onChange={(e) => {
              if (e.target.value.length <= 500) updateField("selfIntro", e.target.value);
            }}
            placeholder="写点什么介绍自己吧..."
            rows={4}
            className="w-full resize-none rounded-lg border border-[hsl(var(--input))] bg-transparent px-3 py-2.5 text-sm text-[hsl(var(--foreground))] placeholder:text-[hsl(var(--muted-foreground))] focus:border-[hsl(var(--ring))] focus:outline-none focus:ring-1 focus:ring-[hsl(var(--ring))]"
          />
          <span className="absolute bottom-2 right-3 text-xs text-[hsl(var(--muted-foreground))]">
            {form.selfIntro.length}/500
          </span>
        </div>
      </section>

      {/* Section 5: Photos (optional, for all users) */}
      <section className="rounded-2xl border border-[hsl(var(--border))] bg-[hsl(var(--card))] p-6">
        <h2 className="mb-2 text-base font-semibold text-[hsl(var(--foreground))]">照片 <span className="text-xs font-normal text-[hsl(var(--muted-foreground))]">（可选）</span></h2>
        <p className="mb-4 text-xs text-[hsl(var(--muted-foreground))]">
          上传照片后将由评分哨对你的照片进行评分，你会获得一个颜值分属性。
        </p>

        {/* Toggle buttons */}
        <div className="mb-4 flex gap-2">
          <button
            type="button"
            onClick={() => {
              if (photos.length > 0) {
                setShowClearPhotosConfirm(true);
              } else {
                setWantPhotos(false);
              }
            }}
            className={`flex flex-1 items-center justify-center gap-1.5 rounded-lg px-4 py-2.5 text-sm font-medium transition-all ${
              !wantPhotos
                ? "bg-[hsl(var(--primary)/0.15)] text-[hsl(var(--primary))] border border-[hsl(var(--primary)/0.3)]"
                : "border border-[hsl(var(--border))] text-[hsl(var(--muted-foreground))] hover:border-[hsl(var(--primary)/0.3)] hover:text-[hsl(var(--foreground))]"
            }`}
          >
            <svg viewBox="0 0 24 24" className="h-4 w-4 shrink-0 fill-none stroke-current stroke-2 stroke-linecap-round stroke-linejoin-round">
              <path d="M9.88 9.88a3 3 0 1 0 4.24 4.24" />
              <path d="M10.73 5.08A10.43 10.43 0 0 1 12 5c7 0 10 7 10 7a13.16 13.16 0 0 1-1.67 2.68" />
              <path d="M6.61 6.61A13.52 13.52 0 0 0 2 12s3 7 10 7a9.74 9.74 0 0 0 5.39-1.61" />
              <line x1="2" y1="2" x2="22" y2="22" />
            </svg>
            我不想传照片
          </button>
          <button
            type="button"
            onClick={() => setWantPhotos(true)}
            className={`flex flex-1 items-center justify-center gap-1.5 rounded-lg px-4 py-2.5 text-sm font-medium transition-all ${
              wantPhotos
                ? "bg-[hsl(var(--primary)/0.15)] text-[hsl(var(--primary))] border border-[hsl(var(--primary)/0.3)]"
                : "border border-[hsl(var(--border))] text-[hsl(var(--muted-foreground))] hover:border-[hsl(var(--primary)/0.3)] hover:text-[hsl(var(--foreground))]"
            }`}
          >
            <svg viewBox="0 0 24 24" className="h-4 w-4 shrink-0 fill-none stroke-current stroke-2 stroke-linecap-round stroke-linejoin-round">
              <path d="M14.5 4h-5L7 7H4a2 2 0 0 0-2 2v9a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2V9a2 2 0 0 0-2-2h-3l-2.5-3z" />
              <circle cx="12" cy="13" r="3" />
            </svg>
            上传照片
          </button>
        </div>

        {/* Photo uploader — only shown when user wants to upload */}
        {wantPhotos && (
          <>
            <PhotoUploader
              photos={photos}
              onPhotosChange={handlePhotosChange}
              maxPhotos={6}
              mode={originalProfileStatus === "ACTIVE" ? "draft" : "published"}
            />


          </>
        )}

        {/* Clear photos confirmation modal */}
        {showClearPhotosConfirm && (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
            <div className="w-full max-w-sm rounded-2xl border border-[hsl(var(--border))] bg-[hsl(var(--card))] p-6 shadow-xl">
              <div className="mb-4 flex justify-center text-amber-500">
                <svg viewBox="0 0 24 24" className="h-10 w-10 fill-none stroke-current stroke-2 stroke-linecap-round stroke-linejoin-round">
                  <path d="m21.73 18-8-14a2 2 0 0 0-3.48 0l-8 14A2 2 0 0 0 4 21h16a2 2 0 0 0 1.73-3Z" />
                  <line x1="12" y1="9" x2="12" y2="13" />
                  <circle cx="12" cy="17" r="1" style={{ fill: "currentColor", stroke: "none" }} />
                </svg>
              </div>
              <h3 className="mb-2 text-center text-base font-semibold text-[hsl(var(--foreground))]">
                确定不上传照片吗？
              </h3>
              <p className="mb-5 text-center text-sm leading-relaxed text-[hsl(var(--muted-foreground))]">
                你已上传的 <span className="font-medium text-[hsl(var(--foreground))]">{photos.length}</span> 张照片将被全部删除。若想再次上传照片，需重新添加。
              </p>
              <div className="flex gap-3">
                <button
                  type="button"
                  onClick={() => setShowClearPhotosConfirm(false)}
                  className="flex-1 rounded-lg border border-[hsl(var(--border))] py-2 text-sm font-medium text-[hsl(var(--muted-foreground))] transition-all hover:bg-[hsl(var(--secondary))]"
                >
                  取消
                </button>
                <button
                  type="button"
                  onClick={handleClearPhotos}
                  className="flex-1 rounded-lg bg-[hsl(0,72%,51%)] py-2 text-sm font-semibold text-white transition-all hover:bg-[hsl(0,72%,45%)]"
                >
                  确认删除
                </button>
              </div>
            </div>
          </div>
        )}
      </section>

      {/* Section 6: Matching Preferences */}
      <section className="rounded-2xl border border-[hsl(var(--border))] bg-[hsl(var(--card))] p-6">
        <h2 className="mb-5 text-base font-semibold text-[hsl(var(--foreground))]">匹配偏好</h2>

        {/* Age range */}
        <div className="mb-4">
          <label className="mb-1.5 block text-sm font-medium text-[hsl(var(--foreground))]">
            期望年龄 (岁)
          </label>
          <DualRangeSlider
            min={18}
            max={60}
            valueMin={Number(form.ageMin) || 18}
            valueMax={Number(form.ageMax) || 30}
            onChangeMin={(v) => updateField("ageMin", String(v))}
            onChangeMax={(v) => updateField("ageMax", String(v))}
            formatValue={(v) => `${v} 岁`}
          />
        </div>

        {/* Height range */}
        <div className="mb-4">
          <label className="mb-1.5 block text-sm font-medium text-[hsl(var(--foreground))]">
            期望身高 (cm)
          </label>
          <DualRangeSlider
            min={HEIGHT_MIN_CM}
            max={HEIGHT_MAX_CM}
            valueMin={Number(form.heightMinCm) || HEIGHT_MIN_CM}
            valueMax={Number(form.heightMaxCm) || HEIGHT_MAX_CM}
            onChangeMin={(v) => updateField("heightMinCm", String(v))}
            onChangeMax={(v) => updateField("heightMaxCm", String(v))}
            formatValue={(v) => `${v} cm`}
            unit="cm"
            minAriaLabel="期望最低身高"
            maxAriaLabel="期望最高身高"
          />
        </div>

        {/* Weight range */}
        <div className="mb-4">
          <label className="mb-1.5 block text-sm font-medium text-[hsl(var(--foreground))]">
            期望体重 (kg)
          </label>
          <DualRangeSlider
            min={WEIGHT_MIN_KG}
            max={WEIGHT_MAX_KG}
            valueMin={Number(form.weightMinKg) || WEIGHT_MIN_KG}
            valueMax={Number(form.weightMaxKg) || WEIGHT_MAX_KG}
            onChangeMin={(v) => updateField("weightMinKg", String(v))}
            onChangeMax={(v) => updateField("weightMaxKg", String(v))}
            formatValue={(v) => `${v}kg = ${v * 2}斤`}
            unit="kg"
            detail={(v) => `= ${v * 2}斤`}
            minAriaLabel="期望最低体重"
            maxAriaLabel="期望最高体重"
          />
        </div>



        {/* Expected attributes */}
        <div>
          <label className="mb-1.5 block text-sm font-medium text-[hsl(var(--foreground))]">
            期望属性 <span className="text-[hsl(var(--destructive))]">*</span>
          </label>
          <div className="flex flex-wrap gap-2">
            {ATTRIBUTE_OPTIONS.map((opt) => {
              const selected = form.expectedAttributes.includes(opt.value);
              return (
                <button
                  key={opt.value}
                  type="button"
                  onClick={() => toggleExpectedAttr(opt.value)}
                  className={`rounded-lg border px-4 py-2 text-sm font-medium transition-all ${
                    selected
                      ? "border-[hsl(var(--primary))] bg-[hsl(var(--primary)/0.15)] text-[hsl(var(--primary))]"
                      : "border-[hsl(var(--border))] text-[hsl(var(--muted-foreground))] hover:border-[hsl(var(--primary)/0.5)] hover:text-[hsl(var(--foreground))]"
                  }`}
                >
                  <span className="mr-1.5">{selected ? "✓" : "+"}</span>
                  {opt.label}
                </button>
              );
            })}
          </div>


        </div>
      </section>

      {/* Section 7: Consent */}
      <section className="rounded-2xl border border-[hsl(var(--border))] bg-[hsl(var(--card))] p-6">
        <label className="flex items-start gap-3 cursor-pointer">
          <input
            type="checkbox"
            checked={form.consent}
            onChange={(e) => updateField("consent", e.target.checked)}
            className="mt-1 h-4 w-4 shrink-0 rounded border-[hsl(var(--input))] accent-[hsl(var(--primary))]"
          />
          <span className="text-sm text-[hsl(var(--foreground))]">
            我同意将我的资料展示给其他群成员用于匹配。我了解我可以随时清空我的资料。
          </span>
        </label>
      </section>

      {/* Sticky action buttons */}
      <div className="fixed inset-x-0 bottom-[calc(4.75rem+env(safe-area-inset-bottom))] z-40 px-3 md:bottom-4 md:left-64 md:px-4">
        <div className="mx-auto max-w-3xl rounded-2xl border border-[hsl(var(--border))] bg-[hsl(var(--card))]/95 p-3 shadow-[0_18px_42px_rgba(15,23,42,0.14)] backdrop-blur">
          <div className="flex gap-3">
          <button
            type="button"
            onClick={() => handleSubmit("DRAFT")}
            disabled={submitting}
            className="flex min-h-12 flex-1 flex-col items-center justify-center rounded-xl border border-[hsl(var(--border))] bg-white px-3 py-2.5 text-center text-xs font-semibold leading-tight text-[hsl(var(--foreground))] transition-all hover:bg-[hsl(var(--secondary))] active:scale-[0.98] disabled:opacity-50 sm:flex-row sm:gap-1 sm:text-sm"
          >
            {submitting ? (
              "保存中..."
            ) : originalProfileStatus === "ACTIVE" ? (
              <>
                <span>保存草稿</span>
                <span className="mt-0.5 text-[11px] font-medium text-[hsl(var(--muted-foreground))] sm:mt-0 sm:text-sm sm:text-[hsl(var(--foreground))]">
                  不影响已发布资料
                </span>
              </>
            ) : (
              "保存草稿"
            )}
          </button>
          <button
            type="button"
            onClick={() => handleSubmit("ACTIVE")}
            disabled={submitting || !form.consent || !cooldowns.canEdit || !cooldowns.canPublish}
            className="flex min-h-12 flex-1 items-center justify-center rounded-xl bg-brand-blue px-3 py-2.5 text-center text-xs font-semibold leading-tight text-white shadow-md shadow-brand-blue/20 transition-all hover:scale-[1.02] hover:bg-brand-blue/90 active:scale-[0.98] disabled:opacity-50 disabled:hover:scale-100 sm:text-sm"
          >
            {submitting ? "保存中..." : !cooldowns.canPublish ? `${cooldowns.publishCooldownRemaining}天后可发布` : !cooldowns.canEdit ? `${cooldowns.editCooldownRemainingText || `${cooldowns.editCooldownRemaining}天`}后可发布` : "发布资料"}
          </button>
          </div>
        </div>
      </div>

      {/* Confirm modal */}
      <ConfirmModal
        open={confirmOpen}
        title={isExisting ? "确认修改" : "确认提交"}
        description={confirmDesc}
        confirmText={confirmText}
        buttonLabel={pendingStatus === "ACTIVE" ? "确认发布" : "确认提交"}
        variant="primary"
        loading={submitting}
        onClose={() => setConfirmOpen(false)}
        onConfirm={() => {
          setConfirmOpen(false);
          doSubmit(pendingStatus);
        }}
      />

      {/* Age alert modal */}
      <AlertModal
        open={showAgeAlert}
        title="年龄提示"
        description="未满 18 周岁（未过 18 岁生日）的用户不允许使用此匹配系统。你的个人资料已被自动保存为草稿，在年满 18 周岁前无法发布。"
        onConfirm={async () => {
          setShowAgeAlert(false);
          await doSubmit("DRAFT");
        }}
      />
    </div>
  );
}

function BmiBadge({ value }: { value: string }) {
  return (
    <span className="inline-flex shrink-0 items-center rounded-lg border border-[hsl(var(--border))] bg-[hsl(var(--secondary))] px-2.5 py-1 text-xs font-medium text-[hsl(var(--muted-foreground))]">
      BMI&nbsp;<span className="text-[hsl(var(--foreground))]">{value}</span>
    </span>
  );
}
