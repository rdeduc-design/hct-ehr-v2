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
const LS_KEY = "hct_ehr_offline_v2";

function seed() {
  const settings = [
    // Wards
    { id: "icu",     kind: "ward", code: "icu",     name: "Intensive Care Unit",         description: "Critical care requiring continuous monitoring.",           capacity: 12, color_class: "c-red"    },
    { id: "med",     kind: "ward", code: "med",     name: "Medical Ward",                description: "General internal medicine for adult patients.",            capacity: 30, color_class: "c-teal"   },
    { id: "pedia",   kind: "ward", code: "pedia",   name: "Pediatric Ward",              description: "Care for children up to 18 years.",                       capacity: 20, color_class: "c-purple" },
    { id: "ob",      kind: "ward", code: "ob",      name: "Obstetrics & Gynecology",     description: "Labor, delivery, postpartum.",                             capacity: 18, color_class: "c-pink"   },
    { id: "surg",    kind: "ward", code: "surg",    name: "Surgical Ward",               description: "Pre-op and post-op surgical patients.",                    capacity: 24, color_class: "c-navy"   },
    { id: "er",      kind: "ward", code: "er",      name: "Emergency Department",        description: "Acute stabilization and triage.",                          capacity: 16, color_class: "c-orange" },
    { id: "ortho",   kind: "ward", code: "ortho",   name: "Orthopedic Ward",             description: "Musculoskeletal injuries, fractures, and joint procedures.", capacity: 20, color_class: "c-teal"  },
    { id: "psych",   kind: "ward", code: "psych",   name: "Psychiatric Ward",            description: "Inpatient mental health stabilization.",                   capacity: 15, color_class: "c-purple" },
    // OPD Clinics
    { id: "cardio",  kind: "opd",  code: "cardio",  name: "Cardiology Clinic",           description: "Heart disease, hypertension, arrhythmia.",                 capacity: 24, color_class: "c-red"    },
    { id: "im",      kind: "opd",  code: "im",      name: "Internal Medicine Clinic",    description: "General adult medicine, chronic disease follow-up.",        capacity: 30, color_class: "c-teal"   },
    { id: "peds-opd",kind: "opd",  code: "peds-opd",name: "Pediatrics Clinic",           description: "Well-child visits and pediatric follow-up.",               capacity: 20, color_class: "c-purple" },
    { id: "obgyn",   kind: "opd",  code: "obgyn",   name: "OB-GYN Clinic",              description: "Prenatal, women's health, and gynecology.",                 capacity: 18, color_class: "c-pink"   },
    { id: "surg-opd",kind: "opd",  code: "surg-opd",name: "Surgery Clinic",             description: "Surgical consultations and wound care follow-up.",          capacity: 16, color_class: "c-navy"   },
    { id: "ortho-opd",kind:"opd",  code:"ortho-opd",name: "Orthopedics Clinic",         description: "Fractures, joint pain, physical therapy referrals.",        capacity: 20, color_class: "c-teal"   },
    { id: "neuro",   kind: "opd",  code: "neuro",   name: "Neurology Clinic",           description: "Stroke follow-up, seizure disorders, headaches.",           capacity: 14, color_class: "c-navy"   },
    { id: "ent",     kind: "opd",  code: "ent",     name: "ENT Clinic",                 description: "Ear, nose, throat, and hearing disorders.",                 capacity: 18, color_class: "c-teal"   },
    { id: "optha",   kind: "opd",  code: "optha",   name: "Ophthalmology Clinic",       description: "Eye diseases, vision assessment, and surgery follow-up.",   capacity: 16, color_class: "c-blue"   },
    { id: "derm",    kind: "opd",  code: "derm",    name: "Dermatology Clinic",         description: "Skin disorders, wound care, and allergy testing.",          capacity: 20, color_class: "c-orange" },
    { id: "psych-opd",kind:"opd",  code:"psych-opd",name: "Psychiatry Clinic",         description: "Outpatient mental health therapy and medication review.",    capacity: 12, color_class: "c-purple" },
    { id: "id",      kind: "opd",  code: "id",      name: "Infectious Disease Clinic",  description: "HIV care, TB follow-up, travel medicine.",                  capacity: 14, color_class: "c-orange" },
    // LTC Wings
    { id: "ltc-gen", kind: "ltc",  code: "ltc-gen", name: "General Care Wing",          description: "Daily ADL nursing assistance for long-term residents.",     capacity: 20, color_class: "c-teal"   },
    { id: "ltc-mem", kind: "ltc",  code: "ltc-mem", name: "Memory Care Wing",           description: "Specialized unit for dementia and Alzheimer's patients.",   capacity: 15, color_class: "c-purple" },
    { id: "ltc-reh", kind: "ltc",  code: "ltc-reh", name: "Rehabilitation Wing",        description: "Sub-acute rehab: PT, OT, and speech therapy.",             capacity: 18, color_class: "c-navy"   },
    { id: "ltc-pal", kind: "ltc",  code: "ltc-pal", name: "Palliative Care Wing",       description: "Comfort-focused care and end-of-life support.",            capacity: 10, color_class: "c-pink"   },
  ];

  const patients = [
    // ICU
    mk("p1",  "100231","Ricardo Villanueva",   "1958-03-14","M","icu",     "ICU-1",  "critical",   "Acute Myocardial Infarction",          "Dr. Lim"),
    mk("p2",  "100232","Corazon Reyes",         "1972-06-22","F","icu",     "ICU-2",  "critical",   "Septic Shock",                         "Dr. Mendoza"),
    mk("p3",  "100233","Arturo Bautista",        "1945-11-03","M","icu",     "ICU-3",  "critical",   "Acute Respiratory Failure",            "Dr. Santos"),
    // Medical Ward
    mk("p4",  "100245","Benjamin Magno",         "1968-05-17","M","med",    "MW-301", "admitted",   "Type 2 DM with DKA",                   "Dr. Reyes"),
    mk("p5",  "100246","Teresita Llaneta",        "1961-02-28","F","med",    "MW-302", "admitted",   "Hypertensive Crisis",                  "Dr. Lim"),
    mk("p6",  "100247","Eduardo Castillo",        "1955-08-10","M","med",    "MW-303", "admitted",   "Community-Acquired Pneumonia",         "Dr. Aquino"),
    mk("p7",  "100248","Florencia Dela Cruz",     "1980-12-05","F","med",    "MW-304", "isolation",  "Pulmonary Tuberculosis",               "Dr. Reyes"),
    // Pediatric Ward
    mk("p8",  "100260","Jayson Tan",              "2016-04-18","M","pedia",  "PW-101", "admitted",   "Acute Gastroenteritis with Dehydration","Dr. Gomez"),
    mk("p9",  "100261","Maria Clara Santos",      "2019-09-30","F","pedia",  "PW-102", "admitted",   "Febrile Seizure",                      "Dr. Gomez"),
    // OB Ward
    mk("p10", "100270","Analyn Peralta",          "1995-07-14","F","ob",     "OB-201", "admitted",   "Preterm Labor 34 weeks",               "Dr. Evangelista"),
    mk("p11", "100271","Rowena Ocampo",            "1988-03-22","F","ob",     "OB-202", "admitted",   "Gestational Hypertension",             "Dr. Evangelista"),
    // Surgical Ward
    mk("p12", "100280","Roberto Fernandez",        "1963-01-19","M","surg",  "SW-401", "admitted",   "Post-op Appendectomy Day 1",           "Dr. Torres"),
    mk("p13", "100281","Josefina Cruz",            "1975-10-07","F","surg",  "SW-402", "for discharge","Laparoscopic Cholecystectomy Day 3",  "Dr. Torres"),
    // ER
    mk("p14", "100290","Hernando Ramos",           "1982-06-25","M","er",    "ER-A1",  "critical",   "Polytrauma — MVA",                     "Dr. Bautista"),
    mk("p15", "100291","Estrella Macapagal",       "1967-09-11","F","er",    "ER-A2",  "admitted",   "Acute Abdomen — rule out Appendicitis", "Dr. Bautista"),
    // Orthopedic
    mk("p16", "100300","Danilo Morales",           "1950-02-14","M","ortho", "OR-501", "admitted",   "Right Hip Fracture — post-ORIF",       "Dr. Valdez"),
    // Psychiatric
    mk("p17", "100310","Angelica Villares",        "1992-11-28","F","psych", "PS-601", "admitted",   "Major Depressive Episode",             "Dr. Navarro"),
    // OPD (Cardiology)
    mk("p18", "100320","Domingo Agustin",          "1960-04-05","M","cardio","OPD-C1", "admitted",   "Stable Angina — follow-up",            "Dr. Lim"),
    // OPD (Internal Medicine)
    mk("p19", "100321","Luzviminda Bañares",       "1970-07-17","F","im",    "OPD-IM1","admitted",   "Uncontrolled Hypertension",            "Dr. Reyes"),
    // OPD (Peds)
    mk("p20", "100330","Carlo Quisumbing",          "2015-02-28","M","peds-opd","OPD-P1","admitted", "Asthma — follow-up",                   "Dr. Gomez"),
    // LTC General
    mk("p21", "100400","Felicidad Alvarado",        "1940-08-21","F","ltc-gen","LTC-G1","admitted",  "Stroke Sequelae — long-term care",     "Dr. Santos"),
    mk("p22", "100401","Venancio Macaraeg",          "1938-11-02","M","ltc-gen","LTC-G2","admitted", "COPD — palliative management",         "Dr. Aquino"),
    // LTC Memory
    mk("p23", "100410","Remedios Pascual",           "1935-05-14","F","ltc-mem","LTC-M1","admitted", "Moderate Alzheimer's Disease",         "Dr. Navarro"),
  ];

  const data = {
    settings,
    patients,
    allergies: {
      p1:  [{ id: "a1", substance: "Penicillin",      category: "medication", reactions: ["Rash","Hives"],            severity: "moderate" }],
      p5:  [{ id: "a2", substance: "Sulfa drugs",      category: "medication", reactions: ["Anaphylaxis"],            severity: "severe"   }],
      p7:  [{ id: "a3", substance: "Aspirin",          category: "medication", reactions: ["Bronchospasm","Rash"],    severity: "moderate" }],
      p14: [{ id: "a4", substance: "Latex",            category: "environment", reactions: ["Urticaria","Angioedema"],severity: "severe"   },
             { id: "a5", substance: "Ibuprofen",        category: "medication", reactions: ["Rash"],                  severity: "mild"     }],
    },
    conditions: {
      p1:  [{ id: "c1", label: "Coronary Artery Disease",          status: "active" }, { id: "c2", label: "Hypertension", status: "active" }],
      p4:  [{ id: "c3", label: "Type 2 Diabetes Mellitus",         status: "active" }, { id: "c4", label: "Obesity", status: "active" }],
      p5:  [{ id: "c5", label: "Hypertension",                     status: "active" }, { id: "c6", label: "Chronic Kidney Disease Stage 3", status: "active" }],
      p6:  [{ id: "c7", label: "Community-Acquired Pneumonia",     status: "active" }],
      p7:  [{ id: "c8", label: "Pulmonary Tuberculosis",           status: "active" }],
      p16: [{ id: "c9", label: "Osteoporosis",                     status: "active" }],
      p21: [{ id: "c10",label: "Ischemic Stroke Sequelae",         status: "active" }, { id: "c11", label: "Hypertension", status: "active" }],
      p23: [{ id: "c12",label: "Alzheimer's Disease",              status: "active" }, { id: "c13", label: "Hypothyroidism", status: "active" }],
    },
    observations: {
      p1: seedVitals(),
      p4: seedVitals(),
      p6: seedVitals(),
      p14: seedVitals(),
    },
    orders: {
      p1:  [
        { id: "o1",  drug_name: "Aspirin",            dose: "80 mg",       route: "PO",  frequency: "OD",      is_high_alert: false, is_prn: false },
        { id: "o2",  drug_name: "Atorvastatin",        dose: "40 mg",       route: "PO",  frequency: "OD (HS)", is_high_alert: false, is_prn: false },
        { id: "o3",  drug_name: "Nitroglycerin",        dose: "0.4 mg",      route: "SL",  frequency: "PRN",     is_high_alert: true,  is_prn: true  },
        { id: "o4",  drug_name: "Heparin",              dose: "5000 units",  route: "IV",  frequency: "q8h",     is_high_alert: true,  is_prn: false },
      ],
      p4:  [
        { id: "o5",  drug_name: "Insulin glargine",    dose: "20 units",    route: "SC",  frequency: "HS",      is_high_alert: true,  is_prn: false },
        { id: "o6",  drug_name: "Insulin regular",      dose: "per sliding scale", route: "SC", frequency: "AC + HS", is_high_alert: true, is_prn: false },
        { id: "o7",  drug_name: "Metformin",            dose: "500 mg",      route: "PO",  frequency: "BID",     is_high_alert: false, is_prn: false },
      ],
      p5:  [
        { id: "o8",  drug_name: "Amlodipine",           dose: "10 mg",       route: "PO",  frequency: "OD",      is_high_alert: false, is_prn: false },
        { id: "o9",  drug_name: "Losartan",              dose: "50 mg",       route: "PO",  frequency: "OD",      is_high_alert: false, is_prn: false },
        { id: "o10", drug_name: "Furosemide",            dose: "40 mg",       route: "PO",  frequency: "OD (AM)", is_high_alert: false, is_prn: false },
      ],
      p6:  [
        { id: "o11", drug_name: "Amoxicillin-Clavulanate", dose: "1.2 g",    route: "IV",  frequency: "q8h",     is_high_alert: false, is_prn: false },
        { id: "o12", drug_name: "Azithromycin",         dose: "500 mg",      route: "PO",  frequency: "OD",      is_high_alert: false, is_prn: false },
        { id: "o13", drug_name: "Paracetamol",           dose: "500 mg",      route: "PO",  frequency: "q6h PRN", is_high_alert: false, is_prn: true  },
      ],
      p12: [
        { id: "o14", drug_name: "Cefazolin",             dose: "1 g",         route: "IV",  frequency: "q8h",     is_high_alert: false, is_prn: false },
        { id: "o15", drug_name: "Ketorolac",             dose: "30 mg",       route: "IV",  frequency: "q6h PRN", is_high_alert: false, is_prn: true  },
        { id: "o16", drug_name: "Ondansetron",           dose: "4 mg",        route: "IV",  frequency: "q8h PRN", is_high_alert: false, is_prn: true  },
      ],
    },
    admins:       {},
    notes:        {},
    scores:       {},
    io:           {},
    immunizations:{},
    labs:         {},
  };
  return data;
}

function mk(id, mrn, name, dob, sex, setting, room, status, cc, doc) {
  return { id, mrn, full_name: name, dob, sex, setting_id: setting, room, status,
           chief_complaint: cc, admitting_physician: doc, encounter_id: "e_" + id,
           admission_date: new Date(Date.now() - Math.floor(Math.random() * 5) * 864e5).toISOString().split("T")[0] };
}

function seedVitals() {
  const now = Date.now();
  const v = [];
  [
    ["HR",     "Heart Rate",        "bpm",  78,  [60,100]],
    ["RR",     "Respiratory Rate",  "/min", 16,  [12,20]],
    ["SPO2",   "SpO₂",             "%",    97,  [95,100]],
    ["BP_SYS", "Systolic BP",       "mmHg", 122, [90,140]],
    ["BP_DIA", "Diastolic BP",      "mmHg", 78,  [60,90]],
    ["TEMP",   "Temperature",       "°C",   36.8,[36.1,37.2]],
  ].forEach(([code, display, unit, base, refs]) => {
    for (let i = 5; i >= 0; i--) {
      v.push({
        id: `${code}-${i}`,
        code, display, unit,
        value_num: Math.round((base + (Math.random() - 0.5) * 4) * 10) / 10,
        ref_low: refs[0], ref_high: refs[1],
        recorded_at: new Date(now - i * 36e5).toISOString(),
        category: "vital-sign",
      });
    }
  });
  return v;
}

const db = {
  load() {
    let d = JSON.parse(localStorage.getItem(LS_KEY) || "null");
    if (!d) { d = seed(); this.save(d); }
    // migrate: add collections that older seeds may lack
    if (!d.io)            { d.io = {};            this.save(d); }
    if (!d.immunizations) { d.immunizations = {}; this.save(d); }
    if (!d.labs)          { d.labs = {};          this.save(d); }
    return d;
  },
  save(d) { localStorage.setItem(LS_KEY, JSON.stringify(d)); },
  reset()  { localStorage.removeItem(LS_KEY); },
};

const uid  = () => "x" + Math.random().toString(36).slice(2, 10);
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
    return db.load().settings.filter(s => s.kind === kind);
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
    return db.load().patients.filter(p => p.setting_id === settingId);
  },

  async patient(patientId) {
    if (ONLINE) {
      const { data } = await sb
        .from("encounters")
        .select("id,status,chief_complaint,admitting_physician,admitted_at,room:rooms(label),patient:patients(*)")
        .eq("patient_id", patientId).order("admitted_at", { ascending: false }).limit(1).single();
      return flattenEnc(data);
    }
    return db.load().patients.find(p => p.id === patientId);
  },

  async admitPatient(payload) {
    if (ONLINE) {
      const { data: px } = await sb.from("patients").insert({
        full_name: payload.full_name, dob: payload.dob || null, sex: payload.sex || null,
        mrn: payload.mrn || null,
      }).select().single();
      if (!px) throw new Error("Failed to create patient");
      await sb.from("encounters").insert({
        patient_id: px.id, care_setting_id: payload.setting_id,
        chief_complaint: payload.chief_complaint || null,
        admitting_physician: payload.admitting_physician || null,
        admitted_at: payload.admission_date ? new Date(payload.admission_date).toISOString() : new Date().toISOString(),
        status: "admitted",
      });
      return px;
    }
    const d = db.load();
    const id = uid();
    const mrn = String(100500 + d.patients.length);
    const newPx = {
      id, mrn, full_name: payload.full_name, dob: payload.dob || null, sex: payload.sex || null,
      setting_id: payload.setting_id, room: payload.room || null, status: "admitted",
      chief_complaint: payload.chief_complaint || null,
      admitting_physician: payload.admitting_physician || null,
      admission_date: payload.admission_date || new Date().toISOString().split("T")[0],
      encounter_id: "e_" + id,
    };
    d.patients.push(newPx);
    db.save(d);
    return newPx;
  },

  // ----- allergies / conditions -----
  async allergies(p) {
    if (ONLINE) {
      const { data } = await sb.from("allergies").select("*").eq("patient_id", p.id).is("deleted_at", null);
      return data ?? [];
    }
    return db.load().allergies[p.id] ?? [];
  },

  async addAllergy(p, allergy) {
    const row = { id: uid(), patient_id: p.id, substance: allergy.substance, category: allergy.category || "medication",
                  reactions: allergy.reactions || [], severity: allergy.severity || "unknown",
                  created_at: new Date().toISOString() };
    if (ONLINE) {
      await sb.from("allergies").insert({ patient_id: p.id, substance: allergy.substance,
        category: allergy.category || "medication", reactions: allergy.reactions || [],
        severity: allergy.severity || "unknown" });
      return;
    }
    const d = db.load();
    (d.allergies[p.id] ??= []).push(row);
    db.save(d);
  },

  async conditions(p) {
    if (ONLINE) {
      const { data } = await sb.from("conditions").select("*").eq("patient_id", p.id).is("deleted_at", null);
      return data ?? [];
    }
    return db.load().conditions[p.id] ?? [];
  },

  // ----- observations (vitals / labs) -----
  async observations(p, category = "vital-sign") {
    if (ONLINE) {
      const { data } = await sb.from("observations").select("*")
        .eq("encounter_id", p.encounter_id).eq("category", category)
        .is("deleted_at", null).order("recorded_at");
      return data ?? [];
    }
    return (db.load().observations[p.id] ?? []).filter(o => o.category === category);
  },

  async addObservation(p, obs) {
    const row = { encounter_id: p.encounter_id, category: "vital-sign", recorded_at: new Date().toISOString(), ...obs };
    if (ONLINE) { await sb.from("observations").insert(row); return; }
    const d = db.load();
    (d.observations[p.id] ??= []).push({ id: uid(), ...row });
    db.save(d);
  },

  // ----- lab results (offline: separate store keyed by test code) -----
  async labResults(p) {
    if (ONLINE) {
      const { data } = await sb.from("lab_results").select("*")
        .eq("encounter_id", p.encounter_id).is("deleted_at", null).order("collected_at");
      return data ?? [];
    }
    return db.load().labs[p.id] ?? [];
  },

  async addLabResult(p, result) {
    const row = { id: uid(), encounter_id: p.encounter_id, collected_at: new Date().toISOString(), ...result };
    if (ONLINE) {
      await sb.from("lab_results").insert({ encounter_id: p.encounter_id, ...result });
      return;
    }
    const d = db.load();
    (d.labs[p.id] ??= []).push(row);
    db.save(d);
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

  async addMedOrder(p, order) {
    const row = { id: uid(), encounter_id: p.encounter_id, ordered_at: new Date().toISOString(), ...order };
    if (ONLINE) {
      await sb.from("medication_orders").insert({ encounter_id: p.encounter_id, ...order });
      return row;
    }
    const d = db.load();
    (d.orders[p.id] ??= []).push(row);
    db.save(d);
    return row;
  },

  async administer(p, order, payload) {
    const rec = { id: uid(), order_id: order.id, status: payload.status,
                  administered_at: new Date().toISOString(), administered_by: payload.by,
                  witnessed_by: payload.witness ?? null, hold_reason: payload.holdReason ?? null };
    if (ONLINE) { await sb.from("medication_administrations").insert(rec); return rec; }
    const d = db.load();
    (d.admins[order.id] ??= []).push(rec);
    db.save(d);
    return rec;
  },

  async adminHistory(order) {
    if (ONLINE) {
      const { data } = await sb.from("medication_administrations").select("*").eq("order_id", order.id).order("administered_at");
      return data ?? [];
    }
    return db.load().admins[order.id] ?? [];
  },

  // ----- intake & output -----
  async ioEntries(p) {
    if (ONLINE) {
      const { data } = await sb.from("io_entries").select("*").eq("encounter_id", p.encounter_id).order("recorded_at");
      return data ?? [];
    }
    return db.load().io[p.id] ?? [];
  },

  async addIOEntry(p, entry) {
    const row = { id: uid(), encounter_id: p.encounter_id, recorded_at: new Date().toISOString(), ...entry };
    if (ONLINE) { await sb.from("io_entries").insert({ encounter_id: p.encounter_id, ...entry }); return; }
    const d = db.load();
    (d.io[p.id] ??= []).push(row);
    db.save(d);
  },

  async deleteIOEntry(p, entryId) {
    if (ONLINE) { await sb.from("io_entries").delete().eq("id", entryId); return; }
    const d = db.load();
    d.io[p.id] = (d.io[p.id] ?? []).filter(e => e.id !== entryId);
    db.save(d);
  },

  // ----- immunizations -----
  async immunizations(p) {
    if (ONLINE) {
      const { data } = await sb.from("immunizations").select("*").eq("patient_id", p.id).order("administered_date");
      return data ?? [];
    }
    return db.load().immunizations[p.id] ?? [];
  },

  async saveImmunization(p, record) {
    const row = { id: uid(), patient_id: p.id, updated_at: new Date().toISOString(), ...record };
    if (ONLINE) {
      const existing = record.id
        ? await sb.from("immunizations").update(record).eq("id", record.id)
        : await sb.from("immunizations").insert({ patient_id: p.id, ...record });
      return;
    }
    const d = db.load();
    const imm = (d.immunizations[p.id] ??= []);
    const idx = record.id ? imm.findIndex(i => i.id === record.id) : -1;
    if (idx >= 0) imm[idx] = { ...imm[idx], ...record, updated_at: new Date().toISOString() };
    else imm.push(row);
    db.save(d);
  },

  // ----- notes -----
  async notes(p) {
    if (ONLINE) {
      const { data } = await sb.from("clinical_notes").select("*").eq("encounter_id", p.encounter_id)
        .is("deleted_at", null).order("created_at");
      return data ?? [];
    }
    return db.load().notes[p.id] ?? [];
  },

  async addNote(p, note) {
    const row = { id: uid(), encounter_id: p.encounter_id, kind: note.kind,
                  body: note.body ?? {}, text_body: note.text ?? "",
                  created_at: new Date().toISOString() };
    if (ONLINE) {
      await sb.from("clinical_notes").insert({ encounter_id: p.encounter_id, kind: note.kind,
        body: note.body ?? {}, text_body: note.text ?? "" });
      return;
    }
    const d = db.load();
    (d.notes[p.id] ??= []).push(row);
    db.save(d);
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
  return { ...e.patient, encounter_id: e.id, status: e.status,
           chief_complaint: e.chief_complaint, admitting_physician: e.admitting_physician,
           room: e.room?.label, setting_id: e.care_setting_id };
}

export function localNews2(v) {
  const s = {
    rr:  v.RR <= 8 ? 3 : v.RR <= 11 ? 1 : v.RR <= 20 ? 0 : v.RR <= 24 ? 2 : 3,
    spo2:v.SPO2 <= 91 ? 3 : v.SPO2 <= 93 ? 2 : v.SPO2 <= 95 ? 1 : 0,
    o2:  v.onO2 ? 2 : 0,
    sbp: v.BP_SYS <= 90 ? 3 : v.BP_SYS <= 100 ? 2 : v.BP_SYS <= 110 ? 1 : v.BP_SYS <= 219 ? 0 : 3,
    hr:  v.HR <= 40 ? 3 : v.HR <= 50 ? 1 : v.HR <= 90 ? 0 : v.HR <= 110 ? 1 : v.HR <= 130 ? 2 : 3,
    temp:v.TEMP <= 35 ? 3 : v.TEMP <= 36 ? 1 : v.TEMP <= 38 ? 0 : v.TEMP <= 39 ? 1 : 2,
    con: (v.consciousness || "A") === "A" ? 0 : 3,
  };
  const total  = Object.values(s).reduce((a, b) => a + b, 0);
  const single = Object.values(s).some(x => x === 3);
  const band   = total >= 7 ? "high" : total >= 5 ? "medium" : single ? "medium-single" : "low";
  return { total, band, subscores: s };
}

function clientReport(p, vitals, notes) {
  const rows = vitals.slice(-12).map(v =>
    `<tr><td>${v.display}</td><td>${v.value_num} ${v.unit}</td><td>${new Date(v.recorded_at).toLocaleString()}</td></tr>`
  ).join("");
  const nrows = notes.map(n =>
    `<div style="border-left:3px solid #2BBFAD;padding:4px 10px;margin:6px 0;background:#F8F7F3"><b>${n.kind}</b><p>${n.text_body || ""}</p></div>`
  ).join("");
  return `<!doctype html><html><head><meta charset="utf-8"><title>Report — ${p.full_name}</title>
  <style>body{font-family:Arial;color:#1B2A4A;margin:32px;font-size:13px}h1{font-family:serif;border-bottom:3px solid #2BBFAD;padding-bottom:8px}
  table{width:100%;border-collapse:collapse}th,td{border:1px solid #E4E8F0;padding:6px 9px;text-align:left}th{background:#F8F7F3}</style></head>
  <body><h1>HCT Academy · After-Action Report</h1>
  <p><b>Patient:</b> ${p.full_name} (MRN ${p.mrn}) · <b>Dx:</b> ${p.chief_complaint}</p>
  <h2>Vital Signs</h2><table><tr><th>Parameter</th><th>Value</th><th>Time</th></tr>${rows || "<tr><td colspan=3>No data</td></tr>"}</table>
  <h2>Notes</h2>${nrows || "<p>No notes.</p>"}
  <h2>PEARLS Debrief</h2><ol><li>Reactions</li><li>Description</li><li>Analysis</li><li>Summary</li></ol></body></html>`;
}
