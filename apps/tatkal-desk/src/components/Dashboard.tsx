"use client";

import { useCallback, useEffect, useState } from "react";
import { BookingForm } from "@/components/BookingForm";
import { BookingList } from "@/components/BookingList";
import type { BookingRequest, CredentialStatus } from "@/lib/types";

type ApiPayload = {
  bookings: BookingRequest[];
  credentials: CredentialStatus;
  bookingMode: string;
};

export function Dashboard() {
  const [bookings, setBookings] = useState<BookingRequest[]>([]);
  const [credentials, setCredentials] = useState<CredentialStatus | null>(
    null,
  );
  const [mode, setMode] = useState("simulate");
  const [clock, setClock] = useState("");

  const refresh = useCallback(async () => {
    const res = await fetch("/api/bookings");
    const data = (await res.json()) as ApiPayload;
    setBookings(data.bookings);
    setCredentials(data.credentials);
    setMode(data.bookingMode);
  }, []);

  useEffect(() => {
    refresh();
  }, [refresh]);

  useEffect(() => {
    const tick = () => {
      setClock(
        new Intl.DateTimeFormat("en-IN", {
          timeZone: "Asia/Kolkata",
          dateStyle: "medium",
          timeStyle: "medium",
        }).format(new Date()),
      );
    };
    tick();
    const t = setInterval(tick, 1000);
    return () => clearInterval(t);
  }, []);

  // Client-side scheduler: poll Tatkal due bookings every 8s
  useEffect(() => {
    const t = setInterval(async () => {
      try {
        await fetch("/api/schedule/tick", { method: "POST" });
        await refresh();
      } catch {
        /* ignore transient */
      }
    }, 8000);
    return () => clearInterval(t);
  }, [refresh]);

  return (
    <div className="shell">
      <div className="atmosphere" aria-hidden />
      <header className="topbar">
        <p className="brand">Tatkal Desk</p>
        <p className="ist-clock" suppressHydrationWarning>
          IST {clock || "—"}
        </p>
      </header>

      <main>
        <section className="hero">
          <div className="hero-copy">
            <p className="brand-mark">Tatkal Desk</p>
            <h1>Stage your train. Hit the window.</h1>
            <p className="lede">
              Capture IRCTC Tatkal details once. We arm a local trigger for
              10:00 / 11:00 IST and pause for CAPTCHA, OTP, and payment — you
              finish the human steps; we keep the queue ready.
            </p>
            <div className="cta-row">
              <a className="primary-btn" href="#compose">
                Compose booking
              </a>
              <a className="ghost-btn" href="#queue">
                Open queue
              </a>
            </div>
          </div>
        </section>

        <section className="status-strip" aria-label="Setup status">
          <div>
            <span className="meta-label">Credentials</span>
            <strong>
              {credentials?.configured
                ? `Env · ${credentials.usernameHint}`
                : "Missing — set IRCTC_USERNAME / IRCTC_PASSWORD in .env.local"}
            </strong>
          </div>
          <div>
            <span className="meta-label">Booking mode</span>
            <strong>{mode}</strong>
          </div>
          <div>
            <span className="meta-label">Tatkal windows</span>
            <strong>AC 10:00 · non-AC 11:00 IST (day before journey)</strong>
          </div>
        </section>

        <section id="compose" className="panel">
          <h2>Compose booking</h2>
          <p className="section-lede">
            One form — train, route, class, passengers, berth preference.
            Secrets stay in local env, never in this record.
          </p>
          <BookingForm onCreated={refresh} />
        </section>

        <section id="queue" className="panel">
          <h2>Booking queue</h2>
          <p className="section-lede">
            Arm a draft to wait for Tatkal open time. The desk ticks every few
            seconds while this page is open.
          </p>
          <BookingList bookings={bookings} onChanged={refresh} />
        </section>

        <section className="panel limits">
          <h2>What this MVP does — and does not</h2>
          <ul>
            <li>
              Saves booking drafts locally and computes Tatkal open time from
              class + journey date.
            </li>
            <li>
              Arms a scheduler trigger and runs a simulate path that pauses for
              CAPTCHA → OTP → payment.
            </li>
            <li>
              Does <em>not</em> silently book on IRCTC. There is no official
              public booking API; live automation needs attended browser work
              and must respect IRCTC terms.
            </li>
            <li>
              Never commits passwords, OTP, or CAPTCHA values to git or the
              booking JSON store.
            </li>
          </ul>
        </section>
      </main>
    </div>
  );
}
