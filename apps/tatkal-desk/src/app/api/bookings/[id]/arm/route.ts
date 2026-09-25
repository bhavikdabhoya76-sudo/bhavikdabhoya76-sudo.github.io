import { NextResponse } from "next/server";
import { armBooking, cancelBooking } from "@/lib/booking-engine";

export const runtime = "nodejs";

export async function POST(
  req: Request,
  ctx: { params: Promise<{ id: string }> },
) {
  const { id } = await ctx.params;
  const body = (await req.json().catch(() => ({}))) as { action?: string };

  try {
    if (body.action === "cancel") {
      const booking = await cancelBooking(id);
      return NextResponse.json({ booking });
    }
    const booking = await armBooking(id);
    return NextResponse.json({ booking });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ error: message }, { status: 400 });
  }
}
