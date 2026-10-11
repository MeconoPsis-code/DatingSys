/* eslint-disable @typescript-eslint/no-require-imports -- Standalone CommonJS QA runs directly in Node without adding app dependencies. */
/**
 * Reproducible UI QA without touching real accounts or production services.
 * Run: node scripts/qa-group-card-ui.cjs [--health-only | --dates-only]
 * Uses installed Playwright or the Codex bundled runtime; never installs dependencies.
 * The temporary Next app imports the actual pages, mocks every API, and retains PNG evidence.
 */
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const net = require("node:net");
const http = require("node:http");

const repoRoot = path.resolve(__dirname, "..");
const portable = (value) => value.split(path.sep).join("/");

function findPlaywright() {
  const candidates = [
    path.join(repoRoot, "node_modules", "playwright"),
    ...(process.env.CODEX_WORKSPACE_NODE_MODULES
      ? [path.join(process.env.CODEX_WORKSPACE_NODE_MODULES, "playwright")]
      : []),
    path.join(
      os.homedir(),
      ".cache",
      "codex-runtimes",
      "codex-primary-runtime",
      "dependencies",
      "node",
      "node_modules",
      "playwright"
    ),
  ];
  for (const candidate of candidates)
    if (fs.existsSync(path.join(candidate, "package.json"))) return require(candidate);
  throw new Error(
    "Playwright is unavailable. Set CODEX_WORKSPACE_NODE_MODULES to the Node packages directory returned by load_workspace_dependencies."
  );
}

function selectBrowser(playwright) {
  const requested = process.env.CODEX_QA_BROWSER_CHANNEL;
  let channel = requested;
  if (!channel && !fs.existsSync(playwright.chromium.executablePath())) {
    if (process.platform === "win32") {
      if (
        fs.existsSync(
          path.join(
            process.env.ProgramFiles || "C:/Program Files",
            "Google",
            "Chrome",
            "Application",
            "chrome.exe"
          )
        )
      )
        channel = "chrome";
      else if (
        fs.existsSync(
          path.join(
            process.env["ProgramFiles(x86)"] || "C:/Program Files (x86)",
            "Microsoft",
            "Edge",
            "Application",
            "msedge.exe"
          )
        )
      )
        channel = "msedge";
    }
  }
  return {
    launch: (options = {}) =>
      playwright.chromium.launch({ ...options, ...(channel ? { channel } : {}) }),
  };
}

async function freePort() {
  const server = net.createServer();
  await new Promise((resolve, reject) => {
    server.once("error", reject);
    server.listen(0, "127.0.0.1", resolve);
  });
  const port = server.address().port;
  await new Promise((resolve) => server.close(resolve));
  return port;
}

function createHarness() {
  const qaDir = fs.mkdtempSync(path.join(os.tmpdir(), "date-group-card-ui-qa-"));
  const sourceRoot = portable(path.join(repoRoot, "src"));
  const routeSources = {
    me: "(main)/me/page",
    "group-card-sync": "(admin)/group-card-sync/page",
    signup: "(auth)/signup/page",
    "complete-profile": "(auth)/complete-profile/page",
    "profile/edit": "(main)/profile/edit/page",
    profile: "(main)/profile/page",
  };
  fs.mkdirSync(path.join(qaDir, "app"));
  fs.symlinkSync(
    path.join(repoRoot, "node_modules"),
    path.join(qaDir, "node_modules"),
    process.platform === "win32" ? "junction" : "dir"
  );
  fs.symlinkSync(
    path.join(repoRoot, "public"),
    path.join(qaDir, "public"),
    process.platform === "win32" ? "junction" : "dir"
  );
  fs.writeFileSync(
    path.join(qaDir, "package.json"),
    JSON.stringify({ name: "group-card-ui-qa", private: true })
  );
  fs.writeFileSync(
    path.join(qaDir, "tsconfig.json"),
    JSON.stringify({
      compilerOptions: {
        target: "ES2017",
        lib: ["dom", "dom.iterable", "esnext"],
        skipLibCheck: true,
        allowJs: true,
        noEmit: true,
        incremental: true,
        resolveJsonModule: true,
        isolatedModules: true,
        strict: true,
        esModuleInterop: true,
        module: "esnext",
        moduleResolution: "bundler",
        jsx: "react-jsx",
        paths: { "@/*": [`${sourceRoot}/*`] },
        plugins: [{ name: "next" }],
      },
      include: ["**/*.ts", "**/*.tsx", ".next/types/**/*.ts", ".next/dev/types/**/*.ts"],
      exclude: ["node_modules"],
    })
  );
  fs.writeFileSync(
    path.join(qaDir, "next.config.mjs"),
    `export default { experimental: { externalDir: true }, allowedDevOrigins: ["127.0.0.1"], webpack(config) { config.resolve.alias["@"] = ${JSON.stringify(sourceRoot)}; config.cache = false; return config; } };`
  );
  fs.copyFileSync(
    path.join(repoRoot, "postcss.config.mjs"),
    path.join(qaDir, "postcss.config.mjs")
  );
  fs.writeFileSync(
    path.join(qaDir, "app", "qa.css"),
    `@import ${JSON.stringify(`${sourceRoot}/app/globals.css`)}; @source ${JSON.stringify(sourceRoot)};`
  );
  fs.writeFileSync(
    path.join(qaDir, "app", "layout.tsx"),
    `import "./qa.css"; export {default, metadata, viewport} from ${JSON.stringify(`${sourceRoot}/app/layout`)};`
  );
  for (const [route, source] of Object.entries(routeSources)) {
    const routeDir = path.join(qaDir, "app", route);
    fs.mkdirSync(routeDir, { recursive: true });
    fs.writeFileSync(
      path.join(routeDir, "page.tsx"),
      `export {default} from ${JSON.stringify(`${sourceRoot}/app/${source}`)};`
    );
    if (!route.includes("/"))
      fs.writeFileSync(
        path.join(routeDir, "layout.tsx"),
        `export {default} from ${JSON.stringify(`${sourceRoot}/app/${route === "group-card-sync" ? "(admin)" : route === "me" || route.startsWith("profile") ? "(main)" : "(auth)"}/layout`)};`
      );
  }
  return qaDir;
}

async function main() {
  const chromium = selectBrowser(findPlaywright());
  const qaDir = createHarness();
  const port = await freePort();
  const base = `http://127.0.0.1:${port}`;
  // Custom Next server avoids Windows process-tree permissions during cleanup.
  Object.assign(process.env, {
    NODE_ENV: "development",
    NEXT_TELEMETRY_DISABLED: "1",
    GROUP_CARD_SYNC_MODE: "off",
    DATABASE_URL: "postgresql://qa:qa@127.0.0.1:1/qa",
    REDIS_URL: "redis://127.0.0.1:1",
    NAPCAT_BASE_URL: "http://127.0.0.1:1",
  });
  process.chdir(qaDir);
  const next = require(require.resolve("next", { paths: [repoRoot] }));
  const app = next({
    dev: true,
    dir: qaDir,
    hostname: "127.0.0.1",
    port,
    webpack: true,
    quiet: true,
  });
  let server;
  const sockets = new Set();
  try {
    await app.prepare();
    server = http.createServer(app.getRequestHandler());
    server.on("connection", (socket) => {
      sockets.add(socket);
      socket.once("close", () => sockets.delete(socket));
    });
    server.on("upgrade", app.getUpgradeHandler());
    await new Promise((resolve, reject) => {
      server.once("error", reject);
      server.listen(port, "127.0.0.1", resolve);
    });
    const context = { chromium, base, qaDir };
    if (
      !process.argv.includes("--health-only") &&
      !process.argv.includes("--dates-only")
    ) {
      await require("./qa/group-card-main.cjs")(context);
      await require("./qa/group-card-profile.cjs")(context);
    }
    if (!process.argv.includes("--dates-only"))
      await require("./qa/group-card-health.cjs")(context);
    if (!process.argv.includes("--health-only"))
      await require("./qa/group-card-date.cjs")(context);
    console.log(`UI QA passed. Evidence: ${qaDir}`);
  } finally {
    if (server) {
      for (const socket of sockets) socket.destroy();
      server.closeAllConnections();
      await new Promise((resolve) => server.close(resolve));
    }
    await app.close();
  }
}

// Next dev tooling can retain filesystem watchers after app.close(). The server runs
// in this process, so exit also releases those watchers without orphaning a child server.
main().then(
  () => setImmediate(() => process.exit(0)),
  (cause) => {
    console.error(cause);
    setImmediate(() => process.exit(1));
  }
);
