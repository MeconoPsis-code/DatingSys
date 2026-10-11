import test from "node:test";
import assert from "node:assert/strict";
import { buildGroupCardForProfile, calculateAge, formatGroupCard, normalizeNicknameInput, parseGroupCard } from "../src/lib/group-card";
import { aggregateGroupCardSyncStatus, groupCardRetryDelay, groupCardSyncMode } from "../src/lib/group-card-sync";
import { profileSchema } from "../src/lib/validations/profile";
import { accepts, type MatchCandidate } from "../src/lib/matching";

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
  assert.equal(buildGroupCardForProfile("小明", profile), "17-云南-小明");
  context.mock.timers.setTime(new Date("2026-10-11T16:00:00Z").getTime());
  assert.equal(profileSchema.safeParse(profile).success, true);
  assert.equal(accepts(candidate, candidate), true);
  assert.equal(buildGroupCardForProfile("小明", profile), "18-云南-小明");
});
