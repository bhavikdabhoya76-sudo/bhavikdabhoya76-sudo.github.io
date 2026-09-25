# Tatkal Desk

Personal IRCTC **Tatkal** booking assistant MVP.

Stage train + passenger details in a local dashboard, arm a trigger for the
Tatkal open window (**AC 10:00 AM IST / non-AC 11:00 AM IST**, day before
journey), then complete CAPTCHA → OTP → payment yourself. This does **not**
claim silent full auto-book against IRCTC.

## Quick start

```bash
cd apps/tatkal-desk
cp .env.example .env.local
# edit .env.local with IRCTC_USERNAME / IRCTC_PASSWORD
npm install
npm run dev
```

Open [http://localhost:3000](http://localhost:3000).

## What works

| Feature | Status |
| --- | --- |
| Booking form (train, stations, date, class, TQ, passengers, berth) | ✅ |
| Local JSON persistence (`data/bookings.json`, gitignored) | ✅ |
| Tatkal open-time calculation + countdown | ✅ |
| Arm / wait / scheduler tick (page polls `/api/schedule/tick`) | ✅ |
| Simulate booking path with human CAPTCHA/OTP/payment steps | ✅ |
| Credentials via `.env.local` only | ✅ |
| Live IRCTC browser booking | ⚠️ Stub — attended Playwright not bundled |

## Honest limits

- IRCTC has **no official public booking API** for personal automation.
- CAPTCHA, OTP, and payment are **human-in-the-loop** by design.
- Automating IRCTC may conflict with their Terms of Service — use only for
  your own account, at your own risk.
- `BOOKING_MODE=simulate` ends with a **placeholder PNR** so you can practice
  the queue without hitting IRCTC.

## API sketch

- `GET/POST /api/bookings`
- `GET/DELETE /api/bookings/:id`
- `POST /api/bookings/:id/arm` — body `{}` to arm, `{ "action": "cancel" }` to cancel
- `POST /api/bookings/:id/human-step` — `{ "step": "captcha"|"otp"|"payment", "value": "..." }`
- `POST /api/schedule/tick` — process due armed bookings
- `GET /api/health`

Human-step values are **not** written to the booking store.

## Plan doc

See the project plan (architecture + runbook) in the coordinator store:
`docs/tatkal-dashboard-plan.md`.
