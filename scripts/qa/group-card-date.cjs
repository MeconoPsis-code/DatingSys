/* eslint-disable @typescript-eslint/no-require-imports -- Loaded by the standalone CommonJS QA runner. */
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

module.exports = async function runDateQa({ chromium, base, qaDir }) {
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
    const profile = {
      id: "qa-profile",
      status: "ACTIVE",
      birthDate: "2008-10-12T00:00:00.000Z",
      heightCm: 170,
      weightKg: 60,
      provinceCode: "530000",
      cityCode: "530100",
      locationType: "RESIDENCE",
      attribute: "ONE",
      isSide: false,
      isOther: false,
      customAttribute: null,
      mbti: null,
      selfIntro: null,
      consentProfileVisibility: true,
      draftData: null,
      photoMatchPref: null,
      highScoreOnly: false,
    };
    const preference = {
      ageMin: 18,
      ageMax: 35,
      heightMinCm: 150,
      heightMaxCm: 200,
      weightMinKg: 40,
      weightMaxKg: 100,
      expectedAttributes: ["ONE"],
      expectedCustomAttribute: null,
    };
    await page.route("**/api/**", async (route) => {
      const url = new URL(route.request().url());
      assert.equal(
        route.request().method(),
        "GET",
        "date QA must never mutate an account"
      );
      let data;
      if (url.pathname === "/api/profile/me")
        data = {
          profile,
          preference,
          cooldowns: {
            canPublish: true,
            publishCooldownRemaining: 0,
            canEdit: true,
            editCooldownRemaining: 0,
          },
        };
      else if (url.pathname === "/api/profile/photos") data = { photos: [] };
      else if (url.pathname === "/api/auth/me")
        data = { role: "USER", nickname: "小明", qqNumber: "123456789", avatarUrl: null };
      else if (url.pathname === "/api/notifications")
        data = { notifications: [], unreadCount: 0 };
      else if (url.pathname === "/api/view-requests")
        return route.fulfill({
          status: 200,
          contentType: "application/json",
          body: JSON.stringify({ data: [], pagination: { total: 0 } }),
        });
      else throw new Error(`Unexpected API: ${url.pathname}`);
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({ data }),
      });
    });
    await page.clock.setFixedTime(new Date("2026-10-11T15:59:59.000Z"));
    await page.goto(`${base}/profile/edit`);
    await page.locator("select").nth(0).waitFor();
    assert.equal(await page.locator("select").nth(0).inputValue(), "2008");
    assert.equal(await page.locator("select").nth(1).inputValue(), "10");
    assert.equal(await page.locator("select").nth(2).inputValue(), "12");
    await page.getByRole("button", { name: "发布资料", exact: true }).click();
    await page.getByText("年龄提示", { exact: true }).waitFor();
    assert.equal(await page.getByTestId("profile-submit-preview").count(), 0);
    await page.screenshot({
      path: path.join(qaDir, "profile-before-shanghai-birthday.png"),
    });
    await page.clock.setFixedTime(new Date("2026-10-11T16:00:00.000Z"));
    await page.reload();
    await page.locator("select").nth(2).waitFor();
    assert.equal(await page.locator("select").nth(2).inputValue(), "12");
    await page.getByRole("button", { name: "发布资料", exact: true }).click();
    await page.getByTestId("profile-submit-preview").waitFor();
    assert.equal(await page.getByText("年龄提示", { exact: true }).count(), 0);
    await page.screenshot({ path: path.join(qaDir, "profile-on-shanghai-birthday.png") });
    await page.goto(`${base}/profile`);
    await page.getByText("2008年10月12日", { exact: true }).waitFor();
    await page.screenshot({ path: path.join(qaDir, "profile-utc-birth-date.png") });
    assert.deepEqual(errors, []);
    const results = [
      "Los Angeles browser loads the UTC birth date without shifting it to the previous day",
      "one second before Shanghai's 18th birthday, publishing is blocked",
      "at Shanghai midnight, the same form can open the publish preview",
      "profile birth-date display retains the UTC calendar date in a western timezone",
    ];
    fs.writeFileSync(
      path.join(qaDir, "date-results.json"),
      JSON.stringify({ results, errors }, null, 2)
    );
    console.log(JSON.stringify({ results, errors }, null, 2));
  } finally {
    await browser.close();
  }
};
