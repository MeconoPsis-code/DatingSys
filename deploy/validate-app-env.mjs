#!/usr/bin/env node

const errors = [];
const secretOwners = new Map();
const placeholderPattern = /(?:REPLACE_|change-me|date_dev_password|minioadmin)/i;
const loopbackHosts = new Set(["127.0.0.1", "localhost", "::1", "[::1]"]);
const forbiddenInfrastructureVariables = [
  "POSTGRES_PASSWORD",
  "REDIS_PASSWORD",
  "MINIO_ROOT_USER",
  "MINIO_ROOT_PASSWORD",
  "NAPCAT_WEBUI_TOKEN",
  "INFRA_RESTART_POLICY",
  "NAPCAT_RESTART_POLICY",
];

function readRequired(name) {
  const value = process.env[name]?.trim() ?? "";
  if (value === "") {
    errors.push(`${name} is required`);
  } else if (placeholderPattern.test(value)) {
    errors.push(`${name} still contains a placeholder or unsafe default`);
  }
  return value;
}

function requireSecret(name, minimumLength = 32) {
  const value = readRequired(name);
  if (value !== "" && value.length < minimumLength) {
    errors.push(`${name} must be at least ${minimumLength} characters`);
  }
  rememberSecret(name, value);
  return value;
}

function rememberSecret(name, value) {
  if (value === "" || placeholderPattern.test(value)) return;
  const previousOwner = secretOwners.get(value);
  if (previousOwner) {
    errors.push(`${name} must not reuse the same value as ${previousOwner}`);
  } else {
    secretOwners.set(value, name);
  }
}

function parseUrl(name, protocols) {
  const value = readRequired(name);
  if (value === "") return null;

  try {
    const url = new URL(value);
    if (!protocols.includes(url.protocol)) {
      errors.push(`${name} must use ${protocols.join(" or ")}`);
    }
    return url;
  } catch {
    errors.push(`${name} is not a valid URL`);
    return null;
  }
}

function requireLoopback(name, hostname) {
  if (!loopbackHosts.has(hostname)) {
    errors.push(`${name} must connect through a loopback address`);
  }
}

function decodeUrlComponent(name, value) {
  try {
    return decodeURIComponent(value);
  } catch {
    errors.push(`${name} contains invalid percent-encoding`);
    return "";
  }
}

if (readRequired("NODE_ENV") !== "production") {
  errors.push("NODE_ENV must be production");
}

if (readRequired("NEXT_PUBLIC_APP_URL") !== "https://10match.date") {
  errors.push("NEXT_PUBLIC_APP_URL must be https://10match.date");
}

for (const name of forbiddenInfrastructureVariables) {
  if (process.env[name] !== undefined) {
    errors.push(`${name} is an infrastructure variable and must not reach the app`);
  }
}

const maintenanceMode = readRequired("MAINTENANCE_MODE");
if (maintenanceMode !== "true" && maintenanceMode !== "false") {
  errors.push("MAINTENANCE_MODE must be true or false");
}

const databaseUrl = parseUrl("DATABASE_URL", ["postgres:", "postgresql:"]);
if (databaseUrl) {
  requireLoopback("DATABASE_URL", databaseUrl.hostname);
  if (databaseUrl.username === "") {
    errors.push("DATABASE_URL must contain a database username");
  }
  if (databaseUrl.pathname !== "/date_system") {
    errors.push("DATABASE_URL must select the date_system database");
  }
  const password = decodeUrlComponent("DATABASE_URL password", databaseUrl.password);
  if (password.length < 32 || placeholderPattern.test(password)) {
    errors.push("DATABASE_URL must contain a new password of at least 32 characters");
  }
  rememberSecret("DATABASE_URL password", password);
}

const redisUrl = parseUrl("REDIS_URL", ["redis:", "rediss:"]);
if (redisUrl) {
  requireLoopback("REDIS_URL", redisUrl.hostname);
  if (decodeUrlComponent("REDIS_URL username", redisUrl.username) === "") {
    errors.push("REDIS_URL must contain the dedicated Redis ACL username");
  }
  if (redisUrl.pathname !== "/0" && redisUrl.pathname !== "") {
    errors.push("REDIS_URL must select database 0");
  }
  const password = decodeUrlComponent("REDIS_URL password", redisUrl.password);
  if (password.length < 32 || placeholderPattern.test(password)) {
    errors.push("REDIS_URL must contain a new password of at least 32 characters");
  }
  rememberSecret("REDIS_URL password", password);
}

const minioEndpoint = readRequired("MINIO_ENDPOINT");
requireLoopback("MINIO_ENDPOINT", minioEndpoint);
if (readRequired("MINIO_PORT") !== "9000") {
  errors.push("MINIO_PORT must be 9000 for the loopback-only Compose service");
}
if (readRequired("MINIO_USE_SSL") !== "false") {
  errors.push("MINIO_USE_SSL must be false for the local loopback connection");
}
const minioAccessKey = readRequired("MINIO_ACCESS_KEY");
if (minioAccessKey.toLowerCase() === "root") {
  errors.push("MINIO_ACCESS_KEY must be a bucket-scoped application account");
}
requireSecret("MINIO_SECRET_KEY");
if (readRequired("MINIO_BUCKET") !== "date-photos") {
  errors.push("MINIO_BUCKET must be date-photos to match the scoped policy");
}

requireSecret("JWT_SECRET", 64);
requireSecret("IMAGE_PROXY_SECRET", 64);
requireSecret("BOT_WEBHOOK_TOKEN", 64);
requireSecret("BOT_INTERNAL_SECRET", 64);
requireSecret("NAPCAT_ACCESS_TOKEN", 32);

if (!/^\d+$/.test(readRequired("BOT_TARGET_GROUP_ID"))) {
  errors.push("BOT_TARGET_GROUP_ID must contain digits only");
}
if (readRequired("BOT_PROVIDER") !== "napcat") {
  errors.push("BOT_PROVIDER must be napcat for this deployment");
}

const napcatUrl = parseUrl("NAPCAT_HTTP_BASE_URL", ["http:"]);
if (napcatUrl) {
  requireLoopback("NAPCAT_HTTP_BASE_URL", napcatUrl.hostname);
  if (napcatUrl.port !== "3001") {
    errors.push("NAPCAT_HTTP_BASE_URL must use the loopback port 3001");
  }
}

const emailProvider = readRequired("EMAIL_PROVIDER");
if (emailProvider === "smtp") {
  readRequired("SMTP_HOST");
  const smtpPort = readRequired("SMTP_PORT");
  if (!/^\d+$/.test(smtpPort)) errors.push("SMTP_PORT must contain digits only");
  const smtpSecure = readRequired("SMTP_SECURE");
  if (smtpSecure !== "true" && smtpSecure !== "false") {
    errors.push("SMTP_SECURE must be true or false");
  }
  readRequired("SMTP_USER");
  requireSecret("SMTP_PASS", 12);
  readRequired("SMTP_FROM");
} else if (emailProvider === "resend") {
  requireSecret("RESEND_API_KEY", 16);
  readRequired("RESEND_FROM");
} else if (emailProvider !== "") {
  errors.push("EMAIL_PROVIDER must be smtp or resend");
}

if (errors.length > 0) {
  console.error("Production application environment validation failed:");
  for (const error of errors) console.error(`- ${error}`);
  process.exit(78);
}

console.log("Production application environment validation passed");
