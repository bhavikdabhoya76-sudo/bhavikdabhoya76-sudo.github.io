import { NextResponse } from "next/server";
import { getCredentialStatus } from "@/lib/credentials";

export const runtime = "nodejs";

export async function GET() {
  return NextResponse.json({
    ok: true,
    service: "tatkal-desk",
    credentials: getCredentialStatus(),
    bookingMode: process.env.BOOKING_MODE || "simulate",
    time: new Date().toISOString(),
  });
}
