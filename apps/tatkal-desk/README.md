# Tatkal Desk — private Astra-style assistant

Self-hosted, attended IRCTC **Tatkal** helper. Same runbook as the Google Doc
(ChatGPT Astra flow), but **no ChatGPT / Astra / OpenAI dependency**.

Night-before form + checklist → T−15 / T−10 / T+0 timeline → HAND TO ME for
login, CAPTCHA, OTP, payment → final PNR / failure report in Desk.

## Quick start (local)

```bash
cd apps/tatkal-desk
cp .env.example .env.local
# Optional: IRCTC_USERNAME only. Leave password empty — type it in browser takeover.
npm install
npm run dev
```

Open [http://localhost:3000](http://localhost:3000).

### Optional Playwright scaffolding

```bash
npm i -D playwright
npx playwright install chromium
BOOKING_MODE=playwright npm run dev
```

Live IRCTC selectors are **not** wired in this build (fragile + ToS). Playwright
mode logs the runbook and continues the same simulate timeline so you can
practice. Wire selectors on your machine before a real Tatkal morning.

## What works

| Feature | Status |
| --- | --- |
| Night-before form (train, station codes, date, class, TQ, fare cap, passengers) | ✅ |
| Checklist (Aadhaar, Master List, eWallet, anti-double-book) | ✅ |
| CNF-only + eWallet defaults | ✅ |
| Astra timeline: T−15 start · T−10 login · pre-fill · T−1 hold · T+0 Search | ✅ |
| HAND TO ME: login / CAPTCHA / OTP / payment (values not stored) | ✅ |
| Fare-cap stop + History/wallet guard messaging | ✅ |
| Final report (placeholder PNR in simulate) | ✅ |
| Session API `/api/bookings/:id/session` | ✅ |
| Playwright scaffolding (no ChatGPT) | ✅ stub |
| Live IRCTC book in cloud VM | ❌ — run attended locally |

## Human steps (you)

1. **Login** — take over browser; type IRCTC password yourself; submit `done` in Desk.
2. **CAPTCHA / OTP / txn password** — phone + eyes; ~5s handoffs.
3. Verify PNR in IRCTC Booked Ticket History after a real booking.

## Honest limits

- No CAPTCHA bypass, no silent full auto, no password-in-chat/LLM.
- Automating IRCTC may conflict with their Terms — own account, own risk.
- Prefer manual wake at T−15; do not trust cron alone.

## API

- `GET/POST /api/bookings`
- `GET/DELETE /api/bookings/:id`
- `POST /api/bookings/:id/arm` — `{ }` arm · `{ "action": "cancel" }`
- `POST /api/bookings/:id/human-step` — `{ "step", "value" }` (login value = `done`)
- `GET/POST /api/bookings/:id/session` — HAND TO ME session state
- `POST /api/schedule/tick` — advance from T−15

## Docs

- Project plan: store `docs/tatkal-dashboard-plan.md`
- Architecture choice: store `docs/auto-booking-structure.md` (private A-style)
