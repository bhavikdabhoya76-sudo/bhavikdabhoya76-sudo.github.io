import type { TimelinePhase, TrainClass } from "./types";

/** AC classes open Tatkal at 10:00 IST; non-AC at 11:00 IST. */
const AC_CLASSES: ReadonlySet<TrainClass> = new Set([
  "1A",
  "2A",
  "3A",
  "3E",
  "CC",
  "EC",
  "FC",
]);

/** Minutes before open when the Astra runbook says to start the agent. */
export const START_EARLY_MINUTES = 15;
/** Minutes before open for login HAND TO ME. */
export const LOGIN_HANDOFF_MINUTES = 10;
/** Minutes before open to hold (no refresh). */
export const HOLD_BEFORE_OPEN_MINUTES = 1;

export function isAcClass(trainClass: TrainClass): boolean {
  return AC_CLASSES.has(trainClass);
}

/** Tatkal booking window opens on the day before journey (IRCTC advance: 1 day). */
export function tatkalBookingDate(journeyDateYmd: string): string {
  const [y, m, d] = journeyDateYmd.split("-").map(Number);
  const utc = new Date(Date.UTC(y, m - 1, d));
  utc.setUTCDate(utc.getUTCDate() - 1);
  const yy = utc.getUTCFullYear();
  const mm = String(utc.getUTCMonth() + 1).padStart(2, "0");
  const dd = String(utc.getUTCDate()).padStart(2, "0");
  return `${yy}-${mm}-${dd}`;
}

/**
 * Returns the Instant (ISO UTC) when Tatkal opens for this class/journey.
 * IST = UTC+5:30. AC → 10:00 IST, non-AC → 11:00 IST on the day before journey.
 */
export function computeTatkalOpenAt(
  journeyDateYmd: string,
  trainClass: TrainClass,
): string {
  const bookingDay = tatkalBookingDate(journeyDateYmd);
  const hourIst = isAcClass(trainClass) ? 10 : 11;
  const [y, m, d] = bookingDay.split("-").map(Number);
  const utcMs =
    Date.UTC(y, m - 1, d, hourIst, 0, 0, 0) - (5 * 60 + 30) * 60 * 1000;
  return new Date(utcMs).toISOString();
}

export function formatIst(iso: string): string {
  return new Intl.DateTimeFormat("en-IN", {
    timeZone: "Asia/Kolkata",
    dateStyle: "medium",
    timeStyle: "short",
  }).format(new Date(iso));
}

export function msUntil(iso: string): number {
  return new Date(iso).getTime() - Date.now();
}

export function tatkalWindowLabel(trainClass: TrainClass): string {
  return isAcClass(trainClass)
    ? "10:00 AM IST (AC)"
    : "11:00 AM IST (non-AC)";
}

/** Offset from Tatkal open: negative = before open. */
export function offsetFromOpen(tatkalOpensAt: string): number {
  return Date.now() - new Date(tatkalOpensAt).getTime();
}

export function minutesUntilOpen(tatkalOpensAt: string): number {
  return msUntil(tatkalOpensAt) / 60_000;
}

/** Suggested manual start time (T−15). */
export function suggestStartAt(tatkalOpensAt: string): string {
  return new Date(
    new Date(tatkalOpensAt).getTime() - START_EARLY_MINUTES * 60_000,
  ).toISOString();
}

/** Login handoff cue (T−10). */
export function loginHandoffAt(tatkalOpensAt: string): string {
  return new Date(
    new Date(tatkalOpensAt).getTime() - LOGIN_HANDOFF_MINUTES * 60_000,
  ).toISOString();
}

/** Hold-no-refresh cue (T−1). */
export function holdAt(tatkalOpensAt: string): string {
  return new Date(
    new Date(tatkalOpensAt).getTime() - HOLD_BEFORE_OPEN_MINUTES * 60_000,
  ).toISOString();
}

/** Ready to begin the runbook (at or past T−15). */
export function isPastStartWindow(tatkalOpensAt: string): boolean {
  return minutesUntilOpen(tatkalOpensAt) <= START_EARLY_MINUTES;
}

export function isPastLoginHandoff(tatkalOpensAt: string): boolean {
  return minutesUntilOpen(tatkalOpensAt) <= LOGIN_HANDOFF_MINUTES;
}

export function isPastHold(tatkalOpensAt: string): boolean {
  return minutesUntilOpen(tatkalOpensAt) <= HOLD_BEFORE_OPEN_MINUTES;
}

export function isWindowOpen(tatkalOpensAt: string): boolean {
  return msUntil(tatkalOpensAt) <= 0;
}

export const TIMELINE_LABELS: Record<TimelinePhase, string> = {
  idle: "Idle — arm when ready",
  t15_start: "T−15 — start session (open IRCTC)",
  t10_login: "T−10 — HAND TO ME: login",
  prefill: "Pre-fill form (do NOT Search yet)",
  t1_hold: "T−1 — hold page, no refresh",
  t0_search: "T+0 — Search → Book Now",
  passengers_cnf: "Master List + CNF-only",
  hand_captcha: "HAND TO ME: CAPTCHA",
  hand_otp: "HAND TO ME: OTP",
  fare_ewallet: "Fare cap + eWallet",
  hand_payment: "HAND TO ME: payment / txn password",
  history_guard: "Check History + wallet before retry",
  final_report: "Final report",
};

export const ENGINE_PHASE_TO_TIMELINE: TimelinePhase[] = [
  "idle",
  "t15_start",
  "t10_login",
  "prefill",
  "t1_hold",
  "t0_search",
  "passengers_cnf",
  "hand_captcha",
  "hand_otp",
  "fare_ewallet",
  "hand_payment",
  "history_guard",
  "final_report",
];
