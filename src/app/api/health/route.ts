import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { redis } from "@/lib/redis";

export async function GET() {
  const services: Record<string, string> = {};

  // Check PostgreSQL
  try {
    await db.$queryRaw`SELECT 1`;
    services.database = "connected";
  } catch {
    services.database = "disconnected";
  }

  // Check Redis
  try {
    await redis.ping();
    services.redis = "connected";
  } catch {
    services.redis = "disconnected";
  }

  const allHealthy = Object.values(services).every((s) => s === "connected");

  return NextResponse.json(
    {
      status: allHealthy ? "ok" : "degraded",
      timestamp: new Date().toISOString(),
      services,
    },
    { status: allHealthy ? 200 : 503 }
  );
}
