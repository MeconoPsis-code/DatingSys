import { Client } from "minio";
import type { Readable } from "stream";

const globalForMinio = globalThis as unknown as {
  minioClient: Client | undefined;
};

function createMinioClient(): Client {
  return new Client({
    endPoint: process.env.MINIO_ENDPOINT || "localhost",
    port: parseInt(process.env.MINIO_PORT || "9000", 10),
    useSSL: process.env.MINIO_USE_SSL === "true",
    accessKey: process.env.MINIO_ACCESS_KEY || "minioadmin",
    secretKey: process.env.MINIO_SECRET_KEY || "minioadmin123",
  });
}

export const minioClient = globalForMinio.minioClient ?? createMinioClient();

if (process.env.NODE_ENV !== "production") {
  globalForMinio.minioClient = minioClient;
}

const DEFAULT_BUCKET = process.env.MINIO_BUCKET || "date-photos";

/**
 * Ensure a bucket exists, creating it if necessary
 */
export async function ensureBucket(bucket: string = DEFAULT_BUCKET): Promise<void> {
  const exists = await minioClient.bucketExists(bucket);
  if (!exists) {
    await minioClient.makeBucket(bucket);
    console.log(`[Storage] Created bucket: ${bucket}`);
  }
}

/**
 * Upload a file to object storage
 */
export async function uploadFile(
  key: string,
  buffer: Buffer,
  contentType: string,
  bucket: string = DEFAULT_BUCKET
): Promise<string> {
  await ensureBucket(bucket);
  await minioClient.putObject(bucket, key, buffer, buffer.length, {
    "Content-Type": contentType,
  });
  return key;
}

/**
 * Generate a pre-signed URL for temporary access
 */
export async function getSignedUrl(
  key: string,
  expirySeconds: number = 3600,
  bucket: string = DEFAULT_BUCKET
): Promise<string> {
  return await minioClient.presignedGetObject(bucket, key, expirySeconds);
}

/**
 * Read an object into memory for server-side image processing.
 */
export async function getFileBuffer(
  key: string,
  bucket: string = DEFAULT_BUCKET
): Promise<Buffer> {
  const stream = (await minioClient.getObject(bucket, key)) as Readable;
  const chunks: Buffer[] = [];

  for await (const chunk of stream) {
    chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
  }

  return Buffer.concat(chunks);
}

/**
 * Delete a file from object storage
 */
export async function deleteFile(
  key: string,
  bucket: string = DEFAULT_BUCKET
): Promise<void> {
  await minioClient.removeObject(bucket, key);
}
