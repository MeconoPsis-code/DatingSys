import test from "node:test";
import assert from "node:assert/strict";
import { napcatClient } from "../src/server/bot/clients/napcat.client";

test("member detail and bulk reconciliation queries explicitly bypass NapCat cache", async (context) => {
  const requests: Array<{ action: string; params: Record<string, unknown> }> = [];
  context.mock.method(globalThis, "fetch", async (input: string, init: RequestInit) => {
    const action = new URL(input).pathname.split("/").at(-1)!;
    requests.push({ action, params: JSON.parse(init.body as string) });
    const member = { group_id: 20002, user_id: 30003, nickname: "QQ", card: "26-云南-小明", role: "member" };
    return Response.json({ status: "ok", retcode: 0, data: action === "get_group_member_list" ? [member] : member });
  });
  await napcatClient.getGroupMemberInfo("20002", "30003", { noCache: true, retry: false });
  await napcatClient.getGroupMemberList("20002", { noCache: true, retry: false });
  assert.deepEqual(requests.map((request) => request.params.no_cache), [true, true]);
  await napcatClient.getGroupMemberList("20002", { noCache: false, retry: false });
  assert.equal(requests[2].params.no_cache, false);
});

test("sync calls issue exactly one HTTP request so the coordinator owns retries and rate limits", async (context) => {
  let calls = 0;
  context.mock.method(globalThis, "fetch", async () => {
    calls++;
    throw new TypeError("simulated connection reset");
  });
  const operations = [
    () => napcatClient.getStatus({ retry: false }),
    () => napcatClient.getGroupMemberInfo("20002", "30003", { noCache: true, retry: false }),
    () => napcatClient.getGroupMemberList("20002", { noCache: true, retry: false }),
    () => napcatClient.setGroupCard("20002", "30003", "26-云南-小明", { retry: false }),
  ];
  for (const operation of operations) {
    const previous = calls;
    await assert.rejects(operation, /simulated connection reset/);
    assert.equal(calls, previous + 1);
  }
});

test("uncertain card writes never silently retry on timeout or HTTP 503", async (context) => {
  let calls = 0;
  let timeout = true;
  context.mock.method(globalThis, "fetch", async () => {
    calls++;
    if (timeout) throw new DOMException("simulated timeout", "AbortError");
    return new Response("unavailable", { status: 503 });
  });
  await assert.rejects(napcatClient.setGroupCard("20002", "30003", "26-云南-小明"), /simulated timeout/);
  assert.equal(calls, 1);
  timeout = false;
  await assert.rejects(napcatClient.setGroupCard("20002", "30003", "26-云南-小明"), /HTTP 503/);
  assert.equal(calls, 2);
});
