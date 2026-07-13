import type { RedisOptions } from "ioredis";

const DEFAULT_REDIS_URL = "redis://127.0.0.1:6379/0";

/**
 * Convert REDIS_URL into options shared by BullMQ/ioredis consumers.
 *
 * `new Redis(url)` already understands credentials, but BullMQ receives an
 * options object. Keeping the parsing here prevents silently dropping Redis
 * authentication when production uses a password-protected instance.
 */
export function redisConnectionFromUrl(
  value: string = process.env.REDIS_URL || DEFAULT_REDIS_URL
): RedisOptions {
  const url = new URL(value);

  if (url.protocol !== "redis:" && url.protocol !== "rediss:") {
    throw new Error("REDIS_URL must use the redis:// or rediss:// protocol");
  }

  const databasePart = url.pathname.replace(/^\//, "");
  const database = databasePart === "" ? 0 : Number(databasePart);

  if (!Number.isInteger(database) || database < 0) {
    throw new Error("REDIS_URL must contain a non-negative integer database");
  }

  return {
    host: url.hostname,
    port: url.port === "" ? 6379 : Number(url.port),
    username: url.username === "" ? undefined : decodeURIComponent(url.username),
    password: url.password === "" ? undefined : decodeURIComponent(url.password),
    db: database,
    tls: url.protocol === "rediss:" ? {} : undefined,
  };
}
