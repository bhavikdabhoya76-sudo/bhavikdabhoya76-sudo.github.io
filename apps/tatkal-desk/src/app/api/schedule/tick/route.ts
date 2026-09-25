import { NextResponse } from "next/server";
import { processDueBookings } from "@/lib/booking-engine";

export const runtime = "nodejs";

/**
 * Scheduler tick endpoint.
 * Call every ~5–15s from the dashboard client, or via cron:
 *   curl -X POST http://localhost:3000/api/schedule/tick
 */
export async function POST() {
  const result = await processDueBookings();
  return NextResponse.json({
    ok: true,
    at: new Date().toISOString(),
    ...result,
  });
}

export async function GET() {
  return POST();
}
