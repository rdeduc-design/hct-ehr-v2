// ============================================================================
//  core/api.js — the single data-access layer for the whole app.
//  Every feature talks to THIS, never to Supabase directly. That gives us:
//    * one place to enforce shapes,
//    * a localStorage adapter for OFFLINE/demo mode (mirrors the seed data),
//    * a clean seam to add caching, retries, or optimistic updates later.
//  In ONLINE mode each method maps to a PostgREST query or RPC.
// ============================================================================
import { sb } from "./supabase.js";
import { CONFIG } from "../config.js";

/* ---------------------------------------------------------------------------
 * OFFLINE adapter — seeded once into localStorage, mirrors 0004_seed.sql
 * ------------------------------------------------------------------------- */
const LS_KEY = "hct_ehr_offline_v1";

function seed() {
  const settings = [
    { id: "icu",  kind: "ward", code: "icu",  name: "Intensive Care Unit", description: "Critical care requiring continuous monitoring.", capacity: 12, color_class: "c-red" },
    { id: "med",  kind: "ward", code: "med",  name: "Medical Ward", description: "General internal medicine for adult patients.", capacity: 30, color_class: "c-teal" },
    { id: "pedia",kind: "ward", code: "pedia",name: "Pediatric Ward", description: "Care for children up to 18 years.", capacity: 20, color_class: "c-purple" },
    { id: "ob",   kind: "ward", code: "ob",   name: "Obstetrics & Gynecology", description: "Labor, delivery, postpartum.", capacity: 18, color_class: "c-pink" },
    { id: "cardio",kind:"opd",  code: "cardio",name:"Cardiology Clinic", description:"Heart disease, hypertension.", capacity: 24, color_class:"c-red" },
    { id: "general",kind:"ltc", code:"general",name:"General Care Wing", description:"Daily ADL nursing assistance.", capacity: 20, color_class:"c-teal" },
  ];
  const patients = [
    mk("p1","100231","Ricardo Villanueva","1958-03-14","M","icu","ICU-1","critical","Acute Myocardial Infarction","Dr. Lim"),
    mk("p2","100232","Corazon Reyes","1972-06-22","F","icu","ICU-2","critical","Septic Shock","Dr. Mendoza"),
    mk("p3","100245","Benjamin Magno","1968-05-17","M","med","MW-301","admitted","Type 2 DM with DKA","Dr. Reyes"),
    mk("p4","100246","Teresita Llaneta","1961-02-28","F","med","MW-302","admitted","Hypertensive Crisis","Dr. Lim"),
  ];
  const data = {
    settings, patients,
    allergies: { p1: [{ id: "a1", substance: "Penicillin", category: "medication", reactions: ["Rash","Hives"], severity: "moderate" }] },
    conditions: { p1: [{ id: "c1", label: "Coronary Artery Disease", status: "active" }] },
    observations: { p1: seedVitals(), p3: seedVitals() },
    orders: {
      p1: [{ id: "o1", drug_name: "Aspirin", dose: "80 mg", route: "PO", frequency: "OD", is_high_alert: false, is_prn: false }],
      p3: [{ id: "o2", drug_name: "Insulin glargine", dose: "20 units", route: "SC", frequency: "HS", is_high_alert: true, is_prn: false }],
    },
    admins: {},
    notes: {},
    scores: {},
  };
  return data;
}
function mk(id, mrn, name, dob, sex, setting, room, status, cc, doc) {
  return { id, mrn, full_name: name, dob, sex, setting_id: setting, room, status, chief_complaint: cc, admitting_physician: doc, encounter_id: "e_" + id };
}
function seedVitals() {
  const now = Date.now();
  const v = [];
  [["HR","Heart Rate","bpm",78],["RR","Respiratory Rate","/min",16],["SPO2","SpO₂","%",97],["BP_SYS","Systolic BP","mmHg",122],["TEMP","Temperature","°C",36.8]]
    .forEach(([code,display,unit,base]) => {
      for (let i = 5; i >= 0; i--)
        v.push({ id:`${code}-${i}`, code, display, unit, value_num: base + Math.round((Math.random()-0.5)*4*10)/10,
                 recorded_at: new Date(now - i*36e5).toISOString(), category:"vital-sign" });
    });
  return v;
}

const db = {
  load() {
    let d = JSON.parse(localStorage.getItem(LS_KEY) || "null");
    if (!d) { d = seed(); this.save(d); }
    return d;
  },
  save(d) { localStorage.setItem(LS_KEY, JSON.stringify(d)); },
  reset() { localStorage.removeItem(LS_KEY); },
};

const uid = () => "x" + Math.random().toString(36).slice(2, 10);
const ONLINE = !CONFIG.OFFLINE;

/* ---------------------------------------------------------------------------
 * Public API
 * ------------------------------------------------------------------------- */
export const api = {
  offline: CONFIG.OFFLINE,
  resetDemo() { db.reset(); },

  // ----- care settings -----
  async settings(kind) {
    if (ONLINE) {
      const { data } = await sb.from("care_settings").select("*").eq("kind", kind).order("name");
      return data ?? [];
    }
    return db.load().settings.filter((s) => s.kind === kind);
  },

  // ----- patients / encounters -----
  async patientsBySetting(settingId) {
    if (ONLINE) {
      const { data } = await sb
        .from("encounters")
        .select("id,status,chief_complaint,admitting_physician,room:rooms(label),patient:patients(*)")
        .eq("care_setting_id", settingId)
        .neq("status", "closed");
      return (data ?? []).map(flattenEnc);
    }
    return db.load().patients.filter((p) => p.setting_id === settingId);
  },

  async patient(patientId) {
    if (ONLINE) {
      const { data } = await sb
        .from("encounters")
        .select("id,status,chief_complaint,admitting_physician,admitted_at,room:rooms(label),patient:patients(*)")
        .eq("patient_id", patientId).order("admitted_at", { ascending: false }).limit(1).single();
      return flattenEnc(data);
    }
    return db.load().patients.find((p) => p.id === patientId);
  },

  // ----- allergies / conditions -----
  async allergies(p) {
    if (ONLINE) { const { data } = await sb.from("allergies").select("*").eq("patient_id", p.id).is("deleted_at", null); return data ?? []; }
    return db.load().allergies[p.id] ?? [];
  },
  async conditions(p) {
    if (ONLINE) { const { data } = await sb.from("conditions").select("*").eq("patient_id", p.id).is("deleted_at", null); return data ?? []; }
    return db.load().conditions[p.id] ?? [];
  },

  // ----- observations (vitals/labs) -----
  async observations(p, category = "vital-sign") {
    if (ONLINE) {
      const { data } = await sb.from("observations").select("*")
        .eq("encounter_id", p.encounter_id).eq("category", category)
        .is("deleted_at", null).order("recorded_at");
      return data ?? [];
    }
    return (db.load().observations[p.id] ?? []).filter((o) => o.category === category);
  },
  async addObservation(p, obs) {
    const row = { encounter_id: p.encounter_id, category: "vital-sign", recorded_at: new Date().toISOString(), ...obs };
    if (ONLINE) { await sb.from("observations").insert(row); return; }
    const d = db.load(); (d.observations[p.id] ??= []).push({ id: uid(), ...row }); db.save(d);
  },

  // ----- NEWS2 (server RPC online; local compute offline) -----
  async scoreNews2(p, vit) {
    if (ONLINE) {
      const { data } = await sb.rpc("score_news2", {
        p_encounter: p.encounter_id, p_rr: vit.RR, p_spo2: vit.SPO2, p_on_o2: !!vit.onO2,
        p_sbp: vit.BP_SYS, p_hr: vit.HR, p_temp: vit.TEMP, p_consciousness: vit.consciousness || "A",
      });
      return data;
    }
    return localNews2(vit);
  },

  // ----- MAR -----
  async medOrders(p) {
    if (ONLINE) {
      const { data } = await sb.from("medication_orders").select("*").eq("encounter_id", p.encounter_id).is("deleted_at", null);
      return data ?? [];
    }
    return db.load().orders[p.id] ?? [];
  },
  async administer(p, order, payload) {
    const rec = { id: uid(), order_id: order.id, status: payload.status, administered_at: new Date().toISOString(),
                  administered_by: payload.by, witnessed_by: payload.witness ?? null, hold_reason: payload.holdReason ?? null };
    if (ONLINE) { await sb.from("medication_administrations").insert(rec); return rec; }
    const d = db.load(); (d.admins[order.id] ??= []).push(rec); db.save(d); return rec;
  },
  async adminHistory(order) {
    if (ONLINE) { const { data } = await sb.from("medication_administrations").select("*").eq("order_id", order.id).order("administered_at"); return data ?? []; }
    return db.load().admins[order.id] ?? [];
  },

  // ----- notes -----
  async notes(p) {
    if (ONLINE) { const { data } = await sb.from("clinical_notes").select("*").eq("encounter_id", p.encounter_id).is("deleted_at", null).order("created_at"); return data ?? []; }
    return db.load().notes[p.id] ?? [];
  },
  async addNote(p, note) {
    const row = { id: uid(), encounter_id: p.encounter_id, kind: note.kind, body: note.body ?? {}, text_body: note.text ?? "", created_at: new Date().toISOString() };
    if (ONLINE) { await sb.from("clinical_notes").insert({ encounter_id: p.encounter_id, kind: note.kind, body: note.body ?? {}, text_body: note.text ?? "" }); return; }
    const d = db.load(); (d.notes[p.id] ??= []).push(row); db.save(d);
  },

  // ----- report (server-rendered online; client builder offline) -----
  async generateReport(p) {
    if (ONLINE && CONFIG.FLAGS.serverReport) {
      const { data, error } = await sb.functions.invoke("generate-report", { body: { encounter_id: p.encounter_id } });
      if (error) throw error;
      return data.html;
    }
    return clientReport(p, await this.observations(p), await this.notes(p));
  },
};

/* helpers ------------------------------------------------------------------ */
function flattenEnc(e) {
  if (!e) return null;
  return { ...e.patient, encounter_id: e.id, status: e.status, chief_complaint: e.chief_complaint,
           admitting_physician: e.admitting_physician, room: e.room?.label, setting_id: e.care_setting_id };
}

export function localNews2(v) {
  const s = {
    rr: v.RR <= 8 ? 3 : v.RR <= 11 ? 1 : v.RR <= 20 ? 0 : v.RR <= 24 ? 2 : 3,
    spo2: v.SPO2 <= 91 ? 3 : v.SPO2 <= 93 ? 2 : v.SPO2 <= 95 ? 1 : 0,
    o2: v.onO2 ? 2 : 0,
    sbp: v.BP_SYS <= 90 ? 3 : v.BP_SYS <= 100 ? 2 : v.BP_SYS <= 110 ? 1 : v.BP_SYS <= 219 ? 0 : 3,
    hr: v.HR <= 40 ? 3 : v.HR <= 50 ? 1 : v.HR <= 90 ? 0 : v.HR <= 110 ? 1 : v.HR <= 130 ? 2 : 3,
    temp: v.TEMP <= 35 ? 3 : v.TEMP <= 36 ? 1 : v.TEMP <= 38 ? 0 : v.TEMP <= 39 ? 1 : 2,
    con: (v.consciousness || "A") === "A" ? 0 : 3,
  };
  const total = Object.values(s).reduce((a, b) => a + b, 0);
  const single = Object.values(s).some((x) => x === 3);
  const band = total >= 7 ? "high" : total >= 5 ? "medium" : single ? "medium-single" : "low";
  return { total, band, subscores: s };
}

function clientReport(p, vitals, notes) {
  const rows = vitals.slice(-12).map((v) => `<tr><td>${v.display}</td><td>${v.value_num} ${v.unit}</td><td>${new Date(v.recorded_at).toLocaleString()}</td></tr>`).join("");
  const nrows = notes.map((n) => `<div style="border-left:3px solid #2BBFAD;padding:4px 10px;margin:6px 0;background:#F8F7F3"><b>${n.kind}</b><p>${n.text_body || ""}</p></div>`).join("");
  return `<!doctype html><html><head><meta charset="utf-8"><title>Report — ${p.full_name}</title>
  <style>body{font-family:Arial;color:#1B2A4A;margin:32px;font-size:13px}h1{font-family:serif;border-bottom:3px solid #2BBFAD;padding-bottom:8px}
  table{width:100%;border-collapse:collapse}th,td{border:1px solid #E4E8F0;padding:6px 9px;text-align:left}th{background:#F8F7F3}</style></head>
  <body><h1>HCT Academy · After-Action Report</h1>
  <p><b>Patient:</b> ${p.full_name} (MRN ${p.mrn}) · <b>Dx:</b> ${p.chief_complaint}</p>
  <h2>Vital Signs</h2><table><tr><th>Parameter</th><th>Value</th><th>Time</th></tr>${rows || "<tr><td colspan=3>No data</td></tr>"}</table>
  <h2>Notes</h2>${nrows || "<p>No notes.</p>"}
  <h2>PEARLS Debrief</h2><ol><li>Reactions</li><li>Description</li><li>Analysis</li><li>Summary</li></ol></body></html>`;
}
