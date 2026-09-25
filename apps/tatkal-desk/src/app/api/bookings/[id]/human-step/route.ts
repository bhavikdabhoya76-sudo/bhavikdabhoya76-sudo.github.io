import { NextResponse } from "next/server";
import { submitHumanStep } from "@/lib/booking-engine";
import type { HumanStepKind } from "@/lib/types";

export const runtime = "nodejs";

const ALLOWED: HumanStepKind[] = [
  "login",
  "captcha",
  "otp",
  "payment",
  "txn_password",
  "history_check",
];

export async function POST(
  req: Request,
  ctx: { params: Promise<{ id: string }> },
) {
  const { id } = await ctx.params;
  const body = (await req.json()) as { step?: HumanStepKind; value?: string };

  if (!body.step || !ALLOWED.includes(body.step) || !body.value) {
    return NextResponse.json(
      { error: "step and value required" },
      { status: 400 },
    );
  }

  try {
    const booking = await submitHumanStep(id, body.step, body.value);
    return NextResponse.json({ booking });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ error: message }, { status: 400 });
  }
}
