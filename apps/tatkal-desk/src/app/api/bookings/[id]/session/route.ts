import { NextResponse } from "next/server";
import {
  getSession,
  markHandedBack,
  markUserControl,
  requestHandoff,
} from "@/lib/playwright-session";

export const runtime = "nodejs";

/** Session / HAND TO ME state for the private Playwright engine. */
export async function GET(
  _req: Request,
  ctx: { params: Promise<{ id: string }> },
) {
  const { id } = await ctx.params;
  const session = getSession(id);
  return NextResponse.json({
    session: session ?? {
      bookingId: id,
      handoff: "none",
      browserLaunched: false,
      updatedAt: null,
    },
  });
}

export async function POST(
  req: Request,
  ctx: { params: Promise<{ id: string }> },
) {
  const { id } = await ctx.params;
  const body = (await req.json().catch(() => ({}))) as {
    action?: "take_control" | "hand_back" | "request";
    reason?: string;
  };

  if (body.action === "take_control") {
    return NextResponse.json({ session: markUserControl(id) });
  }
  if (body.action === "hand_back") {
    return NextResponse.json({ session: markHandedBack(id) });
  }
  if (body.action === "request") {
    return NextResponse.json({
      session: requestHandoff(id, body.reason || "HAND TO ME"),
    });
  }

  return NextResponse.json(
    { error: "action must be take_control | hand_back | request" },
    { status: 400 },
  );
}
