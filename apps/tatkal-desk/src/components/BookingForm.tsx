"use client";

import { useMemo, useState, type FormEvent } from "react";
import type {
  BerthPreference,
  CreateBookingInput,
  PrepChecklist,
  TrainClass,
} from "@/lib/types";

const CLASSES: TrainClass[] = [
  "1A",
  "2A",
  "3A",
  "3E",
  "CC",
  "EC",
  "SL",
  "2S",
];

const BERTHS: { value: BerthPreference; label: string }[] = [
  { value: "NO_PREF", label: "No preference" },
  { value: "LOWER", label: "Lower" },
  { value: "MIDDLE", label: "Middle" },
  { value: "UPPER", label: "Upper" },
  { value: "SIDE_LOWER", label: "Side lower" },
  { value: "SIDE_UPPER", label: "Side upper" },
];

type PassengerDraft = {
  name: string;
  age: number;
  gender: "M" | "F" | "T";
  berthPreference: BerthPreference;
};

const emptyPassenger = (): PassengerDraft => ({
  name: "",
  age: 30,
  gender: "M",
  berthPreference: "NO_PREF",
});

const emptyChecklist = (): PrepChecklist => ({
  aadhaarVerified: false,
  masterListSaved: false,
  ewalletFunded: false,
  journeyDetailsReady: false,
  antiDoubleBookAck: false,
});

type Props = {
  onCreated: () => void;
};

export function BookingForm({ onCreated }: Props) {
  const [trainNumber, setTrainNumber] = useState("");
  const [trainName, setTrainName] = useState("");
  const [fromStation, setFromStation] = useState("");
  const [toStation, setToStation] = useState("");
  const [journeyDate, setJourneyDate] = useState("");
  const [trainClass, setTrainClass] = useState<TrainClass>("3A");
  const [fareCap, setFareCap] = useState(5000);
  const [mobile, setMobile] = useState("");
  const [notes, setNotes] = useState("");
  const [passengers, setPassengers] = useState<PassengerDraft[]>([
    emptyPassenger(),
  ]);
  const [checklist, setChecklist] = useState<PrepChecklist>(emptyChecklist);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [ok, setOk] = useState<string | null>(null);

  const openHint = useMemo(() => {
    const ac = ["1A", "2A", "3A", "3E", "CC", "EC", "FC"].includes(trainClass);
    return ac
      ? "AC → Tatkal opens 10:00 AM IST (day before journey)"
      : "Non-AC → Tatkal opens 11:00 AM IST (day before journey)";
  }, [trainClass]);

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    setOk(null);

    const payload: CreateBookingInput = {
      trainNumber,
      trainName: trainName || undefined,
      fromStation,
      toStation,
      journeyDate,
      trainClass,
      quota: "TQ",
      mobile: mobile || undefined,
      notes: notes || undefined,
      fareCap,
      checklist,
      passengers,
    };

    try {
      const res = await fetch("/api/bookings", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Failed to save");
      setOk("Draft saved. Arm when checklist is complete and you are ready.");
      setPassengers([emptyPassenger()]);
      setTrainNumber("");
      setTrainName("");
      setNotes("");
      onCreated();
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(false);
    }
  }

  function toggleCheck(key: keyof PrepChecklist) {
    setChecklist((c) => ({ ...c, [key]: !c[key] }));
  }

  return (
    <form className="booking-form" onSubmit={onSubmit}>
      <div className="form-grid">
        <label>
          <span>Train number</span>
          <input
            required
            inputMode="numeric"
            placeholder="12951"
            value={trainNumber}
            onChange={(e) => setTrainNumber(e.target.value)}
          />
        </label>
        <label>
          <span>Train name (optional)</span>
          <input
            placeholder="Mumbai Rajdhani"
            value={trainName}
            onChange={(e) => setTrainName(e.target.value)}
          />
        </label>
        <label>
          <span>From (station code)</span>
          <input
            required
            placeholder="NDLS"
            value={fromStation}
            onChange={(e) => setFromStation(e.target.value)}
          />
        </label>
        <label>
          <span>To (station code)</span>
          <input
            required
            placeholder="MMCT"
            value={toStation}
            onChange={(e) => setToStation(e.target.value)}
          />
        </label>
        <label>
          <span>Journey date</span>
          <input
            required
            type="date"
            value={journeyDate}
            onChange={(e) => setJourneyDate(e.target.value)}
          />
        </label>
        <label>
          <span>Class</span>
          <select
            value={trainClass}
            onChange={(e) => setTrainClass(e.target.value as TrainClass)}
          >
            {CLASSES.map((c) => (
              <option key={c} value={c}>
                {c}
              </option>
            ))}
          </select>
        </label>
        <label>
          <span>Quota</span>
          <input value="TQ — Tatkal" disabled />
        </label>
        <label>
          <span>Max total fare (₹) — STOP if higher</span>
          <input
            required
            type="number"
            min={1}
            step={1}
            value={fareCap}
            onChange={(e) => setFareCap(Number(e.target.value))}
          />
        </label>
        <label>
          <span>Mobile (optional)</span>
          <input
            inputMode="tel"
            placeholder="10-digit"
            value={mobile}
            onChange={(e) => setMobile(e.target.value)}
          />
        </label>
        <label>
          <span>CNF / payment</span>
          <input value="CNF only · IRCTC eWallet" disabled />
        </label>
      </div>
      <p className="field-hint">{openHint}</p>

      <div className="passenger-block">
        <div className="passenger-head">
          <h3>Passengers (Master List names)</h3>
          <button
            type="button"
            className="ghost-btn"
            onClick={() =>
              setPassengers((p) =>
                p.length >= 6 ? p : [...p, emptyPassenger()],
              )
            }
          >
            Add passenger
          </button>
        </div>
        <p className="field-hint">
          Names must match IRCTC Master List exactly — the engine selects, never
          types new passengers.
        </p>
        {passengers.map((p, i) => (
          <div className="passenger-row" key={i}>
            <label>
              <span>Name as in Master List</span>
              <input
                required
                value={p.name}
                onChange={(e) => {
                  const next = [...passengers];
                  next[i] = { ...p, name: e.target.value };
                  setPassengers(next);
                }}
              />
            </label>
            <label>
              <span>Age</span>
              <input
                required
                type="number"
                min={1}
                max={120}
                value={p.age}
                onChange={(e) => {
                  const next = [...passengers];
                  next[i] = { ...p, age: Number(e.target.value) };
                  setPassengers(next);
                }}
              />
            </label>
            <label>
              <span>Gender</span>
              <select
                value={p.gender}
                onChange={(e) => {
                  const next = [...passengers];
                  next[i] = {
                    ...p,
                    gender: e.target.value as "M" | "F" | "T",
                  };
                  setPassengers(next);
                }}
              >
                <option value="M">Male</option>
                <option value="F">Female</option>
                <option value="T">Transgender</option>
              </select>
            </label>
            <label>
              <span>Berth</span>
              <select
                value={p.berthPreference}
                onChange={(e) => {
                  const next = [...passengers];
                  next[i] = {
                    ...p,
                    berthPreference: e.target.value as BerthPreference,
                  };
                  setPassengers(next);
                }}
              >
                {BERTHS.map((b) => (
                  <option key={b.value} value={b.value}>
                    {b.label}
                  </option>
                ))}
              </select>
            </label>
            {passengers.length > 1 && (
              <button
                type="button"
                className="ghost-btn remove"
                onClick={() =>
                  setPassengers((list) => list.filter((_, j) => j !== i))
                }
              >
                Remove
              </button>
            )}
          </div>
        ))}
      </div>

      <fieldset className="checklist-block">
        <legend>Night-before checklist</legend>
        <p className="field-hint">
          Same prerequisites as the Google Doc runbook. Arming requires all
          boxes.
        </p>
        <label className="check-row">
          <input
            type="checkbox"
            checked={checklist.aadhaarVerified}
            onChange={() => toggleCheck("aadhaarVerified")}
          />
          <span>Aadhaar-verified IRCTC account (OTP will come to phone)</span>
        </label>
        <label className="check-row">
          <input
            type="checkbox"
            checked={checklist.masterListSaved}
            onChange={() => toggleCheck("masterListSaved")}
          />
          <span>Every passenger saved in IRCTC Master List</span>
        </label>
        <label className="check-row">
          <input
            type="checkbox"
            checked={checklist.ewalletFunded}
            onChange={() => toggleCheck("ewalletFunded")}
          />
          <span>IRCTC eWallet funded (a little more than fare)</span>
        </label>
        <label className="check-row">
          <input
            type="checkbox"
            checked={checklist.journeyDetailsReady}
            onChange={() => toggleCheck("journeyDetailsReady")}
          />
          <span>Journey details ready (train, codes, date, class)</span>
        </label>
        <label className="check-row warn-check">
          <input
            type="checkbox"
            checked={checklist.antiDoubleBookAck}
            onChange={() => toggleCheck("antiDoubleBookAck")}
          />
          <span>
            Anti-double-book: I will not run Desk and the IRCTC app at the same
            time
          </span>
        </label>
      </fieldset>

      <label className="notes">
        <span>Notes</span>
        <textarea
          rows={2}
          placeholder="Coach preference, nearby train backup, etc."
          value={notes}
          onChange={(e) => setNotes(e.target.value)}
        />
      </label>

      <div className="form-actions">
        <button type="submit" className="primary-btn" disabled={busy}>
          {busy ? "Saving…" : "Save booking draft"}
        </button>
        {error && <p className="form-msg error">{error}</p>}
        {ok && <p className="form-msg ok">{ok}</p>}
      </div>
    </form>
  );
}
