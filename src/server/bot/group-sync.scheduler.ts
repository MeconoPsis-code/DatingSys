/**
 * @file group-sync.scheduler.ts
 * @description Periodic scheduler for group member sync.
 *
 * Checks hourly whether the 24-hour reconciliation interval has elapsed.
 * When due, automatically runs the sync.
 *
 * Started by Next.js instrumentation hook on server startup.
 */

import { syncGroupMembers, isSyncDue } from './group-sync.service';
import { createLogger } from '@/lib/logger';

const log = createLogger('bot:group-sync-scheduler');

/** Check hourly so a near-due startup check cannot delay the daily sync by another day. */
const CHECK_INTERVAL_MS = 60 * 60 * 1000;

let schedulerStarted = false;
let checkRunning = false;

/**
 * Start the periodic group sync scheduler.
 * Safe to call multiple times — will only start once.
 */
export function startGroupSyncScheduler(): void {
  if (schedulerStarted) return;
  schedulerStarted = true;

  log.info('Group sync scheduler started (checks hourly, syncs every 24 hours)');

  // Run an initial check after a short delay (let the server fully initialize)
  setTimeout(() => runCheck(), 30_000);

  // Then check every 24 hours
  setInterval(() => runCheck(), CHECK_INTERVAL_MS);
}

async function runCheck(): Promise<void> {
  if (checkRunning) {
    log.debug('A group sync check is already running, skipping overlap');
    return;
  }

  checkRunning = true;
  try {
    const due = await isSyncDue();
    if (!due) {
      log.debug('Group sync not due yet, skipping');
      return;
    }

    log.info('Group sync is due, starting automatic sync...');
    const result = await syncGroupMembers({ force: false });

    log.info(
      {
        groupMemberCount: result.groupMemberCount,
        verifiedAccountCount: result.verifiedAccountCount,
        markedForReview: result.markedForReview.length,
        errors: result.errors.length,
      },
      'Automatic group sync completed'
    );
  } catch (err) {
    log.error({ err }, 'Automatic group sync check failed');
  } finally {
    checkRunning = false;
  }
}
