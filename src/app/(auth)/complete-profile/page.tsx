"use client";

import { useState, useMemo } from "react";
import { useRouter } from "next/navigation";
import { PROVINCES, getCities, isOverseas } from "@/data/regions";
import { MAIN_ATTRIBUTE_OPTIONS, ATTRIBUTE_OPTIONS } from "@/data/attributes";
import { LOCATION_TYPE_OPTIONS } from "@/data/location-types";
import { MBTI_OPTIONS } from "@/data/mbti";
import { DualRangeSlider } from "@/components/DualRangeSlider";
import { MeasurementSlider } from "@/components/MeasurementSlider";
import { PhotoUploader } from "@/components/profile/photo-uploader";
import { ProfileSubmitPreview } from "@/components/profile/profile-submit-preview";
import { AlertModal } from "@/components/ui/alert-modal";
import { ConfirmModal } from "@/components/ui/confirm-modal";
import {
  buildGroupCardForProfile,
  normalizeNicknameInput,
} from "@/lib/group-card";
import {
  HEIGHT_DEFAULT_CM,
  HEIGHT_MAX_CM,
  HEIGHT_MIN_CM,
  MAX_SELF_INTRO_LENGTH,
  WEIGHT_DEFAULT_KG,
  WEIGHT_MAX_KG,
  WEIGHT_MIN_KG,
} from "@/lib/profile-limits";
import {
  getBirthDayOptions,
  isValidCalendarDate,
  keepValidBirthDay,
} from "@/lib/date-input";
import { getUserFacingRequestError, readApiJson } from "@/lib/api-client";

interface PhotoItem {
  id: string;
  order: number;
  originalName: string | null;
  url: string;
}

/* ─── Profile Types ─────────────────────────────────── */

type Attribute = "ONE" | "ZERO" | "HALF" | "LEAN_ONE" | "LEAN_ZERO" | "SIDE" | "OTHER";
type LocationType = "RESIDENCE" | "HOMETOWN" | "SCHOOL" | "WORK" | "TRAVEL" | "OTHER";
type PhotoMatchPref = "PHOTO_ONLY" | "ALL";

const SELECT_CLS =
  "w-full rounded-lg border border-[hsl(var(--input))] bg-[hsl(var(--card))] px-3 py-2.5 text-sm text-[hsl(var(--foreground))] focus:border-[hsl(var(--ring))] focus:outline-none focus:ring-1 focus:ring-[hsl(var(--ring))]";
const SELECT_CLS_EMPTY =
  `${SELECT_CLS} text-[hsl(var(--muted-foreground))]`;

interface ProfileFormState {
  nickname: string;
  birthYear: string;
  birthMonth: string;
  birthDay: string;
  heightCm: string;
  weightKg: string;
  provinceCode: string;
  cityCode: string;
  locationType: LocationType;
  attribute: Attribute | "";
  isSide: boolean;
  isOther: boolean;
  customAttribute: string;
  mbti: string;
  selfIntro: string;
  ageMin: string;
  ageMax: string;
  heightMinCm: string;
  heightMaxCm: string;
  weightMinKg: string;
  weightMaxKg: string;

  expectedAttributes: Attribute[];
  expectedCustomAttribute: string;
  photoMatchPref: PhotoMatchPref | "";
  highScoreOnly: boolean;
  consent: boolean;
}

const INITIAL_PROFILE: ProfileFormState = {
  nickname: "",
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
  ageMin: "18",
  ageMax: "35",
  heightMinCm: "150",
  heightMaxCm: "200",
  weightMinKg: "40",
  weightMaxKg: "100",

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

const YEARS = range(1960, 2010).reverse();
const MONTHS = range(1, 12);
const PUBLISH_CONFIRM_TEXT = "确认提交并发布我的资料";
const PUBLISH_CONFIRM_DESCRIPTION = "提交后 7 天内不能修改，请确认所有信息无误。";

function isUnder18(birthYear: number, birthMonth: number, birthDay: number): boolean {
  const today = new Date();
  const year = today.getFullYear();
  const month = today.getMonth() + 1;
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

/**
 * Complete Profile page — shown when a logged-in user
 * has not yet created their profile (signup Step 3 was skipped).
 * The user CANNOT navigate away until the profile is created.
 */
export default function CompleteProfilePage() {
  const router = useRouter();

  // Profile form state
  const [profile, setProfile] = useState<ProfileFormState>(INITIAL_PROFILE);

  // Photo state
  const [photos, setPhotos] = useState<PhotoItem[]>([]);
  const [wantPhotos, setWantPhotos] = useState(false);

  // Shared state
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);
  const [showAgeAlert, setShowAgeAlert] = useState(false);
  const [publishConfirmOpen, setPublishConfirmOpen] = useState(false);
  const [previewingProfile, setPreviewingProfile] = useState(false);

  // Computed cities
  const cities = useMemo(
    () => (profile.provinceCode ? getCities(profile.provinceCode) : []),
    [profile.provinceCode]
  );
  const birthDays = getBirthDayOptions(profile.birthYear, profile.birthMonth);

  function updateProfile<K extends keyof ProfileFormState>(key: K, value: ProfileFormState[K]) {
    setProfile((prev) => ({ ...prev, [key]: value }));
  }

  function handleBirthYearChange(birthYear: string) {
    setProfile((prev) => ({
      ...prev,
      birthYear,
      birthDay: keepValidBirthDay(prev.birthDay, birthYear, prev.birthMonth),
    }));
  }

  function handleBirthMonthChange(birthMonth: string) {
    setProfile((prev) => ({
      ...prev,
      birthMonth,
      birthDay: keepValidBirthDay(prev.birthDay, prev.birthYear, birthMonth),
    }));
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

  /* ── Validate profile ── */
  function validateProfile(): string | null {
    const nickname = normalizeNicknameInput(profile.nickname);
    if (!nickname) return "请输入昵称";
    if (nickname.length > 30) return "昵称不能超过30个字符";
    if (!profile.birthYear || !profile.birthMonth || !profile.birthDay) return "请选择出生日期";
    if (!isValidCalendarDate(profile.birthYear, profile.birthMonth, profile.birthDay)) {
      return "请选择有效的出生日期";
    }
    if (!profile.heightCm) return "请输入身高";
    const hVal = Number(profile.heightCm);
    if (isNaN(hVal) || hVal < HEIGHT_MIN_CM || hVal > HEIGHT_MAX_CM) {
      return `身高范围: ${HEIGHT_MIN_CM}-${HEIGHT_MAX_CM}cm`;
    }
    if (!profile.weightKg) return "请输入体重";
    const wVal = Number(profile.weightKg);
    if (isNaN(wVal) || wVal < WEIGHT_MIN_KG || wVal > WEIGHT_MAX_KG) {
      return `体重范围: ${WEIGHT_MIN_KG}-${WEIGHT_MAX_KG}kg`;
    }
    if (!profile.provinceCode) return "请选择地区";
    if (!profile.cityCode) return isOverseas(profile.provinceCode) ? "请选择国家" : "请选择城市";
    if (!resolveSelectedAttribute(profile.attribute, profile.isSide, profile.isOther)) return "请选择属性";

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

    if (!profile.consent) return "请勾选同意条款后再提交";

    return null;
  }

  async function doSubmitProfile(status: "ACTIVE" | "DRAFT") {
    setLoading(true);
    setError(null);

    const birthDate = `${profile.birthYear}-${String(profile.birthMonth).padStart(2, "0")}-${String(profile.birthDay).padStart(2, "0")}`;
    const resolvedAttribute = resolveSelectedAttribute(
      profile.attribute,
      profile.isSide,
      profile.isOther,
    );

    const body = {
      nickname: normalizeNicknameInput(profile.nickname),
      profile: {
        birthDate,
        heightCm: Number(profile.heightCm),
        weightKg: Number(profile.weightKg),
        provinceCode: profile.provinceCode,
        cityCode: profile.cityCode,
        locationType: profile.locationType,
        attribute: resolvedAttribute,
        isSide: profile.isSide,
        isOther: profile.isOther,
        customAttribute: null,
        mbti: profile.mbti || null,
        selfIntro: profile.selfIntro || null,
        consentProfileVisibility: profile.consent,
        status,
        photoMatchPref: null,
        highScoreOnly: false,
      },
      preference: {
        ageMin: Number(profile.ageMin),
        ageMax: Number(profile.ageMax),
        heightMinCm: Number(profile.heightMinCm),
        heightMaxCm: Number(profile.heightMaxCm),
        weightMinKg: Number(profile.weightMinKg),
        weightMaxKg: Number(profile.weightMaxKg),

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

      await readApiJson<unknown>(res, "保存资料失败");

      // Refresh auth state before navigating; otherwise protected tabs can see the old no-profile session.
      const refreshRes = await fetch("/api/auth/refresh", { method: "POST", cache: "no-store" });
      await readApiJson<unknown>(refreshRes, "登录状态刷新失败，请刷新页面后重试");
      router.refresh();

      setSuccess(true);
      setTimeout(() => router.push("/profile"), 1500);
    } catch (err) {
      setError(getUserFacingRequestError(err, "保存资料失败"));
      window.scrollTo({ top: 0, behavior: "smooth" });
    } finally {
      setLoading(false);
    }
  }

  async function handleSubmitProfile() {
    const err = validateProfile();
    if (err) {
      setError(err);
      window.scrollTo({ top: 0, behavior: "smooth" });
      return;
    }

    const under18 = isUnder18(
      Number(profile.birthYear),
      Number(profile.birthMonth),
      Number(profile.birthDay)
    );

    if (under18) {
      setShowAgeAlert(true);
      return;
    }

    setError(null);
    setPreviewingProfile(true);
    window.scrollTo({ top: 0, behavior: "smooth" });
  }

  return (
    <div className="flex flex-col gap-6">
      {/* Header card */}
      <div className="rounded-2xl border border-[hsl(var(--border))] bg-[hsl(var(--card))] p-8">
        <div className="mb-4 text-center">
          <h1 className="text-2xl font-bold text-[hsl(var(--foreground))]">
            完善个人资料
          </h1>
          <p className="mt-2 text-sm text-[hsl(var(--muted-foreground))]">
            你需要完成资料创建才能继续使用 TenMatch
          </p>
        </div>

        {/* Notice banner */}
        <div className="flex items-start gap-3 rounded-lg border border-brand-blue/30 bg-brand-blue/5 px-4 py-3">
          <svg viewBox="0 0 24 24" className="mt-0.5 h-5 w-5 shrink-0 fill-none stroke-brand-blue stroke-2 stroke-linecap-round stroke-linejoin-round">
            <circle cx="12" cy="12" r="10" />
            <line x1="12" y1="16" x2="12" y2="12" />
            <line x1="12" y1="8" x2="12.01" y2="8" />
          </svg>
          <p className="text-sm text-brand-blue">
            你的注册尚未完成。请填写以下信息以完成资料创建。
          </p>
        </div>
      </div>

      {/* Error */}
      {error && (
        <div className="rounded-lg border border-[hsl(0,62%,50%/0.3)] bg-[hsl(0,62%,50%/0.1)] px-4 py-3 text-sm text-[hsl(0,62%,70%)]">
          {error}
        </div>
      )}

      {/* Success */}
      {success ? (
        <div className="rounded-lg border border-[hsl(150,60%,40%/0.3)] bg-[hsl(150,60%,40%/0.1)] px-4 py-3 text-center text-sm text-[hsl(150,60%,60%)]">
          ✅ 资料创建成功！正在跳转...
        </div>
      ) : (
        <>
          {previewingProfile ? (
            <ProfileSubmitPreview
              data={{
                ...profile,
                nickname: normalizeNicknameInput(profile.nickname),
                photos,
              }}
              submitting={loading}
              publishLabel="发布资料"
              onEdit={() => {
                setPreviewingProfile(false);
                window.scrollTo({ top: 0, behavior: "smooth" });
              }}
              onPublish={() => setPublishConfirmOpen(true)}
            />
          ) : (
            <ProfileFormSection
              profile={profile}
              cities={cities}
              birthDays={birthDays}
              loading={loading}
              photos={photos}
              wantPhotos={wantPhotos}
              onPhotosChange={setPhotos}
              onWantPhotosChange={setWantPhotos}
              updateProfile={updateProfile}
              onBirthYearChange={handleBirthYearChange}
              onBirthMonthChange={handleBirthMonthChange}
              handleProvinceChange={handleProvinceChange}
              toggleExpectedAttr={toggleExpectedAttr}
              onSubmit={handleSubmitProfile}
            />
          )}
          {/* Age alert modal */}
          <AlertModal
            open={showAgeAlert}
            title="年龄提示"
            description="未满 18 周岁（未过 18 岁生日）的用户不允许使用此匹配系统。你的账号可以创建，但个人资料已被自动保存为草稿，在年满 18 周岁前无法发布。"
            onConfirm={async () => {
              setShowAgeAlert(false);
              await doSubmitProfile("DRAFT");
            }}
          />
          <ConfirmModal
            open={publishConfirmOpen}
            title="确认发布"
            description={PUBLISH_CONFIRM_DESCRIPTION}
            confirmText={PUBLISH_CONFIRM_TEXT}
            buttonLabel="确认发布"
            variant="primary"
            loading={loading}
            onClose={() => setPublishConfirmOpen(false)}
            onConfirm={() => {
              setPublishConfirmOpen(false);
              void doSubmitProfile("ACTIVE");
            }}
          />
        </>
      )}
    </div>
  );
}

/* ─── Profile Form Section ─────────────────────────── */

function ProfileFormSection({
  profile,
  cities,
  birthDays,
  loading,
  photos,
  wantPhotos,
  onPhotosChange,
  onWantPhotosChange,
  updateProfile,
  onBirthYearChange,
  onBirthMonthChange,
  handleProvinceChange,
  toggleExpectedAttr,
  onSubmit,
}: {
  profile: ProfileFormState;
  cities: { code: string; name: string }[];
  birthDays: number[];
  loading: boolean;
  photos: PhotoItem[];
  wantPhotos: boolean;
  onPhotosChange: (photos: PhotoItem[]) => void;
  onWantPhotosChange: (v: boolean) => void;
  updateProfile: <K extends keyof ProfileFormState>(key: K, value: ProfileFormState[K]) => void;
  onBirthYearChange: (birthYear: string) => void;
  onBirthMonthChange: (birthMonth: string) => void;
  handleProvinceChange: (code: string) => void;
  toggleExpectedAttr: (attr: Attribute) => void;
  onSubmit: () => void;
}) {
  const [showClearPhotosConfirm, setShowClearPhotosConfirm] = useState(false);
  const nicknamePreview = normalizeNicknameInput(profile.nickname);
  const groupCardPreview = useMemo(() => {
    if (!nicknamePreview) return "";
    if (!profile.birthYear || !profile.birthMonth || !profile.birthDay || !profile.provinceCode) {
      return nicknamePreview;
    }

    return buildGroupCardForProfile(nicknamePreview, {
      birthDate: `${profile.birthYear}-${String(profile.birthMonth).padStart(2, "0")}-${String(profile.birthDay).padStart(2, "0")}`,
      provinceCode: profile.provinceCode,
    });
  }, [
    nicknamePreview,
    profile.birthYear,
    profile.birthMonth,
    profile.birthDay,
    profile.provinceCode,
  ]);
  return (
    <div className="flex flex-col gap-5">
      {/* Section 1: Basic Info */}
      <section className="rounded-2xl border border-[hsl(var(--border))] bg-[hsl(var(--card))] p-6">
        <h2 className="mb-5 text-base font-semibold text-[hsl(var(--foreground))]">基本信息</h2>

        {/* Nickname */}
        <div className="mb-4">
          <label className="mb-1.5 block text-sm font-medium text-[hsl(var(--foreground))]">
            昵称 <span className="text-[hsl(var(--destructive))]">*</span>
          </label>
          <input
            type="text"
            value={profile.nickname}
            onChange={(e) => updateProfile("nickname", e.target.value)}
            maxLength={30}
            placeholder="请输入群名片中的昵称部分"
            className={SELECT_CLS}
          />
          <p className="mt-1.5 text-xs text-[hsl(var(--muted-foreground))]">
            群名片预览：
            <span className="font-semibold text-[hsl(var(--primary))]">
              {groupCardPreview || "填写昵称、生日和地区后生成"}
            </span>
          </p>
        </div>

        {/* Birth date */}
        <div className="mb-4">
          <label className="mb-1.5 block text-sm font-medium text-[hsl(var(--foreground))]">
            出生日期 <span className="text-[hsl(var(--destructive))]">*</span>
          </label>
          <div className="grid grid-cols-3 gap-2">
            <select
              value={profile.birthYear}
              onChange={(e) => onBirthYearChange(e.target.value)}
              className={profile.birthYear ? SELECT_CLS : SELECT_CLS_EMPTY}
            >
              <option value="">年</option>
              {YEARS.map((y) => (
                <option key={y} value={y}>{y}年</option>
              ))}
            </select>
            <select
              value={profile.birthMonth}
              onChange={(e) => onBirthMonthChange(e.target.value)}
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
              {birthDays.map((d) => (
                <option key={d} value={d}>{d}日</option>
              ))}
            </select>
          </div>
        </div>

        <MeasurementSlider
          className="mb-4"
          label="身高"
          required
          value={profile.heightCm}
          min={HEIGHT_MIN_CM}
          max={HEIGHT_MAX_CM}
          defaultValue={HEIGHT_DEFAULT_CM}
          unit="cm"
          onChange={(v) => updateProfile("heightCm", v)}
        />

        <MeasurementSlider
          label="体重"
          required
          value={profile.weightKg}
          min={WEIGHT_MIN_KG}
          max={WEIGHT_MAX_KG}
          defaultValue={WEIGHT_DEFAULT_KG}
          unit="kg"
          detail={(v) => `= ${v * 2} 斤`}
          onChange={(v) => updateProfile("weightKg", v)}
        />
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
                updateProfile(
                  "attribute",
                  profile.attribute === opt.value ? "" : opt.value
                )
              }
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

        {/* Extra tags (toggleable) */}
        <div className="mt-3 flex flex-wrap gap-2">
          <button
            type="button"
            onClick={() => updateProfile("isSide", !profile.isSide)}
            className={`rounded-lg border px-4 py-2 text-sm font-medium transition-all ${
              profile.isSide
                ? "border-[hsl(var(--primary))] bg-[hsl(var(--primary)/0.15)] text-[hsl(var(--primary))]"
                : "border-[hsl(var(--border))] text-[hsl(var(--foreground))] hover:border-[hsl(var(--primary)/0.5)] hover:text-[hsl(var(--primary))]"
            }`}
          >
            <span className="mr-1">{profile.isSide ? "✓" : "+"}</span>side
          </button>
          <button
            type="button"
            onClick={() => updateProfile("isOther", !profile.isOther)}
            className={`rounded-lg border px-4 py-2 text-sm font-medium transition-all ${
              profile.isOther
                ? "border-[hsl(var(--primary))] bg-[hsl(var(--primary)/0.15)] text-[hsl(var(--primary))]"
                : "border-[hsl(var(--border))] text-[hsl(var(--foreground))] hover:border-[hsl(var(--primary)/0.5)] hover:text-[hsl(var(--primary))]"
            }`}
          >
            <span className="mr-1">{profile.isOther ? "✓" : "+"}</span>其他
          </button>
        </div>

        <p className="mt-2 text-xs text-[hsl(var(--muted-foreground))]">
          上方选择主属性，side 和其他可以同时勾选
        </p>
      </section>

      {/* Section 5: Self Intro */}
      <section className="rounded-2xl border border-[hsl(var(--border))] bg-[hsl(var(--card))] p-6">
        <h2 className="mb-5 text-base font-semibold text-[hsl(var(--foreground))]">自我介绍</h2>
        <div className="relative">
          <textarea
            value={profile.selfIntro}
            onChange={(e) => {
              if (e.target.value.length <= MAX_SELF_INTRO_LENGTH) updateProfile("selfIntro", e.target.value);
            }}
            placeholder="写点什么介绍自己吧..."
            maxLength={MAX_SELF_INTRO_LENGTH}
            rows={6}
            className="w-full resize-none rounded-lg border border-[hsl(var(--input))] bg-transparent px-3 py-2.5 text-sm text-[hsl(var(--foreground))] placeholder:text-[hsl(var(--muted-foreground))] focus:border-[hsl(var(--ring))] focus:outline-none focus:ring-1 focus:ring-[hsl(var(--ring))]"
          />
          <span className="absolute bottom-2 right-3 text-xs text-[hsl(var(--muted-foreground))]">
            {profile.selfIntro.length}/{MAX_SELF_INTRO_LENGTH}
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
            onClick={() => {
              if (photos.length > 0) {
                setShowClearPhotosConfirm(true);
              } else {
                onWantPhotosChange(false);
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
                  onClick={async () => {
                    setShowClearPhotosConfirm(false);
                    await Promise.all(
                      photos.map((p) =>
                        fetch("/api/profile/photos", {
                          method: "DELETE",
                          headers: { "Content-Type": "application/json" },
                          body: JSON.stringify({ photoId: p.id }),
                        }).catch(() => {})
                      )
                    );
                    onPhotosChange([]);
                    onWantPhotosChange(false);
                  }}
                  className="flex-1 rounded-lg bg-[hsl(0,72%,51%)] py-2 text-sm font-semibold text-white transition-all hover:bg-[hsl(0,72%,45%)]"
                >
                  确认删除
                </button>
              </div>
            </div>
          </div>
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
            min={HEIGHT_MIN_CM}
            max={HEIGHT_MAX_CM}
            valueMin={Number(profile.heightMinCm) || HEIGHT_MIN_CM}
            valueMax={Number(profile.heightMaxCm) || HEIGHT_MAX_CM}
            onChangeMin={(v) => updateProfile("heightMinCm", String(v))}
            onChangeMax={(v) => updateProfile("heightMaxCm", String(v))}
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
            valueMin={Number(profile.weightMinKg) || WEIGHT_MIN_KG}
            valueMax={Number(profile.weightMaxKg) || WEIGHT_MAX_KG}
            onChangeMin={(v) => updateProfile("weightMinKg", String(v))}
            onChangeMax={(v) => updateProfile("weightMaxKg", String(v))}
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
        </div>
      </section>

      {/* Section 8: Consent */}
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
        {loading ? "保存中..." : "完成资料创建"}
      </button>
    </div>
  );
}
