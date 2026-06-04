# HCT EHR

A production-oriented Electronic Health Record for HCT Academy's nursing
simulation program. Modular static front-end (deploys to GitHub Pages, no build
step) on a Supabase backend (Postgres + Auth + Row-Level Security + Realtime +
Edge Functions). See **`ARCHITECTURE.md`** for the full design and
**`docs/api.md`** for the API contract.

## Run it in 30 seconds (offline demo — no backend)
```bash
npm run dev          # serves ./public on http://localhost:5173
```
`config.js` ships with empty Supabase keys, so the app runs in **OFFLINE mode**:
all data lives in `localStorage`, seeded to match the database. Sign in with any
email/password and pick a role (student vs instructor changes what you can see).
This also works when deployed straight to GitHub Pages.

## Connect the real backend
1. Create a Supabase project. Copy the URL + anon key into `src/config.js`.
2. Apply the schema (in order):
   ```bash
   supabase db push          # runs supabase/migrations/0001..0004
   ```
   Run `0004_seed.sql` once (service role) to load HCT, wards, and demo patients.
3. Deploy the Edge Functions:
   ```bash
   supabase functions deploy adaptive-vitals generate-report
   ```
4. Reload — the app is now live, multi-user, and audited. RLS means students
   only see scenarios assigned to them.

## What's implemented
- Auth + role-aware UI (student / instructor) backed by RLS.
- Roster: wards / OPD clinics / LTC wings → patient lists → chart.
- Chart: identity + allergy banner, **Visit Summary, Vital Signs (auto-NEWS2),
  MAR (high-alert independent double-check), Notes/SBAR**.
- **Adaptive vitals engine** (instructor): drive a patient deteriorating /
  improving; nurse interventions bend the trajectory.
- **Realtime collaborative charting** + presence avatars.
- **Server-rendered PEARLS after-action report** (fixes the blank-print bug).
- Append-only **audit log** on every clinical mutation.

## Extending
- **New chart section:** add one function to `src/features/chart/sections.js`
  and register it in the `SECTIONS` array in `chart.js`. The prototype's full
  `NAV` (flowsheets, 30+ scales, OB, respiratory) migrates this way — most reuse
  the generic `observations` / `assessment_scores` tables, so no schema change.
- **New data type:** one method in `src/core/api.js` + one migration.

## Project layout
```
public/   static shell + styles
src/      core (data/auth/router/store/realtime) · ui · features
supabase/ migrations · functions · config
docs/     api.md
```
