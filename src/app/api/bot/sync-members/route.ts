import { NextRequest, NextResponse } from "next/server";
import { requireRole } from "@/lib/auth";
import { syncGroupMembers, isSyncDue, getLastSyncTime } from "@/server/bot/group-sync.service";
import { createLogger } from "@/lib/logger";

const log = createLogger("api:sync-members");

/**
 * GET /api/bot/sync-members
 *
 * Check the sync status (last sync time, whether a sync is due).
 * Requires ADMIN role.
 */
export async function GET() {
  await requireRole("ADMIN");

  const [due, lastSync] = await Promise.all([
    isSyncDue(),
    getLastSyncTime(),
  ]);

  return NextResponse.json({
    data: {
      syncDue: due,
      lastSyncAt: lastSync,
      intervalDays: 15,
    },
  });
}

/**
 * POST /api/bot/sync-members
 *
 * Trigger a group member sync. Compares the QQ group member list
 * with verified website accounts and marks missing users for review.
 *
 * Query params:
 *   - force=true  — Run even if the 15-day interval hasn't elapsed
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
        errors: result.errors.length,
      },
      "Group sync completed via API"
    );

    return NextResponse.json({ data: result });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Sync failed";
    log.error({ err }, "Group sync failed");

    return NextResponse.json(
      { error: { code: "SYNC_ERROR", message } },
      { status: 400 }
    );
  }
}
