import { NextResponse } from "next/server";
import sharp from "sharp";
import { requireAuth } from "@/lib/auth";
import { AppError } from "@/lib/errors";
import { getFileBuffer } from "@/lib/storage";
import { verifyImageProxyRequest } from "@/lib/image-proxy";

export const runtime = "nodejs";

const MAX_CONCURRENT_IMAGE_TRANSFORMS = 1;
const MAX_QUEUED_IMAGE_TRANSFORMS = 64;
const MAX_INPUT_PIXELS = 25_000_000;

// libvips keeps its own native cache and worker pool outside the V8 heap.
// Keep both deliberately small on the 4 GiB production host.
sharp.cache({ memory: 16, files: 0, items: 32 });
sharp.concurrency(1);

type ReleaseImageTransformSlot = () => void;

interface ImageTransformWaiter {
  resolve: (release: ReleaseImageTransformSlot | null) => void;
  signal: AbortSignal;
  onAbort: () => void;
}

let activeImageTransforms = 0;
const imageTransformQueue: ImageTransformWaiter[] = [];

function createImageTransformRelease(): ReleaseImageTransformSlot {
  activeImageTransforms += 1;
  let released = false;

  return () => {
    if (released) return;
    released = true;
    activeImageTransforms -= 1;
    dispatchQueuedImageTransforms();
  };
}

function dispatchQueuedImageTransforms() {
  while (
    activeImageTransforms < MAX_CONCURRENT_IMAGE_TRANSFORMS &&
    imageTransformQueue.length > 0
  ) {
    const waiter = imageTransformQueue.shift();
    if (!waiter) return;

    waiter.signal.removeEventListener("abort", waiter.onAbort);
    if (waiter.signal.aborted) {
      waiter.resolve(null);
      continue;
    }

    waiter.resolve(createImageTransformRelease());
  }
}

function acquireImageTransformSlot(
  signal: AbortSignal
): Promise<ReleaseImageTransformSlot | null> {
  if (signal.aborted) return Promise.resolve(null);

  if (activeImageTransforms < MAX_CONCURRENT_IMAGE_TRANSFORMS) {
    return Promise.resolve(createImageTransformRelease());
  }

  if (imageTransformQueue.length >= MAX_QUEUED_IMAGE_TRANSFORMS) {
    return Promise.resolve(null);
  }

  return new Promise((resolve) => {
    const waiter: ImageTransformWaiter = {
      resolve,
      signal,
      onAbort: () => {
        const index = imageTransformQueue.indexOf(waiter);
        if (index >= 0) imageTransformQueue.splice(index, 1);
        resolve(null);
      },
    };

    signal.addEventListener("abort", waiter.onAbort, { once: true });
    imageTransformQueue.push(waiter);
  });
}

const CONTENT_TYPE_BY_FORMAT = {
  webp: "image/webp",
  avif: "image/avif",
  jpeg: "image/jpeg",
  png: "image/png",
} as const;

function unauthorized(status = 403, message = "无权访问该图片") {
  return NextResponse.json(
    { error: { code: status === 401 ? "UNAUTHORIZED" : "FORBIDDEN", message } },
    { status }
  );
}

export async function GET(req: Request) {
  let session;
  try {
    session = await requireAuth();
  } catch (err) {
    if (err instanceof AppError) {
      return unauthorized(err.status, err.message);
    }
    throw err;
  }
  const url = new URL(req.url);
  const imageRequest = verifyImageProxyRequest(url.searchParams, session.id);

  if (!imageRequest) {
    return unauthorized();
  }

  const releaseImageTransform = await acquireImageTransformSlot(req.signal);
  if (!releaseImageTransform) {
    return NextResponse.json(
      {
        error: {
          code: "IMAGE_PROXY_BUSY",
          message: "Image service is busy. Please retry shortly.",
        },
      },
      {
        status: 503,
        headers: { "Cache-Control": "no-store", "Retry-After": "2" },
      }
    );
  }

  try {
    const sourceBuffer = await getFileBuffer(imageRequest.storageKey);
    let pipeline = sharp(sourceBuffer, {
      failOn: "none",
      limitInputPixels: MAX_INPUT_PIXELS,
      sequentialRead: true,
    })
      .rotate()
      .resize({
        width: imageRequest.width,
        height: imageRequest.height ?? undefined,
        fit: imageRequest.fit,
        withoutEnlargement: true,
      });

    switch (imageRequest.format) {
      case "avif":
        pipeline = pipeline.avif({ quality: imageRequest.quality });
        break;
      case "jpeg":
        pipeline = pipeline.jpeg({ quality: imageRequest.quality, mozjpeg: true });
        break;
      case "png":
        pipeline = pipeline.png({ compressionLevel: 9, quality: imageRequest.quality });
        break;
      case "webp":
      default:
        pipeline = pipeline.webp({ quality: imageRequest.quality });
        break;
    }

    const outputBuffer = await pipeline.toBuffer();
    const secondsUntilExpiry = Math.max(
      0,
      imageRequest.expiresAt - Math.floor(Date.now() / 1000)
    );
    const browserMaxAge = Math.min(secondsUntilExpiry, 10 * 60);

    const responseBody = new Uint8Array(
      outputBuffer.buffer as ArrayBuffer,
      outputBuffer.byteOffset,
      outputBuffer.byteLength
    );

    return new NextResponse(responseBody, {
      headers: {
        "Content-Type": CONTENT_TYPE_BY_FORMAT[imageRequest.format],
        "Cache-Control": `private, max-age=${browserMaxAge}`,
        "Content-Length": String(outputBuffer.length),
        "X-Content-Type-Options": "nosniff",
        Vary: "Cookie",
      },
    });
  } catch (err) {
    console.error("[image-proxy] failed to render image:", err);
    return NextResponse.json(
      { error: { code: "IMAGE_RENDER_FAILED", message: "图片处理失败" } },
      { status: 500 }
    );
  } finally {
    releaseImageTransform();
  }
}
