/* eslint-disable @typescript-eslint/no-require-imports -- Loaded by the standalone CommonJS QA runner. */
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

module.exports = async function runHealthQa({ chromium, base, qaDir }) {
  const browser = await chromium.launch({ headless: true });
  try {
    const page = await browser.newPage({
      viewport: { width: 1280, height: 1000 },
      locale: "zh-CN",
      timezoneId: "America/Los_Angeles",
    });
    const errors = [];
    page.on("pageerror", (cause) => errors.push(String(cause)));
    page.on("console", (message) => {
      if (message.type() === "error") errors.push(message.text());
    });
    let metrics = {
      pendingCount: 2,
      oldestPendingAt: "2026-10-11T02:00:00.000Z",
      lastReconciledAt: null,
      lastObservedAt: "2026-10-11T03:00:00.000Z",
      mode: "observe",
      online: true,
      blockedCount: 1,
      alerts: [],
    };
    await page.route("**/api/**", async (route) => {
      const url = new URL(route.request().url());
      let data;
      if (url.pathname === "/api/admin/group-card-sync") data = { states: [], metrics };
      else if (url.pathname === "/api/auth/me") data = { role: "ADMIN", nickname: "QA管理员" };
      else throw new Error(`Unexpected API: ${url.pathname}`);
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({ data }),
      });
    });
    await page.goto(`${base}/group-card-sync`);
    await page
      .getByText("观察模式：只记录差异，不自动修改网站或 QQ。", { exact: true })
      .waitFor();
    await page.getByText("机器人在线", { exact: true }).waitFor();
    await page.getByText("最近成功群对账", { exact: true }).waitFor();
    await page.getByText("尚无成功对账", { exact: true }).waitFor();
    await page.getByText("最近名片观察", { exact: true }).waitFor();
    assert.equal(await page.getByRole("list", { name: "同步告警" }).count(), 0);
    await page.screenshot({
      path: path.join(qaDir, "group-card-observe.png"),
      fullPage: true,
    });

    metrics = {
      ...metrics,
      mode: "active",
      online: false,
      lastReconciledAt: "2026-10-11T01:00:00.000Z",
      alerts: [],
    };
    await page.getByRole("button", { name: "刷新状态", exact: true }).click();
    await page.getByText("机器人离线，等待恢复后补偿同步。", { exact: true }).waitFor();
    await page.getByText("自动同步已启用。", { exact: true }).waitFor();
    assert.equal(await page.getByText("尚无成功对账", { exact: true }).count(), 0);
    assert.equal(await page.getByRole("list", { name: "同步告警" }).count(), 0);
    await page.screenshot({
      path: path.join(qaDir, "group-card-offline.png"),
      fullPage: true,
    });
    metrics = { ...metrics, mode: "off", online: null };
    await page.getByRole("button", { name: "刷新状态", exact: true }).click();
    await page
      .getByText("同步已关闭：保留待办，等待重新启用。", { exact: true })
      .waitFor();
    await page.getByText("机器人状态待检查", { exact: true }).waitFor();
    assert.deepEqual(errors, []);
    const results = [
      "observe mode distinguishes a last observation from a successful full scan, with no backlog alert",
      "active but offline explicitly shows recovery wait and no online backlog alert",
      "off mode and unknown bot health are displayed",
    ];
    fs.writeFileSync(
      path.join(qaDir, "health-results.json"),
      JSON.stringify({ results, errors }, null, 2)
    );
    console.log(JSON.stringify({ results, errors }, null, 2));
  } finally {
    await browser.close();
  }
};
