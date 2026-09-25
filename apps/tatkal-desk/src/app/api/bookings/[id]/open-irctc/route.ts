import { NextResponse } from "next/server";
import { openIrctcWindow, readIrctcStatus } from "@/lib/irctc-window";
import { getBooking } from "@/lib/storage";

export const runtime = "nodejs";

export async function GET(
  _req: Request,
  ctx: { params: Promise<{ id: string }> },
) {
  const { id } = await ctx.params;
  const booking = await getBooking(id);
  if (!booking) {
    return NextResponse.json({ error: "Booking not found" }, { status: 404 });
  }
  const status = await readIrctcStatus(id);
  return NextResponse.json({
    bookingId: id,
    irctcWindow: booking.irctcWindow ?? null,
    status,
  });
}

/**
 * Open a headed Chromium window on irctc.co.in and fill public journey fields.
 * Does not type a password, CAPTCHA, OTP, or payment.
 */
export async function POST(
  _req: Request,
  ctx: { params: Promise<{ id: string }> },
) {
  const { id } = await ctx.params;
  const booking = await getBooking(id);
  if (!booking) {
    return NextResponse.json({ error: "Booking not found" }, { status: 404 });
  }
  if (booking.status === "cancelled") {
    return NextResponse.json({ error: "Booking is cancelled" }, { status: 400 });
  }
  if (!booking.fromStation || !booking.toStation || !booking.journeyDate) {
    return NextResponse.json(
      { error: "Saved From, To, and date are required before opening IRCTC" },
      { status: 400 },
    );
  }

  try {
    const result = await openIrctcWindow(booking);
    return NextResponse.json(result);
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ error: message }, { status: 400 });
  }
}
