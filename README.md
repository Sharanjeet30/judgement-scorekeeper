# Judgement Scorekeeper (Next.js + Tailwind, Local-First)

Mobile-friendly score keeping app for **Judgement / Oh Hell**.
- Enter players, per-round bids & tricks, choose the trump suit each round
- Exact-bid scoring (two modes): **Bid = points** or **10 + bid**
- Leaderboard & per-round progress sparkline
- Local-first persistence (browser `localStorage`); **Export/Import JSON** for portability

## Quick Start (Local)

```bash
# Node 18+ recommended
npm i     # or: pnpm i  OR  yarn
npm run dev
```

Open http://localhost:3000

## Deploy to Vercel

1. Create a new empty GitHub repo and upload this folder’s contents.
2. In Vercel, click **New Project → Import** that repo → **Deploy** (defaults are fine).
3. Done. (No env vars needed.)

## Notes

- No backend required. To make it multi-device in real time, add Supabase or Vercel Postgres later.
- Scoring modes:
  - **Bid = points (exact), else 0** (default)
  - **10 + bid (exact), else 0** (toggle in Settings)
- Data model lives in `lib/storage.ts`.
- All UI is in a single page (`app/page.tsx`) for simplicity.
