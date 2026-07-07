import { NextResponse } from "next/server";
import sharp from "sharp";
import { requireAuth } from "@/lib/auth";
import { AppError } from "@/lib/errors";
import { getFileBuffer } from "@/lib/storage";
import { verifyImageProxyRequest } from "@/lib/image-proxy";

export const runtime = "nodejs";

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

  try {
    const sourceBuffer = await getFileBuffer(imageRequest.storageKey);
    let pipeline = sharp(sourceBuffer, { failOn: "none" })
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

    return new NextResponse(new Uint8Array(outputBuffer), {
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
  }
}
