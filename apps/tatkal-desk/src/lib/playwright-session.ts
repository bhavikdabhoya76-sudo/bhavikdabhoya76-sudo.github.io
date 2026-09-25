/**
 * Attended Playwright session scaffolding — private replacement for ChatGPT Astra.
 *
 * This module does NOT drive live IRCTC in the cloud VM by default. IRCTC DOM
 * selectors change often, CAPTCHA/OTP cannot be bypassed, and automation may
 * conflict with IRCTC Terms of Service.
 *
 * Local run (on your machine, attended):
 *   1. cd apps/tatkal-desk && npm install && npx playwright install chromium
 *   2. BOOKING_MODE=playwright npm run dev
 *   3. Compose + Arm in Desk; when prompted HAND TO ME, use the visible browser
 *   4. Type IRCTC password yourself — never paste it into Desk/chat/LLM
 *
 * The session API below tracks handoff state so Desk and a future worker share
 * the same Astra timeline. Live click automation is intentionally stubbed;
 * `runAttendedPlaywright` logs the exact runbook steps and falls through to
 * the simulate engine so practice still works.
 */

import type { BookingRequest, RunLogEntry } from "./types";

export type SessionHandoff =
  | "none"
  | "awaiting_user"
  | "user_has_control"
  | "handed_back";

export interface PlaywrightSessionState {
  bookingId: string;
  handoff: SessionHandoff;
  handoffReason?: string;
  browserLaunched: boolean;
  lastCue?: string;
  updatedAt: string;
}

/** In-memory session map (local process only — not shared across serverless). */
const sessions = new Map<string, PlaywrightSessionState>();

export function getSession(bookingId: string): PlaywrightSessionState | null {
  return sessions.get(bookingId) ?? null;
}

export function upsertSession(
  state: PlaywrightSessionState,
): PlaywrightSessionState {
  sessions.set(state.bookingId, state);
  return state;
}

export function requestHandoff(
  bookingId: string,
  reason: string,
): PlaywrightSessionState {
  const prev = sessions.get(bookingId);
  const next: PlaywrightSessionState = {
    bookingId,
    handoff: "awaiting_user",
    handoffReason: reason,
    browserLaunched: prev?.browserLaunched ?? false,
    lastCue: reason,
    updatedAt: new Date().toISOString(),
  };
  return upsertSession(next);
}

export function markUserControl(bookingId: string): PlaywrightSessionState {
  const prev = sessions.get(bookingId);
  const next: PlaywrightSessionState = {
    bookingId,
    handoff: "user_has_control",
    handoffReason: prev?.handoffReason,
    browserLaunched: prev?.browserLaunched ?? false,
    lastCue: prev?.lastCue,
    updatedAt: new Date().toISOString(),
  };
  return upsertSession(next);
}

export function markHandedBack(bookingId: string): PlaywrightSessionState {
  const prev = sessions.get(bookingId);
  const next: PlaywrightSessionState = {
    bookingId,
    handoff: "handed_back",
    handoffReason: undefined,
    browserLaunched: prev?.browserLaunched ?? false,
    lastCue: prev?.lastCue,
    updatedAt: new Date().toISOString(),
  };
  return upsertSession(next);
}

function appendLog(
  booking: BookingRequest,
  level: RunLogEntry["level"],
  message: string,
): void {
  booking.runLog = [
    ...booking.runLog,
    { at: new Date().toISOString(), level, message },
  ].slice(-80);
  booking.updatedAt = new Date().toISOString();
}

/**
 * Attempt to detect Playwright without failing the Next build when the
 * optional package is not installed.
 */
export async function tryLaunchBrowser(
  booking: BookingRequest,
): Promise<boolean> {
  try {
    const modName = "playwright";
    const importer = new Function("m", "return import(m)") as (
      m: string,
    ) => Promise<unknown>;
    const playwright = await importer(modName).catch(() => null);
    if (!playwright) {
      appendLog(
        booking,
        "warn",
        "Playwright package not installed. Run: npm i -D playwright && npx playwright install chromium",
      );
      return false;
    }
    appendLog(
      booking,
      "info",
      "PW: Chromium package is installed. Use the Open IRCTC button for the headed window. This tick does not type passwords or pass CAPTCHA.",
    );
    upsertSession({
      bookingId: booking.id,
      handoff: "none",
      browserLaunched: true,
      lastCue: "browser_ready_stub",
      updatedAt: new Date().toISOString(),
    });
    // Deliberately do not navigate or type passwords. Scaffold only.
    return true;
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    appendLog(booking, "warn", `PW: launch skipped — ${message}`);
    return false;
  }
}

/**
 * Documented IRCTC click sequence for a future local worker.
 * Never auto-fills password; never bypasses CAPTCHA.
 */
export const IRCTC_RUNBOOK_STEPS = [
  "Open https://www.irctc.co.in/nget/train-search (and time.is for IST)",
  "At T−10: HAND TO ME — user logs in (password typed by user only)",
  "After login: Book Ticket → fill From, To, Date, Class, Quota=TQ — do NOT Search",
  "At T−1: hold page, no refresh",
  "At T+0: Search → select train/class → Book Now (poll 2–3s if not open)",
  "Select passengers from Master List only",
  "Tick CNF-only (Book only if confirm berths/seats allotted)",
  "Select eWallet; if total > fareCap → STOP",
  "HAND TO ME: CAPTCHA / OTP / txn password",
  "On error: check Booked Ticket History + eWallet before any retry",
  "FINAL REPORT: PNR / CNF / amount — or clear failure reason",
] as const;

export async function runAttendedPlaywright(
  booking: BookingRequest,
): Promise<"continue_simulate"> {
  appendLog(
    booking,
    "info",
    "PW: Attended Playwright mode — private engine (no ChatGPT/Astra).",
  );
  for (const step of IRCTC_RUNBOOK_STEPS) {
    appendLog(booking, "info", `PW runbook: ${step}`);
  }
  await tryLaunchBrowser(booking);
  appendLog(
    booking,
    "warn",
    "PW: Click Open IRCTC for a headed window that fills From, To, Date, Class, and TQ. Simulate timeline continues for practice. Login, CAPTCHA, OTP, and payment stay manual.",
  );
  return "continue_simulate";
}
