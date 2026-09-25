"use client";

import { useEffect, useMemo, useState } from "react";
import {
  HOLD_BEFORE_OPEN_MINUTES,
  LOGIN_HANDOFF_MINUTES,
  START_EARLY_MINUTES,
  TIMELINE_LABELS,
} from "@/lib/tatkal-time";
import type { BookingRequest, HumanStepKind, TimelinePhase } from "@/lib/types";

function formatIst(iso: string | null): string {
  if (!iso) return "—";
  return new Intl.DateTimeFormat("en-IN", {
    timeZone: "Asia/Kolkata",
    dateStyle: "medium",
    timeStyle: "short",
  }).format(new Date(iso));
}

function Countdown({ targetIso }: { targetIso: string | null }) {
  const [now, setNow] = useState(Date.now());
  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(t);
  }, []);
  if (!targetIso) return <span className="countdown">—</span>;
  const ms = new Date(targetIso).getTime() - now;
  if (ms <= 0) return <span className="countdown open">Window open</span>;
  const s = Math.floor(ms / 1000);
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const sec = s % 60;
  return (
    <span className="countdown">
      {h > 0 ? `${h}h ` : ""}
      {m}m {sec}s
    </span>
  );
}

function TimelineRail({
  phase,
  opensAt,
}: {
  phase: TimelinePhase;
  opensAt: string | null;
}) {
  const steps: TimelinePhase[] = [
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
    "final_report",
  ];
  const normalized: TimelinePhase =
    phase === "idle"
      ? "t15_start"
      : phase === "history_guard"
        ? "hand_payment"
        : phase;
  const idx = steps.indexOf(normalized);
  const cues = useMemo(() => {
    if (!opensAt) return null;
    const open = new Date(opensAt).getTime();
    return {
      t15: new Date(open - START_EARLY_MINUTES * 60_000).toISOString(),
      t10: new Date(open - LOGIN_HANDOFF_MINUTES * 60_000).toISOString(),
      t1: new Date(open - HOLD_BEFORE_OPEN_MINUTES * 60_000).toISOString(),
    };
  }, [opensAt]);

  return (
    <div className="timeline-rail">
      <p className="timeline-current">
        Phase: <strong>{TIMELINE_LABELS[phase]}</strong>
      </p>
      {cues && (
        <p className="field-hint">
          Cues IST — start {formatIst(cues.t15)} · login {formatIst(cues.t10)} ·
          hold {formatIst(cues.t1)} · Search {formatIst(opensAt)}
        </p>
      )}
      <ol className="timeline-steps">
        {steps.map((s, i) => (
          <li
            key={s}
            className={
              i < idx ? "done" : i === idx || phase === s ? "active" : ""
            }
          >
            {TIMELINE_LABELS[s]}
          </li>
        ))}
      </ol>
    </div>
  );
}

const STATUS_LABEL: Record<string, string> = {
  draft: "Draft",
  armed: "Armed",
  waiting_for_tatkal: "Waiting / armed clock",
  running: "Running",
  awaiting_login: "HAND TO ME: login",
  awaiting_captcha: "HAND TO ME: CAPTCHA",
  awaiting_otp: "HAND TO ME: OTP",
  awaiting_payment: "HAND TO ME: payment",
  awaiting_history_check: "Check History + wallet",
  booked: "Booked",
  failed: "Failed / stopped",
  cancelled: "Cancelled",
};

type Props = {
  bookings: BookingRequest[];
  onChanged: () => void;
};

export function BookingList({ bookings, onChanged }: Props) {
  const [humanValue, setHumanValue] = useState<Record<string, string>>({});
  const [busyId, setBusyId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function openIrctc(id: string) {
    setBusyId(id);
    setError(null);
    try {
      const res = await fetch(`/api/bookings/${id}/open-irctc`, {
        method: "POST",
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Could not open IRCTC");
      onChanged();
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setBusyId(null);
    }
  }

  async function arm(id: string) {
    setBusyId(id);
    setError(null);
    try {
      const res = await fetch(`/api/bookings/${id}/arm`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({}),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Arm failed");
      onChanged();
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setBusyId(null);
    }
  }

  async function cancel(id: string) {
    setBusyId(id);
    try {
      await fetch(`/api/bookings/${id}/arm`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "cancel" }),
      });
      onChanged();
    } finally {
      setBusyId(null);
    }
  }

  async function remove(id: string) {
    setBusyId(id);
    try {
      await fetch(`/api/bookings/${id}`, { method: "DELETE" });
      onChanged();
    } finally {
      setBusyId(null);
    }
  }

  async function submitStep(id: string, step: HumanStepKind) {
    setBusyId(id);
    setError(null);
    const raw = humanValue[id] || "";
    const value =
      step === "login" || step === "history_check"
        ? raw.trim() || "done"
        : raw;
    try {
      await fetch(`/api/bookings/${id}/session`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "hand_back" }),
      });
      const res = await fetch(`/api/bookings/${id}/human-step`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ step, value }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Step failed");
      setHumanValue((v) => ({ ...v, [id]: "" }));
      onChanged();
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setBusyId(null);
    }
  }

  if (bookings.length === 0) {
    return (
      <p className="empty-list">
        No bookings yet. Fill the form and night-before checklist above.
      </p>
    );
  }

  const launchTarget =
    bookings.find((b) =>
      [
        "armed",
        "waiting_for_tatkal",
        "running",
        "awaiting_login",
        "awaiting_captcha",
        "awaiting_otp",
        "awaiting_payment",
      ].includes(b.status),
    ) || bookings.find((b) => b.status !== "cancelled");

  return (
    <div className="booking-list">
      {launchTarget && (
        <div className="irctc-launch">
          <button
            type="button"
            className="primary-btn"
            disabled={busyId === launchTarget.id}
            onClick={() => openIrctc(launchTarget.id)}
          >
            Open IRCTC
          </button>
          <p>
            Opens Chromium on irctc.co.in and fills From, To, date, class, and
            Tatkal quota from{" "}
            <strong>
              {launchTarget.fromStation} → {launchTarget.toStation}
            </strong>
            . You type login, CAPTCHA, OTP, and payment in that window.
          </p>
        </div>
      )}
      {error && <p className="form-msg error list-error">{error}</p>}
      {bookings.map((b) => (
        <article key={b.id} className={`booking-item status-${b.status}`}>
          <header>
            <div>
              <h3>
                {b.trainNumber}
                {b.trainName ? ` · ${b.trainName}` : ""}
              </h3>
              <p className="route">
                {b.fromStation} → {b.toStation} · {b.journeyDate} ·{" "}
                {b.trainClass}/{b.quota} · cap ₹{b.fareCap} · CNF-only
              </p>
            </div>
            <span className={`status-pill ${b.status}`}>
              {STATUS_LABEL[b.status] || b.status}
            </span>
          </header>

          <div className="meta-row">
            <div>
              <span className="meta-label">Tatkal opens (IST)</span>
              <strong>{formatIst(b.tatkalOpensAt)}</strong>
            </div>
            <div>
              <span className="meta-label">Countdown</span>
              <Countdown targetIso={b.tatkalOpensAt} />
            </div>
            <div>
              <span className="meta-label">Passengers</span>
              <strong>
                {b.passengers.map((p) => p.name.split(" ")[0]).join(", ")}
              </strong>
            </div>
            {b.ticketPnr && (
              <div>
                <span className="meta-label">PNR</span>
                <strong>{b.ticketPnr}</strong>
              </div>
            )}
          </div>

          <TimelineRail phase={b.timelinePhase || "idle"} opensAt={b.tatkalOpensAt} />

          {b.irctcWindow && (
            <div className={`irctc-banner ${b.irctcWindow.mode}`}>
              <strong>IRCTC window.</strong> {b.irctcWindow.message}
            </div>
          )}

          {b.finalReport && (
            <div className={`final-report ${b.finalReport.outcome}`}>
              <h4>Final report</h4>
              {b.finalReport.outcome === "booked" ? (
                <p>
                  PNR <strong>{b.finalReport.pnr}</strong> ·{" "}
                  {b.finalReport.status || "CNF"}
                  {b.finalReport.amount != null
                    ? ` · ₹${b.finalReport.amount}`
                    : ""}
                </p>
              ) : (
                <p>{b.finalReport.reason || "Stopped / failed"}</p>
              )}
            </div>
          )}

          {b.pendingHumanStep && (
            <div className="human-step">
              <p>
                <strong>HAND TO ME:</strong> {b.pendingHumanStep}
              </p>
              <div className="human-row">
                {b.pendingHumanStep === "login" ? (
                  <>
                    <input
                      type="text"
                      placeholder='Type "done" after you log in in the browser'
                      value={humanValue[b.id] || ""}
                      onChange={(e) =>
                        setHumanValue((v) => ({
                          ...v,
                          [b.id]: e.target.value,
                        }))
                      }
                      autoComplete="off"
                    />
                    <button
                      type="button"
                      className="primary-btn"
                      disabled={busyId === b.id}
                      onClick={() => submitStep(b.id, "login")}
                    >
                      Handed back
                    </button>
                  </>
                ) : (
                  <>
                    <input
                      type={
                        b.pendingHumanStep === "otp" ||
                        b.pendingHumanStep === "txn_password"
                          ? "password"
                          : "text"
                      }
                      placeholder={
                        b.pendingHumanStep === "captcha"
                          ? "CAPTCHA text (not stored)"
                          : b.pendingHumanStep === "otp"
                            ? "OTP (not stored)"
                            : "done / payment ref (not stored)"
                      }
                      value={humanValue[b.id] || ""}
                      onChange={(e) =>
                        setHumanValue((v) => ({
                          ...v,
                          [b.id]: e.target.value,
                        }))
                      }
                      autoComplete="off"
                    />
                    <button
                      type="button"
                      className="primary-btn"
                      disabled={busyId === b.id}
                      onClick={() => submitStep(b.id, b.pendingHumanStep!)}
                    >
                      Continue
                    </button>
                  </>
                )}
              </div>
              <p className="hint">
                {b.pendingHumanStep === "login"
                  ? "Never paste your IRCTC password here — type it only in the browser takeover."
                  : "Values are used for this step only and are not saved to disk."}
              </p>
            </div>
          )}

          <details className="run-log">
            <summary>Run log ({b.runLog.length})</summary>
            <ul>
              {[...b.runLog].reverse().map((e, i) => (
                <li key={i} className={e.level}>
                  <time>{formatIst(e.at)}</time> {e.message}
                </li>
              ))}
            </ul>
          </details>

          <footer className="item-actions">
            {b.status !== "cancelled" && (
              <button
                type="button"
                className="primary-btn"
                disabled={busyId === b.id}
                onClick={() => openIrctc(b.id)}
              >
                Open IRCTC
              </button>
            )}
            {(b.status === "draft" || b.status === "failed") && (
              <button
                type="button"
                className="primary-btn"
                disabled={busyId === b.id}
                onClick={() => arm(b.id)}
              >
                Arm Astra timeline
              </button>
            )}
            {[
              "armed",
              "waiting_for_tatkal",
              "running",
              "awaiting_login",
              "awaiting_captcha",
              "awaiting_otp",
              "awaiting_payment",
              "awaiting_history_check",
            ].includes(b.status) && (
              <button
                type="button"
                className="ghost-btn"
                disabled={busyId === b.id}
                onClick={() => cancel(b.id)}
              >
                Cancel
              </button>
            )}
            <button
              type="button"
              className="ghost-btn"
              disabled={busyId === b.id}
              onClick={() => remove(b.id)}
            >
              Delete
            </button>
          </footer>
        </article>
      ))}
    </div>
  );
}
