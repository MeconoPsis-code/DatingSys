/* eslint-disable @typescript-eslint/no-require-imports */
const Module = require("node:module");
const path = require("node:path");
const dotenv = require("dotenv");

// Match local Next.js precedence without overriding a DATABASE_URL explicitly
// injected by the deployment environment. The repair command must not silently
// fall back from .env.local to a different database in .env.
dotenv.config({
  path: [path.resolve(process.cwd(), ".env.local"), path.resolve(process.cwd(), ".env")],
  quiet: true,
});

const originalResolveFilename = Module._resolveFilename;

Module._resolveFilename = function resolveWorkspaceAlias(
  request,
  parent,
  isMain,
  options
) {
  const resolvedRequest = request.startsWith("@/")
    ? path.join(process.cwd(), "src", request.slice(2))
    : request;
  return originalResolveFilename.call(this, resolvedRequest, parent, isMain, options);
};
