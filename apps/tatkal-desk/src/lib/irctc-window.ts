/**
 * Launches the headed IRCTC script for one booking.
 * The child process does not receive IRCTC_PASSWORD.
 */

import { spawn } from "node:child_process";
import { existsSync } from "node:fs";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { buildIrctcJob, simulateInstallMessage } from "./irctc-plan";
import type { IrctcGate } from "./irctc-plan";
import { upsertBooking } from "./storage";
import type { BookingRequest, IrctcWindowState, RunLogEntry } from "./types";

const WINDOW_DIR = path.join(process.cwd(), "data", "irctc-window");

export function jobPathFor(id: string): string {
  return path.join(WINDOW_DIR, `${id}.job.json`);
}

export function statusPathFor(id: string): string {
  return path.join(WINDOW_DIR, `${id}.status.json`);
}

interface StatusFile {
  bookingId?: string;
  mode?: "playwright" | "simulate";
  phase?: string;
  gate?: IrctcGate | null;
  message?: string;
  updatedAt?: string;
}

const ACTIVE_PHASES = new Set([
  "starting",
  "journey_filled",
  "waiting_open",
  "searched",
  "passengers_prefilled",
  "paused_gate",
  "hold",
  "selectors_failed",
]);

function logLine(level: RunLogEntry["level"], message: string): RunLogEntry {
  return { at: new Date().toISOString(), level, message };
}

function childEnv(): NodeJS.ProcessEnv {
  const env = { ...process.env };
  delete env.IRCTC_PASSWORD;
  delete env.CREDENTIALS_SECRET;
  return env;
}

export async function readIrctcStatus(id: string): Promise<StatusFile | null> {
  try {
    const raw = await readFile(statusPathFor(id), "utf8");
    return JSON.parse(raw) as StatusFile;
  } catch {
    return null;
  }
}

function toWindow(status: StatusFile): IrctcWindowState {
  return {
    mode: status.mode === "playwright" ? "playwright" : "simulate",
    phase: status.phase || "starting",
    gate: status.gate ?? null,
    message: status.message || "IRCTC window status pending.",
    updatedAt: status.updatedAt || new Date().toISOString(),
  };
}

export async function syncIrctcWindows(
  bookings: BookingRequest[],
): Promise<BookingRequest[]> {
  let dirty = false;
  const next: BookingRequest[] = [];
  for (const booking of bookings) {
    const status = await readIrctcStatus(booking.id);
    if (!status?.message) {
      next.push(booking);
      continue;
    }
    const window = toWindow(status);
    const changed =
      booking.irctcWindow?.phase !== window.phase ||
      booking.irctcWindow?.message !== window.message;
    if (!changed) {
      next.push({ ...booking, irctcWindow: window });
      continue;
    }
    const level: RunLogEntry["level"] =
      window.mode === "simulate" ||
      window.phase === "failed" ||
      window.phase === "paused_gate" ||
      window.phase === "selectors_failed"
        ? "warn"
        : "info";
    next.push({
      ...booking,
      updatedAt: window.updatedAt,
      irctcWindow: window,
      runLog: [
        ...booking.runLog,
        { at: window.updatedAt, level, message: `IRCTC: ${window.message}` },
      ].slice(-80),
    });
    dirty = true;
  }
  if (dirty) {
    const { writeBookings } = await import("./storage");
    await writeBookings(next);
  }
  return next;
}

async function chromiumReady(): Promise<"ready" | "missing-browser" | "missing-package"> {
  const script = path.join(process.cwd(), "scripts", "check-chromium.mjs");
  if (!existsSync(script)) return "missing-package";
  return new Promise((resolve) => {
    const child = spawn(process.execPath, [script], {
      cwd: process.cwd(),
      env: childEnv(),
      stdio: ["ignore", "pipe", "ignore"],
    });
    let out = "";
    child.stdout?.on("data", (chunk) => {
      out += String(chunk);
    });
    child.on("error", () => resolve("missing-package"));
    child.on("close", () => {
      const line = out.trim();
      if (line === "ready" || line === "missing-browser") resolve(line);
      else resolve("missing-package");
    });
  });
}

function recentlyActive(status: StatusFile | null): boolean {
  if (!status?.updatedAt || !status.phase) return false;
  if (!ACTIVE_PHASES.has(status.phase)) return false;
  const age = Date.now() - new Date(status.updatedAt).getTime();
  return age >= 0 && age < 20_000;
}

export async function openIrctcWindow(booking: BookingRequest): Promise<{
  booking: BookingRequest;
  mode: "playwright" | "simulate";
  alreadyRunning: boolean;
  message: string;
}> {
  await mkdir(WINDOW_DIR, { recursive: true });
  const existing = await readIrctcStatus(booking.id);
  if (recentlyActive(existing)) {
    const message =
      existing?.message ||
      "IRCTC window is already open. Log in there yourself if you have not.";
    return {
      booking,
      mode: existing?.mode === "playwright" ? "playwright" : "simulate",
      alreadyRunning: true,
      message,
    };
  }

  const ready = await chromiumReady();
  if (ready !== "ready") {
    const message = simulateInstallMessage();
    const window: IrctcWindowState = {
      mode: "simulate",
      phase: "simulate",
      gate: null,
      message,
      updatedAt: new Date().toISOString(),
    };
    booking.irctcWindow = window;
    booking.runLog = [...booking.runLog, logLine("warn", `IRCTC: ${message}`)].slice(-80);
    booking.updatedAt = window.updatedAt;
    const saved = await upsertBooking(booking);
    return { booking: saved, mode: "simulate", alreadyRunning: false, message };
  }

  const job = buildIrctcJob(booking);
  await writeFile(jobPathFor(booking.id), JSON.stringify(job, null, 2) + "\n", "utf8");

  const starting: IrctcWindowState = {
    mode: "playwright",
    phase: "starting",
    gate: null,
    message: `Opening headed Chromium to ${job.originUrl}. Filling ${job.from} → ${job.to}, ${job.dateDisplay}, ${job.classLabel}, ${job.quotaLabel}. You type login, CAPTCHA, OTP, and payment.`,
    updatedAt: new Date().toISOString(),
  };
  await writeFile(
    statusPathFor(booking.id),
    JSON.stringify({ bookingId: booking.id, ...starting }, null, 2) + "\n",
    "utf8",
  );

  const runner = path.join(process.cwd(), "scripts", "open-irctc.ts");
  const child = spawn(
    process.execPath,
    [
      "--import",
      "tsx",
      runner,
      "--job",
      jobPathFor(booking.id),
      "--status",
      statusPathFor(booking.id),
    ],
    {
      cwd: process.cwd(),
      env: childEnv(),
      detached: true,
      stdio: "ignore",
    },
  );
  child.unref();

  booking.irctcWindow = starting;
  booking.runLog = [
    ...booking.runLog,
    logLine("info", `IRCTC: ${starting.message}`),
  ].slice(-80);
  booking.updatedAt = starting.updatedAt;
  const saved = await upsertBooking(booking);
  return {
    booking: saved,
    mode: "playwright",
    alreadyRunning: false,
    message: starting.message,
  };
}
