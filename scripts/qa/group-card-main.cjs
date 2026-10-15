/* eslint-disable @typescript-eslint/no-require-imports -- Loaded by the standalone CommonJS QA runner. */
/** HTTP-mocked actual page interaction checks; run through ../qa-group-card-ui.cjs. */
module.exports = async function run({ chromium, base, qaDir }) {
  const fs = require("node:fs");
  const path = require("node:path");
  const assert = require("node:assert/strict");
  const results = [];
  const group = (id, status) => ({
    workspaceId: id,
    workspaceName: id === "official" ? "官方群" : "合作群",
    groupId: id === "official" ? "100001" : "100002",
    desiredCard: "27-云南(昆明)-网站小明",
    observedCard: "26-云南(昆明)-旧小明",
    confirmedCard: "26-云南(昆明)-旧小明",
    lastVerifiedAt: "2026-10-10T08:00:00.000Z",
    status,
    reason: status === "failed" ? "机器人缺少修改名片权限" : null,
  });
  const summary = {
    status: "partial",
    nicknameRevision: 7,
    cardRevision: 12,
    lastVerifiedAt: "2026-10-10T08:00:00.000Z",
    groups: [group("official", "pending"), group("partner", "failed")],
  };
  let me = {
    id: "qa-user",
    role: "USER",
    status: "ACTIVE",
    qqNumber: "123456789",
    nickname: "网站小明",
    nicknameRevision: 7,
    groupCardSync: summary,
    avatarUrl: null,
    membershipStatus: "VERIFIED",
    membershipExpiresAt: null,
    activePenalties: [],
    profile: {
      birthDate: "1999-01-02T00:00:00.000Z",
      provinceCode: "530000",
      cityCode: "530100",
    },
    ratingProfile: null,
  };
  let authGets = 0,
    nicknamePosts = [],
    retryPosts = [],
    adminPosts = [],
    conflictNext = false;
  let adminData = {
    states: [
      {
        ...group("official", "failed"),
        userId: "qa-user",
        nickname: "网站小明",
        qqNumber: "123456789",
        updatedAt: "2026-10-11T03:00:00.000Z",
      },
    ],
    metrics: {
      pendingCount: 1,
      oldestPendingAt: "2026-10-11T03:00:00.000Z",
      lastReconciledAt: "2026-10-11T02:00:00.000Z",
      alerts: ["机器人在线，但待同步已超过 10 分钟。"],
    },
  };

  const browser = await chromium.launch({ headless: true });
  try {
    const context = await browser.newContext({
      viewport: { width: 1280, height: 1000 },
      locale: "zh-CN",
      timezoneId: "America/Los_Angeles",
    });
    const page = await context.newPage();
    const errors = [];
    page.on("pageerror", (e) => errors.push(String(e)));
    page.on("console", (m) => {
      if (m.type() === "error") errors.push(m.text());
    });
    await page.route("**/api/**", async (route) => {
      const req = route.request(),
        url = new URL(req.url()),
        isPost = req.method() === "POST";
      let data = {};
      if (url.pathname === "/api/auth/me") {
        authGets++;
        data = me;
      } else if (url.pathname === "/api/account/nickname" && isPost) {
        nicknamePosts.push(req.postDataJSON());
        if (conflictNext) {
          conflictNext = false;
          me = {
            ...me,
            nickname: "QQ最终名字",
            nicknameRevision: 9,
            groupCardSync: { ...summary, nicknameRevision: 9 },
          };
          return route.fulfill({
            status: 409,
            contentType: "application/json",
            body: JSON.stringify({
              error: {
                code: "NICKNAME_CONFLICT",
                message: "昵称已变化",
                currentNickname: me.nickname,
                currentRevision: 9,
              },
            }),
          });
        }
        me = {
          ...me,
          nickname: "QQ及时改名",
          nicknameRevision: 8,
          groupCardSync: { ...summary, nicknameRevision: 8, cardRevision: 13 },
        };
        data = {
          nickname: req.postDataJSON().nickname,
          groupSynced: false,
          message: "网站已保存，QQ 正在同步。",
          groupCardSync: me.groupCardSync,
        };
      } else if (url.pathname === "/api/account/group-card-sync") {
        if (isPost) retryPosts.push(req.postDataJSON());
        data = { groupCardSync: me.groupCardSync };
      } else if (url.pathname === "/api/notifications")
        data = { notifications: [], unreadCount: 0 };
      else if (url.pathname === "/api/view-requests")
        return route.fulfill({
          status: 200,
          contentType: "application/json",
          body: JSON.stringify({ data: [], pagination: { total: 0 } }),
        });
      else if (url.pathname === "/api/admin/group-card-sync") {
        if (isPost) adminPosts.push(req.postDataJSON());
        data = adminData;
      } else throw new Error("Unexpected API " + req.method() + " " + url.pathname);
      return route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({ data }),
      });
    });
    await page.goto(base + "/me");
    await page.getByRole("heading", { name: "网站小明", exact: true }).waitFor();
    assert.equal(await page.title(), "TenMatch");
    assert.equal(new URL(page.url()).pathname, "/me");
    await page
      .getByRole("region", { name: "群名片同步" })
      .getByText("部分群已同步", { exact: true })
      .waitFor();
    assert.equal(await page.getByText("QQ 最后确认名片", { exact: true }).count(), 2);
    await page.getByText("机器人缺少修改名片权限", { exact: true }).waitFor();
    await page.screenshot({ path: path.join(qaDir, "group-card-desktop.png") });
    results.push(
      "desktop shows website target, both QQ confirmed values, partial and permission failure"
    );
    await page.getByRole("button", { name: "重新同步", exact: true }).click();
    await page
      .getByText("已请求重新同步，请等待 QQ 读回确认。", { exact: true })
      .waitFor();
    assert.equal(retryPosts.length, 1);
    results.push("same nickname manual retry is allowed");
    await page.getByRole("button", { name: "编辑", exact: true }).click();
    await page.getByLabel("昵称（仅可修改此部分）").fill("网站提交名");
    await page.getByRole("button", { name: "保存", exact: true }).click();
    await page.getByRole("heading", { name: "QQ及时改名", exact: true }).waitFor();
    assert.equal(nicknamePosts[0].baseNicknameRevision, 7);
    results.push(
      "nickname submit carries revision and renders refreshed server value instead of submitted value"
    );
    conflictNext = true;
    await page.getByRole("button", { name: "编辑", exact: true }).click();
    await page.getByLabel("昵称（仅可修改此部分）").fill("冲突输入");
    await page.getByRole("button", { name: "保存", exact: true }).click();
    await page
      .getByText("昵称已在另一端更新，已载入当前昵称。请确认后重新保存。", {
        exact: true,
      })
      .waitFor();
    assert.equal(
      await page.getByLabel("昵称（仅可修改此部分）").inputValue(),
      "QQ最终名字"
    );
    results.push("409 loads current nickname and keeps dialog open for review");
    await page.getByRole("button", { name: "保存", exact: true }).click();
    await page.getByRole("heading", { name: "QQ最终名字", exact: true }).waitFor();
    assert.equal(nicknamePosts.length, 2);
    assert.equal(retryPosts.length, 2);
    results.push("unchanged modal save retries without revision change");
    me = { ...me, nickname: "QQ前台更新", nicknameRevision: 10 };
    await page.evaluate(() => window.dispatchEvent(new Event("focus")));
    await page.getByRole("heading", { name: "QQ前台更新", exact: true }).waitFor();
    results.push("focus refresh accepts QQ-side nickname change");
    await page.setViewportSize({ width: 390, height: 844 });
    await page.screenshot({ path: path.join(qaDir, "group-card-mobile.png") });
    assert(
      await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)
    );
    results.push("390px mobile has no horizontal page overflow");
    await page.clock.install({ time: new Date("2026-10-11T04:00:00.000Z") });
    await page.evaluate(() => window.dispatchEvent(new Event("focus")));
    await new Promise((r) => setTimeout(r, 100));
    let start = authGets;
    for (let i = 0; i < 25; i++) {
      await page.clock.runFor(5000);
      await new Promise((r) => setTimeout(r, 20));
    }
    const afterWindow = authGets;
    assert(afterWindow > start);
    await page.clock.runFor(15000);
    await new Promise((r) => setTimeout(r, 100));
    assert.equal(authGets, afterWindow);
    results.push("pending polling runs every 5s and stops after 2 minutes");
    await page.evaluate(() => {
      Object.defineProperty(document, "visibilityState", {
        configurable: true,
        get: () => "hidden",
      });
      document.dispatchEvent(new Event("visibilitychange"));
    });
    start = authGets;
    await page.clock.runFor(15000);
    await new Promise((r) => setTimeout(r, 100));
    assert.equal(authGets, start);
    results.push("hidden page does not poll");
    me = { ...me, nickname: "QQ回到页面", nicknameRevision: 11 };
    await page.evaluate(() => {
      Object.defineProperty(document, "visibilityState", {
        configurable: true,
        get: () => "visible",
      });
      document.dispatchEvent(new Event("visibilitychange"));
    });
    await page.getByRole("heading", { name: "QQ回到页面", exact: true }).waitFor();
    results.push("visible return immediately refreshes");
    me = {
      ...me,
      groupCardSync: {
        ...summary,
        status: "failed",
        cardRevision: 14,
        groups: summary.groups.map((group) => ({
          ...group,
          status: "failed",
          reason: "QQ 暂时不可用，等待自动重试",
        })),
      },
    };
    await page.evaluate(() => window.dispatchEvent(new Event("focus")));
    const syncPanel = page.getByRole("region", { name: "群名片同步" });
    await syncPanel.getByRole("status").filter({ hasText: "同步失败" }).waitFor();
    start = authGets;
    me = {
      ...me,
      groupCardSync: {
        ...me.groupCardSync,
        status: "synced",
        groups: me.groupCardSync.groups.map((group) => ({
          ...group,
          status: "synced",
          desiredCard: "27-云南(昆明)-QQ回到页面",
          observedCard: "27-云南(昆明)-QQ回到页面",
          confirmedCard: "27-云南(昆明)-QQ回到页面",
          lastVerifiedAt: "2026-10-11T04:00:00.000Z",
          reason: null,
        })),
      },
    };
    await page.clock.runFor(5000);
    await syncPanel.getByRole("status").filter({ hasText: "已同步并确认" }).waitFor();
    assert(authGets > start, "failed deliveries must poll for automatic recovery");
    const afterRecovery = authGets;
    await page.clock.runFor(15000);
    await new Promise((resolve) => setTimeout(resolve, 100));
    assert.equal(authGets, afterRecovery, "confirmed recovery must stop polling");
    results.push(
      "failed automatic retry is refreshed after 5s and polling stops once QQ is confirmed synchronized"
    );
    me = {
      ...me,
      groupCardSync: {
        ...me.groupCardSync,
        status: "paused",
        cardRevision: 15,
        groups: me.groupCardSync.groups.map((group) => ({
          ...group,
          status: "paused",
          reason: "工作空间已暂停",
        })),
      },
    };
    await page.evaluate(() => window.dispatchEvent(new Event("focus")));
    await syncPanel.getByRole("status").filter({ hasText: "同步已暂停" }).waitFor();
    start = authGets;
    await page.clock.runFor(15000);
    await new Promise((resolve) => setTimeout(resolve, 100));
    assert.equal(authGets, start, "paused delivery does not poll automatically");
    results.push("paused groups stay excluded from automatic polling");
    await page.clock.resume();
    await page.setViewportSize({ width: 1280, height: 1000 });
    me = { ...me, nickname: "25-云南-X", nicknameRevision: 12 };
    await page.evaluate(() => window.dispatchEvent(new Event("focus")));
    await page.getByRole("heading", { name: "25-云南-X", exact: true }).waitFor();
    await page.getByRole("button", { name: "编辑", exact: true }).click();
    assert.equal(
      await page.getByLabel("昵称（仅可修改此部分）").inputValue(),
      "25-云南-X"
    );
    await page.locator("form").getByText("27-云南(昆明)-25-云南-X", { exact: true }).waitFor();
    await page.getByRole("button", { name: "保存", exact: true }).click();
    await page.getByRole("heading", { name: "25-云南-X", exact: true }).waitFor();
    assert.equal(nicknamePosts.length, 2);
    results.push(
      "persisted nickname that resembles a card stays intact when opening and saving unchanged"
    );
    await page.getByRole("button", { name: "编辑", exact: true }).click();
    await page.getByLabel("昵称（仅可修改此部分）").fill("26-云南-24-云南-Y");
    await page.getByRole("button", { name: "保存", exact: true }).click();
    await page.getByRole("heading", { name: "QQ及时改名", exact: true }).waitFor();
    assert.equal(nicknamePosts[2].nickname, "26-云南-24-云南-Y");
    results.push(
      "changed raw card-shaped nickname is sent unchanged for exactly one server normalization"
    );
    me = { ...me, role: "ADMIN" };
    await page.goto(base + "/group-card-sync");
    assert.equal(await page.getByRole("link", { name: "工作空间", exact: true }).count(), 0);
    assert.equal(await page.getByRole("link", { name: "兑换码", exact: true }).count(), 0);
    await page.getByRole("button", { name: "请求对账", exact: true }).waitFor();
    await page
      .getByText("机器人在线，但待同步已超过 10 分钟。", { exact: true })
      .waitFor();
    await page.getByRole("button", { name: "请求对账", exact: true }).click();
    await page
      .getByText("已请求本群对账，等待后台读取 QQ 当前名片。", { exact: true })
      .waitFor();
    assert.equal(adminPosts[0].action, "reconcile");
    await page.getByRole("button", { name: "重新同步", exact: true }).click();
    await page.getByText("已请求重新同步，等待 QQ 读回确认。", { exact: true }).waitFor();
    assert.deepEqual(adminPosts[1], { action: "retry", userId: "qa-user" });
    results.push(
      "official-group admin shows alerts, requests reconciliation and retries a scoped user"
    );
    await page.screenshot({
      path: path.join(qaDir, "group-card-admin.png"),
      fullPage: true,
    });
    await page.setViewportSize({ width: 390, height: 844 });
    await page.screenshot({
      path: path.join(qaDir, "group-card-admin-mobile.png"),
      fullPage: true,
    });
    assert(
      await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)
    );
    results.push("admin mobile table scroll stays inside its container");
    assert.equal(
      await page.locator("nextjs-portal").getByText("Unhandled Runtime Error").count(),
      0
    );
    const appErrors = errors.filter((e) => !e.includes("409 (Conflict)"));
    assert.deepEqual(appErrors, []);
    results.push(
      "console has no app errors; one intentional HTTP 409 is handled in the dialog"
    );
    fs.writeFileSync(
      path.join(qaDir, "results.json"),
      JSON.stringify(
        {
          url: base,
          results,
          errors,
          screenshots: [
            "group-card-desktop.png",
            "group-card-mobile.png",
            "group-card-admin.png",
            "group-card-admin-mobile.png",
          ],
        },
        null,
        2
      )
    );
    console.log(JSON.stringify({ results, errors, qaDir }, null, 2));
  } finally {
    await browser.close();
  }
};
