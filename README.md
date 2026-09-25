# IRCTC Tatkal assistant

Monorepo root. The app lives in [`apps/tatkal-desk`](./apps/tatkal-desk).

```bash
cd apps/tatkal-desk
cp .env.example .env.local   # add IRCTC_USERNAME / IRCTC_PASSWORD
npm install
npm run dev
```

Open http://localhost:3000 — compose a booking, arm it for the Tatkal window,
complete CAPTCHA / OTP / payment when prompted.

**Secrets never go in git.** Use `.env.local` only.
