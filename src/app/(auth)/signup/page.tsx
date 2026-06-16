"use client";

import { useState, useMemo } from "react";
import { useRouter } from "next/navigation";
import { PROVINCES, getCities, isOverseas } from "@/data/regions";
import { ATTRIBUTE_OPTIONS } from "@/data/attributes";
import { LOCATION_TYPE_OPTIONS } from "@/data/location-types";
import { MBTI_OPTIONS } from "@/data/mbti";
import { DualRangeSlider } from "@/components/DualRangeSlider";
import { PhotoUploader } from "@/components/profile/photo-uploader";

interface PhotoItem {
  id: string;
  order: number;
  originalName: string | null;
  url: string;
}

type Step = "verify" | "passcode" | "profile";

/* ─── Profile Types ─────────────────────────────────── */

type Attribute = "ONE" | "ZERO" | "HALF" | "LEAN_ONE" | "LEAN_ZERO" | "SIDE" | "OTHER";
type LocationScope = "ANY" | "PROVINCE" | "CITY";
type LocationType = "RESIDENCE" | "HOMETOWN" | "SCHOOL" | "WORK" | "TRAVEL" | "OTHER";
type PhotoMatchPref = "PHOTO_ONLY" | "ALL";

const SELECT_CLS =
  "w-full rounded-lg border border-[hsl(var(--input))] bg-[hsl(var(--card))] px-3 py-2.5 text-sm text-[hsl(var(--foreground))] focus:border-[hsl(var(--ring))] focus:outline-none focus:ring-1 focus:ring-[hsl(var(--ring))]";
const SELECT_CLS_EMPTY =
  `${SELECT_CLS} text-[hsl(var(--muted-foreground))]`;

interface ProfileFormState {
  birthYear: string;
  birthMonth: string;
  birthDay: string;
  heightCm: string;
  weightKg: string;
  provinceCode: string;
  cityCode: string;
  locationType: LocationType;
  attribute: Attribute | "";
  customAttribute: string;
  mbti: string;
  selfIntro: string;
  ageMin: string;
  ageMax: string;
  heightMinCm: string;
  heightMaxCm: string;
  weightMinKg: string;
  weightMaxKg: string;
  locationScope: LocationScope;
  expectedAttributes: Attribute[];
  expectedCustomAttribute: string;
  photoMatchPref: PhotoMatchPref | "";
  highScoreOnly: boolean;
  consent: boolean;
}

const INITIAL_PROFILE: ProfileFormState = {
  birthYear: "",
  birthMonth: "",
  birthDay: "",
  heightCm: "170",
  weightKg: "60",
  provinceCode: "",
  cityCode: "",
  locationType: "RESIDENCE",
  attribute: "",
  customAttribute: "",
  mbti: "",
  selfIntro: "",
  ageMin: "18",
  ageMax: "35",
  heightMinCm: "150",
  heightMaxCm: "200",
  weightMinKg: "40",
  weightMaxKg: "100",
  locationScope: "ANY",
  expectedAttributes: [],
  expectedCustomAttribute: "",
  photoMatchPref: "",
  highScoreOnly: false,
  consent: false,
};

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

/**
 * Sign-up page — multi-step flow:
 *  Step 1: Enter 验证码 (received via email after bot /signup command)
 *  Step 2: Set passcode
 *  Step 3: Complete profile (mandatory)
 */
export default function SignupPage() {
  const router = useRouter();
  const [step, setStep] = useState<Step>("verify");

  // Step 1 state
  const [code, setCode] = useState("");

  // Resolved from verify-code API response
  const [qqNumber, setQqNumber] = useState("");

  // Step 2 state
  const [passcode, setPasscode] = useState("");
  const [confirmPasscode, setConfirmPasscode] = useState("");

  // Step 3 state — profile form
  const [profile, setProfile] = useState<ProfileFormState>(INITIAL_PROFILE);

  // Photo state
  const [photos, setPhotos] = useState<PhotoItem[]>([]);
  const [wantPhotos, setWantPhotos] = useState(false);

  // Shared state
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);

  // Computed cities
  const cities = useMemo(
    () => (profile.provinceCode ? getCities(profile.provinceCode) : []),
    [profile.provinceCode]
  );

  function updateProfile<K extends keyof ProfileFormState>(key: K, value: ProfileFormState[K]) {
    setProfile((prev) => ({ ...prev, [key]: value }));
  }

  function toggleExpectedAttr(attr: Attribute) {
    setProfile((prev) => {
      const has = prev.expectedAttributes.includes(attr);
      return {
        ...prev,
        expectedAttributes: has
          ? prev.expectedAttributes.filter((a) => a !== attr)
          : [...prev.expectedAttributes, attr],
      };
    });
  }

  function handleProvinceChange(code: string) {
    setProfile((prev) => ({ ...prev, provinceCode: code, cityCode: "" }));
  }

  /* ── Step 1: Verify code ── */
  async function handleVerify(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError(null);

    try {
      const res = await fetch("/api/auth/verify-code", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ code }),
      });

      const data = await res.json();

      if (!res.ok) {
        setError(data.error?.message || "验证失败");
        return;
      }

      setQqNumber(data.data.qqNumber);
      setStep("passcode");
    } catch {
      setError("网络错误，请稍后重试");
    } finally {
      setLoading(false);
    }
  }

  /* ── Step 2: Set passcode ── */
  async function handleSetPasscode(e: React.FormEvent) {
    e.preventDefault();
    setError(null);

    if (passcode !== confirmPasscode) {
      setError("两次输入的密码不一致");
      return;
    }

    setLoading(true);

    try {
      const res = await fetch("/api/auth/set-passcode", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ qqNumber, passcode }),
      });

      const data = await res.json();

      if (!res.ok) {
        setError(data.error?.message || "设置密码失败");
        return;
      }

      // Move to profile step instead of redirecting
      setStep("profile");
      setError(null);
    } catch {
      setError("网络错误，请稍后重试");
    } finally {
      setLoading(false);
    }
  }

  /* ── Step 3: Validate & submit profile ── */
  function validateProfile(): string | null {
    if (!profile.birthYear || !profile.birthMonth || !profile.birthDay) return "请选择出生日期";
    if (!profile.heightCm) return "请输入身高";
    const hVal = Number(profile.heightCm);
    if (isNaN(hVal) || hVal < 100 || hVal > 250) return "身高范围: 100-250cm";
    if (!profile.weightKg) return "请输入体重";
    const wVal = Number(profile.weightKg);
    if (isNaN(wVal) || wVal < 30 || wVal > 200) return "体重范围: 30-200kg";
    if (!profile.provinceCode) return "请选择地区";
    if (!profile.cityCode) return isOverseas(profile.provinceCode) ? "请选择国家" : "请选择城市";
    if (!profile.attribute) return "请选择属性";
    if (profile.attribute === "OTHER" && !profile.customAttribute.trim()) return "请输入自定义属性";
    if (profile.attribute === "OTHER" && profile.customAttribute.length > 20) return "自定义属性不能超过 20 个字";

    // Age >= 18
    const bd = new Date(
      Number(profile.birthYear),
      Number(profile.birthMonth) - 1,
      Number(profile.birthDay)
    );
    const today = new Date();
    let age = today.getFullYear() - bd.getFullYear();
    const monthDiff = today.getMonth() - bd.getMonth();
    if (monthDiff < 0 || (monthDiff === 0 && today.getDate() < bd.getDate())) {
      age--;
    }
    if (age < 18) return "必须年满 18 岁";

    // Preference ranges
    const ageMin = Number(profile.ageMin);
    const ageMax = Number(profile.ageMax);
    if (ageMin > ageMax) return "期望年龄范围无效（最小值不能大于最大值）";

    const hMin = Number(profile.heightMinCm);
    const hMax = Number(profile.heightMaxCm);
    if (hMin > hMax) return "期望身高范围无效（最小值不能大于最大值）";

    const wMin = Number(profile.weightMinKg);
    const wMax = Number(profile.weightMaxKg);
    if (wMin > wMax) return "期望体重范围无效（最小值不能大于最大值）";

    if (profile.expectedAttributes.length === 0) return "请至少选择一个期望属性";

    // Photo users with > 0 photos must set a matching preference
    if (photos.length > 0 && !profile.photoMatchPref) {
      return "有照片用户请选择匹配偏好";
    }

    if (!profile.consent) return "请勾选同意条款后再提交";

    return null;
  }

  async function handleSubmitProfile() {
    const err = validateProfile();
    if (err) {
      setError(err);
      window.scrollTo({ top: 0, behavior: "smooth" });
      return;
    }

    setLoading(true);
    setError(null);

    const birthDate = `${profile.birthYear}-${String(profile.birthMonth).padStart(2, "0")}-${String(profile.birthDay).padStart(2, "0")}`;

    const body = {
      profile: {
        birthDate,
        heightCm: Number(profile.heightCm),
        weightKg: Number(profile.weightKg),
        provinceCode: profile.provinceCode,
        cityCode: profile.cityCode,
        locationType: profile.locationType,
        attribute: profile.attribute,
        customAttribute: profile.attribute === "OTHER" ? profile.customAttribute.trim() : null,
        mbti: profile.mbti || null,
        selfIntro: profile.selfIntro || null,
        consentProfileVisibility: profile.consent,
        status: "ACTIVE",
        photoMatchPref: photos.length > 0 ? (profile.photoMatchPref || "ALL") : null,
        highScoreOnly: photos.length > 0 ? profile.highScoreOnly : false,
      },
      preference: {
        ageMin: Number(profile.ageMin),
        ageMax: Number(profile.ageMax),
        heightMinCm: Number(profile.heightMinCm),
        heightMaxCm: Number(profile.heightMaxCm),
        weightMinKg: Number(profile.weightMinKg),
        weightMaxKg: Number(profile.weightMaxKg),
        locationScope: profile.locationScope,
        expectedAttributes: profile.expectedAttributes,
        expectedCustomAttribute: profile.expectedAttributes.includes("OTHER" as Attribute)
          ? profile.expectedCustomAttribute.trim() || null
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
        throw new Error(data.error?.message || "保存资料失败");
      }

      setSuccess(true);
      setTimeout(() => router.push("/profile"), 1500);
    } catch (err) {
      setError(err instanceof Error ? err.message : "保存资料失败");
      window.scrollTo({ top: 0, behavior: "smooth" });
    } finally {
      setLoading(false);
    }
  }

  /* ── Step indicator ── */
  function getStepState(s: Step): "done" | "current" | "pending" {
    const order: Step[] = ["verify", "passcode", "profile"];
    const ci = order.indexOf(step);
    const si = order.indexOf(s);
    if (si < ci) return "done";
    if (si === ci) return "current";
    return "pending";
  }

  const stepLabels: { key: Step; label: string }[] = [
    { key: "verify", label: "验证" },
    { key: "passcode", label: "密码" },
    { key: "profile", label: "资料" },
  ];

  return (
    <div className="flex flex-col gap-6">
      <div className="rounded-2xl border border-[hsl(var(--border))] bg-[hsl(var(--card))] p-8">
        {/* Header */}
        <div className="mb-6 text-center">
          <h1 className="text-2xl font-bold text-[hsl(var(--foreground))]">
            新用户注册
          </h1>
          <p className="mt-2 text-sm text-[hsl(var(--muted-foreground))]">
            {step === "verify"
              ? "输入邮箱收到的验证码"
              : step === "passcode"
              ? "设置你的登录密码"
              : "完善你的个人资料"}
          </p>
        </div>

        {/* Step indicator */}
        <div className="mb-6 flex items-center justify-center gap-2">
          {stepLabels.map((s, i) => {
            const state = getStepState(s.key);
            return (
              <div key={s.key} className="flex items-center gap-2">
                {i > 0 && (
                  <div className={`h-px w-6 ${state === "pending" ? "bg-[hsl(var(--border))]" : "bg-[hsl(var(--primary))]"}`} />
                )}
                <div className="flex flex-col items-center gap-1">
                  <div
                    className={`flex h-8 w-8 items-center justify-center rounded-full text-xs font-bold ${
                      state === "done"
                        ? "bg-[hsl(var(--primary))] text-white"
                        : state === "current"
                        ? "bg-[hsl(var(--primary))] text-white"
                        : "bg-[hsl(var(--secondary))] text-[hsl(var(--muted-foreground))]"
                    }`}
                  >
                    {state === "done" ? "✓" : i + 1}
                  </div>
                  <span className={`text-[10px] ${state === "pending" ? "text-[hsl(var(--muted-foreground))]" : "text-[hsl(var(--primary))]"}`}>
                    {s.label}
                  </span>
                </div>
              </div>
            );
          })}
        </div>

        {/* Error */}
        {error && (
          <div className="mb-4 rounded-lg border border-[hsl(0,62%,50%/0.3)] bg-[hsl(0,62%,50%/0.1)] px-4 py-3 text-sm text-[hsl(0,62%,70%)]">
            {error}
          </div>
        )}

        {/* Success */}
        {success ? (
          <div className="rounded-lg border border-[hsl(150,60%,40%/0.3)] bg-[hsl(150,60%,40%/0.1)] px-4 py-3 text-center text-sm text-[hsl(150,60%,60%)]">
            ✅ 注册成功！正在跳转...
          </div>
        ) : step === "verify" ? (
          /* Step 1: Verify email code */
          <form onSubmit={handleVerify} className="space-y-4">
            <div>
              <label
                htmlFor="code"
                className="mb-1.5 block text-sm font-medium text-[hsl(var(--foreground))]"
              >
                验证码
              </label>
              <input
                id="code"
                type="text"
                inputMode="text"
                value={code}
                onChange={(e) => setCode(e.target.value.toUpperCase())}
                placeholder="请输入 6 位验证码"
                maxLength={6}
                required
                autoFocus
                className="w-full rounded-lg border border-[hsl(var(--input))] bg-transparent px-3 py-2.5 text-center font-mono text-lg tracking-[0.5em] text-[hsl(var(--foreground))] placeholder:text-[hsl(var(--muted-foreground))] placeholder:tracking-normal placeholder:text-sm focus:border-[hsl(var(--ring))] focus:outline-none focus:ring-1 focus:ring-[hsl(var(--ring))]"
              />
            </div>

            <button
              type="submit"
              disabled={loading || code.length < 6}
              className="w-full rounded-lg bg-brand-blue px-4 py-2.5 text-sm font-semibold text-white shadow-md shadow-brand-blue/20 transition-all hover:scale-[1.02] hover:bg-brand-blue/90 active:scale-[0.98] disabled:opacity-50 disabled:hover:scale-100"
            >
              {loading ? "验证中..." : "验证"}
            </button>
          </form>
        ) : step === "passcode" ? (
          /* Step 2: Set passcode */
          <form onSubmit={handleSetPasscode} className="space-y-4">
            <div className="rounded-lg bg-[hsl(var(--secondary))] px-3 py-2 text-sm text-[hsl(var(--muted-foreground))]">
              QQ 号: <span className="font-mono text-[hsl(var(--foreground))]">{qqNumber}</span>
            </div>

            <div>
              <label
                htmlFor="passcode"
                className="mb-1.5 block text-sm font-medium text-[hsl(var(--foreground))]"
              >
                设置密码
              </label>
              <input
                id="passcode"
                type="password"
                value={passcode}
                onChange={(e) => setPasscode(e.target.value)}
                placeholder="至少 8 位，包含字母和数字"
                required
                minLength={8}
                autoFocus
                className="w-full rounded-lg border border-[hsl(var(--input))] bg-transparent px-3 py-2.5 text-sm text-[hsl(var(--foreground))] placeholder:text-[hsl(var(--muted-foreground))] focus:border-[hsl(var(--ring))] focus:outline-none focus:ring-1 focus:ring-[hsl(var(--ring))]"
              />
            </div>

            <div>
              <label
                htmlFor="confirmPasscode"
                className="mb-1.5 block text-sm font-medium text-[hsl(var(--foreground))]"
              >
                确认密码
              </label>
              <input
                id="confirmPasscode"
                type="password"
                value={confirmPasscode}
                onChange={(e) => setConfirmPasscode(e.target.value)}
                placeholder="请再次输入密码"
                required
                minLength={8}
                className="w-full rounded-lg border border-[hsl(var(--input))] bg-transparent px-3 py-2.5 text-sm text-[hsl(var(--foreground))] placeholder:text-[hsl(var(--muted-foreground))] focus:border-[hsl(var(--ring))] focus:outline-none focus:ring-1 focus:ring-[hsl(var(--ring))]"
              />
            </div>

            <p className="text-xs text-[hsl(var(--muted-foreground))]">
              密码至少 8 位，需包含字母和数字
            </p>

            <button
              type="submit"
              disabled={loading}
              className="w-full rounded-lg bg-brand-blue px-4 py-2.5 text-sm font-semibold text-white shadow-md shadow-brand-blue/20 transition-all hover:scale-[1.02] hover:bg-brand-blue/90 active:scale-[0.98] disabled:opacity-50 disabled:hover:scale-100"
            >
              {loading ? "设置中..." : "下一步"}
            </button>
          </form>
        ) : (
          /* Step 3: Profile creation — rendered outside this card for full width */
          null
        )}

        {/* Footer — only for steps 1 & 2 */}
        {step !== "profile" && !success && (
          <div className="mt-6 text-center">
            <a
              href="/login"
              className="text-xs text-[hsl(var(--primary))] underline-offset-4 hover:underline"
            >
              ← 已有账号？登录
            </a>
          </div>
        )}
      </div>

      {/* Step 3: Profile form (full width, outside the card) */}
      {step === "profile" && !success && (
        <ProfileFormSection
          profile={profile}
          cities={cities}
          loading={loading}
          photos={photos}
          wantPhotos={wantPhotos}
          onPhotosChange={setPhotos}
          onWantPhotosChange={setWantPhotos}
          updateProfile={updateProfile}
          handleProvinceChange={handleProvinceChange}
          toggleExpectedAttr={toggleExpectedAttr}
          onSubmit={handleSubmitProfile}
        />
      )}

      {/* Help card — only for steps 1 & 2 */}
      {step !== "profile" && !success && (
        <div className="rounded-2xl border border-[hsl(var(--border))] bg-[hsl(var(--card))] p-5">
          <h3 className="mb-2 text-sm font-semibold text-[hsl(var(--foreground))]">
            📱 注册步骤
          </h3>
          <ol className="space-y-1.5 text-xs text-[hsl(var(--muted-foreground))]">
            <li className="flex gap-2">
              <span className="font-mono text-[hsl(var(--primary))]">1.</span>
              在 QQ 群中发送 <code className="rounded bg-[hsl(var(--secondary))] px-1 font-mono">/signup</code> 指令
            </li>
            <li className="flex gap-2">
              <span className="font-mono text-[hsl(var(--primary))]">2.</span>
              机器人将验证码发送至你的 QQ 邮箱
            </li>
            <li className="flex gap-2">
              <span className="font-mono text-[hsl(var(--primary))]">3.</span>
              在此页面输入验证码并设置密码
            </li>
            <li className="flex gap-2">
              <span className="font-mono text-[hsl(var(--primary))]">4.</span>
              完善个人资料，完成注册
            </li>
          </ol>
        </div>
      )}
    </div>
  );
}

/* ─── Profile Form Section (Step 3) ─────────────────── */

function ProfileFormSection({
  profile,
  cities,
  loading,
  photos,
  wantPhotos,
  onPhotosChange,
  onWantPhotosChange,
  updateProfile,
  handleProvinceChange,
  toggleExpectedAttr,
  onSubmit,
}: {
  profile: ProfileFormState;
  cities: { code: string; name: string }[];
  loading: boolean;
  photos: PhotoItem[];
  wantPhotos: boolean;
  onPhotosChange: (photos: PhotoItem[]) => void;
  onWantPhotosChange: (v: boolean) => void;
  updateProfile: <K extends keyof ProfileFormState>(key: K, value: ProfileFormState[K]) => void;
  handleProvinceChange: (code: string) => void;
  toggleExpectedAttr: (attr: Attribute) => void;
  onSubmit: () => void;
}) {
  return (
    <div className="flex flex-col gap-5">
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
              value={profile.birthYear}
              onChange={(e) => updateProfile("birthYear", e.target.value)}
              className={profile.birthYear ? SELECT_CLS : SELECT_CLS_EMPTY}
            >
              <option value="">年</option>
              {YEARS.map((y) => (
                <option key={y} value={y}>{y}年</option>
              ))}
            </select>
            <select
              value={profile.birthMonth}
              onChange={(e) => updateProfile("birthMonth", e.target.value)}
              className={profile.birthMonth ? SELECT_CLS : SELECT_CLS_EMPTY}
            >
              <option value="">月</option>
              {MONTHS.map((m) => (
                <option key={m} value={m}>{m}月</option>
              ))}
            </select>
            <select
              value={profile.birthDay}
              onChange={(e) => updateProfile("birthDay", e.target.value)}
              className={profile.birthDay ? SELECT_CLS : SELECT_CLS_EMPTY}
            >
              <option value="">日</option>
              {DAYS.map((d) => (
                <option key={d} value={d}>{d}日</option>
              ))}
            </select>
          </div>
        </div>

        {/* Height — slider */}
        <div className="mb-4">
          <label className="mb-1.5 flex items-center justify-between text-sm font-medium text-[hsl(var(--foreground))]">
            <span>身高 <span className="text-[hsl(var(--destructive))]">*</span></span>
            <span className="tabular-nums text-[hsl(var(--primary))] font-semibold">{profile.heightCm || "170"} cm</span>
          </label>
          <input
            type="range"
            min={100}
            max={250}
            step={1}
            value={profile.heightCm || "170"}
            onChange={(e) => updateProfile("heightCm", e.target.value)}
            className="slider-input w-full"
          />
          <div className="mt-1 flex justify-between text-[10px] text-[hsl(var(--muted-foreground))]">
            <span>100 cm</span>
            <span>250 cm</span>
          </div>
        </div>

        {/* Weight — slider */}
        <div>
          <label className="mb-1.5 flex items-center justify-between text-sm font-medium text-[hsl(var(--foreground))]">
            <span>体重 <span className="text-[hsl(var(--destructive))]">*</span></span>
            <span className="tabular-nums text-[hsl(var(--primary))] font-semibold">{profile.weightKg || "60"} kg = {Number(profile.weightKg || "60") * 2} 斤</span>
          </label>
          <input
            type="range"
            min={30}
            max={200}
            step={1}
            value={profile.weightKg || "60"}
            onChange={(e) => updateProfile("weightKg", e.target.value)}
            className="slider-input w-full"
          />
          <div className="mt-1 flex justify-between text-[10px] text-[hsl(var(--muted-foreground))]">
            <span>30 kg</span>
            <span>200 kg</span>
          </div>
        </div>
      </section>

      {/* Section 2: Location */}
      <section className="rounded-2xl border border-[hsl(var(--border))] bg-[hsl(var(--card))] p-6">
        <h2 className="mb-5 text-base font-semibold text-[hsl(var(--foreground))]">所在地区</h2>

        {/* Province */}
        <div className="mb-4">
          <label className="mb-1.5 block text-sm font-medium text-[hsl(var(--foreground))]">
            {isOverseas(profile.provinceCode) ? "地区" : "省份"} <span className="text-[hsl(var(--destructive))]">*</span>
          </label>
          <select
            value={profile.provinceCode}
            onChange={(e) => handleProvinceChange(e.target.value)}
            className={profile.provinceCode ? SELECT_CLS : SELECT_CLS_EMPTY}
          >
            <option value="">请选择地区</option>
            {PROVINCES.map((p) => (
              <option key={p.code} value={p.code}>{p.name}</option>
            ))}
          </select>
        </div>

        {/* City */}
        <div>
          <label className="mb-1.5 block text-sm font-medium text-[hsl(var(--foreground))]">
            {isOverseas(profile.provinceCode) ? "国家" : "城市"} <span className="text-[hsl(var(--destructive))]">*</span>
          </label>
          <select
            value={profile.cityCode}
            onChange={(e) => updateProfile("cityCode", e.target.value)}
            disabled={!profile.provinceCode}
            className={`${profile.cityCode ? SELECT_CLS : SELECT_CLS_EMPTY} disabled:opacity-50`}
          >
            <option value="">{isOverseas(profile.provinceCode) ? "请选择国家" : "请选择城市"}</option>
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
                onClick={() => updateProfile("locationType", opt.value as LocationType)}
                className={`rounded-lg border px-4 py-2 text-sm font-medium transition-all ${
                  profile.locationType === opt.value
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
          value={profile.mbti}
          onChange={(e) => updateProfile("mbti", e.target.value)}
          className={profile.mbti ? SELECT_CLS : SELECT_CLS_EMPTY}
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
                updateProfile("attribute", opt.value);
                if (opt.value !== "OTHER") updateProfile("customAttribute", "");
              }}
              className={`rounded-lg border px-4 py-2 text-sm font-medium transition-all ${
                profile.attribute === opt.value
                  ? "border-[hsl(var(--primary))] bg-[hsl(var(--primary)/0.15)] text-[hsl(var(--primary))]"
                  : "border-[hsl(var(--border))] text-[hsl(var(--foreground))] hover:border-[hsl(var(--primary)/0.5)] hover:text-[hsl(var(--primary))]"
              }`}
            >
              {opt.label}
            </button>
          ))}
        </div>

        {profile.attribute === "OTHER" && (
          <div className="mt-4">
            <label className="mb-1.5 block text-sm font-medium text-[hsl(var(--foreground))]">
              请输入自定义属性 <span className="text-[hsl(var(--destructive))]">*</span>
            </label>
            <div className="relative">
              <input
                type="text"
                maxLength={20}
                value={profile.customAttribute}
                onChange={(e) => updateProfile("customAttribute", e.target.value)}
                placeholder="输入你的属性描述"
                className="w-full rounded-lg border border-[hsl(var(--input))] bg-[hsl(var(--card))] px-3 py-2.5 text-sm text-[hsl(var(--foreground))] placeholder:text-[hsl(var(--muted-foreground))] focus:border-[hsl(var(--ring))] focus:outline-none focus:ring-1 focus:ring-[hsl(var(--ring))]"
              />
              <span className="absolute right-3 top-1/2 -translate-y-1/2 text-xs text-[hsl(var(--muted-foreground))]">
                {profile.customAttribute.length}/20
              </span>
            </div>
          </div>
        )}
      </section>

      {/* Section 5: Self Intro */}
      <section className="rounded-2xl border border-[hsl(var(--border))] bg-[hsl(var(--card))] p-6">
        <h2 className="mb-5 text-base font-semibold text-[hsl(var(--foreground))]">自我介绍</h2>
        <div className="relative">
          <textarea
            value={profile.selfIntro}
            onChange={(e) => {
              if (e.target.value.length <= 500) updateProfile("selfIntro", e.target.value);
            }}
            placeholder="写点什么介绍自己吧..."
            rows={4}
            className="w-full resize-none rounded-lg border border-[hsl(var(--input))] bg-transparent px-3 py-2.5 text-sm text-[hsl(var(--foreground))] placeholder:text-[hsl(var(--muted-foreground))] focus:border-[hsl(var(--ring))] focus:outline-none focus:ring-1 focus:ring-[hsl(var(--ring))]"
          />
          <span className="absolute bottom-2 right-3 text-xs text-[hsl(var(--muted-foreground))]">
            {profile.selfIntro.length}/500
          </span>
        </div>
      </section>

      {/* Section 6: Photos (optional) */}
      <section className="rounded-2xl border border-[hsl(var(--border))] bg-[hsl(var(--card))] p-6">
        <h2 className="mb-2 text-base font-semibold text-[hsl(var(--foreground))]">照片 <span className="text-xs font-normal text-[hsl(var(--muted-foreground))]">(可选)</span></h2>
        <p className="mb-4 text-xs text-[hsl(var(--muted-foreground))]">
          上传照片后将由评分哨对你的照片进行评分，你会获得一个颜值分属性。
        </p>

        {/* Toggle buttons */}
        <div className="mb-4 flex gap-2">
          <button
            type="button"
            onClick={() => onWantPhotosChange(false)}
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
            onClick={() => onWantPhotosChange(true)}
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

        {/* Photo uploader */}
        {wantPhotos && (
          <>
            <PhotoUploader
              photos={photos}
              onPhotosChange={onPhotosChange}
              maxPhotos={6}
            />

            {/* Photo matching preference */}
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
                  <label className={`flex items-center gap-3 rounded-lg border px-4 py-3 cursor-pointer transition-all ${
                    profile.photoMatchPref === "ALL"
                      ? "border-[hsl(var(--primary)/0.5)] bg-[hsl(var(--primary)/0.05)]"
                      : "border-[hsl(var(--border))] hover:border-[hsl(var(--primary)/0.5)]"
                  }`}>
                    <input
                      type="radio"
                      name="photoMatchPref"
                      checked={profile.photoMatchPref === "ALL"}
                      onChange={() => updateProfile("photoMatchPref", "ALL")}
                      className="h-4 w-4 accent-[hsl(var(--primary))]"
                    />
                    <div>
                      <div className="text-sm font-medium text-[hsl(var(--foreground))]">与所有用户匹配</div>
                      <div className="text-xs text-[hsl(var(--muted-foreground))]">包括有照片和无照片用户</div>
                    </div>
                  </label>
                  <label className={`flex items-center gap-3 rounded-lg border px-4 py-3 cursor-pointer transition-all ${
                    profile.photoMatchPref === "PHOTO_ONLY"
                      ? "border-[hsl(var(--primary)/0.5)] bg-[hsl(var(--primary)/0.05)]"
                      : "border-[hsl(var(--border))] hover:border-[hsl(var(--primary)/0.5)]"
                  }`}>
                    <input
                      type="radio"
                      name="photoMatchPref"
                      checked={profile.photoMatchPref === "PHOTO_ONLY"}
                      onChange={() => updateProfile("photoMatchPref", "PHOTO_ONLY")}
                      className="h-4 w-4 accent-[hsl(var(--primary))]"
                    />
                    <div>
                      <div className="text-sm font-medium text-[hsl(var(--foreground))]">仅与有照片用户匹配</div>
                      <div className="text-xs text-[hsl(var(--muted-foreground))]">只匹配同样上传了照片的用户</div>
                    </div>
                  </label>
                </div>
              </div>
            )}
          </>
        )}
      </section>

      {/* Section 7: Matching Preferences */}
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
            valueMin={Number(profile.ageMin) || 18}
            valueMax={Number(profile.ageMax) || 30}
            onChangeMin={(v) => updateProfile("ageMin", String(v))}
            onChangeMax={(v) => updateProfile("ageMax", String(v))}
            formatValue={(v) => `${v} 岁`}
          />
        </div>

        {/* Height range */}
        <div className="mb-4">
          <label className="mb-1.5 block text-sm font-medium text-[hsl(var(--foreground))]">
            期望身高 (cm)
          </label>
          <DualRangeSlider
            min={140}
            max={210}
            valueMin={Number(profile.heightMinCm) || 155}
            valueMax={Number(profile.heightMaxCm) || 185}
            onChangeMin={(v) => updateProfile("heightMinCm", String(v))}
            onChangeMax={(v) => updateProfile("heightMaxCm", String(v))}
            formatValue={(v) => `${v} cm`}
          />
        </div>

        {/* Weight range */}
        <div className="mb-4">
          <label className="mb-1.5 block text-sm font-medium text-[hsl(var(--foreground))]">
            期望体重 (kg)
          </label>
          <DualRangeSlider
            min={35}
            max={150}
            valueMin={Number(profile.weightMinKg) || 45}
            valueMax={Number(profile.weightMaxKg) || 80}
            onChangeMin={(v) => updateProfile("weightMinKg", String(v))}
            onChangeMax={(v) => updateProfile("weightMaxKg", String(v))}
            formatValue={(v) => `${v}kg = ${v * 2}斤`}
          />
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
                onClick={() => updateProfile("locationScope", opt.value)}
                className={`rounded-lg border px-4 py-2 text-sm font-medium transition-all ${
                  profile.locationScope === opt.value
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
              const selected = profile.expectedAttributes.includes(opt.value);
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

          {profile.expectedAttributes.includes("OTHER" as Attribute) && (
            <div className="mt-3">
              <label className="mb-1.5 block text-sm font-medium text-[hsl(var(--foreground))]">
                自定义期望属性描述
              </label>
              <div className="relative">
                <input
                  type="text"
                  maxLength={20}
                  value={profile.expectedCustomAttribute}
                  onChange={(e) => updateProfile("expectedCustomAttribute", e.target.value)}
                  placeholder="输入你期望的属性描述"
                  className="w-full rounded-lg border border-[hsl(var(--input))] bg-[hsl(var(--card))] px-3 py-2.5 text-sm text-[hsl(var(--foreground))] placeholder:text-[hsl(var(--muted-foreground))] focus:border-[hsl(var(--ring))] focus:outline-none focus:ring-1 focus:ring-[hsl(var(--ring))]"
                />
                <span className="absolute right-3 top-1/2 -translate-y-1/2 text-xs text-[hsl(var(--muted-foreground))]">
                  {profile.expectedCustomAttribute.length}/20
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
            checked={profile.consent}
            onChange={(e) => updateProfile("consent", e.target.checked)}
            className="mt-1 h-4 w-4 shrink-0 rounded border-[hsl(var(--input))] accent-[hsl(var(--primary))]"
          />
          <span className="text-sm text-[hsl(var(--foreground))]">
            我同意将我的资料展示给其他群成员用于匹配。我了解我可以随时清空我的资料。
          </span>
        </label>
      </section>

      {/* Submit button */}
      <button
        type="button"
        onClick={onSubmit}
        disabled={loading}
        className="w-full rounded-lg bg-brand-blue px-4 py-3 text-sm font-semibold text-white shadow-md shadow-brand-blue/20 transition-all hover:scale-[1.02] hover:bg-brand-blue/90 active:scale-[0.98] disabled:opacity-50 disabled:hover:scale-100"
      >
        {loading ? "保存中..." : "完成注册"}
      </button>
    </div>
  );
}
