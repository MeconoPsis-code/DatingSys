import { NextRequest, NextResponse } from "next/server";
import { requireRole } from "@/lib/auth";
import {
  syncGroupMembers,
  isSyncDue,
  getLastSyncTime,
} from "@/server/bot/group-sync.service";
import { createLogger } from "@/lib/logger";
import { GROUP_MEMBERSHIP_SYNC_INTERVAL_SECONDS } from "@/lib/group-membership-sync";

const log = createLogger("api:sync-members");

/**
 * GET /api/bot/sync-members
 *
 * Check the sync status (last sync time, whether a sync is due).
 * Requires ADMIN role.
 */
export async function GET() {
  await requireRole("ADMIN");

  const [due, lastSync] = await Promise.all([isSyncDue(), getLastSyncTime()]);

  return NextResponse.json({
    data: {
      syncDue: due,
      lastSyncAt: lastSync,
      intervalDays: GROUP_MEMBERSHIP_SYNC_INTERVAL_SECONDS / 86400,
    },
  });
}

/**
 * POST /api/bot/sync-members
 *
 * Trigger a group member sync. Compares the QQ group member list
 * with linked website accounts, marks missing users for review, and restores
 * returning users to normal verified status.
 *
 * Query params:
 *   - force=true  — Run even if the 24-hour interval hasn't elapsed
 *
 * Requires ADMIN role.
 */
export async function POST(req: NextRequest) {
  await requireRole("ADMIN");

  const force = req.nextUrl.searchParams.get("force") === "true";

  try {
    const result = await syncGroupMembers({ force });

    log.info(
      {
        markedForReview: result.markedForReview.length,
        restoredMemberships: result.restoredMemberships.length,
        errors: result.errors.length,
      },
      "Group sync completed via API"
    );

    return NextResponse.json({ data: result });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Sync failed";
    log.error({ err }, "Group sync failed");

    return NextResponse.json({ error: { code: "SYNC_ERROR", message } }, { status: 400 });
  }
}
