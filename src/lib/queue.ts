import { Queue } from "bullmq";
import { redisConnectionFromUrl } from "@/lib/redis-connection";

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
      ...redisConnectionFromUrl(),
      maxRetriesPerRequest: null,
      lazyConnect: true,
    },
  });
}

// Pre-instantiate queues (workers will be added in Phase 3)
export const ratingQueue = createQueue(QUEUE_NAMES.RATING_COMPLETION);
export const membershipQueue = createQueue(QUEUE_NAMES.MEMBERSHIP_EXPIRY);
export const auditQueue = createQueue(QUEUE_NAMES.AUDIT_ARCHIVE);
