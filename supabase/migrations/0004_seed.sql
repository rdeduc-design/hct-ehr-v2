-- ============================================================================
--  HCT EHR · 0004_seed.sql
--  Seed the HCT tenant, facility structure, one demo scenario, and a handful of
--  patients drawn from the existing single-file app so the new backend renders
--  identically on first boot. Run with the SERVICE ROLE (bypasses RLS).
--  Idempotent-ish: safe to run once on a fresh project.
-- ============================================================================

-- Tenant ----------------------------------------------------------------------
insert into organizations(id, name, slug)
values ('00000000-0000-0000-0000-0000000000aa','Healthcare and Technology Institute Inc.','hct-academy')
on conflict (slug) do nothing;

insert into cohorts(id, organization_id, name, term)
values ('00000000-0000-0000-0000-0000000000bb',
        '00000000-0000-0000-0000-0000000000aa','BSN 3 · Co-Simulationists','AY 2026')
on conflict do nothing;

-- Demo scenario ---------------------------------------------------------------
insert into scenarios(id, organization_id, title, specialty, difficulty, is_published, learning_objectives)
values ('00000000-0000-0000-0000-0000000000cc',
        '00000000-0000-0000-0000-0000000000aa',
        'General Acute Care Ward — Baseline Cohort','Med-Surg','intermediate', true,
        '["Demonstrate safe medication administration using the rights of medication.",
          "Interpret a deteriorating NEWS2 trend and escalate per protocol.",
          "Document a structured SBAR handoff."]')
on conflict do nothing;

-- Care settings (wards) -------------------------------------------------------
insert into care_settings(organization_id, kind, code, name, description, capacity, color_class) values
('00000000-0000-0000-0000-0000000000aa','ward','icu','Intensive Care Unit','Critical care requiring continuous monitoring.',12,'c-red'),
('00000000-0000-0000-0000-0000000000aa','ward','pedia','Pediatric Ward','Care for infants, children, and adolescents up to 18 years.',20,'c-purple'),
('00000000-0000-0000-0000-0000000000aa','ward','ob','Obstetrics & Gynecology','Labor, delivery, and postpartum care.',18,'c-pink'),
('00000000-0000-0000-0000-0000000000aa','ward','med','Medical Ward','General internal medicine for adult patients.',30,'c-teal'),
('00000000-0000-0000-0000-0000000000aa','ward','surg','Surgical Ward','Pre- and post-operative surgical care.',24,'c-amber'),
('00000000-0000-0000-0000-0000000000aa','ward','er','Emergency Room','Urgent and emergency care.',16,'c-red'),
('00000000-0000-0000-0000-0000000000aa','opd','cardio','Cardiology Clinic','Heart disease, hypertension, heart failure.',24,'c-red'),
('00000000-0000-0000-0000-0000000000aa','opd','endo','Endocrinology Clinic','Diabetes, thyroid, hormonal disorders.',20,'c-amber'),
('00000000-0000-0000-0000-0000000000aa','ltc','general','General Care Wing','Daily nursing assistance with ADLs.',20,'c-teal'),
('00000000-0000-0000-0000-0000000000aa','ltc','memory','Memory Care Unit','Secure dementia and Alzheimer''s care.',15,'c-purple')
on conflict do nothing;

-- Rooms for ICU + Medical (others follow same pattern) ------------------------
insert into rooms(care_setting_id, label)
select c.id, r.label
from care_settings c
join (values ('icu','ICU-1'),('icu','ICU-2'),('icu','ICU-3'),('icu','ICU-4'),
             ('med','MW-301'),('med','MW-302'),('med','MW-303'),('med','MW-304')) as r(code,label)
  on r.code = c.code
where c.organization_id='00000000-0000-0000-0000-0000000000aa'
on conflict do nothing;

-- A few patients + encounters from the existing dataset -----------------------
-- Using a CTE so we capture the generated ids for the encounter rows.
with ins as (
  insert into patients(organization_id, scenario_id, mrn, full_name, dob, sex) values
  ('00000000-0000-0000-0000-0000000000aa','00000000-0000-0000-0000-0000000000cc','100231','Ricardo Villanueva','1958-03-14','M'),
  ('00000000-0000-0000-0000-0000000000aa','00000000-0000-0000-0000-0000000000cc','100232','Corazon Reyes','1972-06-22','F'),
  ('00000000-0000-0000-0000-0000000000aa','00000000-0000-0000-0000-0000000000cc','100245','Benjamin Magno','1968-05-17','M'),
  ('00000000-0000-0000-0000-0000000000aa','00000000-0000-0000-0000-0000000000cc','100246','Teresita Llaneta','1961-02-28','F')
  returning id, mrn
)
insert into encounters(organization_id, patient_id, care_setting_id, room_id, visit_type, status, chief_complaint, admitting_physician, admitted_at)
select '00000000-0000-0000-0000-0000000000aa', ins.id,
       cs.id, rm.id, 'inpatient'::visit_type, d.status::encounter_status, d.cc, d.doc, d.adm::timestamptz
from ins
join (values
  ('100231','icu','ICU-1','critical','Acute Myocardial Infarction','Dr. Lim','2026-05-28'),
  ('100232','icu','ICU-2','critical','Septic Shock','Dr. Mendoza','2026-05-29'),
  ('100245','med','MW-301','admitted','Type 2 DM with DKA','Dr. Reyes','2026-05-31'),
  ('100246','med','MW-302','admitted','Hypertensive Crisis','Dr. Lim','2026-05-30')
) as d(mrn,ward,room,status,cc,doc,adm) on d.mrn = ins.mrn
join care_settings cs on cs.code = d.ward and cs.organization_id='00000000-0000-0000-0000-0000000000aa'
join rooms rm on rm.label = d.room and rm.care_setting_id = cs.id;

-- Sample allergy, condition, and a med order so the chart isn't empty ----------
insert into allergies(patient_id, substance, category, reactions, severity)
select id,'Penicillin','medication',array['Rash','Hives'],'moderate' from patients where mrn='100231';

insert into conditions(patient_id, label, status)
select id,'Coronary Artery Disease','active' from patients where mrn='100231';

insert into medication_orders(encounter_id, drug_name, dose, route, frequency)
select e.id,'Aspirin','80 mg','PO','OD'
from encounters e join patients p on p.id=e.patient_id where p.mrn='100231';

insert into medication_orders(encounter_id, drug_name, dose, route, frequency)
select e.id,'Insulin glargine','20 units','SC','HS'   -- auto-flagged high-alert
from encounters e join patients p on p.id=e.patient_id where p.mrn='100245';
