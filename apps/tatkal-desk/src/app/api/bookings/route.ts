import { NextResponse } from "next/server";
import { syncIrctcWindows } from "@/lib/irctc-window";
import { newId } from "@/lib/id";
import { readBookings, upsertBooking } from "@/lib/storage";
import { computeTatkalOpenAt } from "@/lib/tatkal-time";
import { getCredentialStatus } from "@/lib/credentials";
import type {
  BookingRequest,
  CreateBookingInput,
  Passenger,
  PrepChecklist,
} from "@/lib/types";

export const runtime = "nodejs";

const emptyChecklist = (): PrepChecklist => ({
  aadhaarVerified: false,
  masterListSaved: false,
  ewalletFunded: false,
  journeyDetailsReady: false,
  antiDoubleBookAck: false,
});

export async function GET() {
  const bookings = await syncIrctcWindows(await readBookings());
  return NextResponse.json({
    bookings,
    credentials: getCredentialStatus(),
    bookingMode: process.env.BOOKING_MODE || "simulate",
    engine: "private-astra",
  });
}

export async function POST(req: Request) {
  const body = (await req.json()) as CreateBookingInput;

  if (!body.trainNumber?.trim()) {
    return NextResponse.json({ error: "Train number required" }, { status: 400 });
  }
  if (!body.fromStation?.trim() || !body.toStation?.trim()) {
    return NextResponse.json({ error: "From/To station codes required" }, { status: 400 });
  }
  if (!/^\d{4}-\d{2}-\d{2}$/.test(body.journeyDate || "")) {
    return NextResponse.json({ error: "Journey date must be YYYY-MM-DD" }, { status: 400 });
  }
  if (!body.trainClass) {
    return NextResponse.json({ error: "Class required" }, { status: 400 });
  }
  if (!body.passengers?.length) {
    return NextResponse.json({ error: "At least one passenger required" }, { status: 400 });
  }
  const fareCap = Number(body.fareCap);
  if (!Number.isFinite(fareCap) || fareCap <= 0) {
    return NextResponse.json(
      { error: "Fare cap (max total ₹) required" },
      { status: 400 },
    );
  }

  const checklist: PrepChecklist = {
    ...emptyChecklist(),
    ...(body.checklist || {}),
  };

  const now = new Date().toISOString();
  const passengers: Passenger[] = body.passengers.map((p) => ({
    ...p,
    id: newId(),
    name: p.name.trim(),
    berthPreference: p.berthPreference || "NO_PREF",
  }));

  const booking: BookingRequest = {
    id: newId(),
    createdAt: now,
    updatedAt: now,
    trainNumber: body.trainNumber.trim(),
    trainName: body.trainName?.trim() || undefined,
    fromStation: body.fromStation.trim().toUpperCase(),
    toStation: body.toStation.trim().toUpperCase(),
    journeyDate: body.journeyDate,
    trainClass: body.trainClass,
    quota: body.quota || "TQ",
    passengers,
    mobile: body.mobile?.trim() || undefined,
    notes: body.notes?.trim() || undefined,
    fareCap,
    cnfOnly: true,
    paymentMethod: "ewallet",
    checklist,
    status: "draft",
    timelinePhase: "idle",
    tatkalOpensAt: computeTatkalOpenAt(body.journeyDate, body.trainClass),
    armedAt: null,
    runLog: [
      {
        at: now,
        level: "info",
        message:
          "Draft created (private Astra-style). Complete checklist, then Arm. Login password stays in browser takeover — never in chat.",
      },
    ],
    pendingHumanStep: null,
    enginePhase: 0,
  };

  await upsertBooking(booking);
  return NextResponse.json({ booking }, { status: 201 });
}
