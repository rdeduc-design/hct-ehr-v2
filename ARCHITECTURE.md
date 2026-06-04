# HCT EHR — System Architecture

A production-oriented redesign of the HCT Academy student EHR. The existing
single-file app (`hct-ehr.html`, ~6,300 lines) is an excellent **front-end
prototype** — rich charting, MAR, NEWS2, I&O. What it lacks is everything that
makes a product: a real database, authentication, per-user authorization, an
audit trail, multi-user collaboration, and a codebase that more than one person
can work in. This design supplies that layer while preserving the existing look
and clinical model.

> **Scope of this MVP.** The backend (schema, RLS, audit, Edge Functions) is
> complete and the front-end is a runnable, modular slice (auth → roster →
> chart → vitals/MAR/notes → scenarios) that proves the architecture end to
> end. The remaining chart sections from the prototype's `NAV` taxonomy
> (flowsheets, the 30+ clinical scales, OB/respiratory) are migrated by writing
> one `sections.js` function each — the seam is in place.

---

## 1. Architecture

### Topology
```
        ┌──────────────────────────────────────────────┐
        │  Browser (static, GitHub Pages — no build)    │
        │  ES modules · import map · localStorage cache │
        │  ┌──────────┐  ┌────────┐  ┌────────────────┐ │
        │  │ features │→ │ core   │→ │ api.js (one     │ │
        │  │ (views)  │  │ store, │  │ data-access     │ │
        │  └──────────┘  │ router │  │ layer)          │ │
        │                └────────┘  └───────┬─────────┘ │
        └────────────────────────────────────┼───────────┘
                          HTTPS (JWT)         │
        ┌─────────────────────────────────────▼──────────┐
        │                 Supabase                        │
        │  Auth ── Postgres(RLS) ── Realtime ── Storage   │
        │                    │                            │
        │            Edge Functions (Deno)                │
        │    adaptive-vitals · generate-report            │
        └─────────────────────────────────────────────────┘
```

### Key decisions and the reasoning
- **Supabase, not a custom server.** It bundles Postgres, Auth, an auto-generated
  REST API (PostgREST), Realtime, and serverless functions. For a solo R&D team
  this removes an entire ops surface (no Node server to host, patch, or scale)
  while still being plain Postgres underneath — no lock-in at the data layer.
  This also matches the stack already standardized across HCT tools.
- **No front-end build step.** Native ES modules + an import map deploy to
  GitHub Pages exactly as written. There is no webpack/Vite pipeline to break,
  which keeps the barrier to contribution and deployment near zero. A bundler
  can be added later without changing module boundaries.
- **Security lives in the database (RLS), not the client.** Every table has
  row-level security; the browser holds only the public anon key. A leaked key
  cannot read another organization's patients or another cohort's scenario,
  because Postgres re-checks the caller's identity on every row. This is the
  single most important difference from the prototype, where all "security" was
  cosmetic role-gating in JavaScript.
- **One data-access layer (`api.js`) with an offline adapter.** Features never
  touch Supabase directly. The same UI runs against Supabase in production or
  `localStorage` in demo/offline mode, so a student can open the GitHub Pages
  URL with zero backend and still use the app — preserving the prototype's
  dependency-free spirit.
- **FHIR-influenced data model.** Vitals and labs share one `observations`
  table (FHIR `Observation`), assessment scales share one `assessment_scores`
  table. Adding the 30+ scales from the prototype needs **no schema change** —
  just rows. This is how real EHRs avoid dozens of narrow tables.
- **Multi-tenant from day one.** Every clinical row carries `organization_id`,
  so the platform can host partner schools (e.g. St. Dominic College of Asia)
  later without a migration.

### How the prototype's concepts map
| Prototype (in-memory JS) | This system (Postgres) |
|---|---|
| `WARDS`, `OPD_CLINICS`, `LTC_WINGS` | `care_settings(kind)` + `rooms` |
| `PATIENTS[ward]` array | `patients` + `encounters` (status, room, physician) |
| `dx` field | `encounters.chief_complaint` |
| `MAR_MEDS`, `MAR_HISTORY` | `medication_orders` + `medication_administrations` |
| `VS_DATA`, `LAB_DATA` | `observations(category)` |
| `GCS/Morse/Braden/NEWS2` panels | `assessment_scores(scale, subscores)` |
| `ALLERGIES`, problem list | `allergies`, `conditions` |
| client `window.print()` (blank bug) | `generate-report` Edge Function |
| client role flags | RLS policies + JWT role claim |
| (none) | `audit_log`, `scenario_runtime`, Realtime presence |

---

## 2. File structure
```
hct-ehr/
├── public/
│   ├── index.html              # app shell, import map, single mount point
│   └── assets/styles.css       # design tokens lifted from the prototype
├── src/
│   ├── main.js                 # bootstrap: routes + auth guard
│   ├── config.js               # public config + feature flags + OFFLINE switch
│   ├── core/
│   │   ├── supabase.js         # client singleton (null when offline)
│   │   ├── api.js              # THE data-access layer (Supabase | localStorage)
│   │   ├── auth.js             # session + role
│   │   ├── store.js            # tiny reactive store
│   │   ├── router.js           # hash router (GitHub-Pages friendly)
│   │   └── realtime.js         # presence + collaborative charting
│   ├── ui/
│   │   ├── shell.js            # top bar, tabs, breadcrumb
│   │   ├── components.js       # render helpers
│   │   └── toast.js            # alert engine surface
│   └── features/
│       ├── auth/login.js
│       ├── roster/roster.js    # settings grid + patient list
│       ├── chart/chart.js      # chart orchestrator (nav, banner, print)
│       ├── chart/sections.js   # summary · vitals · MAR · notes
│       └── scenarios/scenarios.js  # instructor adaptive-engine control
├── supabase/
│   ├── migrations/             # 0001 schema · 0002 RLS · 0003 logic/audit · 0004 seed
│   ├── functions/              # adaptive-vitals · generate-report · _shared
│   └── config.toml
└── docs/api.md                 # the API contract (item 4)
```
Module boundaries are the contribution unit: a new chart section is one function
in `sections.js`; a new data type is one method in `api.js` + one migration.

---

## 3. Database schema
Full DDL in `supabase/migrations/`. Shape:

- **Tenancy/identity:** `organizations`, `cohorts`, `profiles` (mirrors
  `auth.users`, holds `role` + `organization_id`).
- **Simulation:** `scenarios`, `scenario_assignments`, `scenario_runtime`
  (the live adaptive-engine state per encounter).
- **Facility:** `care_settings` (ward/opd/ltc), `rooms`.
- **Clinical core:** `patients`, `encounters`, `allergies`, `conditions`,
  `medication_orders`, `medication_administrations`, `observations`
  (vitals+labs+I/O), `clinical_notes`, `assessment_scores`.
- **Governance:** `audit_log` (append-only).

Notable logic that lives in the DB (so it's identical for every client):
- `score_news2(...)` — Royal College of Physicians NEWS2, persists a score row.
- `flag_high_alert()` — auto-flags insulin/heparin/KCl/opioids at order time.
- `audit_row()` — trigger writing every clinical INSERT/UPDATE/DELETE to
  `audit_log` with the actor and a JSON diff.
- `handle_new_user()` — provisions a `profiles` row on signup.

Indexing: trigram index on `patients.full_name` for fuzzy search;
composite indexes on `(encounter_id, category, code, recorded_at)` for vitals
trends; foreign-key indexes throughout. Soft-delete (`deleted_at`) on clinical
tables — EHR data is never hard-deleted.

---

## 4. API
Two surfaces, fully specified in `docs/api.md`:

1. **PostgREST (auto-generated REST over the tables)** — the front-end uses the
   `supabase-js` query builder, which compiles to these endpoints. RLS applies
   to every call. Examples: `GET /rest/v1/encounters?care_setting_id=eq.<id>`,
   `POST /rest/v1/observations`.
2. **RPC + Edge Functions (business logic):**
   - `POST /rest/v1/rpc/score_news2` — server-authoritative NEWS2.
   - `POST /functions/v1/adaptive-vitals` — advance a scenario; drifts vitals,
     re-scores, fans out via Realtime.
   - `POST /functions/v1/generate-report` — server-rendered, print-ready PEARLS
     after-action report (fixes the prototype's blank Print Report).

---

## 5. UI architecture
- **Shell + views.** `shell.js` renders persistent chrome once; feature modules
  render into `#view-root`. The chart has its own internal nav (`chart.js`)
  driving section renderers (`sections.js`).
- **State.** A single reactive `store` (session, current tab/setting/patient/
  section, realtime presence). Features subscribe and re-render on change — no
  framework, ~30 lines.
- **Routing.** Hash-based, so deep links (`#/chart/<id>/vitals`) survive a
  refresh on GitHub Pages with no server rewrites.
- **Data flow.** view → `api.js` → (Supabase | localStorage). Realtime inserts
  on the open encounter re-invoke the active section renderer, so two students
  charting the same patient see each other's entries live, with presence
  avatars in the banner.
- **Design system.** Tokens (`--navy`, `--teal`, DM Serif/DM Sans) are copied
  verbatim from the prototype; the new UI is visually continuous with it.

---

## Scaling path (startup MVP → real product)
1. **Now (MVP):** Supabase free tier, GitHub Pages, RLS, audit, Realtime,
   adaptive engine, offline demo mode.
2. **Pilot hardening:** lock CORS to the Pages origin; add `pg_cron` to tick the
   adaptive engine server-side; faculty clinical-content review workflow;
   structured `body` schemas for SBAR/flowsheet notes.
3. **Multi-institution:** the `organization_id` column is already the tenant
   boundary; onboard a partner school by inserting one `organizations` row.
   Move Edge Functions behind a queue if tick volume grows.
4. **Evidence layer:** an analytics schema (or read replica) aggregating
   `audit_log` + `assessment_scores` into learning-outcome dashboards — the
   prerequisite "published evidence" piece.
5. **PWA / phone-first:** add a service worker; the offline adapter in `api.js`
   already models the local-first data path.
```
```
