"use client";

import { ATTRIBUTE_OPTIONS } from "@/data/attributes";
import { LOCATION_TYPE_OPTIONS } from "@/data/location-types";
import { getCityName, getProvinceName } from "@/data/regions";

interface PreviewPhoto {
  id: string;
  order: number;
  originalName: string | null;
  url: string;
}

export interface ProfileSubmitPreviewData {
  nickname?: string;
  birthYear: string;
  birthMonth: string;
  birthDay: string;
  heightCm: string;
  weightKg: string;
  provinceCode: string;
  cityCode: string;
  locationType: string;
  attribute: string;
  isSide: boolean;
  isOther: boolean;
  mbti: string;
  selfIntro: string;
  ageMin: string;
  ageMax: string;
  heightMinCm: string;
  heightMaxCm: string;
  weightMinKg: string;
  weightMaxKg: string;
  expectedAttributes: string[];
  expectedCustomAttribute: string;
  consent: boolean;
  photos: PreviewPhoto[];
}

interface ProfileSubmitPreviewProps {
  data: ProfileSubmitPreviewData;
  submitting: boolean;
  onEdit: () => void;
  onPublish: () => void;
  publishLabel?: string;
  hasMobileNavigation?: boolean;
}

const ATTRIBUTE_LABELS = new Map(
  ATTRIBUTE_OPTIONS.map((option) => [option.value as string, option.label]),
);
const LOCATION_TYPE_LABELS = new Map(
  LOCATION_TYPE_OPTIONS.map((option) => [option.value as string, option.label]),
);

function getAttributeSummary(data: ProfileSubmitPreviewData): string {
  const labels: string[] = [];
  if (data.attribute) labels.push(ATTRIBUTE_LABELS.get(data.attribute) ?? data.attribute);
  if (data.isSide && data.attribute !== "SIDE") labels.push("side");
  if (data.isOther && data.attribute !== "OTHER") labels.push("其他");
  return labels.join("、") || "未填写";
}

function getExpectedAttributeSummary(data: ProfileSubmitPreviewData): string {
  return data.expectedAttributes
    .map((attribute) => {
      const label = ATTRIBUTE_LABELS.get(attribute) ?? attribute;
      if (attribute === "OTHER" && data.expectedCustomAttribute.trim()) {
        return `${label}（${data.expectedCustomAttribute.trim()}）`;
      }
      return label;
    })
    .join("、");
}

function PreviewField({ label, value }: { label: string; value: string }) {
  return (
    <div className="min-w-0 rounded-xl bg-[hsl(var(--secondary)/0.55)] px-4 py-3">
      <dt className="text-xs font-medium text-[hsl(var(--muted-foreground))]">{label}</dt>
      <dd className="mt-1 break-words text-sm font-semibold text-[hsl(var(--foreground))]">
        {value || "未填写"}
      </dd>
    </div>
  );
}

function PreviewSection({
  title,
  children,
}: {
  title: string;
  children: React.ReactNode;
}) {
  return (
    <section className="rounded-2xl border border-[hsl(var(--border))] bg-[hsl(var(--card))] p-4 shadow-sm sm:p-6">
      <h2 className="mb-4 text-base font-bold text-[hsl(var(--foreground))]">{title}</h2>
      {children}
    </section>
  );
}

export function ProfileSubmitPreview({
  data,
  submitting,
  onEdit,
  onPublish,
  publishLabel = "确认发布",
  hasMobileNavigation = false,
}: ProfileSubmitPreviewProps) {
  const provinceName = getProvinceName(data.provinceCode);
  const cityName = getCityName(data.provinceCode, data.cityCode);
  const expectedAttributeSummary = getExpectedAttributeSummary(data);

  return (
    <div data-testid="profile-submit-preview" className="mx-auto flex w-full max-w-4xl flex-col gap-4 pb-8 sm:gap-6">
      <header className="rounded-2xl border border-brand-blue/25 bg-gradient-to-br from-brand-blue/10 to-[hsl(var(--card))] p-5 sm:p-7">
        <div className="flex items-start gap-3">
          <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-brand-blue text-xl text-white shadow-md shadow-brand-blue/20">
            ✓
          </div>
          <div className="min-w-0">
            <h1 className="text-xl font-bold text-[hsl(var(--foreground))] sm:text-2xl">发布前确认</h1>
            <p className="mt-1.5 text-sm leading-6 text-[hsl(var(--muted-foreground))]">
              以下是即将提交发布的资料，仅供检查，无法在此页面编辑。请确认无误后再发布。
            </p>
          </div>
        </div>
      </header>

      <PreviewSection title="基本资料">
        <dl className="grid grid-cols-2 gap-3 lg:grid-cols-4">
          {data.nickname ? <PreviewField label="昵称" value={data.nickname} /> : null}
          <PreviewField
            label="出生日期"
            value={`${data.birthYear}年${data.birthMonth}月${data.birthDay}日`}
          />
          <PreviewField label="身高" value={`${data.heightCm} cm`} />
          <PreviewField label="体重" value={`${data.weightKg} kg`} />
          <PreviewField label="属性" value={getAttributeSummary(data)} />
          <PreviewField label="MBTI" value={data.mbti || "未知"} />
        </dl>
      </PreviewSection>

      <PreviewSection title="所在地区">
        <dl className="grid grid-cols-1 gap-3 sm:grid-cols-3">
          <PreviewField label="省份 / 地区" value={provinceName} />
          <PreviewField label="城市 / 国家" value={cityName} />
          <PreviewField
            label="地区类型"
            value={LOCATION_TYPE_LABELS.get(data.locationType) ?? data.locationType}
          />
        </dl>
      </PreviewSection>

      <PreviewSection title="匹配偏好">
        <dl className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <PreviewField label="期望年龄" value={`${data.ageMin}–${data.ageMax} 岁`} />
          <PreviewField label="期望身高" value={`${data.heightMinCm}–${data.heightMaxCm} cm`} />
          <PreviewField label="期望体重" value={`${data.weightMinKg}–${data.weightMaxKg} kg`} />
          <PreviewField label="期望属性" value={expectedAttributeSummary || "未填写"} />
        </dl>
      </PreviewSection>

      <PreviewSection title={`照片（${data.photos.length} 张）`}>
        {data.photos.length > 0 ? (
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
            {data.photos.map((photo) => (
              <figure
                key={photo.id}
                className="relative aspect-[4/3] overflow-hidden rounded-xl border border-[hsl(var(--border))] bg-[hsl(var(--secondary))]"
              >
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={photo.url}
                  alt={photo.originalName || `资料照片 ${photo.order + 1}`}
                  className="h-full w-full object-cover"
                />
                <figcaption className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/75 to-transparent px-3 pb-2 pt-7 text-xs text-white">
                  照片 {photo.order + 1}
                </figcaption>
              </figure>
            ))}
          </div>
        ) : (
          <p className="rounded-xl bg-[hsl(var(--secondary)/0.55)] px-4 py-5 text-center text-sm text-[hsl(var(--muted-foreground))]">
            本次不提交照片
          </p>
        )}
      </PreviewSection>

      <PreviewSection title="自我介绍">
        <p className="min-h-20 whitespace-pre-wrap break-words rounded-xl bg-[hsl(var(--secondary)/0.55)] px-4 py-3 text-sm leading-6 text-[hsl(var(--foreground))]">
          {data.selfIntro || "未填写"}
        </p>
      </PreviewSection>

      <div className="flex items-start gap-3 rounded-2xl border border-emerald-500/25 bg-emerald-500/10 px-4 py-3 text-sm text-[hsl(var(--foreground))] sm:px-5">
        <span className="mt-0.5 text-emerald-500">✓</span>
        <p>
          {data.consent
            ? "已同意将资料展示给其他群成员用于匹配。"
            : "尚未同意资料可见性条款，无法发布。"}
        </p>
      </div>

      <div
        className={`sticky z-30 rounded-2xl border border-[hsl(var(--border))] bg-[hsl(var(--card))]/95 p-3 shadow-[0_18px_42px_rgba(15,23,42,0.16)] backdrop-blur md:bottom-4 ${
          hasMobileNavigation
            ? "bottom-[calc(4.75rem+env(safe-area-inset-bottom))]"
            : "bottom-4"
        }`}
      >
        <div className="flex flex-col-reverse gap-3 sm:flex-row">
          <button
            data-testid="preview-edit-button"
            type="button"
            onClick={onEdit}
            disabled={submitting}
            className="min-h-12 flex-1 rounded-xl border border-[hsl(var(--border))] bg-[hsl(var(--card))] px-5 py-3 text-sm font-semibold text-[hsl(var(--foreground))] transition-colors hover:bg-[hsl(var(--secondary))] disabled:opacity-50"
          >
            返回修改
          </button>
          <button
            data-testid="preview-publish-button"
            type="button"
            onClick={onPublish}
            disabled={submitting || !data.consent}
            className="min-h-12 flex-1 rounded-xl bg-brand-blue px-5 py-3 text-sm font-semibold text-white shadow-md shadow-brand-blue/20 transition-all hover:bg-brand-blue/90 active:scale-[0.99] disabled:opacity-50"
          >
            {submitting ? "发布中..." : publishLabel}
          </button>
        </div>
      </div>
    </div>
  );
}
