import { getIrctcCredentials } from "./credentials";
import { requestHandoff, runAttendedPlaywright } from "./playwright-session";
import { getBooking, upsertBooking } from "./storage";
import {
  ENGINE_PHASE_TO_TIMELINE,
  isPastHold,
  isPastLoginHandoff,
  isPastStartWindow,
  isWindowOpen,
  loginHandoffAt,
  msUntil,
  suggestStartAt,
} from "./tatkal-time";
import type {
  BookingRequest,
  FinalReport,
  HumanStepKind,
  RunLogEntry,
  TimelinePhase,
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

function setPhase(booking: BookingRequest, phase: number): void {
  booking.enginePhase = phase;
  booking.timelinePhase =
    ENGINE_PHASE_TO_TIMELINE[phase] ?? ("idle" as TimelinePhase);
}

function finalize(
  booking: BookingRequest,
  report: Omit<FinalReport, "at">,
): BookingRequest {
  const at = new Date().toISOString();
  booking.finalReport = { ...report, at };
  setPhase(booking, 12);
  booking.timelinePhase = "final_report";
  booking.pendingHumanStep = null;
  if (report.outcome === "booked") {
    booking.status = "booked";
    booking.ticketPnr = report.pnr;
    log(
      booking,
      "info",
      `FINAL REPORT: PNR ${report.pnr} · status ${report.status ?? "CNF"} · amount ₹${report.amount ?? "?"}`,
    );
  } else {
    booking.status = report.outcome === "stopped" ? "failed" : "failed";
    booking.lastError = report.reason;
    log(booking, "error", `FINAL REPORT: ${report.reason}`);
  }
  return booking;
}

/**
 * Private attended Tatkal runner — Astra runbook without ChatGPT.
 *
 * Modes:
 * - simulate (default): exact timeline for practice
 * - playwright: scaffolding + same timeline (live selectors not bundled)
 *
 * Never accepts IRCTC password as a human-step value.
 */
export async function armBooking(id: string): Promise<BookingRequest> {
  const booking = await getBooking(id);
  if (!booking) throw new Error("Booking not found");
  if (!booking.tatkalOpensAt) throw new Error("Tatkal open time missing");
  if (booking.passengers.length === 0) {
    throw new Error("Add at least one passenger (Master List names)");
  }
  if (!booking.checklist.antiDoubleBookAck) {
    throw new Error(
      "Confirm anti-double-book: never run Desk and IRCTC app at the same time",
    );
  }
  if (
    !booking.checklist.aadhaarVerified ||
    !booking.checklist.masterListSaved ||
    !booking.checklist.ewalletFunded ||
    !booking.checklist.journeyDetailsReady
  ) {
    throw new Error(
      "Complete the night-before checklist before arming (Aadhaar, Master List, eWallet, journey details)",
    );
  }
  if (!booking.fareCap || booking.fareCap <= 0) {
    throw new Error("Set a fare cap (max total ₹) before arming");
  }

  const creds = getIrctcCredentials();
  booking.status = "armed";
  booking.armedAt = new Date().toISOString();
  booking.pendingHumanStep = null;
  booking.lastError = undefined;
  booking.finalReport = undefined;
  setPhase(booking, 0);

  const startAt = suggestStartAt(booking.tatkalOpensAt);
  const loginAt = loginHandoffAt(booking.tatkalOpensAt);

  log(
    booking,
    "info",
    `Armed (private Astra-style). Open ${booking.tatkalOpensAt}. Suggest start T−15 @ ${startAt}. Login handoff T−10 @ ${loginAt}. CNF-only · fare cap ₹${booking.fareCap} · eWallet.`,
  );
  if (!creds) {
    log(
      booking,
      "info",
      "No IRCTC_USERNAME in .env.local — fine. Login is HAND TO ME; type password only in the browser takeover.",
    );
  } else if (!creds.password) {
    log(
      booking,
      "info",
      `Username hint loaded (${creds.username.slice(0, 2)}…). Password not in env — type it yourself at login handoff.`,
    );
  } else {
    log(
      booking,
      "warn",
      "Password present in .env.local. Prefer typing it only during browser takeover; Desk never sends it to an LLM.",
    );
  }

  booking.status = "waiting_for_tatkal";
  const until = msUntil(booking.tatkalOpensAt);
  if (isPastStartWindow(booking.tatkalOpensAt)) {
    log(
      booking,
      "info",
      "Within T−15 (or window open) — eligible to run on next tick.",
    );
  } else {
    log(
      booking,
      "info",
      `Waiting until T−15 (~${Math.ceil(until / 1000 - 15 * 60)}s from now for start cue).`,
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

const SECRET_STEPS: HumanStepKind[] = ["captcha", "otp", "payment", "txn_password"];

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

  // Never accept IRCTC password as a login step value.
  if (step === "login") {
    const v = value.trim().toLowerCase();
    if (v !== "done" && v !== "continue" && v !== "handed_back") {
      throw new Error(
        'Login handoff: type password only in the browser. Here submit "done" when you hand control back.',
      );
    }
  }

  // Never persist OTP/CAPTCHA/payment secrets in the booking record.
  booking.pendingHumanStep = null;
  if (SECRET_STEPS.includes(step)) {
    log(booking, "info", `HAND TO ME "${step}" received (value not stored).`);
  } else {
    log(booking, "info", `HAND TO ME "${step}" acknowledged (${value.trim()}).`);
  }
  booking = await upsertBooking(booking);
  return runBookingAttempt(booking.id);
}

async function pauseForHuman(
  booking: BookingRequest,
  step: HumanStepKind,
  message: string,
): Promise<BookingRequest> {
  const statusMap: Record<HumanStepKind, BookingRequest["status"]> = {
    login: "awaiting_login",
    captcha: "awaiting_captcha",
    otp: "awaiting_otp",
    payment: "awaiting_payment",
    txn_password: "awaiting_payment",
    history_check: "awaiting_history_check",
  };
  booking.status = statusMap[step];
  booking.pendingHumanStep = step;
  requestHandoff(booking.id, message);
  log(booking, "warn", message);
  return upsertBooking(booking);
}

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

  if (booking.tatkalOpensAt && !isPastStartWindow(booking.tatkalOpensAt)) {
    booking.status = "waiting_for_tatkal";
    return upsertBooking(booking);
  }

  const mode = (process.env.BOOKING_MODE || "simulate").toLowerCase();
  booking.status = "running";
  if (booking.enginePhase === 0) {
    log(
      booking,
      "info",
      `Starting private attended attempt (mode=${mode}). No ChatGPT/Astra dependency.`,
    );
  }
  booking = await upsertBooking(booking);

  try {
    if (mode === "playwright" && booking.enginePhase === 0) {
      await runAttendedPlaywright(booking);
      booking = (await getBooking(id))!;
    }
    return await runAstraTimeline(booking);
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    booking.status = "failed";
    booking.lastError = message;
    log(booking, "error", message);
    return upsertBooking(
      finalize(booking, {
        outcome: "failed",
        reason: message,
      }),
    );
  }
}

/**
 * Astra EXACT TIMELINE mirrored locally (simulate / practice).
 * Compresses waits when the real clock is already past a cue.
 */
async function runAstraTimeline(
  booking: BookingRequest,
): Promise<BookingRequest> {
  const openAt = booking.tatkalOpensAt!;
  let phase = booking.enginePhase ?? 0;

  // Phase 1: T−15 start — open IRCTC + time.is cue
  if (phase <= 0) {
    setPhase(booking, 1);
    log(
      booking,
      "info",
      "T−15: Open irctc.co.in. Keep time.is (IST) visible. Do not Search yet.",
    );
    await upsertBooking(booking);
    await sleep(150);
    phase = 1;
  }

  // Phase 2: wait for T−10 → HAND TO ME login
  if (phase === 1) {
    if (!isPastLoginHandoff(openAt)) {
      booking.status = "waiting_for_tatkal";
      log(
        booking,
        "info",
        `Holding until T−10 login cue (${loginHandoffAt(openAt)}).`,
      );
      return upsertBooking(booking);
    }
    setPhase(booking, 2);
    await upsertBooking(booking);
    return pauseForHuman(
      booking,
      "login",
      'HAND TO ME: Take over the browser and log in to IRCTC. Type your password yourself — never paste it into Desk. When done, submit "done".',
    );
  }

  // Phase 3: after login — pre-fill, do NOT Search
  if (phase === 2) {
    setPhase(booking, 3);
    log(
      booking,
      "info",
      `Pre-fill: From ${booking.fromStation} → To ${booking.toStation}, date ${booking.journeyDate}, class ${booking.trainClass}, quota TQ. Do NOT click Search yet.`,
    );
    await upsertBooking(booking);
    await sleep(150);
    phase = 3;
  }

  // Phase 4: T−1 hold
  if (phase === 3) {
    if (!isPastHold(openAt) && !isWindowOpen(openAt)) {
      booking.status = "waiting_for_tatkal";
      setPhase(booking, 3);
      log(booking, "info", "Waiting for T−1 hold window…");
      return upsertBooking(booking);
    }
    setPhase(booking, 4);
    log(
      booking,
      "info",
      "T−1: Stay on the page. Do not refresh. Ready for Search at open.",
    );
    await upsertBooking(booking);
    await sleep(100);
    phase = 4;
  }

  // Phase 5: T+0 Search
  if (phase === 4) {
    if (!isWindowOpen(openAt)) {
      booking.status = "waiting_for_tatkal";
      log(booking, "info", "Waiting for T+0 (Tatkal open) to Search…");
      return upsertBooking(booking);
    }
    setPhase(booking, 5);
    log(
      booking,
      "info",
      `T+0: Search → select ${booking.trainNumber} ${booking.trainClass}/TQ → Book Now. (If not open, poll every 2–3s.)`,
    );
    await upsertBooking(booking);
    await sleep(150);
    phase = 5;
  }

  // Phase 6: passengers + CNF-only
  if (phase === 5) {
    setPhase(booking, 6);
    const names = booking.passengers.map((p) => p.name).join(", ");
    log(
      booking,
      "info",
      `Passengers: select from Master List only — ${names}. CNF-only checkbox ON (never WL/RAC).`,
    );
    await upsertBooking(booking);
    await sleep(100);
    phase = 6;
  }

  // Phase 7: CAPTCHA
  if (phase === 6) {
    setPhase(booking, 7);
    await upsertBooking(booking);
    return pauseForHuman(
      booking,
      "captcha",
      "HAND TO ME: CAPTCHA — enter it in the browser (~5s), then submit here to continue.",
    );
  }

  // Phase 8: OTP
  if (phase === 7) {
    setPhase(booking, 8);
    await upsertBooking(booking);
    return pauseForHuman(
      booking,
      "otp",
      "HAND TO ME: OTP (Aadhaar / IRCTC) — enter from your phone, then submit here.",
    );
  }

  // Phase 9: fare cap + eWallet
  if (phase === 8) {
    setPhase(booking, 9);
    log(
      booking,
      "info",
      `Fare check: maximum total ₹${booking.fareCap}. If quoted fare is higher → STOP, do not pay. Payment: IRCTC eWallet only.`,
    );
    // Simulate a fare under cap for practice; live path must read the page.
    const simulatedFare = Math.min(
      booking.fareCap,
      Math.max(100, Math.floor(booking.fareCap * 0.85)),
    );
    if (simulatedFare > booking.fareCap) {
      return upsertBooking(
        finalize(booking, {
          outcome: "stopped",
          reason: `Fare ₹${simulatedFare} exceeds cap ₹${booking.fareCap} — stopped, did not pay.`,
          amount: simulatedFare,
        }),
      );
    }
    log(
      booking,
      "info",
      `SIM: Quoted fare ₹${simulatedFare} within cap ₹${booking.fareCap}. Continuing to payment handoff.`,
    );
    await upsertBooking(booking);
    await sleep(100);
    phase = 9;
  }

  // Phase 10: payment / txn password
  if (phase === 9) {
    setPhase(booking, 10);
    await upsertBooking(booking);
    return pauseForHuman(
      booking,
      "payment",
      "HAND TO ME: complete eWallet payment (txn password if asked). Submit \"done\" or a payment ref — value not stored.",
    );
  }

  // Phase 11: history/wallet guard (shown once before success in simulate)
  if (phase === 10) {
    setPhase(booking, 11);
    log(
      booking,
      "warn",
      "Anti-double-pay: before any retry, check My Account → Booked Ticket History and eWallet transactions. Ticket found → STOP. Money deducted, no ticket → STOP. Only retry if neither.",
    );
    await upsertBooking(booking);
    await sleep(100);
    phase = 11;
  }

  // Phase 12: final report
  const pnr = `SIM${Date.now().toString().slice(-8)}`;
  const amount = Math.min(
    booking.fareCap,
    Math.max(100, Math.floor(booking.fareCap * 0.85)),
  );
  booking = finalize(booking, {
    outcome: "booked",
    pnr,
    status: "CNF",
    amount,
    reason: undefined,
  });
  log(
    booking,
    "info",
    "SIM complete — placeholder PNR for practice. For a real ticket, run locally with attended Playwright and complete HAND TO ME in the live IRCTC browser.",
  );
  return upsertBooking(booking);
}

function sleep(ms: number) {
  return new Promise((r) => setTimeout(r, ms));
}

/** Called by scheduler tick — advances bookings from T−15 onward. */
export async function processDueBookings(): Promise<{
  checked: number;
  started: number;
  ids: string[];
}> {
  const { readBookings } = await import("./storage");
  const all = await readBookings();
  const due = all.filter((b) => {
    if (!b.tatkalOpensAt) return false;
    if (b.pendingHumanStep) return false;
    const active =
      b.status === "waiting_for_tatkal" ||
      b.status === "armed" ||
      b.status === "running";
    if (!active) return false;
    return isPastStartWindow(b.tatkalOpensAt);
  });

  const started: string[] = [];
  for (const b of due) {
    await runBookingAttempt(b.id);
    started.push(b.id);
  }

  return { checked: all.length, started: started.length, ids: started };
}
