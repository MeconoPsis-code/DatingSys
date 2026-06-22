/**
 * @file instrumentation.ts
 * @description Next.js instrumentation hook — runs once on server startup.
 *
 * Used to register periodic background tasks like the group member sync.
 * This file is automatically loaded by Next.js when present in the src/ directory.
 *
 * @see https://nextjs.org/docs/app/building-your-application/optimizing/instrumentation
 */

export async function register() {
  // Only run on the server (not during build or in Edge runtime)
  if (process.env.NEXT_RUNTIME === 'nodejs') {
    const { startGroupSyncScheduler } = await import(
      '@/server/bot/group-sync.scheduler'
    );
    startGroupSyncScheduler();
  }
}
