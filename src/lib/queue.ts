import { Queue } from "bullmq";

/**
 * Pre-defined queue names for the Date System
 */
export const QUEUE_NAMES = {
  RATING_COMPLETION: "rating-completion",
  MEMBERSHIP_EXPIRY: "membership-expiry",
  AUDIT_ARCHIVE: "audit-archive",
} as const;

/**
 * Create a BullMQ queue with Redis URL connection
 */
export function createQueue(name: string): Queue {
  return new Queue(name, {
    connection: {
      host: new URL(process.env.REDIS_URL || "redis://localhost:6379").hostname,
      port: parseInt(
        new URL(process.env.REDIS_URL || "redis://localhost:6379").port || "6379",
        10
      ),
      maxRetriesPerRequest: null,
      lazyConnect: true,
    },
  });
}

// Pre-instantiate queues (workers will be added in Phase 3)
export const ratingQueue = createQueue(QUEUE_NAMES.RATING_COMPLETION);
export const membershipQueue = createQueue(QUEUE_NAMES.MEMBERSHIP_EXPIRY);
export const auditQueue = createQueue(QUEUE_NAMES.AUDIT_ARCHIVE);
