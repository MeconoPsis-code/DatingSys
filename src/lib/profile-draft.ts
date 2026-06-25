import type { Prisma } from "@prisma/client";

export type DraftPhotoSource = "published" | "draft";

export interface DraftPhotoRecord {
  id: string;
  storageKey: string;
  order: number;
  originalName: string | null;
  mimeType: string | null;
  sizeBytes: number | null;
  source: DraftPhotoSource;
}

export interface ProfileDraftData {
  profile?: Prisma.InputJsonValue;
  preference?: Prisma.InputJsonValue;
  deleteAllPhotos?: boolean;
  photos?: DraftPhotoRecord[];
}

interface PublishedPhotoLike {
  id: string;
  storageKey: string;
  order: number;
  originalName: string | null;
  mimeType: string | null;
  sizeBytes: number | null;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function normalizePhoto(value: unknown, fallbackOrder: number): DraftPhotoRecord | null {
  if (!isRecord(value)) return null;

  const id = typeof value.id === "string" ? value.id : "";
  const storageKey = typeof value.storageKey === "string" ? value.storageKey : "";
  if (!id || !storageKey) return null;

  const order = Number.isInteger(value.order) ? Number(value.order) : fallbackOrder;
  const source = value.source === "draft" ? "draft" : "published";

  return {
    id,
    storageKey,
    order,
    originalName: typeof value.originalName === "string" ? value.originalName : null,
    mimeType: typeof value.mimeType === "string" ? value.mimeType : null,
    sizeBytes: Number.isInteger(value.sizeBytes) ? Number(value.sizeBytes) : null,
    source,
  };
}

export function normalizeDraftPhotos(value: unknown): DraftPhotoRecord[] | undefined {
  if (!Array.isArray(value)) return undefined;

  return value
    .map((photo, index) => normalizePhoto(photo, index))
    .filter((photo): photo is DraftPhotoRecord => photo !== null)
    .sort((a, b) => a.order - b.order)
    .map((photo, index) => ({ ...photo, order: index }));
}

export function readProfileDraftData(value: unknown): ProfileDraftData {
  if (!isRecord(value)) return {};

  return {
    profile: isRecord(value.profile) ? (value.profile as Prisma.InputJsonValue) : undefined,
    preference: isRecord(value.preference) ? (value.preference as Prisma.InputJsonValue) : undefined,
    deleteAllPhotos: value.deleteAllPhotos === true,
    photos: normalizeDraftPhotos(value.photos),
  };
}

export function publishedPhotosToDraftPhotos(
  photos: PublishedPhotoLike[],
): DraftPhotoRecord[] {
  return photos
    .sort((a, b) => a.order - b.order)
    .map((photo, index) => ({
      id: photo.id,
      storageKey: photo.storageKey,
      order: index,
      originalName: photo.originalName,
      mimeType: photo.mimeType,
      sizeBytes: photo.sizeBytes,
      source: "published",
    }));
}

export function orderDraftPhotos(photos: DraftPhotoRecord[]): DraftPhotoRecord[] {
  return photos.map((photo, index) => ({ ...photo, order: index }));
}

export function toDraftJson(data: ProfileDraftData): Prisma.InputJsonValue {
  const output: Record<string, Prisma.InputJsonValue> = {};

  if (data.profile !== undefined) output.profile = data.profile;
  if (data.preference !== undefined) output.preference = data.preference;
  if (data.deleteAllPhotos !== undefined) output.deleteAllPhotos = data.deleteAllPhotos;
  if (data.photos !== undefined) {
    output.photos = orderDraftPhotos(data.photos) as unknown as Prisma.InputJsonValue;
  }

  return output as Prisma.InputJsonValue;
}
