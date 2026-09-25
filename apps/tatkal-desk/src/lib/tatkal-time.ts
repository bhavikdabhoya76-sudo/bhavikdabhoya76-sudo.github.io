import type { TrainClass } from "./types";

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
  // Convert IST wall time → UTC: subtract 5h30m
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
