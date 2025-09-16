# Judgement Scorekeeper (Next.js + Tailwind, Local-First)

Mobile-friendly score keeping app for **Judgement / Oh Hell**.
- Enter players, per-round bids & tricks, choose the trump suit each round
- Exact-bid scoring (two modes): **Bid = points** or **10 + bid**
- Leaderboard & per-round progress sparkline
- Local-first persistence (browser `localStorage`); **Export/Import JSON** for portability

## UI controls at a glance

- **Save Cloud** – Save the current game to Supabase using this game's ID (requires Supabase env vars).
- **Load Cloud** – Fetch a saved game from Supabase by entering its ID.
- **Live: ON/OFF** – Toggle automatic live sync via Supabase for everyone using the shared link.
- **Share Link** – Copy a link that opens this game (with live sync if enabled).
- **Create Descending Plan (Max → 1)** – Generate rounds that count down from the max hand size to one card.
- **Create Ascending Plan (1 → Max)** – Generate rounds that build up from one card to the max hand size.
- **Append Ascending Rounds (1 → Max)** – After reaching one card, add another pass that climbs back up.

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
