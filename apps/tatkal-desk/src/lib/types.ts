export type TrainClass =
  | "1A"
  | "2A"
  | "3A"
  | "3E"
  | "CC"
  | "EC"
  | "FC"
  | "SL"
  | "2S";

export type Quota = "TQ" | "PT" | "GN";

export type BerthPreference =
  | "NO_PREF"
  | "LOWER"
  | "MIDDLE"
  | "UPPER"
  | "SIDE_LOWER"
  | "SIDE_UPPER";

export type BookingStatus =
  | "draft"
  | "armed"
  | "waiting_for_tatkal"
  | "running"
  | "awaiting_login"
  | "awaiting_captcha"
  | "awaiting_otp"
  | "awaiting_payment"
  | "awaiting_history_check"
  | "booked"
  | "failed"
  | "cancelled";

/** HAND TO ME steps — mirrors Astra runbook; password never accepted as a step value. */
export type HumanStepKind =
  | "login"
  | "captcha"
  | "otp"
  | "payment"
  | "txn_password"
  | "history_check";

/**
 * Astra-style timeline phases (enginePhase index).
 * 0 idle → 1 T−15 start → 2 T−10 login → 3 prefill → 4 T−1 hold
 * → 5 T+0 search → 6 passengers/CNF → 7 captcha → 8 otp
 * → 9 fare/eWallet → 10 pay → 11 history guard → 12 final
 */
export type TimelinePhase =
  | "idle"
  | "t15_start"
  | "t10_login"
  | "prefill"
  | "t1_hold"
  | "t0_search"
  | "passengers_cnf"
  | "hand_captcha"
  | "hand_otp"
  | "fare_ewallet"
  | "hand_payment"
  | "history_guard"
  | "final_report";

export interface Passenger {
  id: string;
  name: string;
  age: number;
  gender: "M" | "F" | "T";
  berthPreference: BerthPreference;
  foodPreference?: "Veg" | "Non-Veg" | "No food";
}

/** Night-before prep checklist (Google Doc prerequisites). */
export interface PrepChecklist {
  aadhaarVerified: boolean;
  masterListSaved: boolean;
  ewalletFunded: boolean;
  journeyDetailsReady: boolean;
  antiDoubleBookAck: boolean;
}

export interface FinalReport {
  outcome: "booked" | "failed" | "stopped";
  pnr?: string;
  status?: string;
  amount?: number;
  reason?: string;
  at: string;
}

export interface BookingRequest {
  id: string;
  createdAt: string;
  updatedAt: string;
  trainNumber: string;
  trainName?: string;
  fromStation: string;
  toStation: string;
  journeyDate: string; // YYYY-MM-DD
  trainClass: TrainClass;
  quota: Quota;
  passengers: Passenger[];
  mobile?: string;
  notes?: string;
  /** Max total fare in INR — STOP and do not pay if higher. */
  fareCap: number;
  /** Always true for Tatkal Desk — never WL/RAC. */
  cnfOnly: true;
  /** Prefer IRCTC eWallet (doc default). */
  paymentMethod: "ewallet";
  checklist: PrepChecklist;
  status: BookingStatus;
  timelinePhase: TimelinePhase;
  tatkalOpensAt: string | null; // ISO UTC
  armedAt: string | null;
  lastError?: string;
  runLog: RunLogEntry[];
  pendingHumanStep: HumanStepKind | null;
  /** Internal progress for the booking runner (0 = not started). */
  enginePhase: number;
  ticketPnr?: string;
  finalReport?: FinalReport;
  /** Headed IRCTC window status. Absent until Open IRCTC is used. */
  irctcWindow?: IrctcWindowState;
}

export interface RunLogEntry {
  at: string;
  level: "info" | "warn" | "error";
  message: string;
}

export interface CreateBookingInput {
  trainNumber: string;
  trainName?: string;
  fromStation: string;
  toStation: string;
  journeyDate: string;
  trainClass: TrainClass;
  quota?: Quota;
  passengers: Omit<Passenger, "id">[];
  mobile?: string;
  notes?: string;
  fareCap: number;
  checklist: PrepChecklist;
}

export interface CredentialStatus {
  configured: boolean;
  usernameHint: string | null;
  source: "env" | "missing";
  /** Attended login is preferred — password not required to arm. */
  attendedLogin: true;
}

/** Live headed IRCTC window. Secrets are never part of this state. */
export interface IrctcWindowState {
  mode: "playwright" | "simulate";
  phase: string;
  gate: "login" | "captcha" | "otp" | "payment" | null;
  message: string;
  updatedAt: string;
}
