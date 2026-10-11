import test from "node:test";
import assert from "node:assert/strict";
import { normalizeEvent } from "../src/server/bot/bot-event-normalizer";
import type { OneBotRawEvent } from "../src/server/bot/bot.types";

function notice(overrides: Record<string, unknown> = {}): OneBotRawEvent {
  return {
    post_type: "notice", notice_type: "group_card", self_id: 10001,
    group_id: 20002, user_id: 30003, operator_id: 40004,
    card_old: "25-云南-旧昵称", card_new: "25-云南-新昵称", time: 1791676800,
    ...overrides,
  } as OneBotRawEvent;
}

test("card notices preserve the transition and source metadata for durable processing", () => {
  const raw = notice();
  const normalized = normalizeEvent(raw);
  assert.equal(normalized.type, "group_card_changed");
  if (normalized.type !== "group_card_changed") throw new Error("Expected card notice");
  assert.deepEqual(normalized.event, {
    eventId: normalized.event.eventId, groupId: "20002", qqNumber: "30003",
    cardOld: "25-云南-旧昵称", cardNew: "25-云南-新昵称", timestamp: 1791676800,
    selfId: "10001", operatorId: "40004", rawEvent: raw,
  });
  assert.ok(normalized.event.eventId.startsWith("ob11_card_"));
});

test("repeated delivery deduplicates but different transitions in one second remain distinct", () => {
  function key(raw: OneBotRawEvent) {
    const result = normalizeEvent(raw);
    if (result.type !== "group_card_changed") throw new Error("Expected card notice");
    return result.event.eventId;
  }
  const initial = key(notice());
  assert.equal(initial, key(notice()));
  assert.notEqual(initial, key(notice({ card_old: "25-云南-另一旧昵称" })));
  assert.notEqual(initial, key(notice({ card_new: "25-云南-另一新昵称" })));
  assert.notEqual(initial, key(notice({ self_id: 10002 })));
  assert.notEqual(initial, key(notice({ group_id: 20003 })));
  assert.notEqual(initial, key(notice({ user_id: 30004 })));
});

test("clearing a card remains an explicit notice rather than an ignored empty value", () => {
  const normalized = normalizeEvent(notice({ card_new: "" }));
  assert.equal(normalized.type, "group_card_changed");
  if (normalized.type !== "group_card_changed") throw new Error("Expected clear-card notice");
  assert.equal(normalized.event.cardNew, "");
});

test("malformed card payload cannot be misread as a user clearing their card", () => {
  assert.equal(normalizeEvent(notice({ card_new: 12345 })).type, "ignored");
  assert.equal(normalizeEvent(notice({ card_new: null })).type, "ignored");
});
