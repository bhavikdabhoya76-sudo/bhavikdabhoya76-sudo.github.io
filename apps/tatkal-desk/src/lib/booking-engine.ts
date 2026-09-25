import { getIrctcCredentials } from "./credentials";
import { getBooking, upsertBooking } from "./storage";
import { msUntil } from "./tatkal-time";
import type {
  BookingRequest,
  HumanStepKind,
  RunLogEntry,
} from "./types";

function log(
  booking: BookingRequest,
  level: RunLogEntry["level"],
  message: string,
): BookingRequest {
  booking.runLog = [
    ...booking.runLog,
    { at: new Date().toISOString(), level, message },
  ].slice(-80);
  booking.updatedAt = new Date().toISOString();
  return booking;
}

/**
 * Personal-use booking runner.
 *
 * Reality check (IRCTC):
 * - No official public booking API for end users.
 * - Browser automation can prep login / search / fill passengers,
 *   but CAPTCHA, OTP, and payment almost always need a human.
 * - IRCTC Terms of Service restrict unauthorized automation;
 *   this MVP is a local assistant that stages the flow and queues
 *   human-in-the-loop steps rather than claiming silent full booking.
 *
 * Mode:
 * - BOOKING_MODE=simulate (default): deterministic dry-run that pauses on human steps.
 * - BOOKING_MODE=playwright: reserved hook — requires local Playwright + user consent.
 */
export async function armBooking(id: string): Promise<BookingRequest> {
  const booking = await getBooking(id);
  if (!booking) throw new Error("Booking not found");
  if (!booking.tatkalOpensAt) throw new Error("Tatkal open time missing");
  if (booking.passengers.length === 0) {
    throw new Error("Add at least one passenger");
  }

  const creds = getIrctcCredentials();
  if (!creds) {
    throw new Error(
      "IRCTC credentials not configured. Set IRCTC_USERNAME and IRCTC_PASSWORD in .env.local",
    );
  }

  booking.status = "armed";
  booking.armedAt = new Date().toISOString();
  booking.pendingHumanStep = null;
  booking.lastError = undefined;
  log(
    booking,
    "info",
    `Armed. Will trigger at ${booking.tatkalOpensAt} (IST window for ${booking.trainClass}).`,
  );

  const until = msUntil(booking.tatkalOpensAt);
  if (until <= 0) {
    booking.status = "waiting_for_tatkal";
    log(booking, "info", "Tatkal window already open — eligible to run on next tick.");
  } else {
    booking.status = "waiting_for_tatkal";
    log(
      booking,
      "info",
      `Waiting ${Math.ceil(until / 1000)}s until Tatkal opens.`,
    );
  }

  return upsertBooking(booking);
}

export async function cancelBooking(id: string): Promise<BookingRequest> {
  const booking = await getBooking(id);
  if (!booking) throw new Error("Booking not found");
  booking.status = "cancelled";
  booking.pendingHumanStep = null;
  log(booking, "warn", "Cancelled by user.");
  return upsertBooking(booking);
}

export async function submitHumanStep(
  id: string,
  step: HumanStepKind,
  value: string,
): Promise<BookingRequest> {
  let booking = await getBooking(id);
  if (!booking) throw new Error("Booking not found");
  if (booking.pendingHumanStep !== step) {
    throw new Error(`Expected step ${booking.pendingHumanStep}, got ${step}`);
  }
  if (!value.trim()) throw new Error("Value required");

  // Never persist OTP/CAPTCHA/payment secrets in the booking record.
  booking.pendingHumanStep = null;
  log(booking, "info", `Human step "${step}" received (value not stored).`);
  booking = await upsertBooking(booking);
  return runBookingAttempt(booking.id);
}

async function pauseForHuman(
  booking: BookingRequest,
  step: HumanStepKind,
  message: string,
): Promise<BookingRequest> {
  const statusMap: Record<HumanStepKind, BookingRequest["status"]> = {
    captcha: "awaiting_captcha",
    otp: "awaiting_otp",
    payment: "awaiting_payment",
  };
  booking.status = statusMap[step];
  booking.pendingHumanStep = step;
  log(booking, "warn", message);
  return upsertBooking(booking);
}

/**
 * Single booking attempt. Safe default is simulate mode.
 */
export async function runBookingAttempt(id: string): Promise<BookingRequest> {
  let booking = await getBooking(id);
  if (!booking) throw new Error("Booking not found");

  if (
    booking.status === "cancelled" ||
    booking.status === "booked" ||
    booking.status === "draft"
  ) {
    return booking;
  }

  if (booking.pendingHumanStep) {
    return booking;
  }

  if (booking.tatkalOpensAt && msUntil(booking.tatkalOpensAt) > 0) {
    booking.status = "waiting_for_tatkal";
    return upsertBooking(booking);
  }

  const mode = (process.env.BOOKING_MODE || "simulate").toLowerCase();
  booking.status = "running";
  log(booking, "info", `Starting booking attempt (mode=${mode}).`);
  booking = await upsertBooking(booking);

  try {
    if (mode === "playwright") {
      return await runPlaywrightStub(booking);
    }
    return await runSimulate(booking);
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    booking.status = "failed";
    booking.lastError = message;
    log(booking, "error", message);
    return upsertBooking(booking);
  }
}

async function runSimulate(booking: BookingRequest): Promise<BookingRequest> {
  const phase = booking.enginePhase ?? 0;

  if (phase === 0) {
    log(booking, "info", "SIM: Warming session / login prep (credentials from env only).");
    booking.enginePhase = 1;
    await upsertBooking(booking);
    await sleep(200);
    return pauseForHuman(
      booking,
      "captcha",
      "CAPTCHA required — enter the code shown on IRCTC (or paste solve) to continue.",
    );
  }

  if (phase === 1) {
    log(
      booking,
      "info",
      `SIM: Searching ${booking.trainNumber} ${booking.fromStation}→${booking.toStation} on ${booking.journeyDate} (${booking.trainClass}/${booking.quota}).`,
    );
    log(booking, "info", "SIM: Filling passenger details.");
    booking.enginePhase = 2;
    await upsertBooking(booking);
    await sleep(200);
    return pauseForHuman(
      booking,
      "otp",
      "IRCTC OTP sent to registered mobile — enter OTP to continue.",
    );
  }

  if (phase === 2) {
    log(booking, "info", "SIM: Seat availability check + review.");
    booking.enginePhase = 3;
    await upsertBooking(booking);
    return pauseForHuman(
      booking,
      "payment",
      "Payment gateway — complete payment in your bank/UPI app or paste confirmation ref.",
    );
  }

  booking.status = "booked";
  booking.ticketPnr = `SIM${Date.now().toString().slice(-8)}`;
  booking.pendingHumanStep = null;
  booking.enginePhase = 4;
  log(
    booking,
    "info",
    `SIM: Booking complete. Placeholder PNR ${booking.ticketPnr}. Replace simulate mode with attended Playwright for real IRCTC.`,
  );
  return upsertBooking(booking);
}

/**
 * Playwright path is intentionally a stub: installing browsers and driving
 * IRCTC against live ToS should be an explicit local choice by the user.
 */
async function runPlaywrightStub(
  booking: BookingRequest,
): Promise<BookingRequest> {
  log(
    booking,
    "warn",
    "Playwright mode selected but live IRCTC automation is not bundled. Falling back to simulate with human steps.",
  );
  await upsertBooking(booking);
  return runSimulate(booking);
}

function sleep(ms: number) {
  return new Promise((r) => setTimeout(r, ms));
}

/** Called by scheduler tick — advances all armed/waiting bookings. */
export async function processDueBookings(): Promise<{
  checked: number;
  started: number;
  ids: string[];
}> {
  const { readBookings } = await import("./storage");
  const all = await readBookings();
  const due = all.filter(
    (b) =>
      (b.status === "waiting_for_tatkal" || b.status === "armed") &&
      b.tatkalOpensAt &&
      msUntil(b.tatkalOpensAt) <= 0,
  );

  const started: string[] = [];
  for (const b of due) {
    await runBookingAttempt(b.id);
    started.push(b.id);
  }

  return { checked: all.length, started: started.length, ids: started };
}
