import test from "node:test";
import assert from "node:assert/strict";
import { redisConnectionFromUrl } from "../src/lib/redis-connection";

test("preserves Redis credentials and database for BullMQ", () => {
  const options = redisConnectionFromUrl(
    "redis://queue-user:p%40ssword@127.0.0.1:6380/3"
  );

  assert.deepEqual(options, {
    host: "127.0.0.1",
    port: 6380,
    username: "queue-user",
    password: "p@ssword",
    db: 3,
    tls: undefined,
  });
});

test("enables TLS for rediss URLs", () => {
  const options = redisConnectionFromUrl("rediss://cache.example.com/0");

  assert.deepEqual(options, {
    host: "cache.example.com",
    port: 6379,
    username: undefined,
    password: undefined,
    db: 0,
    tls: {},
  });
});

test("rejects unsupported protocols and invalid database numbers", () => {
  assert.throws(
    () => redisConnectionFromUrl("http://127.0.0.1:6379"),
    /redis:\/\/ or rediss:\/\//
  );
  assert.throws(
    () => redisConnectionFromUrl("redis://127.0.0.1/not-a-number"),
    /non-negative integer database/
  );
});
