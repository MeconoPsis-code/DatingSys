/* eslint-disable @typescript-eslint/no-require-imports -- Loaded by the standalone CommonJS QA runner. */
/** HTTP-mocked actual page interaction checks; run through ../qa-group-card-ui.cjs. */
module.exports = async function run({ chromium, base, qaDir }) {
  const fs = require("node:fs");
  const path = require("node:path");
  const assert = require("node:assert/strict");
  const results = [];
  const posts = [];
  let currentNickname = "24-北京-X";
  let currentRevision = 11;

  const browser = await chromium.launch({ headless: true });
  try {
    const page = await browser.newPage({
      viewport: { width: 1280, height: 1000 },
      locale: "zh-CN",
      timezoneId: "America/Los_Angeles",
    });
    const errors = [];
    page.on("pageerror", (e) => errors.push(String(e)));
    page.on("console", (m) => {
      if (m.type() === "error" && !m.text().includes("409 (Conflict)"))
        errors.push(m.text());
    });
    await page.route("**/api/**", async (route) => {
      const req = route.request(),
        url = new URL(req.url());
      let data = {};
      if (url.pathname === "/api/auth/me")
        data = {
          nickname: currentNickname,
          nicknameRevision: currentRevision,
          groupCardSync: { nicknameRevision: currentRevision },
        };
      else if (url.pathname === "/api/auth/verify-code") data = { qqNumber: "123456789" };
      else if (url.pathname === "/api/auth/set-passcode") {
        currentNickname = "25-北京-";
        currentRevision = 20;
        data = {
          nickname: currentNickname,
          groupCardSync: { nicknameRevision: currentRevision },
        };
      } else if (url.pathname === "/api/profile/me" && req.method() === "PUT") {
        posts.push(req.postDataJSON());
        currentNickname = "25-北京-";
        currentRevision++;
        return route.fulfill({
          status: 409,
          contentType: "application/json",
          body: JSON.stringify({
            error: {
              code: "NICKNAME_CONFLICT",
              message: "昵称版本已变化",
              currentNickname,
              currentRevision,
            },
          }),
        });
      } else if (url.pathname === "/api/profile/photos") data = { photos: [] };
      else throw new Error("Unexpected API " + req.method() + " " + url.pathname);
      return route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({ data }),
      });
    });
    async function fillProfile(nickname = "26-云南-25-云南-X") {
      await page.getByPlaceholder("请输入群名片中的昵称部分").fill(nickname);
      await page.locator("select").nth(0).selectOption("1999");
      await page.locator("select").nth(1).selectOption("1");
      await page.locator("select").nth(2).selectOption("2");
      await page.locator("select").nth(3).selectOption("530000");
      await page.locator("select").nth(4).selectOption("530100");
      await page.getByRole("button", { name: "1", exact: true }).nth(0).click();
      await page.getByRole("button", { name: /^\+\s*1$/ }).click();
      await page.getByRole("checkbox", { name: /我同意将我的资料展示/ }).check();
    }
    async function submitProfile(buttonName, expectedNickname) {
      await page.getByRole("button", { name: buttonName, exact: true }).click();
      await page.getByTestId("profile-submit-preview").waitFor();
      if (expectedNickname)
        await page
          .getByTestId("profile-submit-preview")
          .getByText(expectedNickname, { exact: true })
          .waitFor();
      await page.getByRole("button", { name: "发布资料", exact: true }).click();
      await page.getByTestId("strong-confirm-input").fill("确认提交并发布我的资料");
      await page
        .getByRole("dialog")
        .getByRole("button", { name: "确认发布", exact: true })
        .click();
    }
    await page.goto(base + "/complete-profile");
    await page.getByPlaceholder("请输入群名片中的昵称部分").waitFor();
    await page.waitForFunction(
      () =>
        document.querySelector('input[placeholder="请输入群名片中的昵称部分"]').value ===
        "24-北京-X"
    );
    await fillProfile("24-北京-X");
    await page.getByRole("button", { name: "完成资料创建", exact: true }).click();
    await page
      .getByTestId("profile-submit-preview")
      .getByText("24-北京-X", { exact: true })
      .waitFor();
    results.push(
      "complete profile preview preserves a loaded canonical nickname that resembles a full card"
    );
    await page.getByRole("button", { name: "返回修改", exact: true }).click();
    await page.getByPlaceholder("请输入群名片中的昵称部分").fill("26-云南-25-云南-X");
    await submitProfile("完成资料创建", "25-云南-X");
    await page
      .getByText(
        "QQ 昵称已更新，已载入当前昵称。其他资料已保留，请确认昵称后重新提交。",
        { exact: true }
      )
      .waitFor();
    assert.equal(posts[0].baseNicknameRevision, 11);
    assert.equal(posts[0].nickname, "26-云南-25-云南-X");
    assert.equal(posts[0].profile.birthDate, "1999-01-02");
    assert.equal(
      await page.getByPlaceholder("请输入群名片中的昵称部分").inputValue(),
      "25-北京-"
    );
    assert.equal(await page.locator("select").nth(0).inputValue(), "1999");
    results.push(
      "complete profile captures initial nickname revision, sends raw nickname once, and retains profile values on QQ conflict"
    );
    await submitProfile("完成资料创建", "25-北京-");
    await page
      .getByText(
        "QQ 昵称已更新，已载入当前昵称。其他资料已保留，请确认昵称后重新提交。",
        { exact: true }
      )
      .waitFor();
    assert.equal(posts[1].baseNicknameRevision, 12);
    assert.equal(posts[1].nickname, "25-北京-");
    results.push(
      "complete profile conflict refreshes the baseline and preserves a canonical trailing separator in preview"
    );
    results.push("complete profile retry uses conflict revision after user confirmation");
    await page.evaluate(() => window.scrollTo({ top: 0, behavior: "instant" }));
    await page.screenshot({ path: path.join(qaDir, "complete-profile-conflict.png") });
    await page.goto(base + "/signup");
    await page.getByLabel("验证码").fill("123456");
    await page.getByRole("button", { name: "验证", exact: true }).click();
    await page.getByLabel("设置密码").fill("QaPassword123");
    await page.getByLabel("确认密码").fill("QaPassword123");
    await page.getByRole("button", { name: "下一步", exact: true }).click();
    await page.getByPlaceholder("请输入群名片中的昵称部分").waitFor();
    assert.equal(
      await page.getByPlaceholder("请输入群名片中的昵称部分").inputValue(),
      "25-北京-"
    );
    await fillProfile("25-北京-");
    await page.getByRole("button", { name: "完成注册", exact: true }).click();
    await page
      .getByTestId("profile-submit-preview")
      .getByText("25-北京-", { exact: true })
      .waitFor();
    results.push(
      "signup preview and validation preserve a loaded canonical trailing separator"
    );
    await page.getByRole("button", { name: "返回修改", exact: true }).click();
    await page.getByPlaceholder("请输入群名片中的昵称部分").fill("26-云南-25-云南-X");
    await submitProfile("完成注册", "25-云南-X");
    await page
      .getByText(
        "QQ 昵称已更新，已载入当前昵称。其他资料已保留，请确认昵称后重新提交。",
        { exact: true }
      )
      .waitFor();
    assert.equal(posts[2].baseNicknameRevision, 20);
    assert.equal(posts[2].nickname, "26-云南-25-云南-X");
    assert.equal(await page.locator("select").nth(3).inputValue(), "530000");
    results.push(
      "signup uses set-passcode nickname revision and recovers QQ conflict without losing the profile"
    );
    await page.getByRole("button", { name: "完成注册", exact: true }).click();
    await page
      .getByTestId("profile-submit-preview")
      .getByText("25-北京-", { exact: true })
      .waitFor();
    results.push(
      "signup conflict refreshes the canonical nickname baseline used by preview"
    );
    await page.getByRole("button", { name: "返回修改", exact: true }).click();
    await page.setViewportSize({ width: 390, height: 844 });
    await page.evaluate(() => window.scrollTo({ top: 0, behavior: "instant" }));
    await page.screenshot({ path: path.join(qaDir, "signup-conflict-mobile.png") });
    assert(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth));
    assert.deepEqual(errors, []);
    results.push(
      "profile conflict pages render without app errors or mobile horizontal overflow; expected HTTP 409 handled"
    );
    fs.writeFileSync(
      path.join(qaDir, "profile-results.json"),
      JSON.stringify({ results, errors, posts }, null, 2)
    );
    console.log(JSON.stringify({ results, errors }, null, 2));
  } finally {
    await browser.close();
  }
};
