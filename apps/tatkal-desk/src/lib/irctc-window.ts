/**
 * Launches the headed IRCTC script for one booking.
 * The child process does not receive IRCTC_PASSWORD.
 */

import { spawn, type ChildProcess } from "node:child_process";
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
  "blocked",
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
      window.phase === "selectors_failed" ||
      window.phase === "blocked"
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

function observeLaunch(
  child: ChildProcess,
  bookingId: string,
  timeoutMs: number,
): Promise<{ ok: true } | { ok: false; message: string }> {
  return new Promise((resolve) => {
    let settled = false;
    const finish = (result: { ok: true } | { ok: false; message: string }) => {
      if (settled) return;
      settled = true;
      clearInterval(timer);
      clearTimeout(limit);
      resolve(result);
    };

    const timer = setInterval(() => {
      void readIrctcStatus(bookingId).then((status) => {
        if (!status) return;
        if (status.mode === "simulate" || status.phase === "failed") {
          finish({
            ok: false,
            message: status.message || simulateInstallMessage(),
          });
        }
      });
    }, 250);

    const limit = setTimeout(() => finish({ ok: true }), timeoutMs);

    const onExit = () => {
      void readIrctcStatus(bookingId).then((status) => {
        const message = status?.message || "";
        const stillStarting =
          !message || message.startsWith("Opening headed Chromium");
        if (
          status?.mode === "playwright" &&
          status.phase !== "failed" &&
          !stillStarting
        ) {
          finish({ ok: true });
          return;
        }
        finish({
          ok: false,
          message: stillStarting ? simulateInstallMessage() : message,
        });
      });
    };

    child.on("error", (err) => {
      finish({
        ok: false,
        message: `${simulateInstallMessage()} (${err.message})`,
      });
    });

    if (child.exitCode !== null || child.signalCode) onExit();
    else child.on("exit", onExit);
  });
}

async function saveWindow(
  booking: BookingRequest,
  window: IrctcWindowState,
  level: RunLogEntry["level"],
): Promise<BookingRequest> {
  await writeFile(
    statusPathFor(booking.id),
    JSON.stringify({ bookingId: booking.id, ...window }, null, 2) + "\n",
    "utf8",
  );
  booking.irctcWindow = window;
  booking.runLog = [
    ...booking.runLog,
    logLine(level, `IRCTC: ${window.message}`),
  ].slice(-80);
  booking.updatedAt = window.updatedAt;
  return upsertBooking(booking);
}

export async function openIrctcWindow(booking: BookingRequest): Promise<{
  ok: boolean;
  booking: BookingRequest;
  mode: "playwright" | "simulate";
  alreadyRunning: boolean;
  message: string;
}> {
  await mkdir(WINDOW_DIR, { recursive: true });
  const existing = await readIrctcStatus(booking.id);
  if (recentlyActive(existing)) {
    const mode = existing?.mode === "playwright" ? "playwright" : "simulate";
    const message =
      existing?.message ||
      "IRCTC window is already open. Log in there yourself if you have not.";
    return {
      ok: mode === "playwright",
      booking,
      mode,
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
    const saved = await saveWindow(booking, window, "warn");
    return { ok: false, booking: saved, mode: "simulate", alreadyRunning: false, message };
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
      windowsHide: false,
    },
  );
  child.unref();

  const outcome = await observeLaunch(child, booking.id, 4000);
  const latest = await readIrctcStatus(booking.id);
  const launched =
    outcome.ok &&
    latest?.mode !== "simulate" &&
    latest?.phase !== "failed";
  const window: IrctcWindowState = launched
    ? latest?.message && latest.phase && latest.phase !== "starting"
      ? toWindow(latest)
      : starting
    : {
        mode: "simulate",
        phase: "simulate",
        gate: null,
        message: outcome.ok
          ? latest?.message || simulateInstallMessage()
          : outcome.message,
        updatedAt: new Date().toISOString(),
      };
  const saved = await saveWindow(booking, window, launched ? "info" : "warn");
  return {
    ok: launched,
    booking: saved,
    mode: launched ? "playwright" : "simulate",
    alreadyRunning: false,
    message: window.message,
  };
}
