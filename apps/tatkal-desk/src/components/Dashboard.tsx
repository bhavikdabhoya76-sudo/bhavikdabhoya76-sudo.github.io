"use client";

import { useCallback, useEffect, useState } from "react";
import { BookingForm } from "@/components/BookingForm";
import { BookingList } from "@/components/BookingList";
import type { BookingRequest, CredentialStatus } from "@/lib/types";

type ApiPayload = {
  bookings: BookingRequest[];
  credentials: CredentialStatus;
  bookingMode: string;
  engine?: string;
};

export function Dashboard() {
  const [bookings, setBookings] = useState<BookingRequest[]>([]);
  const [credentials, setCredentials] = useState<CredentialStatus | null>(
    null,
  );
  const [mode, setMode] = useState("simulate");
  const [clock, setClock] = useState("");
  const [irctcNotice, setIrctcNotice] = useState<{
    kind: "error" | "ok";
    text: string;
  } | null>(null);

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

  // Client scheduler: advance Astra timeline from T−15 while page is open
  useEffect(() => {
    const t = setInterval(async () => {
      try {
        await fetch("/api/schedule/tick", { method: "POST" });
        await refresh();
      } catch {
        /* ignore transient */
      }
    }, 5000);
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
            <h1>Private Astra-style Tatkal — you stay in control.</h1>
            <p className="lede">
              Night-before form and checklist. Open IRCTC fills saved From, To,
              date, class, and Tatkal quota in a window you can see. You still
              type login, CAPTCHA, OTP, and payment — no ChatGPT, no password
              in chat.
            </p>
            <div className="cta-row">
              <a className="primary-btn" href="#compose">
                Night-before prep
              </a>
              <a className="ghost-btn" href="#queue">
                Timeline queue
              </a>
            </div>
          </div>
        </section>

        <section className="status-strip" aria-label="Setup status">
          <div>
            <span className="meta-label">Login</span>
            <strong>
              Attended HAND TO ME
              {credentials?.usernameHint
                ? ` · env hint ${credentials.usernameHint}`
                : " · password only in browser"}
            </strong>
          </div>
          <div>
            <span className="meta-label">Engine</span>
            <strong>
              private-astra ·{" "}
              {bookings.some(
                (b) =>
                  b.irctcWindow?.mode === "playwright" &&
                  b.irctcWindow.phase !== "failed" &&
                  b.irctcWindow.phase !== "closed",
              )
                ? "playwright"
                : mode}
            </strong>
            {irctcNotice && (
              <p className={`engine-note ${irctcNotice.kind}`} role="alert">
                {irctcNotice.text}
              </p>
            )}
          </div>
          <div>
            <span className="meta-label">Tatkal windows</span>
            <strong>AC 10:00 · non-AC 11:00 IST (day before)</strong>
          </div>
        </section>

        <section id="compose" className="panel">
          <h2>Night-before prep</h2>
          <p className="section-lede">
            Same runbook as the Google Doc — journey fields, Master List names,
            fare cap, CNF-only, eWallet. Secrets never leave your machine for an
            LLM.
          </p>
          <BookingForm onCreated={refresh} />
        </section>

        <section id="queue" className="panel">
          <h2>Timeline &amp; arming</h2>
          <p className="section-lede">
            Arm when checklist is done. Desk suggests start at T−15, login
            handoff at T−10, Search at T+0. Keep this tab open (or tick the
            schedule endpoint). Prefer waking yourself — do not trust cron alone.
          </p>
          <BookingList
            bookings={bookings}
            onChanged={refresh}
            onIrctcNotice={setIrctcNotice}
          />
        </section>

        <section className="panel limits">
          <h2>Honest limits</h2>
          <ul>
            <li>
              No CAPTCHA bypass, no silent full auto, no IRCTC password in Desk
              chat or any LLM.
            </li>
            <li>
              CNF-only and fare-cap stop are enforced in the runbook. On error:
              check Booked Ticket History and eWallet before any retry.
            </li>
            <li>
              Open IRCTC uses headed Chromium. If Playwright is missing, the
              page shows the error. One-time setup in Desktop\Tatkal-Desk:{" "}
              <code>npx playwright install chromium</code>
            </li>
            <li>
              IRCTC may flag automation — use only for your own travel, at your
              own risk. This app does not depend on OpenAI / ChatGPT / Astra.
            </li>
          </ul>
        </section>
      </main>
    </div>
  );
}
