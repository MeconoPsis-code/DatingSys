"use client";

import { useState, useEffect, useMemo } from "react";
import { useRouter } from "next/navigation";
import { PROVINCES, getCities, isOverseas } from "@/data/regions";
import { ATTRIBUTE_OPTIONS } from "@/data/attributes";
import { LOCATION_TYPE_OPTIONS } from "@/data/location-types";
import { MBTI_OPTIONS } from "@/data/mbti";
import { ConfirmModal } from "@/components/ui/confirm-modal";
import { PhotoUploader } from "@/components/profile/photo-uploader";

interface PhotoItem {
  id: string;
  order: number;
  originalName: string | null;
  url: string;
}

/* ─── Types ──────────────────────────────────────────── */

type Attribute = "ONE" | "ZERO" | "HALF" | "LEAN_ONE" | "LEAN_ZERO" | "SIDE" | "OTHER";
type LocationScope = "ANY" | "PROVINCE" | "CITY";
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
  locationScope: LocationScope;
  expectedAttributes: Attribute[];
  expectedCustomAttribute: string;
  // Consent
  consent: boolean;
}

const INITIAL_FORM: FormState = {
  birthYear: "",
  birthMonth: "",
  birthDay: "",
  heightCm: "",
  weightKg: "",
  provinceCode: "",
  cityCode: "",
  locationType: "RESIDENCE",
  attribute: "",
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
  locationScope: "ANY",
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

const YEARS = range(1960, 2008).reverse();
const MONTHS = range(1, 12);
const DAYS = range(1, 31);

const LOCATION_SCOPE_OPTIONS: { value: LocationScope; label: string }[] = [
  { value: "ANY", label: "不限" },
  { value: "PROVINCE", label: "同省" },
  { value: "CITY", label: "同市" },
];

/* ─── Component ──────────────────────────────────────── */

export default function ProfileEditPage() {
  const router = useRouter();
  const [form, setForm] = useState<FormState>(INITIAL_FORM);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [isExisting, setIsExisting] = useState(false); // whether profile already exists

  // Cooldown state from API
  const [cooldowns, setCooldowns] = useState<{
    canPublish: boolean;
    publishCooldownRemaining: number;
    canEdit: boolean;
    editCooldownRemaining: number;
  }>({ canPublish: true, publishCooldownRemaining: 0, canEdit: true, editCooldownRemaining: 0 });

  // Confirm modal state
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [pendingStatus, setPendingStatus] = useState<"DRAFT" | "ACTIVE">("DRAFT");

  // Photo state
  const [photos, setPhotos] = useState<PhotoItem[]>([]);
  const [wantPhotos, setWantPhotos] = useState(false);

  // Cities based on selected province
  const cities = useMemo(
    () => (form.provinceCode ? getCities(form.provinceCode) : []),
    [form.provinceCode]
  );

  /* ── Fetch existing profile ── */
  useEffect(() => {
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
          const bd = new Date(profile.birthDate);
          setForm((prev) => ({
            ...prev,
            birthYear: String(bd.getFullYear()),
            birthMonth: String(bd.getMonth() + 1),
            birthDay: String(bd.getDate()),
            heightCm: String(profile.heightCm),
            weightKg: String(profile.weightKg),
            provinceCode: profile.provinceCode || "",
            cityCode: profile.cityCode || "",
            locationType: profile.locationType || "RESIDENCE",
            attribute: profile.attribute || "",
            customAttribute: profile.customAttribute || "",
            mbti: profile.mbti || "",
            selfIntro: profile.selfIntro || "",
            photoMatchPref: profile.photoMatchPref || "",
            highScoreOnly: profile.highScoreOnly ?? false,
            consent: profile.consentProfileVisibility ?? false,
          }));
        }
        if (pref) {
          setForm((prev) => ({
            ...prev,
            ageMin: String(pref.ageMin ?? 18),
            ageMax: String(pref.ageMax ?? 35),
            heightMinCm: String(pref.heightMinCm ?? 150),
            heightMaxCm: String(pref.heightMaxCm ?? 200),
            weightMinKg: String(pref.weightMinKg ?? 40),
            weightMaxKg: String(pref.weightMaxKg ?? 100),
            locationScope: pref.locationScope || "ANY",
            expectedAttributes: Array.isArray(pref.expectedAttributes)
              ? pref.expectedAttributes
              : [],
            expectedCustomAttribute: pref.expectedCustomAttribute || "",
          }));
        }

        // Load photos if profile exists
        if (profile) {
          try {
            const photoRes = await fetch("/api/profile/photos");
            if (photoRes.ok) {
              const photoData = await photoRes.json();
              const loadedPhotos = photoData.data?.photos || [];
              setPhotos(loadedPhotos);
              if (loadedPhotos.length > 0) setWantPhotos(true);
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
    if (isNaN(hVal) || hVal < 100 || hVal > 250) return "身高范围: 100-250cm";
    if (!form.weightKg) return "请输入体重";
    const wVal = Number(form.weightKg);
    if (isNaN(wVal) || wVal < 30 || wVal > 200) return "体重范围: 30-200kg";
    if (!form.provinceCode) return "请选择地区";
    if (!form.cityCode) return isOverseas(form.provinceCode) ? "请选择国家" : "请选择城市";
    if (!form.attribute) return "请选择属性";
    if (form.attribute === "OTHER" && !form.customAttribute.trim()) return "请输入自定义属性";
    if (form.attribute === "OTHER" && form.customAttribute.length > 20) return "自定义属性不能超过 20 个字";

    // Age >= 18
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
    if (age < 18) return "必须年满 18 岁";

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

    // Photo users with > 0 photos must set a matching preference
    if (status === "ACTIVE" && photos.length > 0 && !form.photoMatchPref) {
      return "有照片用户发布时请选择匹配偏好";
    }

    if (status === "ACTIVE" && !form.consent) return "发布资料需要勾选同意条款";

    return null;
  }

  /* ── Submit (called after confirmation) ── */
  async function doSubmit(status: "DRAFT" | "ACTIVE") {
    setSubmitting(true);
    setError(null);

    const birthDate = `${form.birthYear}-${String(form.birthMonth).padStart(2, "0")}-${String(form.birthDay).padStart(2, "0")}`;

    const body = {
      profile: {
        poolType: undefined, // removed — single pool
        birthDate,
        heightCm: Number(form.heightCm),
        weightKg: Number(form.weightKg),
        provinceCode: form.provinceCode,
        cityCode: form.cityCode,
        locationType: form.locationType,
        attribute: form.attribute,
        customAttribute: form.attribute === "OTHER" ? form.customAttribute.trim() : null,
        mbti: form.mbti || null,
        selfIntro: form.selfIntro || null,
        consentProfileVisibility: form.consent,
        status,
        photoMatchPref: photos.length > 0 ? (form.photoMatchPref || "ALL") : null,
        highScoreOnly: photos.length > 0 ? form.highScoreOnly : false,
      },
      preference: {
        ageMin: Number(form.ageMin),
        ageMax: Number(form.ageMax),
        heightMinCm: Number(form.heightMinCm),
        heightMaxCm: Number(form.heightMaxCm),
        weightMinKg: Number(form.weightMinKg),
        weightMaxKg: Number(form.weightMaxKg),
        locationScope: form.locationScope,
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
        <div className="flex items-start gap-2 rounded-lg border border-[hsl(40,90%,50%/0.3)] bg-[hsl(40,90%,50%/0.08)] px-4 py-3 text-sm text-[hsl(40,90%,70%)]">
          <svg viewBox="0 0 24 24" className="h-4 w-4 shrink-0 fill-none stroke-current stroke-2 stroke-linecap-round stroke-linejoin-round mt-0.5">
            <path d="m21.73 18-8-14a2 2 0 0 0-3.48 0l-8 14A2 2 0 0 0 4 21h16a2 2 0 0 0 1.73-3Z" />
            <line x1="12" y1="9" x2="12" y2="13" />
            <line x1="12" y1="17" x2="12.01" y2="17" />
          </svg>
          <span>发布后 {7} 天内不能再次修改发布。还需等待 {cooldowns.editCooldownRemaining} 天。但仍可保存草稿。</span>
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

      {/* Section 1: Basic Info */}
      <section className="rounded-2xl border border-[hsl(var(--border))] bg-[hsl(var(--card))] p-6">
        <h2 className="mb-5 text-base font-semibold text-[hsl(var(--foreground))]">基本信息</h2>

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

        {/* Height — number input */}
        <div className="mb-4">
          <label className="mb-1.5 block text-sm font-medium text-[hsl(var(--foreground))]">
            身高 (cm) <span className="text-[hsl(var(--destructive))]">*</span>
          </label>
          <input
            type="number"
            min={100}
            max={250}
            placeholder="请输入身高, 如 170"
            value={form.heightCm}
            onChange={(e) => updateField("heightCm", e.target.value)}
            className="w-full rounded-lg border border-[hsl(var(--input))] bg-[hsl(var(--card))] px-3 py-2.5 text-sm text-[hsl(var(--foreground))] placeholder:text-[hsl(var(--muted-foreground))] focus:border-[hsl(var(--ring))] focus:outline-none focus:ring-1 focus:ring-[hsl(var(--ring))]"
          />
        </div>

        {/* Weight — number input */}
        <div>
          <label className="mb-1.5 block text-sm font-medium text-[hsl(var(--foreground))]">
            体重 (kg) <span className="text-[hsl(var(--destructive))]">*</span>
          </label>
          <input
            type="number"
            min={30}
            max={200}
            placeholder="请输入体重, 如 65"
            value={form.weightKg}
            onChange={(e) => updateField("weightKg", e.target.value)}
            className="w-full rounded-lg border border-[hsl(var(--input))] bg-[hsl(var(--card))] px-3 py-2.5 text-sm text-[hsl(var(--foreground))] placeholder:text-[hsl(var(--muted-foreground))] focus:border-[hsl(var(--ring))] focus:outline-none focus:ring-1 focus:ring-[hsl(var(--ring))]"
          />
        </div>
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
        <div className="flex flex-wrap gap-2">
          {ATTRIBUTE_OPTIONS.map((opt) => (
            <button
              key={opt.value}
              type="button"
              onClick={() => {
                updateField("attribute", opt.value);
                if (opt.value !== "OTHER") updateField("customAttribute", "");
              }}
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

        {/* Custom text input for OTHER */}
        {form.attribute === "OTHER" && (
          <div className="mt-4">
            <label className="mb-1.5 block text-sm font-medium text-[hsl(var(--foreground))]">
              请输入自定义属性 <span className="text-[hsl(var(--destructive))]">*</span>
            </label>
            <div className="relative">
              <input
                type="text"
                maxLength={20}
                value={form.customAttribute}
                onChange={(e) => updateField("customAttribute", e.target.value)}
                placeholder="输入你的属性描述"
                className="w-full rounded-lg border border-[hsl(var(--input))] bg-[hsl(var(--card))] px-3 py-2.5 text-sm text-[hsl(var(--foreground))] placeholder:text-[hsl(var(--muted-foreground))] focus:border-[hsl(var(--ring))] focus:outline-none focus:ring-1 focus:ring-[hsl(var(--ring))]"
              />
              <span className="absolute right-3 top-1/2 -translate-y-1/2 text-xs text-[hsl(var(--muted-foreground))]">
                {form.customAttribute.length}/20
              </span>
            </div>
          </div>
        )}
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
            onClick={() => setWantPhotos(false)}
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
            我想传照片
          </button>
        </div>

        {/* Photo uploader — only shown when user wants to upload */}
        {wantPhotos && (
          <>
            <PhotoUploader
              photos={photos}
              onPhotosChange={setPhotos}
              maxPhotos={6}
            />

            {/* Photo matching preference — only shown when user has photos */}
            {photos.length > 0 && (
              <div className="mt-5 rounded-xl border border-[hsl(var(--border))] bg-[hsl(var(--secondary)/0.3)] p-4">
                <h3 className="mb-3 flex items-center gap-1.5 text-sm font-semibold text-[hsl(var(--foreground))]">
                  <svg viewBox="0 0 24 24" className="h-4 w-4 shrink-0 fill-none stroke-current stroke-2 stroke-linecap-round stroke-linejoin-round text-brand-blue">
                    <circle cx="12" cy="12" r="10" />
                    <circle cx="12" cy="12" r="6" />
                    <circle cx="12" cy="12" r="2" />
                  </svg>
                  匹配偏好
                </h3>
                <div className="space-y-2">
                  <label className="flex items-center gap-3 rounded-lg border border-[hsl(var(--border))] px-4 py-3 cursor-pointer transition-all hover:border-[hsl(var(--primary)/0.5)]">
                    <input
                      type="radio"
                      name="photoMatchPref"
                      checked={form.photoMatchPref === "ALL"}
                      onChange={() => updateField("photoMatchPref", "ALL")}
                      className="h-4 w-4 accent-[hsl(var(--primary))]"
                    />
                    <div>
                      <div className="text-sm font-medium text-[hsl(var(--foreground))]">与所有用户匹配</div>
                      <div className="text-xs text-[hsl(var(--muted-foreground))]">包括有照片和无照片用户</div>
                    </div>
                  </label>
                  <label className="flex items-center gap-3 rounded-lg border border-[hsl(var(--border))] px-4 py-3 cursor-pointer transition-all hover:border-[hsl(var(--primary)/0.5)]">
                    <input
                      type="radio"
                      name="photoMatchPref"
                      checked={form.photoMatchPref === "PHOTO_ONLY"}
                      onChange={() => updateField("photoMatchPref", "PHOTO_ONLY")}
                      className="h-4 w-4 accent-[hsl(var(--primary))]"
                    />
                    <div>
                      <div className="text-sm font-medium text-[hsl(var(--foreground))]">仅与有照片用户匹配</div>
                      <div className="text-xs text-[hsl(var(--muted-foreground))]">只匹配同样上传了照片的用户</div>
                    </div>
                  </label>

                  {/* High score only — nested under PHOTO_ONLY */}
                  {form.photoMatchPref === "PHOTO_ONLY" && (
                    <div className="ml-7 mt-1 rounded-lg border border-[hsl(var(--border)/0.5)] bg-[hsl(var(--secondary)/0.3)] px-4 py-3">
                      <label className="flex items-center gap-3 cursor-pointer">
                        <input
                          type="checkbox"
                          checked={form.highScoreOnly}
                          onChange={(e) => updateField("highScoreOnly", e.target.checked)}
                          className="h-4 w-4 rounded accent-[hsl(var(--primary))]"
                        />
                        <span className="text-sm text-[hsl(var(--foreground))]">
                          仅与高分用户匹配（≥ 7.0 分）
                        </span>
                      </label>
                      <p className="mt-1 ml-7 text-xs text-[hsl(var(--muted-foreground))]">
                        只有你的评分也达到 7.0 分时此选项才会生效
                      </p>
                    </div>
                  )}
                </div>
              </div>
            )}
          </>
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
          <div className="flex items-center gap-2">
            <input
              type="number"
              min={18}
              max={99}
              value={form.ageMin}
              onChange={(e) => updateField("ageMin", e.target.value)}
              className="w-full rounded-lg border border-[hsl(var(--input))] bg-transparent px-3 py-2.5 text-sm text-[hsl(var(--foreground))] focus:border-[hsl(var(--ring))] focus:outline-none focus:ring-1 focus:ring-[hsl(var(--ring))]"
            />
            <span className="shrink-0 text-sm text-[hsl(var(--muted-foreground))]">~</span>
            <input
              type="number"
              min={18}
              max={99}
              value={form.ageMax}
              onChange={(e) => updateField("ageMax", e.target.value)}
              className="w-full rounded-lg border border-[hsl(var(--input))] bg-transparent px-3 py-2.5 text-sm text-[hsl(var(--foreground))] focus:border-[hsl(var(--ring))] focus:outline-none focus:ring-1 focus:ring-[hsl(var(--ring))]"
            />
          </div>
        </div>

        {/* Height range */}
        <div className="mb-4">
          <label className="mb-1.5 block text-sm font-medium text-[hsl(var(--foreground))]">
            期望身高 (cm)
          </label>
          <div className="flex items-center gap-2">
            <input
              type="number"
              min={100}
              max={250}
              value={form.heightMinCm}
              onChange={(e) => updateField("heightMinCm", e.target.value)}
              className="w-full rounded-lg border border-[hsl(var(--input))] bg-transparent px-3 py-2.5 text-sm text-[hsl(var(--foreground))] focus:border-[hsl(var(--ring))] focus:outline-none focus:ring-1 focus:ring-[hsl(var(--ring))]"
            />
            <span className="shrink-0 text-sm text-[hsl(var(--muted-foreground))]">~</span>
            <input
              type="number"
              min={100}
              max={250}
              value={form.heightMaxCm}
              onChange={(e) => updateField("heightMaxCm", e.target.value)}
              className="w-full rounded-lg border border-[hsl(var(--input))] bg-transparent px-3 py-2.5 text-sm text-[hsl(var(--foreground))] focus:border-[hsl(var(--ring))] focus:outline-none focus:ring-1 focus:ring-[hsl(var(--ring))]"
            />
          </div>
        </div>

        {/* Weight range */}
        <div className="mb-4">
          <label className="mb-1.5 block text-sm font-medium text-[hsl(var(--foreground))]">
            期望体重 (kg)
          </label>
          <div className="flex items-center gap-2">
            <input
              type="number"
              min={30}
              max={200}
              value={form.weightMinKg}
              onChange={(e) => updateField("weightMinKg", e.target.value)}
              className="w-full rounded-lg border border-[hsl(var(--input))] bg-transparent px-3 py-2.5 text-sm text-[hsl(var(--foreground))] focus:border-[hsl(var(--ring))] focus:outline-none focus:ring-1 focus:ring-[hsl(var(--ring))]"
            />
            <span className="shrink-0 text-sm text-[hsl(var(--muted-foreground))]">~</span>
            <input
              type="number"
              min={30}
              max={200}
              value={form.weightMaxKg}
              onChange={(e) => updateField("weightMaxKg", e.target.value)}
              className="w-full rounded-lg border border-[hsl(var(--input))] bg-transparent px-3 py-2.5 text-sm text-[hsl(var(--foreground))] focus:border-[hsl(var(--ring))] focus:outline-none focus:ring-1 focus:ring-[hsl(var(--ring))]"
            />
          </div>
        </div>

        {/* Location scope */}
        <div className="mb-4">
          <label className="mb-1.5 block text-sm font-medium text-[hsl(var(--foreground))]">
            地区偏好
          </label>
          <div className="flex flex-wrap gap-2">
            {LOCATION_SCOPE_OPTIONS.map((opt) => (
              <button
                key={opt.value}
                type="button"
                onClick={() => updateField("locationScope", opt.value)}
                className={`rounded-lg border px-4 py-2 text-sm font-medium transition-all ${
                  form.locationScope === opt.value
                    ? "border-[hsl(var(--primary))] bg-[hsl(var(--primary)/0.15)] text-[hsl(var(--primary))]"
                    : "border-[hsl(var(--border))] text-[hsl(var(--muted-foreground))] hover:border-[hsl(var(--primary)/0.5)] hover:text-[hsl(var(--foreground))]"
                }`}
              >
                {opt.label}
              </button>
            ))}
          </div>
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

          {/* Custom text input for OTHER in expected attributes */}
          {form.expectedAttributes.includes("OTHER" as Attribute) && (
            <div className="mt-3">
              <label className="mb-1.5 block text-sm font-medium text-[hsl(var(--foreground))]">
                自定义期望属性描述
              </label>
              <div className="relative">
                <input
                  type="text"
                  maxLength={20}
                  value={form.expectedCustomAttribute}
                  onChange={(e) => updateField("expectedCustomAttribute", e.target.value)}
                  placeholder="输入你期望的属性描述"
                  className="w-full rounded-lg border border-[hsl(var(--input))] bg-[hsl(var(--card))] px-3 py-2.5 text-sm text-[hsl(var(--foreground))] placeholder:text-[hsl(var(--muted-foreground))] focus:border-[hsl(var(--ring))] focus:outline-none focus:ring-1 focus:ring-[hsl(var(--ring))]"
                />
                <span className="absolute right-3 top-1/2 -translate-y-1/2 text-xs text-[hsl(var(--muted-foreground))]">
                  {form.expectedCustomAttribute.length}/20
                </span>
              </div>
            </div>
          )}
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
      <div className="fixed bottom-0 left-0 right-0 z-40 border-t border-[hsl(var(--border))] bg-[hsl(var(--background))] safe-bottom md:left-64">
        <div className="mx-auto flex max-w-3xl gap-3 px-4 py-3">
          <button
            type="button"
            onClick={() => handleSubmit("DRAFT")}
            disabled={submitting}
            className="flex-1 rounded-lg border border-[hsl(var(--border))] px-4 py-2.5 text-sm font-semibold text-[hsl(var(--foreground))] transition-all hover:bg-[hsl(var(--secondary))] active:scale-[0.98] disabled:opacity-50"
          >
            {submitting ? "保存中..." : "保存草稿"}
          </button>
          <button
            type="button"
            onClick={() => handleSubmit("ACTIVE")}
            disabled={submitting || !form.consent || !cooldowns.canEdit || !cooldowns.canPublish}
            className="flex-1 rounded-lg bg-brand-blue px-4 py-2.5 text-sm font-semibold text-white shadow-md shadow-brand-blue/20 transition-all hover:scale-[1.02] hover:bg-brand-blue/90 active:scale-[0.98] disabled:opacity-50 disabled:hover:scale-100"
          >
            {submitting ? "保存中..." : !cooldowns.canPublish ? `${cooldowns.publishCooldownRemaining}天后可发布` : !cooldowns.canEdit ? `${cooldowns.editCooldownRemaining}天后可修改` : "发布资料"}
          </button>
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
    </div>
  );
}
