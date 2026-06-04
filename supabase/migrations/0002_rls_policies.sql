-- ============================================================================
--  HCT EHR · 0002_rls_policies.sql
--  Row-Level Security. This is the security boundary of the whole platform —
--  it is enforced by Postgres on EVERY query, so a stolen anon key cannot read
--  another organization's patients or another cohort's scenario.
--
--  Model
--  -----
--  * Tenant isolation: a row is visible only if its organization_id matches the
--    caller's org (read from the profiles row keyed by auth.uid()).
--  * Role gate:
--      - instructor / admin  -> full read/write within their org
--      - student             -> read patients/encounters belonging to a scenario
--                               assigned to them or their cohort; may WRITE their
--                               own charting (observations, notes, MAR, scores)
--                               but may not delete structural rows.
--  * service_role bypasses RLS (used by Edge Functions / seeding only).
-- ============================================================================

-- Helper: caller's organization
create or replace function auth_org() returns uuid
language sql stable security definer set search_path = public as $$
  select organization_id from profiles where id = auth.uid()
$$;

-- Helper: caller's role
create or replace function auth_role() returns app_role
language sql stable security definer set search_path = public as $$
  select role from profiles where id = auth.uid()
$$;

-- Helper: caller's cohort
create or replace function auth_cohort() returns uuid
language sql stable security definer set search_path = public as $$
  select cohort_id from profiles where id = auth.uid()
$$;

-- Helper: is this scenario assigned to the caller (student) ?
create or replace function student_can_see_scenario(scn uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from scenario_assignments a
    where a.scenario_id = scn
      and (a.student_id = auth.uid() or a.cohort_id = auth_cohort())
  )
$$;

-- Helper: does the caller (student or staff) have access to a given patient?
create or replace function can_access_patient(pid uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select case
    when auth_role() in ('instructor','admin') then
      exists(select 1 from patients p where p.id = pid and p.organization_id = auth_org())
    else
      exists(
        select 1 from patients p
        where p.id = pid
          and p.organization_id = auth_org()
          and (p.scenario_id is null or student_can_see_scenario(p.scenario_id))
      )
  end
$$;

-- ---------------------------------------------------------------------------
-- Enable RLS on every table
-- ---------------------------------------------------------------------------
alter table organizations enable row level security;
alter table cohorts enable row level security;
alter table profiles enable row level security;
alter table scenarios enable row level security;
alter table scenario_assignments enable row level security;
alter table care_settings enable row level security;
alter table rooms enable row level security;
alter table patients enable row level security;
alter table encounters enable row level security;
alter table allergies enable row level security;
alter table conditions enable row level security;
alter table medication_orders enable row level security;
alter table medication_administrations enable row level security;
alter table observations enable row level security;
alter table clinical_notes enable row level security;
alter table assessment_scores enable row level security;
alter table scenario_runtime enable row level security;
alter table audit_log enable row level security;

-- ---------------------------------------------------------------------------
-- profiles: a user reads their own profile + classmates in same org; staff all
-- ---------------------------------------------------------------------------
create policy profiles_self_read on profiles for select
  using (id = auth.uid() or organization_id = auth_org());
create policy profiles_self_update on profiles for update
  using (id = auth.uid());

-- ---------------------------------------------------------------------------
-- org / cohort: readable within tenant
-- ---------------------------------------------------------------------------
create policy org_read on organizations for select using (id = auth_org());
create policy cohort_read on cohorts for select using (organization_id = auth_org());

-- ---------------------------------------------------------------------------
-- scenarios: staff manage; students read only assigned & published
-- ---------------------------------------------------------------------------
create policy scenarios_staff_all on scenarios for all
  using (organization_id = auth_org() and auth_role() in ('instructor','admin'))
  with check (organization_id = auth_org() and auth_role() in ('instructor','admin'));
create policy scenarios_student_read on scenarios for select
  using (organization_id = auth_org() and is_published and student_can_see_scenario(id));

create policy assign_staff_all on scenario_assignments for all
  using (auth_role() in ('instructor','admin'))
  with check (auth_role() in ('instructor','admin'));
create policy assign_student_read on scenario_assignments for select
  using (student_id = auth.uid() or cohort_id = auth_cohort());

-- ---------------------------------------------------------------------------
-- facility structure: readable in tenant, writable by staff
-- ---------------------------------------------------------------------------
create policy cs_read on care_settings for select using (organization_id = auth_org());
create policy cs_write on care_settings for all
  using (organization_id = auth_org() and auth_role() in ('instructor','admin'))
  with check (organization_id = auth_org() and auth_role() in ('instructor','admin'));
create policy rooms_read on rooms for select
  using (exists(select 1 from care_settings c where c.id = care_setting_id and c.organization_id = auth_org()));
create policy rooms_write on rooms for all
  using (auth_role() in ('instructor','admin'))
  with check (auth_role() in ('instructor','admin'));

-- ---------------------------------------------------------------------------
-- patients & encounters: visibility via can_access_patient(); staff write,
-- students read-only on the demographic shell
-- ---------------------------------------------------------------------------
create policy patients_read on patients for select using (can_access_patient(id));
create policy patients_staff_write on patients for all
  using (organization_id = auth_org() and auth_role() in ('instructor','admin'))
  with check (organization_id = auth_org() and auth_role() in ('instructor','admin'));

create policy enc_read on encounters for select using (can_access_patient(patient_id));
create policy enc_staff_write on encounters for all
  using (organization_id = auth_org() and auth_role() in ('instructor','admin'))
  with check (organization_id = auth_org() and auth_role() in ('instructor','admin'));

-- ---------------------------------------------------------------------------
-- Chart data: read if patient is accessible; students MAY chart (write) but
-- cannot delete. Helper macro pattern repeated per table.
-- ---------------------------------------------------------------------------
-- allergies
create policy allergies_read on allergies for select using (can_access_patient(patient_id));
create policy allergies_write on allergies for insert with check (can_access_patient(patient_id));
create policy allergies_update on allergies for update using (can_access_patient(patient_id));

-- conditions
create policy cond_read on conditions for select using (can_access_patient(patient_id));
create policy cond_write on conditions for insert with check (can_access_patient(patient_id));
create policy cond_update on conditions for update using (can_access_patient(patient_id));

-- medication orders (staff order; students administer, see below)
create policy mo_read on medication_orders for select
  using (exists(select 1 from encounters e where e.id = encounter_id and can_access_patient(e.patient_id)));
create policy mo_staff_write on medication_orders for all
  using (exists(select 1 from encounters e where e.id = encounter_id and e.organization_id = auth_org())
         and auth_role() in ('instructor','admin'))
  with check (exists(select 1 from encounters e where e.id = encounter_id and e.organization_id = auth_org())
         and auth_role() in ('instructor','admin'));

-- medication administrations (the student charting action)
create policy ma_read on medication_administrations for select
  using (exists(select 1 from medication_orders o join encounters e on e.id=o.encounter_id
               where o.id = order_id and can_access_patient(e.patient_id)));
create policy ma_write on medication_administrations for insert
  with check (exists(select 1 from medication_orders o join encounters e on e.id=o.encounter_id
               where o.id = order_id and can_access_patient(e.patient_id)));
create policy ma_update on medication_administrations for update
  using (exists(select 1 from medication_orders o join encounters e on e.id=o.encounter_id
               where o.id = order_id and can_access_patient(e.patient_id)));

-- observations / notes / scores: read+write if patient accessible
create policy obs_read on observations for select
  using (exists(select 1 from encounters e where e.id = encounter_id and can_access_patient(e.patient_id)));
create policy obs_write on observations for insert
  with check (exists(select 1 from encounters e where e.id = encounter_id and can_access_patient(e.patient_id)));
create policy obs_update on observations for update
  using (exists(select 1 from encounters e where e.id = encounter_id and can_access_patient(e.patient_id)));

create policy notes_read on clinical_notes for select
  using (exists(select 1 from encounters e where e.id = encounter_id and can_access_patient(e.patient_id)));
create policy notes_write on clinical_notes for insert
  with check (exists(select 1 from encounters e where e.id = encounter_id and can_access_patient(e.patient_id)));

create policy scores_read on assessment_scores for select
  using (exists(select 1 from encounters e where e.id = encounter_id and can_access_patient(e.patient_id)));
create policy scores_write on assessment_scores for insert
  with check (exists(select 1 from encounters e where e.id = encounter_id and can_access_patient(e.patient_id)));

-- runtime: staff drive it, students read it
create policy rt_read on scenario_runtime for select
  using (exists(select 1 from encounters e where e.id = encounter_id and can_access_patient(e.patient_id)));
create policy rt_write on scenario_runtime for all
  using (exists(select 1 from encounters e where e.id = encounter_id and e.organization_id = auth_org())
         and auth_role() in ('instructor','admin'))
  with check (exists(select 1 from encounters e where e.id = encounter_id and e.organization_id = auth_org())
         and auth_role() in ('instructor','admin'));

-- audit log: append-only; staff may read their org's trail, nobody updates/deletes
create policy audit_staff_read on audit_log for select
  using (organization_id = auth_org() and auth_role() in ('instructor','admin'));
