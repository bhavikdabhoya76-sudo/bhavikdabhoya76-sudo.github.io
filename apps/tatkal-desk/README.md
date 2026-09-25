# Tatkal Desk — private Astra-style assistant

Self-hosted, attended IRCTC **Tatkal** helper. Same runbook as the Google Doc
(ChatGPT Astra flow), but **no ChatGPT / Astra / OpenAI dependency**.

Night-before form + checklist → T−15 / T−10 / T+0 timeline → HAND TO ME for
login, CAPTCHA, OTP, payment → final PNR / failure report in Desk.

---

## Windows Desktop — run steps / વિન્ડોઝ ડેસ્કટોપ — ચલાવવાની રીત

### English

1. **Install Node.js LTS** from [https://nodejs.org](https://nodejs.org) (v20+). Restart after install if needed.
2. Put this folder on your Desktop as `Tatkal-Desk` only (`%USERPROFILE%\Desktop\Tatkal-Desk`). Long AgentStores / Context paths break Next.js.
3. Before first run after a bad extract: delete if present `docs\node_modules`, `docs\package-lock.json`, and `docs\Tatkal-Desk-Desktop\` (nested under Context).
4. **Double-click `Start-Tatkal-Desk.bat`** (always runs from Desktop\Tatkal-Desk; zip next to bat auto-extracts there). Browser opens to http://localhost:3000.
5. Fill the night-before form + checklist → **Arm Astra timeline** → keep the tab open → complete **HAND TO ME** when prompted.

**Note:** `npm run dev` uses plain `next dev` (Turbopack disabled) to avoid Windows path-length FATAL errors on long folders.

Manual alternative (PowerShell / Command Prompt):

```bat
cd %USERPROFILE%\Desktop\Tatkal-Desk
copy .env.example .env.local
npm install
npm run dev
```

Optional: leave `IRCTC_PASSWORD` empty in `.env.local`. Type your password only in the IRCTC browser window during HAND TO ME.

### ગુજરાતી

1. **Node.js LTS** ઇન્સ્ટોલ કરો: [https://nodejs.org](https://nodejs.org) (v20+).
2. આ ફોલ્ડર Desktop પર `Tatkal-Desk` નામથી રાખો (zip હોય તો extract કરીને).
3. **`Start-Tatkal-Desk.bat` પર ડબલ-ક્લિક કરો** (પહેલી વાર packages install થઈ શકે; બ્રાઉઝર http://localhost:3000 ખુલશે).
4. રાત પહેલાંનું ફોર્મ + ચેકલિસ્ટ ભરો → **Arm Astra timeline** → ટેબ ખુલ્લી રાખો → **HAND TO ME** આવે ત્યારે login / CAPTCHA / OTP / payment પૂરું કરો.

નોંધ: `.env.local` માં પાસવર્ડ ખાલી રાખો. પાસવર્ડ ફક્ત IRCTC બ્રાઉઝરમાં જ ટાઈપ કરો — Desk અથવા chat માં નહીં.

---

## Quick start (any OS / monorepo)

```bash
cd apps/tatkal-desk   # or: cd Tatkal-Desk if using the Desktop zip
cp .env.example .env.local
npm install
npm run dev
```

Open [http://localhost:3000](http://localhost:3000).

### Optional Playwright scaffolding

```bash
npm i -D playwright
npx playwright install chromium
# Windows PowerShell:
$env:BOOKING_MODE="playwright"; npm run dev
# bash:
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
- Desktop zip guide: store `docs/desktop-install.md`
