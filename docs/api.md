# HCT EHR — API Contract

Base URL (online): `https://<project-ref>.supabase.co`
Auth: every request sends `apikey: <anon>` and `Authorization: Bearer <jwt>`.
**RLS is enforced on every endpoint** — a request only ever sees rows the
caller is entitled to (their org; for students, their assigned scenarios).

The front-end calls these through `supabase-js`; the raw shapes are documented
here so the contract is explicit and testable with `curl`/Postman.

---

## 1. Auth (Supabase Auth — GoTrue)
| Action | Method | Path |
|---|---|---|
| Sign up | POST | `/auth/v1/signup` `{ email, password, data:{full_name,role} }` |
| Sign in | POST | `/auth/v1/token?grant_type=password` `{ email, password }` |
| Refresh | POST | `/auth/v1/token?grant_type=refresh_token` |
| Sign out | POST | `/auth/v1/logout` |

On signup the `handle_new_user()` trigger creates the matching `profiles` row
(org = HCT, role from metadata).

---

## 2. Resource endpoints (PostgREST — auto REST over tables)
All support `select=`, filtering (`col=eq.value`), `order=`, `limit=`,
`Prefer: return=representation`.

### Care settings & roster
```
GET  /rest/v1/care_settings?kind=eq.ward&order=name
GET  /rest/v1/encounters?care_setting_id=eq.<id>&status=neq.closed
       &select=id,status,chief_complaint,room:rooms(label),patient:patients(*)
GET  /rest/v1/patients?full_name=ilike.*reyes*       # trigram fuzzy search
```

### Single patient chart
```
GET  /rest/v1/encounters?patient_id=eq.<id>&order=admitted_at.desc&limit=1
       &select=*,patient:patients(*),room:rooms(label)
GET  /rest/v1/allergies?patient_id=eq.<id>&deleted_at=is.null
GET  /rest/v1/conditions?patient_id=eq.<id>&deleted_at=is.null
```

### Observations (vitals + labs + I/O)
```
GET  /rest/v1/observations?encounter_id=eq.<id>&category=eq.vital-sign
       &order=recorded_at
POST /rest/v1/observations
     { encounter_id, category:"vital-sign", code:"HR",
       display:"Heart Rate", value_num:96, unit:"bpm" }
```

### Medications (MAR)
```
GET  /rest/v1/medication_orders?encounter_id=eq.<id>&deleted_at=is.null
POST /rest/v1/medication_administrations
     { order_id, status:"given", administered_at,
       administered_by, witnessed_by }   # witnessed_by required for high-alert
GET  /rest/v1/medication_administrations?order_id=eq.<id>&order=administered_at
```
Writing a `medication_orders` row auto-flags high-alert drugs server-side
(`flag_high_alert` trigger).

### Notes & scores
```
GET  /rest/v1/clinical_notes?encounter_id=eq.<id>&order=created_at
POST /rest/v1/clinical_notes  { encounter_id, kind:"sbar", body:{...}, text_body }
GET  /rest/v1/assessment_scores?encounter_id=eq.<id>&scale=eq.NEWS2&order=recorded_at
```

---

## 3. RPC (business logic in Postgres)
```
POST /rest/v1/rpc/score_news2
     { p_encounter, p_rr, p_spo2, p_on_o2, p_sbp, p_hr, p_temp, p_consciousness }
  -> { total: 6, band: "medium", subscores: { rr:1, spo2:2, ... } }
```
Authoritative NEWS2; also persists an `assessment_scores` row.

---

## 4. Edge Functions (Deno)
### adaptive-vitals — live deteriorating/improving engine
```
POST /functions/v1/adaptive-vitals
     { encounter_id, action? }      # action ∈ gave_o2|gave_fluids|gave_pressor|...
  -> { snapshot:{HR,RR,SPO2,BP_SYS,TEMP}, news2:{total,band}, phase }
```
Reads `scenario_runtime.phase`, drifts each vital one tick, writes new
`observations`, re-scores NEWS2, and (via Realtime) pushes the rows to every
connected nurse station. A nurse `action` bends the trajectory (intervention).

### generate-report — server-rendered PEARLS after-action report
```
POST /functions/v1/generate-report   { encounter_id }
  -> { html }    # complete, print-ready document
```
Runs under the caller's JWT (RLS still applies). The client prints it via a
hidden iframe — no reliance on live DOM, which is what made the old client-side
Print Report come out blank.

---

## 5. Realtime channels
```
channel  enc:<encounter_id>
  · postgres_changes INSERT on observations|clinical_notes|medication_administrations
       filter: encounter_id=eq.<id>
  · presence: { email, name }       # collaborator avatars on the chart
```

---

## Error model
PostgREST returns standard HTTP codes; RLS denials surface as `401/403` or an
empty result set (a row the caller can't see simply isn't returned). Edge
Functions return `{ error }` with a `4xx/5xx` status. The client `api.js` maps
these to user-facing toasts.
