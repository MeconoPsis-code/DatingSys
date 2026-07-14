import { AsyncLocalStorage } from "node:async_hooks";
import * as http from "node:http";
import * as https from "node:https";
import { Client } from "minio";
import type { Readable } from "node:stream";

const DEFAULT_STORAGE_TIMEOUT_MS = 20_000;
const UPLOAD_STORAGE_TIMEOUT_MS = 30_000;
const DELETE_STORAGE_TIMEOUT_MS = 10_000;

export interface StorageOperationOptions {
  signal?: AbortSignal;
  timeoutMs?: number;
}

export interface StorageReadOptions extends StorageOperationOptions {
  maxBytes?: number;
}

export class StorageOperationError extends Error {
  readonly code:
    | "STORAGE_TIMEOUT"
    | "STORAGE_ABORTED"
    | "STORAGE_OBJECT_TOO_LARGE"
    | "STORAGE_UNAVAILABLE";

  constructor(
    code:
      | "STORAGE_TIMEOUT"
      | "STORAGE_ABORTED"
      | "STORAGE_OBJECT_TOO_LARGE"
      | "STORAGE_UNAVAILABLE",
    operation: string,
    cause?: unknown
  ) {
    super(
      code === "STORAGE_TIMEOUT"
        ? `Object storage operation timed out: ${operation}`
        : code === "STORAGE_ABORTED"
          ? `Object storage operation was aborted: ${operation}`
          : code === "STORAGE_OBJECT_TOO_LARGE"
            ? `Object storage object exceeded the permitted size: ${operation}`
            : `Object storage is unavailable: ${operation}`
    );
    this.name = "StorageOperationError";
    this.code = code;
    if (cause !== undefined) this.cause = cause;
  }
}

interface StorageRequestContext {
  operation: string;
  deadline: number;
  signal?: AbortSignal;
}

interface StorageState {
  requestContext: AsyncLocalStorage<StorageRequestContext>;
  minioClient?: Client;
}

const globalForStorage = globalThis as typeof globalThis & {
  __tenmatchStorageState?: StorageState;
};

const storageState =
  globalForStorage.__tenmatchStorageState ??
  ({
    requestContext: new AsyncLocalStorage<StorageRequestContext>(),
  } satisfies StorageState);

globalForStorage.__tenmatchStorageState = storageState;

const storageRequestContext = storageState.requestContext;

function bindReadableToStorageContext(stream: Readable): void {
  const context = storageRequestContext.getStore();
  if (!context) return;

  const abortStream = () => {
    stream.destroy(new StorageOperationError("STORAGE_ABORTED", context.operation));
  };
  const cleanup = () => {
    clearTimeout(deadlineTimer);
    context.signal?.removeEventListener("abort", abortStream);
  };

  if (context.signal?.aborted) {
    queueMicrotask(abortStream);
  } else {
    context.signal?.addEventListener("abort", abortStream, { once: true });
  }

  const remainingMs = Math.max(0, context.deadline - Date.now());
  const deadlineTimer = setTimeout(() => {
    stream.destroy(new StorageOperationError("STORAGE_TIMEOUT", context.operation));
  }, remainingMs);
  deadlineTimer.unref();
  stream.once("close", cleanup);
  stream.once("end", cleanup);
  stream.once("error", cleanup);
}

/**
 * MinIO v8 does not expose AbortSignal on individual operations. Supplying a
 * transport lets us bind every underlying request to the operation deadline
 * and caller signal, so a timeout also releases the socket and request body.
 */
function createStorageTransport(useSSL: boolean): Pick<typeof http, "request"> {
  const baseRequest = (useSSL ? https.request : http.request) as typeof http.request;
  const callBaseRequest = baseRequest as unknown as (
    ...args: unknown[]
  ) => http.ClientRequest;

  const request = ((...args: unknown[]) => {
    const req = callBaseRequest(...args);
    const context = storageRequestContext.getStore();

    if (!context) return req;

    const abortRequest = () => {
      req.destroy(new StorageOperationError("STORAGE_ABORTED", context.operation));
    };
    const cleanup = () => {
      clearTimeout(deadlineTimer);
      context.signal?.removeEventListener("abort", abortRequest);
    };

    if (context.signal?.aborted) {
      queueMicrotask(abortRequest);
    } else {
      context.signal?.addEventListener("abort", abortRequest, { once: true });
    }

    const remainingMs = Math.max(0, context.deadline - Date.now());
    const deadlineTimer = setTimeout(() => {
      req.destroy(new StorageOperationError("STORAGE_TIMEOUT", context.operation));
    }, remainingMs);
    deadlineTimer.unref();
    req.once("close", cleanup);

    return req;
  }) as typeof http.request;

  return { request };
}

async function runStorageOperation<T>(
  operation: string,
  task: () => Promise<T>,
  options: StorageOperationOptions = {},
  defaultTimeoutMs = DEFAULT_STORAGE_TIMEOUT_MS
): Promise<T> {
  const timeoutMs = options.timeoutMs ?? defaultTimeoutMs;
  if (!Number.isFinite(timeoutMs) || timeoutMs <= 0) {
    throw new TypeError("Storage timeout must be a positive number");
  }
  if (options.signal?.aborted) {
    throw new StorageOperationError("STORAGE_ABORTED", operation);
  }

  const context: StorageRequestContext = {
    operation,
    deadline: Date.now() + timeoutMs,
    signal: options.signal,
  };

  const operationPromise = storageRequestContext.run(context, task);
  let timer: NodeJS.Timeout | undefined;
  let abortListener: (() => void) | undefined;

  try {
    return await new Promise<T>((resolve, reject) => {
      timer = setTimeout(() => {
        reject(new StorageOperationError("STORAGE_TIMEOUT", operation));
      }, timeoutMs);
      timer.unref();

      if (options.signal) {
        abortListener = () => {
          reject(new StorageOperationError("STORAGE_ABORTED", operation));
        };
        options.signal.addEventListener("abort", abortListener, { once: true });
      }

      operationPromise.then(resolve, reject);
    });
  } catch (err) {
    if (err instanceof StorageOperationError) throw err;
    throw new StorageOperationError("STORAGE_UNAVAILABLE", operation, err);
  } finally {
    if (timer) clearTimeout(timer);
    if (abortListener) {
      options.signal?.removeEventListener("abort", abortListener);
    }
  }
}

function createMinioClient(): Client {
  const accessKey = process.env.MINIO_ACCESS_KEY?.trim();
  const secretKey = process.env.MINIO_SECRET_KEY?.trim();

  if (!accessKey || !secretKey) {
    throw new Error(
      "MINIO_ACCESS_KEY and MINIO_SECRET_KEY must be set; default MinIO credentials are not permitted."
    );
  }

  const useSSL = process.env.MINIO_USE_SSL === "true";

  return new Client({
    endPoint: process.env.MINIO_ENDPOINT || "localhost",
    port: parseInt(process.env.MINIO_PORT || "9000", 10),
    useSSL,
    accessKey,
    secretKey,
    transport: createStorageTransport(useSSL),
  });
}

export const minioClient = storageState.minioClient ?? createMinioClient();

storageState.minioClient = minioClient;

const DEFAULT_BUCKET = process.env.MINIO_BUCKET || "date-photos";

async function ensureBucketInternal(bucket: string): Promise<void> {
  const exists = await minioClient.bucketExists(bucket);
  if (!exists) {
    await minioClient.makeBucket(bucket);
    console.log(`[Storage] Created bucket: ${bucket}`);
  }
}

/** Ensure a bucket exists, creating it if necessary. */
export async function ensureBucket(
  bucket: string = DEFAULT_BUCKET,
  options: StorageOperationOptions = {}
): Promise<void> {
  await runStorageOperation(
    `ensure bucket ${bucket}`,
    () => ensureBucketInternal(bucket),
    options
  );
}

/** Upload a file to object storage. */
export async function uploadFile(
  key: string,
  buffer: Buffer,
  contentType: string,
  bucket: string = DEFAULT_BUCKET,
  options: StorageOperationOptions = {}
): Promise<string> {
  await runStorageOperation(
    `upload ${key}`,
    async () => {
      await ensureBucketInternal(bucket);
      await minioClient.putObject(bucket, key, buffer, buffer.length, {
        "Content-Type": contentType,
      });
    },
    options,
    UPLOAD_STORAGE_TIMEOUT_MS
  );
  return key;
}

/** Generate a pre-signed URL for temporary access. */
export async function getSignedUrl(
  key: string,
  expirySeconds: number = 3600,
  bucket: string = DEFAULT_BUCKET,
  options: StorageOperationOptions = {}
): Promise<string> {
  return runStorageOperation(
    `sign ${key}`,
    () => minioClient.presignedGetObject(bucket, key, expirySeconds),
    options
  );
}

/** Read an object into memory for server-side image processing. */
export async function getFileBuffer(
  key: string,
  bucket: string = DEFAULT_BUCKET,
  options: StorageReadOptions = {}
): Promise<Buffer> {
  return runStorageOperation(
    `read ${key}`,
    async () => {
      const stream = (await minioClient.getObject(bucket, key)) as Readable;
      bindReadableToStorageContext(stream);
      const chunks: Buffer[] = [];
      let totalBytes = 0;

      try {
        for await (const chunk of stream) {
          const buffer = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk);
          totalBytes += buffer.length;

          if (options.maxBytes !== undefined && totalBytes > options.maxBytes) {
            throw new StorageOperationError("STORAGE_OBJECT_TOO_LARGE", `read ${key}`);
          }

          chunks.push(buffer);
        }
      } catch (err) {
        stream.destroy(err instanceof Error ? err : undefined);
        throw err;
      }

      if (chunks.length === 0) return Buffer.alloc(0);
      if (chunks.length === 1) return chunks[0];
      return Buffer.concat(chunks, totalBytes);
    },
    options
  );
}

/** Delete a file from object storage. */
export async function deleteFile(
  key: string,
  bucket: string = DEFAULT_BUCKET,
  options: StorageOperationOptions = {}
): Promise<void> {
  await runStorageOperation(
    `delete ${key}`,
    () => minioClient.removeObject(bucket, key),
    options,
    DELETE_STORAGE_TIMEOUT_MS
  );
}
