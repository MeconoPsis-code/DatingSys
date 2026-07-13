import test from "node:test";
import assert from "node:assert/strict";
import { buildImageProxyUrl, verifyImageProxyRequest } from "../src/lib/image-proxy";

const originalDateNow = Date.now;
const originalImageProxySecret = process.env.IMAGE_PROXY_SECRET;

process.env.IMAGE_PROXY_SECRET = "a".repeat(64);

test.after(() => {
  Date.now = originalDateNow;
  if (originalImageProxySecret === undefined) {
    delete process.env.IMAGE_PROXY_SECRET;
  } else {
    process.env.IMAGE_PROXY_SECRET = originalImageProxySecret;
  }
});

test("keeps signed image URLs stable within a ten-minute cache bucket", () => {
  const baseSeconds = 1_800_000_100;
  Date.now = () => baseSeconds * 1000;

  const first = buildImageProxyUrl("photos/example.webp", {
    viewerId: "viewer-1",
    variant: "thumb",
  });

  Date.now = () => (baseSeconds + 300) * 1000;
  const second = buildImageProxyUrl("photos/example.webp", {
    viewerId: "viewer-1",
    variant: "thumb",
  });

  Date.now = () => (baseSeconds + 600) * 1000;
  const nextBucket = buildImageProxyUrl("photos/example.webp", {
    viewerId: "viewer-1",
    variant: "thumb",
  });

  assert.equal(second, first);
  assert.notEqual(nextBucket, first);
});

test("accepts an untampered URL for its viewer and rejects tampering", () => {
  const nowSeconds = 1_800_000_100;
  Date.now = () => nowSeconds * 1000;
  const url = buildImageProxyUrl("photos/example.webp", {
    viewerId: "viewer-1",
    variant: "large",
  });
  const params = new URL(url, "https://example.test").searchParams;

  const verified = verifyImageProxyRequest(params, "viewer-1", nowSeconds);
  assert.equal(verified?.storageKey, "photos/example.webp");
  assert.equal(verified?.width, 1280);

  params.set("w", "1920");
  assert.equal(verifyImageProxyRequest(params, "viewer-1", nowSeconds), null);
  assert.equal(verifyImageProxyRequest(params, "viewer-2", nowSeconds), null);
});
