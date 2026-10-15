import test from "node:test";
import assert from "node:assert/strict";
import { buildGroupCardForProfile, calculateAge, formatGroupCard, getGroupCardRegionName, normalizeNicknameInput, parseGroupCard } from "../src/lib/group-card";
import { OVERSEAS_CODE } from "../src/data/regions";
import { aggregateGroupCardSyncStatus, groupCardRetryDelay, groupCardSyncMode } from "../src/lib/group-card-sync";
import { profileSchema } from "../src/lib/validations/profile";
import { accepts, type MatchCandidate } from "../src/lib/matching";
import { validateGroupCard } from "../src/server/bot/group-card.service";

test("group cards normalize one structural prefix and retain nickname separators", () => {
  for (const separator of ["-", "｜", "|", "—", "/", "／"]) {
    assert.equal(normalizeNicknameInput(`26${separator}云南${separator}小明-A/B`), "小明-A/B");
    assert.deepEqual(parseGroupCard(`26${separator}云南${separator}小明-A/B`), { age: 26, province: "云南", nickname: "小明-A/B" });
  }
  assert.equal(normalizeNicknameInput("26-云南-25-北京-X"), "25-北京-X");
  assert.equal(normalizeNicknameInput("999/不存在/小明"), "小明");
  assert.equal(normalizeNicknameInput("26-云南-"), "");
  assert.equal(normalizeNicknameInput(" Alice/Bob "), "Alice/Bob");
});
test("canonical nickname that looks like a card is never stripped during formatting", () => {
  assert.equal(formatGroupCard(26, "云南省", "25-北京-X"), "26-云南-25-北京-X");
  assert.equal(buildGroupCardForProfile("25-北京-X", { birthDate: "2000-01-01", provinceCode: "530000" }, new Date("2026-10-11T00:00:00Z")), "26-云南-25-北京-X");
  assert.equal(buildGroupCardForProfile("25-北京-X", null), "25-北京-X");
  assert.equal(buildGroupCardForProfile("小明", { birthDate: "2000-01-01", provinceCode: "000000" }), "小明");
});
test("profile group cards include provincial cities and retain autonomous region names", () => {
  const now = new Date("2026-10-11T00:00:00Z");
  const profile = { birthDate: "2000-01-01", provinceCode: "530000", cityCode: "530100" };
  assert.equal(buildGroupCardForProfile(" 小明-A/B ", profile, now), "26-云南(昆明)-小明-A/B");
  assert.equal(getGroupCardRegionName("440000", "440100"), "广东(广州)");
  assert.equal(getGroupCardRegionName("450000", "450100"), "广西(南宁)");
  assert.equal(getGroupCardRegionName("220000", "220200"), "吉林(吉林)");
  assert.equal(getGroupCardRegionName("530000", "532900"), "云南(大理白族自治州)");
  assert.equal(getGroupCardRegionName("150000", "152500"), "内蒙古(锡林郭勒盟)");
  assert.equal(getGroupCardRegionName("230000", "232700"), "黑龙江(大兴安岭地区)");
  assert.equal(getGroupCardRegionName("710000", "710100"), "台湾(台北)");
});
test("municipalities omit districts and special administrative regions avoid duplicate names", () => {
  for (const [provinceCode, cityCode, region] of [
    ["110000", "110105", "北京"],
    ["120000", "120101", "天津"],
    ["310000", "310115", "上海"],
    ["500000", "500103", "重庆"],
    ["810000", "810100", "香港"],
    ["820000", "820100", "澳门"],
  ]) {
    assert.equal(getGroupCardRegionName(provinceCode, cityCode), region);
    assert.equal(buildGroupCardForProfile("小明", { birthDate: "2000-01-01", provinceCode, cityCode }, new Date("2026-10-11T00:00:00Z")), `26-${region}-小明`);
  }
});
test("overseas cards display only the selected country without a flag or overseas prefix", () => {
  for (const [cityCode, country] of [
    ["990001", "美国"], ["990002", "加拿大"], ["990006", "日本"],
    ["990008", "澳大利亚"], ["990020", "沙特阿拉伯"], ["990099", "其他国家"],
  ]) {
    assert.equal(getGroupCardRegionName(OVERSEAS_CODE, cityCode), country);
    assert.equal(buildGroupCardForProfile("小明", { birthDate: "2000-01-01", provinceCode: OVERSEAS_CODE, cityCode }, new Date("2026-10-11T00:00:00Z")), `26-${country}-小明`);
  }
});
test("missing, unknown and mismatched city codes fall back to the known province", () => {
  for (const cityCode of [undefined, null, "", "000000", "440100"]) {
    assert.equal(getGroupCardRegionName("530000", cityCode), "云南");
    assert.equal(buildGroupCardForProfile("小明", { birthDate: "2000-01-01", provinceCode: "530000", cityCode }, new Date("2026-10-11T00:00:00Z")), "26-云南-小明");
  }
  assert.equal(getGroupCardRegionName(OVERSEAS_CODE), "海外");
  assert.equal(getGroupCardRegionName(OVERSEAS_CODE, "530100"), "海外");
  assert.equal(buildGroupCardForProfile("小明", { birthDate: "2000-01-01", provinceCode: "000000", cityCode: "530100" }), "小明");
});
test("new region cards round trip while preserving nickname separators and legacy cards", () => {
  for (const region of ["云南(昆明)", "广西(南宁)", "吉林(吉林)", "云南(大理白族自治州)", "美国", "北京"]) {
    for (const separator of ["-", "｜", "|", "—", "/", "／"]) {
      const card = formatGroupCard(26, region, "小明-A/B", separator);
      assert.deepEqual(parseGroupCard(card), { age: 26, province: region, nickname: "小明-A/B" });
      assert.equal(normalizeNicknameInput(card), "小明-A/B");
    }
  }
  assert.equal(normalizeNicknameInput("26-云南(昆明)-25-北京-X"), "25-北京-X");
  assert.deepEqual(parseGroupCard("26-云南省-小明"), { age: 26, province: "云南", nickname: "小明" });
});
test("bot validation accepts generated regions and legacy provinces but rejects unrelated cities", () => {
  for (const region of ["云南(昆明)", "广西(南宁)", "吉林(吉林)", "云南(大理白族自治州)", "美国", "其他国家", "北京", "天津", "上海", "重庆", "香港", "澳门", "云南"]) {
    assert.equal(validateGroupCard(`26-${region}-小明`).result, "valid", region);
  }
  for (const region of ["云南(不存在)", "云南(广州)", "广东(昆明)", "海外(美国)", "北京(朝阳区)"]) {
    assert.equal(validateGroupCard(`26-${region}-小明`).result, "invalid_province", region);
  }
});
test("age uses the same Shanghai calendar on both sides of midnight", () => {
  assert.equal(calculateAge("2000-10-12", new Date("2026-10-11T15:59:59Z")), 25);
  assert.equal(calculateAge("2000-10-12", new Date("2026-10-11T16:00:00Z")), 26);
  assert.equal(calculateAge("invalid", new Date()), 0);
  assert.equal(calculateAge("2000-02-29", new Date("2025-02-28T15:59:59Z")), 24);
  assert.equal(calculateAge("2000-02-29", new Date("2025-02-28T16:00:00Z")), 25);
});
test("summary does not call partial success or paused delivery synchronized", () => {
  assert.equal(aggregateGroupCardSyncStatus([]), "not_applicable");
  assert.equal(aggregateGroupCardSyncStatus([{ status: "synced" }, { status: "failed" }]), "partial");
  assert.equal(aggregateGroupCardSyncStatus([{ status: "paused" }]), "paused");
  assert.equal(aggregateGroupCardSyncStatus([{ status: "synced" }, { status: "not_applicable" }]), "synced");
  assert.equal(groupCardSyncMode("unexpected"), "observe");
  assert.equal(groupCardSyncMode("off"), "off");
  assert.equal(groupCardRetryDelay(100, () => 0.5), 1_800_000);
});

test("profile validation, matching and QQ cards share Shanghai birthday boundaries", (context) => {
  const originalTimezone = process.env.TZ;
  process.env.TZ = "America/Los_Angeles";
  context.after(() => {
    if (originalTimezone === undefined) delete process.env.TZ;
    else process.env.TZ = originalTimezone;
  });
  context.mock.timers.enable({ apis: ["Date"], now: new Date("2026-10-11T15:59:59Z") });
  const profile = {
    birthDate: "2008-10-12", heightCm: 170, weightKg: 60,
    provinceCode: "530000", cityCode: "530100", locationType: "RESIDENCE",
    attribute: "ONE", consentProfileVisibility: true, status: "ACTIVE",
  };
  const candidate: MatchCandidate = {
    userId: "birthday-test", hasPhotos: false, finalScore: null, lastActiveAt: null,
    profile: {
      ...profile, birthDate: new Date(profile.birthDate), isSide: false, isOther: false,
      photoMatchPref: null, highScoreOnly: false,
    },
    preference: {
      ageMin: 18, ageMax: 18, heightMinCm: 160, heightMaxCm: 180,
      weightMinKg: 50, weightMaxKg: 70, expectedAttributes: ["ONE"],
    },
  };
  assert.equal(profileSchema.safeParse(profile).success, false);
  assert.equal(accepts(candidate, candidate), false);
  assert.equal(buildGroupCardForProfile("小明", profile), "17-云南(昆明)-小明");
  context.mock.timers.setTime(new Date("2026-10-11T16:00:00Z").getTime());
  assert.equal(profileSchema.safeParse(profile).success, true);
  assert.equal(accepts(candidate, candidate), true);
  assert.equal(buildGroupCardForProfile("小明", profile), "18-云南(昆明)-小明");
});
