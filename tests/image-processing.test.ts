import test from "node:test";
import assert from "node:assert/strict";
import {
  ImageProcessingLimiter,
  ImageProcessingUnavailableError,
} from "../src/lib/image-processing";

test("serializes image work and rejects requests beyond the finite queue", async () => {
  const limiter = new ImageProcessingLimiter(1, 1);
  const releaseFirst = await limiter.acquire();

  let secondStarted = false;
  const second = limiter.acquire().then((release) => {
    secondStarted = true;
    return release;
  });

  await Promise.resolve();
  assert.equal(secondStarted, false);

  await assert.rejects(limiter.acquire(), (err: unknown) => {
    return err instanceof ImageProcessingUnavailableError && err.reason === "busy";
  });

  releaseFirst();
  releaseFirst(); // release callbacks must remain safe in route + helper finally blocks
  const releaseSecond = await second;
  assert.equal(secondStarted, true);

  let thirdStarted = false;
  const third = limiter.acquire().then((release) => {
    thirdStarted = true;
    return release;
  });
  await Promise.resolve();
  assert.equal(thirdStarted, false);

  releaseSecond();
  const releaseThird = await third;
  releaseThird();
});

test("removes an aborted waiter and gives its queue place to the next request", async () => {
  const limiter = new ImageProcessingLimiter(1, 1);
  const releaseFirst = await limiter.acquire();
  const controller = new AbortController();
  const abortedWaiter = limiter.acquire(controller.signal);

  controller.abort();
  await assert.rejects(abortedWaiter, (err: unknown) => {
    return err instanceof ImageProcessingUnavailableError && err.reason === "aborted";
  });

  const nextWaiter = limiter.acquire();
  releaseFirst();
  const releaseNext = await nextWaiter;
  releaseNext();
});

test("expires queued work with a retryable busy error", async () => {
  const limiter = new ImageProcessingLimiter(1, 1, 10);
  const releaseFirst = await limiter.acquire();

  await assert.rejects(limiter.acquire(), (err: unknown) => {
    return err instanceof ImageProcessingUnavailableError && err.reason === "busy";
  });

  releaseFirst();
});

test("run always releases its slot when image processing throws", async () => {
  const limiter = new ImageProcessingLimiter(1, 0);

  await assert.rejects(
    limiter.run(undefined, async () => {
      throw new Error("transform failed");
    }),
    /transform failed/
  );

  const release = await limiter.acquire();
  release();
});
