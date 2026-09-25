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
  | "awaiting_captcha"
  | "awaiting_otp"
  | "awaiting_payment"
  | "booked"
  | "failed"
  | "cancelled";

export type HumanStepKind = "captcha" | "otp" | "payment";

export interface Passenger {
  id: string;
  name: string;
  age: number;
  gender: "M" | "F" | "T";
  berthPreference: BerthPreference;
  foodPreference?: "Veg" | "Non-Veg" | "No food";
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
  status: BookingStatus;
  tatkalOpensAt: string | null; // ISO UTC
  armedAt: string | null;
  lastError?: string;
  runLog: RunLogEntry[];
  pendingHumanStep: HumanStepKind | null;
  /** Internal progress for the booking runner (0 = not started). */
  enginePhase: number;
  ticketPnr?: string;
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
}

export interface CredentialStatus {
  configured: boolean;
  usernameHint: string | null;
  source: "env" | "missing";
}
