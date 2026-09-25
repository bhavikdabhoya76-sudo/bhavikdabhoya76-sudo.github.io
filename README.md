# IRCTC Tatkal assistant

Monorepo root. The app lives in [`apps/tatkal-desk`](./apps/tatkal-desk).

Private Astra-style Tatkal Desk — form + checklist + attended timeline.
**No ChatGPT / OpenAI dependency.**

```bash
cd apps/tatkal-desk
cp .env.example .env.local   # optional IRCTC_USERNAME; leave password empty
npm install
npm run dev
```

Open http://localhost:3000 — night-before prep → Arm Astra timeline → HAND TO ME
for login / CAPTCHA / OTP / payment.

**Secrets never go in git.** Prefer typing the IRCTC password only in the browser takeover.
