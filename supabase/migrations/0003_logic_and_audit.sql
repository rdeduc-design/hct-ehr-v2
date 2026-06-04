-- ============================================================================
--  HCT EHR · 0003_logic_and_audit.sql
--  Append-only audit triggers + server-side clinical logic (NEWS2 scoring,
--  high-alert flagging) + new-user provisioning. Putting NEWS2 in the DB means
--  the score is computed identically no matter which client wrote the vitals,
--  and students can't fudge it on the front end.
-- ============================================================================

-- ---------------------------------------------------------------------------
-- Generic audit trigger: writes a row to audit_log for every clinical mutation
-- ---------------------------------------------------------------------------
create or replace function audit_row() returns trigger
language plpgsql security definer set search_path = public as $$
declare
  v_org uuid;
  v_rowid uuid;
begin
  -- best-effort tenant + row id extraction
  begin v_org := coalesce(new.organization_id, old.organization_id); exception when others then v_org := auth_org(); end;
  begin v_rowid := coalesce(new.id, old.id); exception when others then v_rowid := null; end;

  insert into audit_log(organization_id, actor_id, action, table_name, row_id, diff)
  values (
    v_org, auth.uid(), tg_op, tg_table_name, v_rowid,
    case tg_op
      when 'DELETE' then to_jsonb(old)
      when 'INSERT' then to_jsonb(new)
      else jsonb_build_object('old', to_jsonb(old), 'new', to_jsonb(new))
    end
  );
  return coalesce(new, old);
end $$;

-- Attach to the clinically sensitive tables
do $$
declare t text;
begin
  foreach t in array array[
    'patients','encounters','medication_orders','medication_administrations',
    'observations','clinical_notes','allergies','conditions','assessment_scores'
  ] loop
    execute format('create trigger trg_audit_%1$s after insert or update or delete on %1$s
                    for each row execute function audit_row();', t);
  end loop;
end $$;

-- ---------------------------------------------------------------------------
-- High-alert auto-flag: insulin / heparin / KCl etc. flagged at order time
-- ---------------------------------------------------------------------------
create or replace function flag_high_alert() returns trigger
language plpgsql as $$
declare kw text; hit boolean := false;
begin
  foreach kw in array array['insulin','heparin','warfarin','potassium chloride',
                            'kcl','magnesium sulfate','concentrated electrolyte',
                            'digoxin','opioid','morphine','fentanyl','hydromorphone']
  loop
    if position(kw in lower(new.drug_name)) > 0 then hit := true; exit; end if;
  end loop;
  new.is_high_alert := new.is_high_alert or hit;
  return new;
end $$;

create trigger trg_flag_high_alert before insert or update on medication_orders
for each row execute function flag_high_alert();

-- ---------------------------------------------------------------------------
-- NEWS2 scoring RPC. Pass the latest vital values; get back total + band and
-- persist an assessment_scores row. Standard Royal College of Physicians NEWS2.
-- ---------------------------------------------------------------------------
create or replace function score_news2(
  p_encounter uuid,
  p_rr int, p_spo2 numeric, p_on_o2 boolean,
  p_sbp int, p_hr int, p_temp numeric, p_consciousness text  -- 'A' alert or 'CVPU'
) returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  s_rr int; s_spo2 int; s_o2 int; s_sbp int; s_hr int; s_temp int; s_con int;
  total int; band text; jr jsonb;
begin
  -- respiratory rate
  s_rr := case when p_rr <= 8 then 3 when p_rr between 9 and 11 then 1
               when p_rr between 12 and 20 then 0 when p_rr between 21 and 24 then 2 else 3 end;
  -- SpO2 (scale 1)
  s_spo2 := case when p_spo2 <= 91 then 3 when p_spo2 between 92 and 93 then 2
                 when p_spo2 between 94 and 95 then 1 else 0 end;
  s_o2 := case when p_on_o2 then 2 else 0 end;
  -- systolic BP
  s_sbp := case when p_sbp <= 90 then 3 when p_sbp between 91 and 100 then 2
                when p_sbp between 101 and 110 then 1 when p_sbp between 111 and 219 then 0 else 3 end;
  -- heart rate
  s_hr := case when p_hr <= 40 then 3 when p_hr between 41 and 50 then 1
               when p_hr between 51 and 90 then 0 when p_hr between 91 and 110 then 1
               when p_hr between 111 and 130 then 2 else 3 end;
  -- temperature
  s_temp := case when p_temp <= 35.0 then 3 when p_temp between 35.1 and 36.0 then 1
                 when p_temp between 36.1 and 38.0 then 0 when p_temp between 38.1 and 39.0 then 1 else 2 end;
  -- consciousness
  s_con := case when upper(p_consciousness) = 'A' then 0 else 3 end;

  total := s_rr + s_spo2 + s_o2 + s_sbp + s_hr + s_temp + s_con;
  band  := case when total >= 7 then 'high'
                when total between 5 and 6 then 'medium'
                when (s_rr=3 or s_spo2=3 or s_sbp=3 or s_hr=3 or s_temp=3 or s_con=3) then 'medium-single'
                else 'low' end;

  jr := jsonb_build_object('rr',s_rr,'spo2',s_spo2,'o2',s_o2,'sbp',s_sbp,
                           'hr',s_hr,'temp',s_temp,'consciousness',s_con);

  insert into assessment_scores(encounter_id, scale, total_score, risk_band, subscores, recorded_by)
  values (p_encounter, 'NEWS2', total, band, jr, auth.uid());

  return jsonb_build_object('total', total, 'band', band, 'subscores', jr);
end $$;

-- ---------------------------------------------------------------------------
-- New-user provisioning: when a Supabase auth user is created, mirror a profile.
-- Default org = HCT; role taken from signup metadata if present.
-- ---------------------------------------------------------------------------
create or replace function handle_new_user() returns trigger
language plpgsql security definer set search_path = public as $$
declare v_org uuid;
begin
  select id into v_org from organizations where slug = 'hct-academy' limit 1;
  insert into profiles(id, organization_id, full_name, role)
  values (
    new.id,
    coalesce((new.raw_user_meta_data->>'organization_id')::uuid, v_org),
    coalesce(new.raw_user_meta_data->>'full_name', split_part(new.email,'@',1)),
    coalesce((new.raw_user_meta_data->>'role')::app_role, 'student')
  );
  return new;
end $$;

create trigger trg_on_auth_user_created
after insert on auth.users
for each row execute function handle_new_user();
