import test from "node:test";
import assert from "node:assert/strict";
import {
  normalizeDraftPhotos,
  publishedPhotosToDraftPhotos,
} from "../src/lib/profile-draft";

test("preserves a draft photo's original upload time", () => {
  const uploadedAt = "2026-07-14T09:59:59.999Z";
  const photos = normalizeDraftPhotos([
    {
      id: "draft-1",
      storageKey: "photos/user/photo.webp",
      order: 0,
      originalName: "photo.webp",
      mimeType: "image/webp",
      sizeBytes: 123,
      uploadedAt,
      source: "draft",
    },
  ]);

  assert.equal(photos?.[0]?.uploadedAt, uploadedAt);
});

test("carries a published photo's database creation time into draft edits", () => {
  const createdAt = new Date("2026-07-14T10:00:00.000Z");
  const photos = publishedPhotosToDraftPhotos([
    {
      id: "photo-1",
      storageKey: "photos/user/photo.webp",
      order: 0,
      originalName: null,
      mimeType: "image/webp",
      sizeBytes: 123,
      createdAt,
    },
  ]);

  assert.equal(photos[0]?.uploadedAt, createdAt.toISOString());
});
