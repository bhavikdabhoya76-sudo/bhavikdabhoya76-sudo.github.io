/**
 * Public IRCTC journey plan.
 *
 * Only From, To, date, class, and quota are prepared here.
 * Password, CAPTCHA, OTP, and payment are never fields in this plan.
 */

import type { BookingRequest, Quota, TrainClass } from "./types";

export const IRCTC_ORIGIN = "https://www.irctc.co.in";
export const IRCTC_SEARCH_URL = "https://www.irctc.co.in/nget/train-search";

export type IrctcGate = "login" | "captcha" | "otp" | "payment";

export type BrowserAction =
  | "fill_journey"
  | "wait_open"
  | "pause_login"
  | "search"
  | "prefill_passengers"
  | "pause_captcha"
  | "pause_otp"
  | "pause_payment"
  | "hold";

export type ClickKind = "search" | "book" | "continue" | "option" | "checkbox";

export interface IrctcPassengerPlan {
  name: string;
  age: number;
  gender: "M" | "F" | "T";
  genderLabel: string;
  berthLabel: string;
}

/** Saved public details the headed window is allowed to type. */
export interface IrctcJob {
  bookingId: string;
  from: string;
  to: string;
  journeyDate: string;
  dateDisplay: string;
  trainClass: TrainClass;
  classLabel: string;
  classMatchers: string[];
  quota: Quota;
  quotaLabel: string;
  trainNumber: string;
  cnfOnly: true;
  passengers: IrctcPassengerPlan[];
  tatkalOpensAt: string | null;
  originUrl: string;
  searchUrl: string;
}

export interface PageSignals {
  hasVisiblePassword: boolean;
  hasVisibleCaptcha: boolean;
  hasVisibleOtp: boolean;
  hasVisiblePayment: boolean;
  hasLogout: boolean;
}

export interface ActionInput {
  nowMs: number;
  opensAt: string | null;
  gate: IrctcGate | null;
  loggedIn: boolean;
  journeyFilled: boolean;
  searchClicked: boolean;
  passengersFilled: boolean;
  fillAttempts: number;
}

const CLASS_LABELS: Record<TrainClass, string> = {
  "1A": "AC First Class (1A)",
  "2A": "AC 2 Tier (2A)",
  "3A": "AC 3 Tier (3A)",
  "3E": "AC 3 Economy (3E)",
  CC: "AC Chair car (CC)",
  EC: "Exec. Chair Car (EC)",
  FC: "First Class (FC)",
  SL: "Sleeper (SL)",
  "2S": "Second Sitting (2S)",
};

const CLASS_MATCHERS: Record<TrainClass, string[]> = {
  "1A": ["AC First Class (1A)", "1A"],
  "2A": ["AC 2 Tier (2A)", "2A"],
  "3A": ["AC 3 Tier (3A)", "3A"],
  "3E": ["AC 3 Economy (3E)", "3E"],
  CC: ["AC Chair car (CC)", "Chair Car (CC)", "CC"],
  EC: ["Exec. Chair Car (EC)", "EC"],
  FC: ["First Class (FC)", "FC"],
  SL: ["Sleeper (SL)", "SL"],
  "2S": ["Second Sitting (2S)", "2S"],
};

const GENDER_LABEL: Record<IrctcPassengerPlan["gender"], string> = {
  M: "Male",
  F: "Female",
  T: "Transgender",
};

const BERTH_LABEL: Record<string, string> = {
  NO_PREF: "No Preference",
  LOWER: "Lower",
  MIDDLE: "Middle",
  UPPER: "Upper",
  SIDE_LOWER: "Side Lower",
  SIDE_UPPER: "Side Upper",
};

export const JOURNEY_SELECTORS = {
  from: [
    'p-autocomplete[formcontrolname="origin"] input',
    "#origin input",
    'input[aria-label*="From station" i]',
    'input[placeholder*="From" i]',
  ],
  to: [
    'p-autocomplete[formcontrolname="destination"] input',
    "#destination input",
    'input[aria-label*="To station" i]',
    'input[placeholder*="To" i]',
  ],
  date: [
    'p-calendar[formcontrolname="journeyDate"] input',
    'input[placeholder*="Journey Date" i]',
    'input[placeholder*="dd-mm-yyyy" i]',
    'input[placeholder*="dd/mm/yyyy" i]',
  ],
  classDropdown: [
    'p-dropdown[formcontrolname="journeyClass"]',
    "#journeyClass",
  ],
  quotaDropdown: [
    'p-dropdown[formcontrolname="journeyQuota"]',
    "#journeyQuota",
  ],
} as const;

const PROTECTED_FIELD =
  /password|passwd|otp|captcha|cvv|pin\b|txn|aadhaar|secret/i;

const PROTECTED_CLICK =
  /password|captcha|otp|one time|pay\b|payment|wallet|upi|net ?bank|txn|login|sign in|verify|submit|cvv|pin\b/i;

const SECRET_KEY = /password|otp|captcha|cvv|pin|secret|txn/i;

export function journeyDateDisplay(ymd: string): string {
  const [y, m, d] = ymd.split("-");
  if (!y || !m || !d) return ymd;
  return `${d}/${m}/${y}`;
}

export function quotaLabel(quota: Quota): string {
  if (quota === "PT") return "PREMIUM TATKAL";
  if (quota === "GN") return "GENERAL";
  return "TATKAL";
}

export function classLabel(trainClass: TrainClass): string {
  return CLASS_LABELS[trainClass];
}

export function fieldIsProtected(meta: {
  type?: string | null;
  name?: string | null;
  id?: string | null;
  placeholder?: string | null;
  ariaLabel?: string | null;
  autocomplete?: string | null;
}): boolean {
  if ((meta.type || "").toLowerCase() === "password") return true;
  const blob = [
    meta.name,
    meta.id,
    meta.placeholder,
    meta.ariaLabel,
    meta.autocomplete,
  ]
    .filter(Boolean)
    .join(" ");
  return PROTECTED_FIELD.test(blob);
}

export function clickAllowed(label: string, kind: ClickKind): boolean {
  const n = label.replace(/\s+/g, " ").trim().toLowerCase();
  if (!n) return false;
  if (PROTECTED_CLICK.test(n)) return false;
  if (kind === "search") return /^(search|find trains)$/.test(n);
  if (kind === "book") return /^book now$/.test(n);
  if (kind === "continue") return /^continue$/.test(n);
  if (kind === "option" || kind === "checkbox") return true;
  return false;
}

export function optionMatches(optionText: string, matchers: string[]): boolean {
  const text = optionText.replace(/\s+/g, " ").trim().toLowerCase();
  return matchers.some((matcher) => {
    const needle = matcher.toLowerCase();
    if (needle.length <= 3) {
      return (
        text === needle ||
        text.endsWith(`(${needle})`) ||
        text.endsWith(` ${needle}`)
      );
    }
    return text.includes(needle);
  });
}

export function selectorsArePublic(selectors: readonly string[]): boolean {
  return selectors.every((sel) => !/password|captcha|otp|cvv|pin/i.test(sel));
}

export function publicJobHasNoSecrets(job: unknown): boolean {
  const keys: string[] = [];
  const walk = (value: unknown) => {
    if (!value || typeof value !== "object") return;
    for (const [key, child] of Object.entries(value as Record<string, unknown>)) {
      keys.push(key);
      walk(child);
    }
  };
  walk(job);
  return !keys.some((key) => SECRET_KEY.test(key));
}

export function detectGate(signals: PageSignals): IrctcGate | null {
  if (signals.hasVisiblePayment) return "payment";
  if (signals.hasVisibleOtp) return "otp";
  if (signals.hasVisibleCaptcha) return "captcha";
  if (signals.hasVisiblePassword) return "login";
  return null;
}

export function detectLoggedIn(signals: PageSignals): boolean {
  if (signals.hasVisiblePassword) return false;
  return signals.hasLogout;
}

export function isTatkalOpen(opensAt: string | null, nowMs: number): boolean {
  if (!opensAt) return false;
  const t = new Date(opensAt).getTime();
  return Number.isFinite(t) && nowMs >= t;
}

export function nextBrowserAction(input: ActionInput): BrowserAction {
  if (input.gate === "payment") return "pause_payment";
  if (input.gate === "otp") return "pause_otp";
  if (input.gate === "captcha") return "pause_captcha";

  const open = isTatkalOpen(input.opensAt, input.nowMs);

  if (!input.journeyFilled) {
    if (input.gate === "login") return "pause_login";
    if (input.fillAttempts >= 3) {
      if (open && !input.loggedIn) return "pause_login";
      return "hold";
    }
    return "fill_journey";
  }

  if (!open) {
    if (input.gate === "login") return "pause_login";
    return "wait_open";
  }

  if (!input.loggedIn || input.gate === "login") return "pause_login";
  if (!input.searchClicked) return "search";
  if (!input.passengersFilled) return "prefill_passengers";
  return "hold";
}

export function buildIrctcJob(booking: BookingRequest): IrctcJob {
  const trainClass = booking.trainClass;
  const quota = booking.quota || "TQ";
  const job: IrctcJob = {
    bookingId: booking.id,
    from: booking.fromStation.trim().toUpperCase(),
    to: booking.toStation.trim().toUpperCase(),
    journeyDate: booking.journeyDate,
    dateDisplay: journeyDateDisplay(booking.journeyDate),
    trainClass,
    classLabel: classLabel(trainClass),
    classMatchers: CLASS_MATCHERS[trainClass],
    quota,
    quotaLabel: quotaLabel(quota),
    trainNumber: booking.trainNumber.trim(),
    cnfOnly: true,
    passengers: booking.passengers.map((p) => ({
      name: p.name.trim(),
      age: p.age,
      gender: p.gender,
      genderLabel: GENDER_LABEL[p.gender] || "Male",
      berthLabel: BERTH_LABEL[p.berthPreference] || "No Preference",
    })),
    tatkalOpensAt: booking.tatkalOpensAt,
    originUrl: IRCTC_ORIGIN,
    searchUrl: IRCTC_SEARCH_URL,
  };
  if (!publicJobHasNoSecrets(job)) {
    throw new Error("Refusing to build an IRCTC job that contains secret fields");
  }
  return job;
}

export const GATE_MESSAGES: Record<IrctcGate, string> = {
  login:
    "Pause: log in in the IRCTC window. Type your password there yourself. Desk will not type it or click Login.",
  captcha:
    "Pause: CAPTCHA is on the IRCTC window. Type it there yourself. Desk will not read or solve it.",
  otp: "Pause: OTP is on the IRCTC window. Enter it from your phone. Desk will not read or submit it.",
  payment:
    "Pause: payment is on the IRCTC window. Confirm eWallet yourself. Desk will not pay unattended.",
};

export function filledJourneyMessage(job: IrctcJob, partial: boolean): string {
  const fields = `${job.from} → ${job.to}, ${job.dateDisplay}, ${job.classLabel}, ${job.quotaLabel}`;
  if (partial) {
    return `Opened IRCTC and filled the fields that matched (${fields}). If a box is empty, type it in the IRCTC window. Login, CAPTCHA, OTP, and payment stay manual.`;
  }
  return `Opened IRCTC and filled ${fields}. Log in yourself in that window. Search stays off until Tatkal is open and you are logged in.`;
}

export function simulateInstallMessage(): string {
  return "Playwright Chromium is not ready. In the Tatkal Desk folder run once: npx playwright install chromium — then click Open IRCTC again. Simulate mode still runs. Login, CAPTCHA, OTP, and payment stay manual.";
}
