import test from "node:test";
import assert from "node:assert/strict";
import { ApiResponseError, ensureApiSuccess, readApiJson } from "../src/lib/api-client";

test("preserves a structured API error message", async () => {
  const response = Response.json(
    { error: { code: "VALIDATION_ERROR", message: "请选择有效的出生日期" } },
    { status: 422 }
  );

  await assert.rejects(
    ensureApiSuccess(response, "保存资料失败"),
    (error: unknown) =>
      error instanceof ApiResponseError &&
      error.status === 422 &&
      error.message === "请选择有效的出生日期"
  );
});

test("turns an empty error response into a stable localized message", async () => {
  const response = new Response(null, { status: 500 });

  await assert.rejects(
    ensureApiSuccess(response, "保存资料失败"),
    (error: unknown) =>
      error instanceof ApiResponseError && error.message === "保存资料失败（HTTP 500）"
  );
});

test("does not expose HTML or invalid JSON error bodies", async () => {
  const response = new Response("<html>Bad Gateway</html>", { status: 502 });

  await assert.rejects(
    ensureApiSuccess(response, "保存资料失败"),
    (error: unknown) =>
      error instanceof ApiResponseError && error.message === "保存资料失败（HTTP 502）"
  );
});

test("reads a successful JSON response", async () => {
  const response = Response.json({ data: { success: true } });
  const payload = await readApiJson(response, "请求失败");

  assert.deepEqual(payload, { data: { success: true } });
});
