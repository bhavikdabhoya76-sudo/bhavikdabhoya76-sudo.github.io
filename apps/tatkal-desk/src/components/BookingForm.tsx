"use client";

import { useState, type FormEvent } from "react";
import type {
  BerthPreference,
  CreateBookingInput,
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
  const [mobile, setMobile] = useState("");
  const [notes, setNotes] = useState("");
  const [passengers, setPassengers] = useState<PassengerDraft[]>([
    emptyPassenger(),
  ]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [ok, setOk] = useState<string | null>(null);

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
      setOk("Booking draft saved. Arm it when you are ready.");
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
          <span>From</span>
          <input
            required
            placeholder="NDLS"
            value={fromStation}
            onChange={(e) => setFromStation(e.target.value)}
          />
        </label>
        <label>
          <span>To</span>
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
          <span>Mobile (optional)</span>
          <input
            inputMode="tel"
            placeholder="10-digit"
            value={mobile}
            onChange={(e) => setMobile(e.target.value)}
          />
        </label>
      </div>

      <div className="passenger-block">
        <div className="passenger-head">
          <h3>Passengers</h3>
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
        {passengers.map((p, i) => (
          <div className="passenger-row" key={i}>
            <label>
              <span>Name</span>
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

      <label className="notes">
        <span>Notes</span>
        <textarea
          rows={2}
          placeholder="Coach preference, senior citizen, etc."
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
