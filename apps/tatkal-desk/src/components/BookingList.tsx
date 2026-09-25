"use client";

import { useEffect, useState } from "react";
import type { BookingRequest, HumanStepKind } from "@/lib/types";

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

const STATUS_LABEL: Record<string, string> = {
  draft: "Draft",
  armed: "Armed",
  waiting_for_tatkal: "Waiting for Tatkal",
  running: "Running",
  awaiting_captcha: "Needs CAPTCHA",
  awaiting_otp: "Needs OTP",
  awaiting_payment: "Needs payment",
  booked: "Booked",
  failed: "Failed",
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
    try {
      const res = await fetch(`/api/bookings/${id}/human-step`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ step, value: humanValue[id] || "" }),
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
        No bookings yet. Fill the form above to stage a Tatkal attempt.
      </p>
    );
  }

  return (
    <div className="booking-list">
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
                {b.trainClass}/{b.quota}
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

          {b.pendingHumanStep && (
            <div className="human-step">
              <p>
                Human step required: <strong>{b.pendingHumanStep}</strong>
              </p>
              <div className="human-row">
                <input
                  type={b.pendingHumanStep === "otp" ? "password" : "text"}
                  placeholder={
                    b.pendingHumanStep === "captcha"
                      ? "CAPTCHA text"
                      : b.pendingHumanStep === "otp"
                        ? "OTP"
                        : "Payment ref / done"
                  }
                  value={humanValue[b.id] || ""}
                  onChange={(e) =>
                    setHumanValue((v) => ({ ...v, [b.id]: e.target.value }))
                  }
                  autoComplete="off"
                />
                <button
                  type="button"
                  className="primary-btn"
                  disabled={busyId === b.id}
                  onClick={() => submitStep(b.id, b.pendingHumanStep!)}
                >
                  Submit
                </button>
              </div>
              <p className="hint">
                Values are used for this step only and are not saved to disk.
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
            {(b.status === "draft" || b.status === "failed") && (
              <button
                type="button"
                className="primary-btn"
                disabled={busyId === b.id}
                onClick={() => arm(b.id)}
              >
                Arm for Tatkal
              </button>
            )}
            {[
              "armed",
              "waiting_for_tatkal",
              "running",
              "awaiting_captcha",
              "awaiting_otp",
              "awaiting_payment",
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
