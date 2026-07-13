import { createHmac, timingSafeEqual } from "crypto";

const IMAGE_PROXY_PATH = "/api/images/proxy";
const DEFAULT_TTL_SECONDS = 60 * 60;
const MAX_TTL_SECONDS = 60 * 60 * 2;
const SIGNATURE_TIME_BUCKET_SECONDS = 10 * 60;
const MIN_SIZE = 32;
const MAX_SIZE = 1920;
const MIN_QUALITY = 40;
const MAX_QUALITY = 90;

export type ImageProxyVariant = "thumb" | "medium" | "large" | "full";
export type ImageProxyFormat = "webp" | "avif" | "jpeg" | "png";
export type ImageProxyFit = "cover" | "contain" | "inside";

export interface ImageProxyOptions {
  viewerId: string;
  variant?: ImageProxyVariant;
  width?: number;
  height?: number;
  fit?: ImageProxyFit;
  format?: ImageProxyFormat;
  quality?: number;
  ttlSeconds?: number;
}

export interface VerifiedImageProxyRequest {
  storageKey: string;
  viewerId: string;
  expiresAt: number;
  width: number;
  height: number | null;
  fit: ImageProxyFit;
  format: ImageProxyFormat;
  quality: number;
}

const VARIANT_DEFAULTS: Record<
  ImageProxyVariant,
  Pick<VerifiedImageProxyRequest, "width" | "height" | "fit" | "format" | "quality">
> = {
  thumb: { width: 320, height: 320, fit: "cover", format: "webp", quality: 74 },
  medium: { width: 768, height: null, fit: "inside", format: "webp", quality: 78 },
  large: { width: 1280, height: null, fit: "inside", format: "webp", quality: 82 },
  full: { width: 1600, height: null, fit: "inside", format: "webp", quality: 85 },
};

function getImageProxySecret(): string {
  const secret = process.env.IMAGE_PROXY_SECRET || process.env.JWT_SECRET;
  if (!secret) {
    throw new Error("IMAGE_PROXY_SECRET or JWT_SECRET environment variable is not set");
  }
  return secret;
}

function clampInteger(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, Math.round(value)));
}

function parsePositiveInteger(value: string | null): number | null {
  if (!value) return null;
  const parsed = Number.parseInt(value, 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : null;
}

function encodeStorageKey(storageKey: string): string {
  return Buffer.from(storageKey, "utf8").toString("base64url");
}

function decodeStorageKey(value: string): string | null {
  try {
    return Buffer.from(value, "base64url").toString("utf8");
  } catch {
    return null;
  }
}

function isImageProxyFit(value: string | null): value is ImageProxyFit {
  return value === "cover" || value === "contain" || value === "inside";
}

function isImageProxyFormat(value: string | null): value is ImageProxyFormat {
  return value === "webp" || value === "avif" || value === "jpeg" || value === "png";
}

function normalizeOptions(options: ImageProxyOptions) {
  const defaults = VARIANT_DEFAULTS[options.variant ?? "medium"];
  return {
    width: clampInteger(options.width ?? defaults.width, MIN_SIZE, MAX_SIZE),
    height:
      options.height === undefined || options.height === null
        ? defaults.height
        : clampInteger(options.height, MIN_SIZE, MAX_SIZE),
    fit: options.fit ?? defaults.fit,
    format: options.format ?? defaults.format,
    quality: clampInteger(options.quality ?? defaults.quality, MIN_QUALITY, MAX_QUALITY),
  };
}

function buildSignaturePayload(
  params: Omit<VerifiedImageProxyRequest, "storageKey"> & { k: string }
) {
  return [
    params.k,
    params.viewerId,
    String(params.expiresAt),
    String(params.width),
    params.height === null ? "" : String(params.height),
    params.fit,
    params.format,
    String(params.quality),
  ].join("|");
}

function signPayload(payload: string): string {
  return createHmac("sha256", getImageProxySecret()).update(payload).digest("base64url");
}

function verifySignature(payload: string, signature: string): boolean {
  const expected = Buffer.from(signPayload(payload), "base64url");
  const actual = Buffer.from(signature, "base64url");

  if (expected.length !== actual.length) return false;
  return timingSafeEqual(expected, actual);
}

export function buildImageProxyUrl(
  storageKey: string,
  options: ImageProxyOptions
): string {
  const normalized = normalizeOptions(options);
  const ttlSeconds = clampInteger(
    options.ttlSeconds ?? DEFAULT_TTL_SECONDS,
    60,
    MAX_TTL_SECONDS
  );
  const nowSeconds = Math.floor(Date.now() / 1000);
  // Keep URLs stable across polling responses so browser caching can work.
  // The extra validity is bounded to less than one cache bucket (10 minutes).
  const expiresAt =
    Math.ceil((nowSeconds + ttlSeconds) / SIGNATURE_TIME_BUCKET_SECONDS) *
    SIGNATURE_TIME_BUCKET_SECONDS;
  const k = encodeStorageKey(storageKey);
  const payload = buildSignaturePayload({
    k,
    viewerId: options.viewerId,
    expiresAt,
    ...normalized,
  });
  const params = new URLSearchParams({
    k,
    u: options.viewerId,
    exp: String(expiresAt),
    w: String(normalized.width),
    fit: normalized.fit,
    fmt: normalized.format,
    q: String(normalized.quality),
    sig: signPayload(payload),
  });

  if (normalized.height !== null) {
    params.set("h", String(normalized.height));
  }

  return `${IMAGE_PROXY_PATH}?${params.toString()}`;
}

export function verifyImageProxyRequest(
  searchParams: URLSearchParams,
  currentUserId: string,
  nowSeconds = Math.floor(Date.now() / 1000)
): VerifiedImageProxyRequest | null {
  const k = searchParams.get("k");
  const viewerId = searchParams.get("u");
  const signature = searchParams.get("sig");
  const expiresAt = parsePositiveInteger(searchParams.get("exp"));
  const width = parsePositiveInteger(searchParams.get("w"));
  const height = parsePositiveInteger(searchParams.get("h"));
  const fit = searchParams.get("fit");
  const format = searchParams.get("fmt");
  const quality = parsePositiveInteger(searchParams.get("q"));

  if (!k || !viewerId || !signature || !expiresAt || !width || !quality) return null;
  if (viewerId !== currentUserId) return null;
  if (expiresAt < nowSeconds) return null;
  if (expiresAt > nowSeconds + MAX_TTL_SECONDS + SIGNATURE_TIME_BUCKET_SECONDS) {
    return null;
  }
  if (!isImageProxyFit(fit) || !isImageProxyFormat(format)) return null;

  const normalized = {
    viewerId,
    expiresAt,
    width: clampInteger(width, MIN_SIZE, MAX_SIZE),
    height: height === null ? null : clampInteger(height, MIN_SIZE, MAX_SIZE),
    fit,
    format,
    quality: clampInteger(quality, MIN_QUALITY, MAX_QUALITY),
  };
  const payload = buildSignaturePayload({ k, ...normalized });

  if (!verifySignature(payload, signature)) return null;

  const storageKey = decodeStorageKey(k);
  if (!storageKey) return null;

  return { storageKey, ...normalized };
}
