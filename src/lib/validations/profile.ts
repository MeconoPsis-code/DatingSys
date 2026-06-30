import { z } from "zod/v4";
import { Attribute, LocationType, PhotoMatchPref, ProfileStatus } from "@prisma/client";
import { MBTI_TYPES } from "@/data/mbti";

// ── Constants ───────────────────────────────────────────

const MIN_AGE = 18;
const MIN_HEIGHT = 100;
const MAX_HEIGHT = 250;
const MIN_WEIGHT = 30;
const MAX_WEIGHT = 200;
const MAX_SELF_INTRO = 500;

// ── Cooldown constants (exported for API + UI) ─────────

export const CLEAR_COOLDOWN_DAYS = 30;
export const EDIT_COOLDOWN_DAYS = 7;
export const PHOTO_REVOKE_REPUBLISH_COOLDOWN_HOURS = 5;
export const PHOTO_REVOKE_REPUBLISH_COOLDOWN_MS =
  PHOTO_REVOKE_REPUBLISH_COOLDOWN_HOURS * 60 * 60 * 1000;

// ── Helper: age from DOB ────────────────────────────────

function ageFromDate(date: Date): number {
  const today = new Date();
  let age = today.getFullYear() - date.getFullYear();
  const monthDiff = today.getMonth() - date.getMonth();
  if (monthDiff < 0 || (monthDiff === 0 && today.getDate() < date.getDate())) {
    age--;
  }
  return age;
}

// ── Profile Schema ──────────────────────────────────────

export const profileSchema = z
  .object({
    birthDate: z
      .string()
      .date()
      .transform((s) => new Date(s)),

    heightCm: z
      .number()
      .int()
      .min(MIN_HEIGHT, `身高不能低于 ${MIN_HEIGHT}cm`)
      .max(MAX_HEIGHT, `身高不能超过 ${MAX_HEIGHT}cm`),

    weightKg: z
      .number()
      .int()
      .min(MIN_WEIGHT, `体重不能低于 ${MIN_WEIGHT}kg`)
      .max(MAX_WEIGHT, `体重不能超过 ${MAX_WEIGHT}kg`),

    provinceCode: z.string().min(1, "请选择省份"),
    cityCode: z.string().min(1, "请选择城市"),

    locationType: z.enum(
      Object.values(LocationType) as [string, ...string[]]
    ) as z.ZodType<LocationType>,

    attribute: z.enum(
      Object.values(Attribute) as [string, ...string[]]
    ) as z.ZodType<Attribute>,

    isSide: z.boolean().optional().default(false),
    isOther: z.boolean().optional().default(false),

    customAttribute: z
      .string()
      .max(20, "自定义属性不能超过 20 个字")
      .optional()
      .nullable(),

    mbti: z
      .string()
      .refine(
        (v) => v === "" || (MBTI_TYPES as readonly string[]).includes(v),
        { message: "无效的 MBTI 类型" }
      )
      .optional()
      .nullable(),

    selfIntro: z
      .string()
      .max(MAX_SELF_INTRO, `自我介绍不能超过 ${MAX_SELF_INTRO} 个字`)
      .optional()
      .nullable(),

    consentProfileVisibility: z.boolean(),

    photoMatchPref: z.enum(
      Object.values(PhotoMatchPref) as [string, ...string[]]
    ).optional().nullable() as z.ZodType<PhotoMatchPref | null | undefined>,

    highScoreOnly: z.boolean().optional(),

    status: z
      .enum(Object.values(ProfileStatus) as [string, ...string[]])
      .optional() as z.ZodType<ProfileStatus | undefined>,
  })
  .refine(
    (d) => {
      if (d.status === "ACTIVE") {
        return ageFromDate(d.birthDate) >= MIN_AGE;
      }
      return true;
    },
    {
      message: `未满 18 周岁（未过 18 岁生日）的用户不允许使用此匹配系统`,
      path: ["birthDate"],
    }
  );

// ── Preference Schema ───────────────────────────────────

export const preferenceSchema = z
  .object({
    ageMin: z.number().int().min(MIN_AGE, `最小年龄不能低于 ${MIN_AGE}`),
    ageMax: z.number().int().max(99, "最大年龄不能超过 99"),

    heightMinCm: z
      .number()
      .int()
      .min(MIN_HEIGHT, `最低身高不能低于 ${MIN_HEIGHT}cm`),
    heightMaxCm: z
      .number()
      .int()
      .max(MAX_HEIGHT, `最高身高不能超过 ${MAX_HEIGHT}cm`),

    weightMinKg: z
      .number()
      .int()
      .min(MIN_WEIGHT, `最低体重不能低于 ${MIN_WEIGHT}kg`),
    weightMaxKg: z
      .number()
      .int()
      .max(MAX_WEIGHT, `最高体重不能超过 ${MAX_WEIGHT}kg`),


    expectedAttributes: z.array(
      z.enum(Object.values(Attribute) as [string, ...string[]]) as z.ZodType<Attribute>
    ).min(1, "请至少选择一个期望属性"),

    expectedCustomAttribute: z
      .string()
      .max(20, "自定义期望属性不能超过 20 个字")
      .optional()
      .nullable(),
  })
  .refine((d) => d.ageMin <= d.ageMax, {
    message: "最小年龄不能大于最大年龄",
    path: ["ageMin"],
  })
  .refine((d) => d.heightMinCm <= d.heightMaxCm, {
    message: "最低身高不能大于最高身高",
    path: ["heightMinCm"],
  })
  .refine((d) => d.weightMinKg <= d.weightMaxKg, {
    message: "最低体重不能大于最高体重",
    path: ["weightMinKg"],
  });

// ── Combined Form Schema (for PUT /api/profile/me) ──────

export const profileFormSchema = z
  .object({
    profile: profileSchema,
    preference: preferenceSchema,
    nickname: z
      .string()
      .max(30, "昵称不能超过 30 个字符")
      .optional()
      .nullable(),
  })
  .refine(
    (d) => {
      // Consent required for ACTIVE status
      if (d.profile.status === "ACTIVE" && !d.profile.consentProfileVisibility) {
        return false;
      }
      return true;
    },
    {
      message: "发布资料需要同意资料可见性条款",
      path: ["profile", "consentProfileVisibility"],
    }
  );

// ── Clear Profile Schema ────────────────────────────────

export const clearProfileSchema = z.object({
  confirmation: z.literal("确认清空我的资料", {
    message: '请输入 "确认清空我的资料"',
  }),
});

// ── Types ───────────────────────────────────────────────

export type ProfileFormData = z.infer<typeof profileFormSchema>;
export type ProfileData = z.infer<typeof profileSchema>;
export type PreferenceData = z.infer<typeof preferenceSchema>;
