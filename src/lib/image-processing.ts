import sharp from "sharp";

export const MAX_IMAGE_INPUT_PIXELS = 25_000_000;
export const MAX_IMAGE_OUTPUT_EDGE = 1920;
export const MAX_IMAGE_SOURCE_BYTES = 10 * 1024 * 1024;
export const IMAGE_PROCESSING_TIMEOUT_SECONDS = 15;
export const IMAGE_PROCESSING_QUEUE_TIMEOUT_MS = 5_000;

const MAX_CONCURRENT_IMAGE_TRANSFORMS = 1;
const MAX_QUEUED_IMAGE_TRANSFORMS = 32;

export type ImageProcessingRelease = () => void;

export class ImageProcessingUnavailableError extends Error {
  readonly code: "IMAGE_PROCESSING_BUSY" | "IMAGE_PROCESSING_ABORTED";
  readonly reason: "busy" | "aborted";

  constructor(reason: "busy" | "aborted") {
    super(
      reason === "busy"
        ? "Image processing capacity is exhausted"
        : "Image processing request was aborted"
    );
    this.name = "ImageProcessingUnavailableError";
    this.reason = reason;
    this.code = reason === "busy" ? "IMAGE_PROCESSING_BUSY" : "IMAGE_PROCESSING_ABORTED";
  }
}

interface ImageProcessingWaiter {
  resolve: (release: ImageProcessingRelease) => void;
  reject: (error: ImageProcessingUnavailableError) => void;
  signal?: AbortSignal;
  onAbort?: () => void;
  queueTimer?: NodeJS.Timeout;
}

/**
 * A small FIFO limiter for native image work. Sharp/libvips allocates outside
 * V8's heap, so ordinary JavaScript heap limits do not protect the process.
 */
export class ImageProcessingLimiter {
  private active = 0;
  private readonly queue: ImageProcessingWaiter[] = [];

  constructor(
    private readonly maxConcurrent: number,
    private readonly maxQueued: number,
    private readonly maxQueueWaitMs = IMAGE_PROCESSING_QUEUE_TIMEOUT_MS
  ) {
    if (!Number.isInteger(maxConcurrent) || maxConcurrent < 1) {
      throw new TypeError("maxConcurrent must be a positive integer");
    }
    if (!Number.isInteger(maxQueued) || maxQueued < 0) {
      throw new TypeError("maxQueued must be a non-negative integer");
    }
    if (!Number.isFinite(maxQueueWaitMs) || maxQueueWaitMs <= 0) {
      throw new TypeError("maxQueueWaitMs must be a positive number");
    }
  }

  async acquire(signal?: AbortSignal): Promise<ImageProcessingRelease> {
    if (signal?.aborted) {
      throw new ImageProcessingUnavailableError("aborted");
    }

    if (this.active < this.maxConcurrent) {
      this.active += 1;
      return this.createRelease();
    }

    if (this.queue.length >= this.maxQueued) {
      throw new ImageProcessingUnavailableError("busy");
    }

    return new Promise<ImageProcessingRelease>((resolve, reject) => {
      const waiter: ImageProcessingWaiter = { resolve, reject, signal };

      if (signal) {
        waiter.onAbort = () => {
          const index = this.queue.indexOf(waiter);
          if (index < 0) return;
          this.queue.splice(index, 1);
          this.cleanupWaiter(waiter);
          reject(new ImageProcessingUnavailableError("aborted"));
        };
        signal.addEventListener("abort", waiter.onAbort, { once: true });
      }

      waiter.queueTimer = setTimeout(() => {
        const index = this.queue.indexOf(waiter);
        if (index < 0) return;
        this.queue.splice(index, 1);
        this.cleanupWaiter(waiter);
        reject(new ImageProcessingUnavailableError("busy"));
      }, this.maxQueueWaitMs);
      waiter.queueTimer.unref();
      this.queue.push(waiter);
    });
  }

  async run<T>(signal: AbortSignal | undefined, task: () => Promise<T>): Promise<T> {
    const release = await this.acquire(signal);
    try {
      return await task();
    } finally {
      release();
    }
  }

  private createRelease(): ImageProcessingRelease {
    let released = false;

    return () => {
      if (released) return;
      released = true;
      this.active -= 1;
      this.dispatch();
    };
  }

  private dispatch(): void {
    while (this.active < this.maxConcurrent && this.queue.length > 0) {
      const waiter = this.queue.shift();
      if (!waiter) return;

      this.cleanupWaiter(waiter);

      if (waiter.signal?.aborted) {
        waiter.reject(new ImageProcessingUnavailableError("aborted"));
        continue;
      }

      this.active += 1;
      waiter.resolve(this.createRelease());
    }
  }

  private cleanupWaiter(waiter: ImageProcessingWaiter): void {
    if (waiter.queueTimer) clearTimeout(waiter.queueTimer);
    if (waiter.signal && waiter.onAbort) {
      waiter.signal.removeEventListener("abort", waiter.onAbort);
    }
  }
}

interface ImageProcessingState {
  limiter: ImageProcessingLimiter;
}

const globalForImageProcessing = globalThis as typeof globalThis & {
  __tenmatchImageProcessingState?: ImageProcessingState;
};

function createImageProcessingState(): ImageProcessingState {
  // Keep libvips' native cache and worker pool deliberately small. These
  // allocations are invisible to V8 heap metrics and previously exhausted the
  // service's memory cgroup while the host still had free RAM.
  sharp.cache({ memory: 16, files: 0, items: 32 });
  sharp.concurrency(1);

  return {
    limiter: new ImageProcessingLimiter(
      MAX_CONCURRENT_IMAGE_TRANSFORMS,
      MAX_QUEUED_IMAGE_TRANSFORMS
    ),
  };
}

const imageProcessingState =
  globalForImageProcessing.__tenmatchImageProcessingState ?? createImageProcessingState();

globalForImageProcessing.__tenmatchImageProcessingState = imageProcessingState;

export const imageProcessingLimiter = imageProcessingState.limiter;

export function acquireImageProcessingSlot(
  signal?: AbortSignal
): Promise<ImageProcessingRelease> {
  return imageProcessingLimiter.acquire(signal);
}

export function withImageProcessingSlot<T>(
  signal: AbortSignal | undefined,
  task: () => Promise<T>
): Promise<T> {
  return imageProcessingLimiter.run(signal, task);
}
