-- ============================================================================
--  HCT EHR · 0001_core_schema.sql
--  Postgres 15 / Supabase. FHIR-aligned, multi-tenant, simulation-aware.
--
--  Design notes
--  ------------
--  * Every clinical row is scoped by organization_id (multi-tenant from day 1)
--    so the platform can host HCT plus future partner schools without a rewrite.
--  * Identifiers are uuid (gen_random_uuid) — no sequential PKs leaking volume.
--  * "Observation" is a single FHIR-style table that holds BOTH vital signs and
--    lab results (category discriminates). This is how real EHRs avoid 40 narrow
--    tables; it is what the current single-file app is missing.
--  * Simulation is first-class: patients/encounters belong to a SCENARIO so an
--    instructor can reset a cohort's data without touching another section's.
--  * Soft-delete (deleted_at) everywhere clinical — EHR data is never hard-deleted.
-- ============================================================================

create extension if not exists "pgcrypto";   -- gen_random_uuid()
create extension if not exists "pg_trgm";     -- fuzzy patient search

-- ---------------------------------------------------------------------------
-- ENUMS
-- ---------------------------------------------------------------------------
create type app_role        as enum ('student','instructor','admin');
create type care_setting_kind as enum ('ward','opd','ltc');
create type visit_type       as enum ('inpatient','outpatient','ltc','emergency');
create type encounter_status as enum ('admitted','critical','discharge','isolation','closed');
create type obs_category     as enum ('vital-sign','laboratory','intake','output');
create type med_admin_status as enum ('scheduled','given','held','refused','missed','prn-given');
create type note_kind        as enum ('progress','nursing','sbar','assessment','shift-handoff','discharge');

-- ---------------------------------------------------------------------------
-- TENANCY & IDENTITY
-- ---------------------------------------------------------------------------
create table organizations (
  id          uuid primary key default gen_random_uuid(),
  name        text not null,
  slug        text unique not null,             -- e.g. 'hct-academy'
  created_at  timestamptz not null default now()
);

create table cohorts (
  id              uuid primary key default gen_random_uuid(),
  organization_id uuid not null references organizations(id) on delete cascade,
  name            text not null,                -- e.g. 'BSN 3A · AY2026'
  term            text,
  created_at      timestamptz not null default now()
);

-- Mirrors auth.users (Supabase) 1:1. role + tenant live here, surfaced into JWT.
create table profiles (
  id              uuid primary key references auth.users(id) on delete cascade,
  organization_id uuid not null references organizations(id),
  cohort_id       uuid references cohorts(id),
  full_name       text not null,
  role            app_role not null default 'student',
  student_no      text,
  created_at      timestamptz not null default now()
);
create index on profiles(organization_id);
create index on profiles(cohort_id);

-- ---------------------------------------------------------------------------
-- SIMULATION CONTAINER
-- A scenario is the unit an instructor builds, assigns, and resets.
-- ---------------------------------------------------------------------------
create table scenarios (
  id              uuid primary key default gen_random_uuid(),
  organization_id uuid not null references organizations(id) on delete cascade,
  title           text not null,
  specialty       text,                          -- 'OB', 'Pediatrics', ...
  difficulty      text default 'intermediate',
  framework       text default 'PEARLS',         -- debrief framework
  learning_objectives jsonb default '[]',        -- ["SMART obj", ...]
  is_published    boolean not null default false,
  created_by      uuid references profiles(id),
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now()
);

create table scenario_assignments (
  id          uuid primary key default gen_random_uuid(),
  scenario_id uuid not null references scenarios(id) on delete cascade,
  cohort_id   uuid references cohorts(id),
  student_id  uuid references profiles(id),      -- null = whole cohort
  due_at      timestamptz,
  created_at  timestamptz not null default now()
);

-- ---------------------------------------------------------------------------
-- FACILITY STRUCTURE  (wards / OPD clinics / LTC wings + rooms)
-- ---------------------------------------------------------------------------
create table care_settings (
  id              uuid primary key default gen_random_uuid(),
  organization_id uuid not null references organizations(id) on delete cascade,
  kind            care_setting_kind not null,
  code            text not null,                 -- 'icu','cardio','memory'
  name            text not null,
  description     text,
  capacity        int default 0,
  color_class     text,                          -- 'c-red' (reuse existing tokens)
  unique (organization_id, kind, code)
);

create table rooms (
  id              uuid primary key default gen_random_uuid(),
  care_setting_id uuid not null references care_settings(id) on delete cascade,
  label           text not null,                 -- 'ICU-1'
  unique (care_setting_id, label)
);

-- ---------------------------------------------------------------------------
-- PATIENT  (simulated person)
-- ---------------------------------------------------------------------------
create table patients (
  id              uuid primary key default gen_random_uuid(),
  organization_id uuid not null references organizations(id) on delete cascade,
  scenario_id     uuid references scenarios(id) on delete set null,
  mrn             text not null,                 -- medical record number
  full_name       text not null,
  dob             date,
  sex             text check (sex in ('M','F','X')),
  photo_url       text,
  created_at      timestamptz not null default now(),
  deleted_at      timestamptz,
  unique (organization_id, mrn)
);
create index on patients(organization_id);
create index on patients(scenario_id);
create index patients_name_trgm on patients using gin (full_name gin_trgm_ops);

-- ---------------------------------------------------------------------------
-- ENCOUNTER  (an admission / visit; chart data hangs off the encounter)
-- ---------------------------------------------------------------------------
create table encounters (
  id                  uuid primary key default gen_random_uuid(),
  organization_id     uuid not null references organizations(id) on delete cascade,
  patient_id          uuid not null references patients(id) on delete cascade,
  care_setting_id     uuid references care_settings(id),
  room_id             uuid references rooms(id),
  visit_type          visit_type not null default 'inpatient',
  status              encounter_status not null default 'admitted',
  chief_complaint     text,                      -- the old "dx"
  admitting_physician text,
  admitted_at         timestamptz not null default now(),
  discharged_at       timestamptz,
  created_at          timestamptz not null default now()
);
create index on encounters(patient_id);
create index on encounters(care_setting_id);
create index on encounters(organization_id, status);

-- ---------------------------------------------------------------------------
-- ALLERGIES  (drives the chart-wide allergy banner)
-- ---------------------------------------------------------------------------
create table allergies (
  id          uuid primary key default gen_random_uuid(),
  patient_id  uuid not null references patients(id) on delete cascade,
  substance   text not null,
  category    text,                              -- 'medication','food','environment'
  reactions   text[] default '{}',
  severity    text,                              -- 'mild','moderate','severe'
  noted_at    timestamptz not null default now(),
  recorded_by uuid references profiles(id),
  deleted_at  timestamptz
);
create index on allergies(patient_id);

-- ---------------------------------------------------------------------------
-- PROBLEM LIST / CONDITIONS
-- ---------------------------------------------------------------------------
create table conditions (
  id          uuid primary key default gen_random_uuid(),
  patient_id  uuid not null references patients(id) on delete cascade,
  encounter_id uuid references encounters(id) on delete set null,
  label       text not null,
  icd10       text,
  status      text default 'active',             -- active | resolved
  onset       date,
  recorded_by uuid references profiles(id),
  created_at  timestamptz not null default now(),
  deleted_at  timestamptz
);
create index on conditions(patient_id);

-- ---------------------------------------------------------------------------
-- MEDICATIONS  (orders + administration record = MAR)
-- ---------------------------------------------------------------------------
create table medication_orders (
  id            uuid primary key default gen_random_uuid(),
  encounter_id  uuid not null references encounters(id) on delete cascade,
  drug_name     text not null,
  dose          text,
  route         text,
  frequency     text,                            -- 'q8h','BID','PRN'
  is_prn        boolean not null default false,
  is_high_alert boolean not null default false,  -- insulin/heparin/KCl...
  start_at      timestamptz not null default now(),
  stop_at       timestamptz,
  ordered_by    text,
  created_at    timestamptz not null default now(),
  deleted_at    timestamptz
);
create index on medication_orders(encounter_id);

create table medication_administrations (
  id              uuid primary key default gen_random_uuid(),
  order_id        uuid not null references medication_orders(id) on delete cascade,
  scheduled_slot  timestamptz,                   -- the planned time (null for PRN)
  status          med_admin_status not null default 'scheduled',
  administered_at timestamptz,
  hold_reason     text,
  -- High-alert independent double-check (two-nurse verification)
  witnessed_by    uuid references profiles(id),
  administered_by uuid references profiles(id),
  note            text,
  created_at      timestamptz not null default now()
);
create index on medication_administrations(order_id);
create index on medication_administrations(scheduled_slot);

-- ---------------------------------------------------------------------------
-- OBSERVATIONS  (FHIR-style: vitals + labs + I/O in one table)
-- ---------------------------------------------------------------------------
create table observations (
  id            uuid primary key default gen_random_uuid(),
  encounter_id  uuid not null references encounters(id) on delete cascade,
  category      obs_category not null,
  code          text not null,                   -- 'HR','BP_SYS','NA','UOP'...
  display       text,                            -- 'Heart Rate'
  value_num     numeric,
  value_text    text,
  unit          text,
  ref_low       numeric,
  ref_high      numeric,
  abnormal_flag text,                             -- 'H','L','HH','LL', null
  recorded_at   timestamptz not null default now(),
  recorded_by   uuid references profiles(id),
  deleted_at    timestamptz
);
create index on observations(encounter_id, category, code, recorded_at);

-- ---------------------------------------------------------------------------
-- CLINICAL NOTES  (progress, nursing, SBAR, handoff…)
-- ---------------------------------------------------------------------------
create table clinical_notes (
  id           uuid primary key default gen_random_uuid(),
  encounter_id uuid not null references encounters(id) on delete cascade,
  kind         note_kind not null default 'nursing',
  body         jsonb not null default '{}',      -- {situation,background,...} for SBAR
  text_body    text,                             -- flat fallback / freetext
  author_id    uuid references profiles(id),
  created_at   timestamptz not null default now(),
  deleted_at   timestamptz
);
create index on clinical_notes(encounter_id, kind);

-- ---------------------------------------------------------------------------
-- ASSESSMENT SCORES  (GCS, Morse, Braden, NEWS2, PEWS, RASS, PHQ-9…)
-- One generic table; subscores live in jsonb so adding a scale needs no DDL.
-- ---------------------------------------------------------------------------
create table assessment_scores (
  id           uuid primary key default gen_random_uuid(),
  encounter_id uuid not null references encounters(id) on delete cascade,
  scale        text not null,                    -- 'NEWS2','MORSE','GCS'
  total_score  numeric,
  risk_band    text,                             -- 'low','medium','high'
  subscores    jsonb default '{}',
  recorded_at  timestamptz not null default now(),
  recorded_by  uuid references profiles(id)
);
create index on assessment_scores(encounter_id, scale, recorded_at);

-- ---------------------------------------------------------------------------
-- ADAPTIVE SCENARIO ENGINE STATE
-- The live "deteriorating/improving vitals" feature: the current trajectory of
-- a running encounter, advanced by the adaptive-vitals Edge Function.
-- ---------------------------------------------------------------------------
create table scenario_runtime (
  encounter_id uuid primary key references encounters(id) on delete cascade,
  phase        text not null default 'baseline', -- baseline|deteriorating|improving|stable
  trajectory   jsonb not null default '{}',      -- per-vital drift rules
  last_tick_at timestamptz not null default now(),
  is_active    boolean not null default false
);

-- ---------------------------------------------------------------------------
-- AUDIT LOG  (append-only; who touched what — non-negotiable for an EHR)
-- ---------------------------------------------------------------------------
create table audit_log (
  id              bigint generated always as identity primary key,
  organization_id uuid,
  actor_id        uuid,
  action          text not null,                 -- INSERT|UPDATE|DELETE|VIEW
  table_name      text not null,
  row_id          uuid,
  diff            jsonb,
  at              timestamptz not null default now()
);
create index on audit_log(table_name, row_id);
create index on audit_log(actor_id, at);

-- ---------------------------------------------------------------------------
-- updated_at touch trigger
-- ---------------------------------------------------------------------------
create or replace function touch_updated_at() returns trigger
language plpgsql as $$
begin new.updated_at = now(); return new; end $$;

create trigger trg_scenarios_touch before update on scenarios
for each row execute function touch_updated_at();
