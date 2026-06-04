// ============================================================================
//  features/chart/sections.js — all chart section renderers.
//  Module-level state mirrors the reference single-file app pattern.
// ============================================================================
import { api, localNews2 } from "../../core/api.js";
import { store } from "../../core/store.js";
import { toast } from "../../ui/toast.js";
import { initials, row, statusTag } from "../../ui/components.js";
import { pushAlerts } from "../../ui/shell.js";

// ── helpers ─────────────────────────────────────────────────────────────────
function now() { return new Date(); }
function nowDate() { return now().toISOString().split("T")[0]; }
function nowTime() { return now().toLocaleTimeString("en-US", { hour:"2-digit", minute:"2-digit", hour12:false }); }
function dispDate(d) { return new Date(d).toLocaleDateString("en-US", { day:"2-digit", month:"short", year:"numeric" }); }
function uid() { return "x" + Math.random().toString(36).slice(2, 9); }
function calcAge(dob) {
  if (!dob) return null;
  const d = new Date(dob); const today = new Date();
  let age = today.getFullYear() - d.getFullYear();
  if (today.getMonth() < d.getMonth() || (today.getMonth() === d.getMonth() && today.getDate() < d.getDate())) age--;
  return age;
}

// ── PATIENT INFO SECTIONS ────────────────────────────────────────────────────

export async function summary(p, el) {
  const [allergies, conditions, vitals] = await Promise.all([
    api.allergies(p), api.conditions(p), api.observations(p),
  ]);
  const latest = latestByCode(vitals);
  const age = calcAge(p.dob);
  el.innerHTML = `
    <div class="info-grid">
      <div class="info-card">
        <h4>Patient Demographics</h4>
        ${row("Full Name", p.full_name)}
        ${row("MRN", p.mrn || "—")}
        ${row("Date of Birth", p.dob || "—")}
        ${row("Age", age !== null ? age + " years" : "—")}
        ${row("Sex", p.sex || "—")}
        ${row("Room / Bed", p.room || "—")}
        ${row("Status", statusTag(p.status))}
      </div>
      <div class="info-card">
        <h4>Admission</h4>
        ${row("Admitting Physician", p.admitting_physician || "—")}
        ${row("Chief Complaint", p.chief_complaint || p.admitting_diagnosis || "—")}
        ${row("Admission Date", p.admission_date || p.admitted_at || "—")}
        ${row("Encounter ID", p.encounter_id || "—")}
      </div>
    </div>
    <div class="info-card" style="margin-bottom:12px">
      <h4>Active Problems</h4>
      ${conditions.length ? conditions.map(c => row(c.label, c.status || "active")).join("") : "<p style='font-size:12px;color:var(--text-muted)'>None recorded.</p>"}
    </div>
    <div class="info-card" style="margin-bottom:12px">
      <h4>Allergies</h4>
      ${allergies.length ? allergies.map(a => row(a.substance, (a.reactions||[]).join(", ") + (a.severity ? " · " + a.severity : ""))).join("") : "<p style='font-size:12px;color:var(--text-muted)'>NKDA — No Known Drug Allergies</p>"}
    </div>
    <div class="info-card">
      <h4>Latest Vital Signs</h4>
      ${vitalCards(latest)}
    </div>`;
}

export async function adminfo(p, el) {
  el.innerHTML = `
    <div class="info-grid">
      <div class="info-card">
        <h4>Admission Information</h4>
        ${row("Patient Name", p.full_name)}
        ${row("MRN", p.mrn || "—")}
        ${row("Date of Birth", p.dob || "—")}
        ${row("Sex", p.sex || "—")}
        ${row("Room / Bed", p.room || "—")}
      </div>
      <div class="info-card">
        <h4>Clinical</h4>
        ${row("Chief Complaint", p.chief_complaint || "—")}
        ${row("Admitting Physician", p.admitting_physician || "—")}
        ${row("Admission Date", p.admission_date || "—")}
        ${row("Encounter Type", p.encounter_type || "Inpatient")}
        ${row("Status", statusTag(p.status))}
      </div>
    </div>`;
}

export async function hpi(p, el) {
  const notes = await api.notes(p);
  const hpiNote = notes.find(n => n.kind === "hpi");
  el.innerHTML = `
    <div class="wide-card">
      <h4>History of Present Illness (HPI)</h4>
      ${hpiNote
        ? `<p style="font-size:13px;line-height:1.8;color:var(--text)">${hpiNote.text_body || hpiNote.body?.text || ""}</p>`
        : `<p style="font-size:13px;color:var(--text-muted)">No HPI documented yet.</p>`}
    </div>
    <div class="wide-card">
      <h4>Add / Update HPI</h4>
      <textarea id="hpi-body" style="width:100%;min-height:120px;border:1.5px solid var(--border);border-radius:9px;padding:10px;font-family:inherit;font-size:13px;resize:vertical;outline:none">${hpiNote ? (hpiNote.text_body || "") : ""}</textarea>
      <div style="margin-top:10px"><button class="btn-sm" id="save-hpi">Save HPI</button></div>
    </div>`;
  el.querySelector("#save-hpi").onclick = async () => {
    const text = el.querySelector("#hpi-body").value.trim();
    if (!text) return;
    await api.addNote(p, { kind: "hpi", text });
    toast("HPI saved"); hpi(p, el);
  };
}

export async function pmsh(p, el) {
  const notes = await api.notes(p);
  const pmshNote = notes.find(n => n.kind === "pmsh");
  el.innerHTML = `
    <div class="wide-card">
      <h4>Past Medical, Surgical & Social History (PMSH)</h4>
      ${pmshNote
        ? `<p style="font-size:13px;line-height:1.8;color:var(--text)">${pmshNote.text_body || ""}</p>`
        : `<p style="font-size:13px;color:var(--text-muted)">No PMSH documented yet.</p>`}
    </div>
    <div class="wide-card">
      <h4>Add / Update PMSH</h4>
      <textarea id="pmsh-body" style="width:100%;min-height:120px;border:1.5px solid var(--border);border-radius:9px;padding:10px;font-family:inherit;font-size:13px;resize:vertical;outline:none">${pmshNote ? (pmshNote.text_body || "") : ""}</textarea>
      <div style="margin-top:10px"><button class="btn-sm" id="save-pmsh">Save PMSH</button></div>
    </div>`;
  el.querySelector("#save-pmsh").onclick = async () => {
    const text = el.querySelector("#pmsh-body").value.trim();
    if (!text) return;
    await api.addNote(p, { kind: "pmsh", text });
    toast("PMSH saved"); pmsh(p, el);
  };
}

// ── NURSING SECTIONS ─────────────────────────────────────────────────────────

const CARE_PLAN_ITEMS = [
  { icon: "🫀", title: "Cardiovascular", desc: "Monitor vital signs Q4H. Report SBP >160 or <90, HR >110 or <50. ECG as ordered." },
  { icon: "🫁", title: "Respiratory", desc: "Assess breath sounds Q shift. Maintain SpO₂ ≥95%. Supplemental O₂ as needed." },
  { icon: "💊", title: "Medication Management", desc: "Administer medications as ordered. High-alert meds require independent double-check." },
  { icon: "🩺", title: "Fluid Balance", desc: "Monitor intake & output Q shift. Report urine output <30 mL/hr for 2 consecutive hours." },
  { icon: "🧠", title: "Neurological", desc: "Assess LOC, orientation, pupil response. GCS ≥15 expected. Report any change." },
  { icon: "🦴", title: "Fall Prevention", desc: "Morse Falls Scale assessed on admission and Q shift. Implement precautions per score." },
  { icon: "🩹", title: "Skin Integrity", desc: "Braden Scale on admission. Reposition Q2H if score ≤18. Inspect pressure areas." },
  { icon: "🌡️", title: "Infection Control", desc: "Standard precautions at all times. Contact/droplet/airborne as indicated." },
];

export async function careplan(p, el) {
  el.innerHTML = `
    <div style="margin-bottom:14px">
      <div class="sec-title" style="font-size:16px">Nursing Care Plan</div>
      <div class="sec-sub">Active care goals and interventions for this admission.</div>
    </div>
    ${CARE_PLAN_ITEMS.map(item => `
      <div class="cp-item">
        <div class="cp-icon" style="background:var(--teal-light)">${item.icon}</div>
        <div>
          <div class="cp-title">${item.title}</div>
          <div class="cp-desc">${item.desc}</div>
        </div>
      </div>`).join("")}`;
}

export async function sbar(p, el) {
  const notes = await api.notes(p);
  const sbarNote = notes.find(n => n.kind === "sbar");
  const parsed = sbarNote?.body || {};
  const fields = [
    { key: "S", label: "Situation", ph: "Patient name, MRN, age, sex, reason for call/concern…" },
    { key: "B", label: "Background", ph: "Admitting diagnosis, relevant history, current medications…" },
    { key: "A", label: "Assessment", ph: "Current status, vital signs, pertinent findings…" },
    { key: "R", label: "Recommendation", ph: "What action is needed? Orders requested, transfer, urgent review…" },
  ];
  const saved = sbarNote?.text_body ? JSON.parse(sbarNote.text_body.startsWith("{") ? sbarNote.text_body : "{}") : parsed;
  el.innerHTML = `
    ${fields.map(f => `
      <div class="sbar-sec">
        <span class="sbar-lbl">${f.key} — ${f.label}</span>
        ${saved[f.key] ? `<div class="sbar-txt">${saved[f.key]}</div>` : `<div class="sbar-txt" style="color:var(--text-muted);font-style:italic">Not yet documented.</div>`}
      </div>`).join("")}
    <div class="wide-card" style="margin-top:14px">
      <h4>New SBAR</h4>
      ${fields.map(f => `
        <div class="fg">
          <label>${f.key} — ${f.label}</label>
          <textarea id="sbar-${f.key}" placeholder="${f.ph}" style="width:100%;min-height:60px;border:1.5px solid var(--border);border-radius:9px;padding:8px 10px;font-family:inherit;font-size:12px;resize:vertical;outline:none"></textarea>
        </div>`).join("")}
      <button class="btn-sm" id="save-sbar">Save SBAR</button>
    </div>`;
  el.querySelector("#save-sbar").onclick = async () => {
    const body = {};
    fields.forEach(f => { body[f.key] = el.querySelector(`#sbar-${f.key}`).value.trim(); });
    await api.addNote(p, { kind: "sbar", text: JSON.stringify(body), body });
    toast("SBAR saved"); sbar(p, el);
  };
}

export async function notes(p, el) {
  const list = await api.notes(p);
  const display = list.filter(n => !["hpi","pmsh","sbar"].includes(n.kind));
  el.innerHTML = `
    <div class="wide-card">
      <h4>New Note</h4>
      <div class="fg"><label>Type</label>
        <select id="note-kind">
          <option value="nursing">Nursing Note</option>
          <option value="progress">Progress Note</option>
          <option value="incident">Incident Report</option>
          <option value="discharge">Discharge Note</option>
        </select>
      </div>
      <div class="fg"><label>Note</label>
        <textarea id="note-body" style="width:100%;min-height:90px;border:1.5px solid var(--border);border-radius:9px;padding:10px;font-family:inherit;font-size:13px;resize:vertical;outline:none"></textarea>
      </div>
      <button class="btn-sm" id="save-note">Save Note</button>
    </div>
    <div class="wide-card">
      <h4>Note History</h4>
      ${display.length ? display.slice().reverse().map(n => `
        <div class="note-item">
          <div class="note-hdr">
            <span class="note-auth">${n.kind}</span>
            <span class="note-time">${new Date(n.created_at).toLocaleString()}</span>
          </div>
          <div class="note-txt">${n.text_body || ""}</div>
        </div>`).join("") : `<p style="font-size:12px;color:var(--text-muted)">No notes yet.</p>`}
    </div>`;
  el.querySelector("#save-note").onclick = async () => {
    const kind = el.querySelector("#note-kind").value;
    const text = el.querySelector("#note-body").value.trim();
    if (!text) return;
    await api.addNote(p, { kind, text });
    toast("Note saved"); notes(p, el);
  };
}

// ── MAR ──────────────────────────────────────────────────────────────────────

let marAddPanelOpen = false;
let marOpenPopover = null;

export async function mar(p, el) {
  const orders = await api.medOrders(p);
  const session = store.get("session");
  const rows = await Promise.all(orders.map(async o => {
    const hist = await api.adminHistory(o);
    const last = hist.at(-1);
    let statusHtml = "";
    if (last) {
      if (last.status === "given") statusHtml = `<span class="mar-badge-given">Given</span>`;
      else if (last.status === "held") statusHtml = `<span class="mar-badge-held">Held</span>`;
    }
    return `<tr>
      <td>
        <strong>${o.drug_name}</strong>${o.is_high_alert ? `<span class="hi-alert">HIGH-ALERT</span>` : ""}
        ${o.is_prn ? `<span class="d-badge" style="margin-left:4px">PRN</span>` : ""}
        <button class="mar-chev" data-chev="${o.id}">▶</button>
      </td>
      <td>${o.dose || "—"}</td>
      <td>${o.route || "—"}</td>
      <td>${o.frequency || "—"}</td>
      <td>${last ? statusHtml + ` · ${new Date(last.administered_at).toLocaleTimeString([], {hour:"2-digit",minute:"2-digit"})}` : "—"}</td>
      <td>
        <button class="mar-give-btn" data-give="${o.id}">Give</button>
        <button class="btn-sm ghost" style="margin-left:4px" data-hold="${o.id}">Hold</button>
      </td>
    </tr>
    <tr class="mar-hist-row" id="hist-row-${o.id}"><td colspan="6" style="padding:0">
      <div class="mar-hist" id="hist-${o.id}">
        <div class="mar-hist-inner">
          <table class="mar-hist-tbl">
            <tr><th>Date/Time</th><th>Action</th><th>By</th><th>Witness</th><th>Notes</th></tr>
            ${hist.length ? hist.map(h => `<tr>
              <td>${new Date(h.administered_at).toLocaleString()}</td>
              <td><span class="mar-badge-${h.status === "given" ? "given" : "held"}">${h.status}</span></td>
              <td>${h.administered_by || "—"}</td>
              <td>${h.witnessed_by || "—"}</td>
              <td>${h.hold_reason || ""}</td>
            </tr>`).join("") : `<tr><td colspan="5" style="text-align:center;color:var(--text-muted);padding:8px">No history</td></tr>`}
          </table>
        </div>
      </div>
    </td></tr>`;
  }));

  el.innerHTML = `
    <div class="mar-wrap">
      <div class="mar-header">
        <span class="mar-title">Medication Administration Record</span>
        <div class="mar-header-right">
          <button class="btn-sm" id="mar-add-btn">+ Add Medication</button>
        </div>
      </div>
      <table class="mar-tbl">
        <thead><tr>
          <th>Drug</th><th>Dose</th><th>Route</th><th>Frequency</th><th>Last Action</th><th></th>
        </tr></thead>
        <tbody>${rows.join("") || `<tr><td colspan="6" style="text-align:center;padding:24px;color:var(--text-muted)">No active medication orders.</td></tr>`}</tbody>
      </table>
      <div class="sec-sub" style="padding:10px 14px;font-size:11px">High-alert medications require an independent second-nurse verification before administration.</div>
    </div>

    <div class="mar-add-backdrop" id="mar-backdrop"></div>
    <div class="mar-add-panel" id="mar-add-panel">
      <div class="mar-add-panel-hdr">
        <span class="mar-add-panel-title">Add Medication Order</span>
        <button class="mar-add-panel-close" id="mar-add-close">&#10005;</button>
      </div>
      <div class="mar-add-body">
        <div class="mar-add-field"><label>Drug Name</label><input id="mar-drug" placeholder="e.g. Metoprolol"></div>
        <div class="mar-add-field-row">
          <div class="mar-add-field"><label>Dose</label><input id="mar-dose" placeholder="50 mg"></div>
          <div class="mar-add-field"><label>Route</label>
            <select id="mar-route"><option>PO</option><option>IV</option><option>SC</option><option>IM</option><option>SL</option><option>Topical</option><option>Inhaled</option></select>
          </div>
        </div>
        <div class="mar-add-field"><label>Frequency</label>
          <select id="mar-freq"><option>OD</option><option>BID</option><option>TID</option><option>QID</option><option>Q4H</option><option>Q6H</option><option>Q8H</option><option>Q12H</option><option>PRN</option><option>STAT</option></select>
        </div>
        <div class="mar-add-field"><label>Instructions</label><textarea id="mar-instr" placeholder="Special instructions, e.g. take with food, hold if SBP <90…"></textarea></div>
        <div class="mar-ha-flag">
          <input type="checkbox" id="mar-ha">
          <label for="mar-ha">⚠ Mark as HIGH-ALERT medication</label>
        </div>
      </div>
      <div class="mar-add-footer">
        <button class="mar-add-cancel" id="mar-add-cancel">Cancel</button>
        <button class="mar-add-submit" id="mar-add-submit">Add Order</button>
      </div>
    </div>`;

  function openAddPanel() {
    el.querySelector("#mar-add-panel").classList.add("open");
    el.querySelector("#mar-backdrop").classList.add("open");
  }
  function closeAddPanel() {
    el.querySelector("#mar-add-panel").classList.remove("open");
    el.querySelector("#mar-backdrop").classList.remove("open");
  }

  el.querySelector("#mar-add-btn").onclick = openAddPanel;
  el.querySelector("#mar-add-close").onclick = closeAddPanel;
  el.querySelector("#mar-add-cancel").onclick = closeAddPanel;
  el.querySelector("#mar-backdrop").onclick = closeAddPanel;

  el.querySelector("#mar-add-submit").onclick = async () => {
    const drug = el.querySelector("#mar-drug").value.trim();
    if (!drug) { toast("Enter a drug name", { kind: "crit" }); return; }
    await api.addMedOrder(p, {
      drug_name: drug,
      dose: el.querySelector("#mar-dose").value.trim(),
      route: el.querySelector("#mar-route").value,
      frequency: el.querySelector("#mar-freq").value,
      instructions: el.querySelector("#mar-instr").value.trim(),
      is_high_alert: el.querySelector("#mar-ha").checked,
      is_prn: el.querySelector("#mar-freq").value === "PRN",
    });
    toast("Medication order added");
    closeAddPanel();
    mar(p, el);
  };

  el.querySelectorAll("[data-chev]").forEach(btn => {
    btn.onclick = (e) => {
      e.stopPropagation();
      const id = btn.dataset.chev;
      const hist = el.querySelector(`#hist-${id}`);
      if (hist) {
        hist.classList.toggle("open");
        btn.classList.toggle("open");
      }
    };
  });

  el.querySelectorAll("[data-give]").forEach(btn => btn.onclick = async () => {
    const o = orders.find(x => x.id === btn.dataset.give);
    let witness = null;
    if (o.is_high_alert) {
      witness = prompt(`HIGH-ALERT: ${o.drug_name}\nIndependent double-check — enter verifying nurse's name:`);
      if (!witness) { toast("High-alert med requires second-nurse check.", { kind: "crit" }); return; }
    }
    const by = session?.user?.email || session?.profile?.full_name || "Nurse";
    await api.administer(p, o, { status: "given", by, witness });
    toast(`${o.drug_name} given`);
    mar(p, el);
  });

  el.querySelectorAll("[data-hold]").forEach(btn => btn.onclick = async () => {
    const o = orders.find(x => x.id === btn.dataset.hold);
    const reason = prompt(`Hold ${o.drug_name} — reason:`);
    if (!reason) return;
    const by = session?.user?.email || session?.profile?.full_name || "Nurse";
    await api.administer(p, o, { status: "held", by, holdReason: reason });
    toast(`${o.drug_name} held`);
    mar(p, el);
  });
}

// ── VITAL SIGNS (full VS catalog system) ─────────────────────────────────────

const VS_CATALOG = [
  { id:"temperature",   name:"Temperature",            unit:"°C",   refLow:36.1, refHigh:37.2, type:"numeric" },
  { id:"temp-source",   name:"Temperature Source",     type:"dropdown", results:["Oral","Axillary","Tympanic","Rectal","Temporal"] },
  { id:"heart-rate",    name:"Heart Rate",             unit:"BPM",  refLow:60, refHigh:100, type:"numeric" },
  { id:"pulse-ox",      name:"Pulse Oximetry",         unit:"% SpO2", refLow:95, refHigh:100, type:"numeric" },
  { id:"oxygen-method", name:"Oxygen Method",          type:"oxygen" },
  { id:"respirations",  name:"Respirations / minute",  unit:"br/min", refLow:12, refHigh:20, type:"numeric" },
  { id:"blood-pressure",name:"Blood Pressure",         unit:"mmHg", type:"bp" },
  { id:"bp-location",   name:"BP Location",            type:"dropdown", results:["Right Arm","Left Arm","Right Leg","Left Leg"] },
  { id:"pain-scale",    name:"Pain Scale",             unit:"/10", refLow:0, refHigh:3, type:"numeric" },
  { id:"pain-location", name:"Pain Location",          type:"dropdown", results:["Head","Neck","Chest","Abdomen","Back","Right Arm","Left Arm","Right Leg","Left Leg","Generalized","None"] },
  { id:"pain-comments", name:"Pain Comments",          type:"richtext" },
  { id:"weight",        name:"Weight",                 unit:"kg", refLow:0, refHigh:0, type:"numeric", units:["kg","lbs"] },
  { id:"height",        name:"Height",                 unit:"cm", refLow:0, refHigh:0, type:"numeric", units:["cm","in"] },
  { id:"vs-comments",   name:"Vital Sign Comments",    type:"richtext" },
];
const OXYGEN_METHODS = ["Room Air","Nasal Cannula","Simple Face Mask","Non-Rebreather Mask","High-Flow Nasal Cannula","BiPAP","Ambu-Bag","Blow-by","T-Piece","Trach Collar","Oxy-Mask","Other: See Comments"];

// Per-patient VS data: { [pxId]: { [vsId]: [ {value, date, time, unit?, bpSys?, bpDia?, flowRate?} ] } }
const VS_DATA = {};
let vsOpenId = null;
let vsEntryFormId = null;
let vsGraphToggle = {};
let vsEditIndex = {};
let vsOxygenSearch = "";
let vsOxygenDetailMethod = null;

function getVsEntries(pxId, vsId) { return ((VS_DATA[pxId] || {})[vsId]) || []; }
function addVsEntry(pxId, vsId, entry) {
  if (!VS_DATA[pxId]) VS_DATA[pxId] = {};
  if (!VS_DATA[pxId][vsId]) VS_DATA[pxId][vsId] = [];
  VS_DATA[pxId][vsId].push(entry);
}

export async function vitals(p, el) {
  const pxId = p.id;
  const renderVitals = () => {
    // Summary cards
    const SUMMARY_VS = [
      { id:"temperature",  label:"Temperature",  unit:"°C",   refLow:36.1, refHigh:37.2 },
      { id:"heart-rate",   label:"Heart Rate",   unit:"BPM",  refLow:60,   refHigh:100 },
      { id:"blood-pressure",label:"Blood Pressure", unit:"mmHg", refLow:0, refHigh:0, bp:true },
      { id:"pulse-ox",     label:"SpO2",         unit:"%",    refLow:95,   refHigh:100 },
      { id:"respirations", label:"Resp Rate",    unit:"br/min", refLow:12, refHigh:20 },
      { id:"pain-scale",   label:"Pain Scale",   unit:"/10",  refLow:0,    refHigh:3 },
      { id:"weight",       label:"Weight",       unit:"kg",   refLow:0,    refHigh:0 },
      { id:"height",       label:"Height",       unit:"cm",   refLow:0,    refHigh:0 },
    ];
    const summaryCards = SUMMARY_VS.map(sv => {
      const ents = getVsEntries(pxId, sv.id);
      const latest = ents.length ? ents[ents.length - 1] : null;
      let valTxt = "—", unitTxt = sv.unit, cls = "", flagTxt = "", flagCls = "";
      if (latest) {
        if (sv.bp) {
          valTxt = (latest.bpSys || "—") + "/" + (latest.bpDia || "—");
          const sys = parseFloat(latest.bpSys) || 0;
          if (sys > 140) { cls = "abn"; flagTxt = "HIGH"; flagCls = "h-badge"; }
          else if (sys > 0 && sys < 90) { cls = "warn"; flagTxt = "LOW"; flagCls = "d-badge"; }
        } else {
          const num = parseFloat(latest.value);
          valTxt = isNaN(num) ? latest.value : num;
          unitTxt = latest.unit || sv.unit;
          if (!isNaN(num)) {
            if (sv.refHigh > 0 && num > sv.refHigh) { cls = "abn"; flagTxt = "HIGH"; flagCls = "h-badge"; }
            else if (sv.refLow > 0 && num < sv.refLow) { cls = "warn"; flagTxt = "LOW"; flagCls = "d-badge"; }
            else if (sv.refHigh > 0) { flagTxt = "NORMAL"; flagCls = "g-badge"; }
          }
        }
      }
      return `<div class="vcrd ${cls}">
        <div class="vval" style="font-size:${String(valTxt).length > 7 ? "16px" : "20px"}">${valTxt}</div>
        <div class="vunit">${unitTxt}</div>
        <div class="vname">${sv.label}</div>
        ${flagTxt ? `<span class="${flagCls}" style="font-size:9px;padding:1px 6px;margin-top:3px;display:inline-block">${flagTxt}</span>` : ""}
        ${latest ? `<div style="font-size:9px;color:var(--text-light);margin-top:3px">${latest.date} ${latest.time}</div>` : ""}
      </div>`;
    }).join("");

    // VS alerts
    const vsAlerts = [];
    SUMMARY_VS.forEach(sv => {
      const ents = getVsEntries(pxId, sv.id);
      const latest = ents.length ? ents[ents.length - 1] : null;
      if (!latest) return;
      if (sv.bp) {
        const sys = parseFloat(latest.bpSys) || 0;
        if (sys > 140) vsAlerts.push({ label:"Blood Pressure", val:latest.bpSys+"/"+latest.bpDia+" mmHg", flag:"HIGH", sev:"critical" });
        else if (sys > 0 && sys < 90) vsAlerts.push({ label:"Blood Pressure", val:latest.bpSys+"/"+latest.bpDia+" mmHg", flag:"LOW", sev:"warning" });
      } else {
        const num = parseFloat(latest.value);
        if (!isNaN(num)) {
          if (sv.refHigh > 0 && num > sv.refHigh) vsAlerts.push({ label:sv.label, val:num+" "+sv.unit, flag:"HIGH", sev:"critical" });
          else if (sv.refLow > 0 && num < sv.refLow) vsAlerts.push({ label:sv.label, val:num+" "+sv.unit, flag:"LOW", sev:"warning" });
        }
      }
    });
    setTimeout(() => pushAlerts(vsAlerts, pxId, p.full_name, "vitals"), 100);

    // VS rows
    const rows = VS_CATALOG.map(vs => {
      const entries = getVsEntries(pxId, vs.id);
      const hasData = entries.length > 0;
      const isGraphable = vs.type === "numeric" || vs.type === "bp";
      const waveSvg = `<svg class="lab-graph-icon${hasData ? " lab-graph-icon-active" : ""}" viewBox="0 0 20 14" fill="none"><path d="M1 10 Q3 2 5 7 Q7 12 9 5 Q11 -1 13 8 Q15 14 17 6 Q19 2 19 4" stroke="${hasData ? "#2563EB" : "#A8B5CC"}" stroke-width="1.5" stroke-linecap="round" fill="none"/></svg>`;
      const leftIcon = isGraphable ? waveSvg : `<div style="width:20px;flex-shrink:0"></div>`;
      const qualCls = (vs.type !== "numeric" && vs.type !== "bp") ? " qualitative-row" : "";
      const isOpen = vsOpenId === vs.id;

      const entryCols = entries.map((en, ei) => {
        let displayVal = en.value || "—";
        if (en.unit) displayVal += " " + en.unit;
        else if (vs.type === "bp") displayVal = (en.bpSys || "—") + "/" + (en.bpDia || "—") + " mmHg";
        else if (vs.type === "oxygen") displayVal = en.value + (en.flowRate ? " — " + en.flowRate + " L/min" : "");
        return `<div class="lab-entry-col">
          <div class="lab-entry-date-bubble">
            <div class="lab-bubble-header">
              <div class="lab-bubble-dot"></div>
              <span class="lab-bubble-pencil" data-vs-action="edit-entry" data-vs-id="${vs.id}" data-vs-ei="${ei}">&#9998;</span>
            </div>
            <div class="lab-bubble-date">${en.date}</div>
            <div class="lab-bubble-time">${en.time}</div>
          </div>
          <div class="lab-entry-value normal" style="font-size:11px;text-align:center;white-space:nowrap">${displayVal}</div>
        </div>`;
      }).join("");

      let rowHtml = `<div class="lab-row${qualCls}${hasData ? " has-data" : ""}" data-vs-id="${vs.id}">
        <div class="lab-cell-name">${leftIcon}<span class="lab-name">${vs.name}</span></div>
        ${entryCols}
      </div>`;

      if (!isOpen) return rowHtml;

      // Entry form
      let entryFormHtml = "";
      if (vsEntryFormId === vs.id) {
        const editIdx = vsEditIndex[vs.id];
        const editEn = (editIdx !== undefined && editIdx >= 0) ? entries[editIdx] : null;
        const preVal = editEn ? editEn.value : "";
        const preDateRaw = editEn ? editEn.dateRaw : nowDate();
        const preTime = editEn ? editEn.time : nowTime();
        let inputHtml = "";
        if (vs.type === "bp") {
          inputHtml = `<div class="lab-entry-field"><label>Sys</label><input id="vs-sys-${vs.id}" type="number" value="${editEn?.bpSys||""}" placeholder="120" style="width:70px"/></div>
            <span style="font-size:18px;font-weight:600;color:var(--text-muted);align-self:flex-end;padding-bottom:6px">/</span>
            <div class="lab-entry-field"><label>Dia</label><input id="vs-dia-${vs.id}" type="number" value="${editEn?.bpDia||""}" placeholder="80" style="width:70px"/></div>
            <div class="lab-unit-badge">mmHg</div>`;
        } else if (vs.type === "dropdown") {
          inputHtml = `<div class="lab-entry-field"><label>${vs.name}</label>
            <select id="vs-val-${vs.id}" style="height:36px;border:1.5px solid var(--border);border-radius:7px;padding:0 10px;font-family:inherit;font-size:13px;background:#fff;outline:none;min-width:180px">
              <option value="">— Select —</option>
              ${(vs.results||[]).map(r => `<option value="${r}"${r===preVal?" selected":""}>${r}</option>`).join("")}
            </select></div>`;
        } else if (vs.type === "richtext") {
          inputHtml = `<div class="lab-entry-field" style="flex:1"><label>${vs.name}</label>
            <textarea id="vs-rt-${vs.id}" style="width:100%;min-height:60px;border:1.5px solid var(--border);border-radius:7px;padding:8px 10px;font-family:inherit;font-size:13px;resize:vertical;outline:none">${preVal}</textarea></div>`;
        } else {
          const unitSel = vs.units && vs.units.length > 1
            ? `<select id="vs-unit-${vs.id}" style="height:36px;border:1.5px solid var(--border);border-radius:7px;padding:0 8px;font-family:inherit;font-size:12px;background:#fff;outline:none">${vs.units.map(u=>`<option value="${u}">${u}</option>`).join("")}</select>`
            : `<div class="lab-unit-badge">${vs.unit}</div>`;
          inputHtml = `<div class="lab-entry-field"><label>Value</label><input id="vs-val-${vs.id}" type="number" step="any" value="${preVal}" placeholder="Enter value" style="width:110px"/></div>${unitSel}`;
        }
        if (vs.type !== "oxygen") {
          entryFormHtml = `<div class="lab-entry-form"><div class="lab-entry-form-row">
            ${inputHtml}
            <div class="lab-entry-field"><label>Date</label><input id="vs-date-${vs.id}" type="date" value="${preDateRaw}" style="width:130px"/></div>
            <div class="lab-entry-field"><label>Time</label><input id="vs-time-${vs.id}" type="text" value="${preTime}" style="width:85px"/></div>
            <button class="btn-lab-save" data-vs-action="save" data-vs-id="${vs.id}">Save</button>
          </div></div>`;
        }
      }

      // Oxygen modal
      let oxygenHtml = "";
      if (vs.type === "oxygen" && vsEntryFormId === vs.id) {
        if (vsOxygenDetailMethod) {
          oxygenHtml = `<div class="lab-detail-panel">
            <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:14px">
              <div class="lab-detail-name">${vs.name} — ${vsOxygenDetailMethod}</div>
              <button class="btn-lab-entry" data-vs-action="oxygen-cancel" data-vs-id="${vs.id}">Cancel</button>
            </div>
            <div style="display:flex;gap:12px;flex-wrap:wrap;align-items:flex-end;margin-bottom:12px">
              <div class="lab-entry-field"><label>Flow Rate (L/min)</label><input id="vs-oxygen-fr" type="number" step="0.1" placeholder="e.g. 2" style="width:100px"/></div>
              <div class="lab-entry-field"><label>Comments</label><input id="vs-oxygen-comm" type="text" style="width:180px"/></div>
              <div class="lab-entry-field"><label>Date</label><input id="vs-date-${vs.id}" type="date" value="${nowDate()}" style="width:130px"/></div>
              <div class="lab-entry-field"><label>Time</label><input id="vs-time-${vs.id}" type="text" value="${nowTime()}" style="width:85px"/></div>
              <button class="btn-lab-save" data-vs-action="oxygen-confirm" data-vs-id="${vs.id}">OK</button>
            </div>
          </div>`;
        } else {
          const filtered = OXYGEN_METHODS.filter(m => !vsOxygenSearch || m.toLowerCase().includes(vsOxygenSearch.toLowerCase()));
          oxygenHtml = `<div class="lab-detail-panel">
            <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:14px">
              <div class="lab-detail-name">Select Oxygen Method</div>
              <button class="btn-lab-entry" data-vs-action="oxygen-cancel" data-vs-id="${vs.id}">Cancel</button>
            </div>
            <input id="vs-oxygen-search" type="text" placeholder="Search…" value="${vsOxygenSearch}" style="width:100%;height:36px;border:1.5px solid var(--border);border-radius:7px;padding:0 10px;font-family:inherit;font-size:13px;outline:none;margin-bottom:8px"/>
            <div style="background:#fff;border:1px solid var(--border);border-radius:8px;overflow:hidden">
              ${filtered.map(m => `<div style="padding:9px 14px;cursor:pointer;font-size:13px;color:var(--text);border-bottom:1px solid var(--border)" data-vs-action="oxygen-select" data-method="${m}" data-vs-id="${vs.id}">${m}</div>`).join("")}
            </div>
          </div>`;
        }
      }

      // Chart for numeric
      let chartHtml = "";
      const numericEntries = entries.filter(e => !isNaN(parseFloat(e.value)));
      if (isGraphable && numericEntries.length > 0) {
        const graphOn = vsGraphToggle[vs.id] !== false;
        const canvasId = "vscnv-" + vs.id.replace(/[^a-z0-9]/g, "-");
        chartHtml = `<div class="lab-chart-wrap">
          <div class="lab-chart-title">
            <div class="lab-chart-toggle${graphOn ? "" : " off"}" data-vs-action="toggle-graph" data-vs-id="${vs.id}"><div class="lab-chart-toggle-dot"></div></div>
            <div class="lab-chart-legend"><span class="lab-chart-legend-dot"></span>${vs.name}</div>
          </div>
          ${graphOn ? `<div class="lab-chart-canvas-wrap"><canvas id="${canvasId}" class="lab-canvas"></canvas></div>
            <span data-pending-chart="${canvasId}"
              data-vals="${encodeURIComponent(JSON.stringify(numericEntries.map(e => vs.type==="bp" ? parseFloat(e.bpSys)||0 : parseFloat(e.value)||0)))}"
              data-labels="${encodeURIComponent(JSON.stringify(numericEntries.map(e => e.date+" "+e.time)))}"
              data-ref-low="${vs.refLow||0}" data-ref-high="${vs.refHigh||0}"></span>` : ""}
        </div>`;
      }

      const refStr = (vs.refLow > 0 || vs.refHigh > 0) ? `Reference: ${vs.refLow} – ${vs.refHigh} ${vs.unit}` : "";
      const detailPanel = (vs.type !== "oxygen" || vsEntryFormId !== vs.id) ? `<div class="lab-detail-panel">
        <div class="lab-detail-header">
          <div><div class="lab-detail-name">${vs.name}</div><div class="lab-detail-ref">${refStr}</div></div>
          <button class="btn-lab-entry" data-vs-action="new-entry" data-vs-id="${vs.id}">+ New Entry</button>
        </div>
        ${entryFormHtml}${chartHtml}
      </div>` : "";

      return rowHtml + (vs.type === "oxygen" && vsEntryFormId === vs.id ? oxygenHtml : detailPanel);
    }).join("");

    el.innerHTML = `
      <div class="labs-wrap">
        <div class="labs-header"><span class="labs-header-title">Vital Signs</span></div>
        <div style="padding:14px 16px 0;border-bottom:1px solid var(--border)">
          <div style="font-size:11px;font-weight:600;color:var(--text-light);text-transform:uppercase;letter-spacing:.7px;margin-bottom:10px">Current Vitals</div>
          <div style="display:grid;grid-template-columns:repeat(4,1fr);gap:9px;margin-bottom:14px">${summaryCards}</div>
        </div>
        ${rows}
      </div>`;

    attachVsHandlers(el, pxId, renderVitals);
    setTimeout(() => renderPendingCharts(el), 80);
  };
  renderVitals();
}

function attachVsHandlers(el, pxId, rerender) {
  el.addEventListener("click", e => {
    // Row expand/collapse
    const vsRow = e.target.closest("[data-vs-id]");
    const vsAction = e.target.closest("[data-vs-action]");
    if (vsAction) {
      const act = vsAction.getAttribute("data-vs-action");
      const vid = vsAction.getAttribute("data-vs-id");
      if (act === "new-entry") { vsEntryFormId = vid; vsOpenId = vid; rerender(); return; }
      if (act === "save") { saveVsEntry(pxId, vid, el); return; }
      if (act === "toggle-graph") { vsGraphToggle[vid] = !vsGraphToggle[vid]; rerender(); return; }
      if (act === "edit-entry") {
        const ei = parseInt(vsAction.getAttribute("data-vs-ei") || "0");
        vsEditIndex[vid] = ei; vsEntryFormId = vid; vsOpenId = vid; rerender(); return;
      }
      if (act === "oxygen-select") { vsOxygenDetailMethod = vsAction.getAttribute("data-method"); rerender(); return; }
      if (act === "oxygen-confirm") { saveVsOxygenEntry(pxId, vid, el); return; }
      if (act === "oxygen-cancel") { vsOxygenDetailMethod = null; vsEntryFormId = null; rerender(); return; }
      return;
    }
    if (vsRow && !e.target.closest("[data-vs-action]")) {
      const vid = vsRow.getAttribute("data-vs-id");
      vsOpenId = vsOpenId === vid ? null : vid;
      rerender();
    }
  });
  el.addEventListener("input", e => {
    if (e.target.id === "vs-oxygen-search") { vsOxygenSearch = e.target.value; rerender(); }
  });
}

function saveVsEntry(pxId, vsId, el) {
  const cat = VS_CATALOG.find(v => v.id === vsId);
  if (!cat) return;
  const dateEl = el.querySelector(`#vs-date-${vsId}`);
  const timeEl = el.querySelector(`#vs-time-${vsId}`);
  const dateVal = dateEl ? dateEl.value : nowDate();
  const timeVal = timeEl ? timeEl.value : nowTime();
  const entry = { date: dispDate(dateVal), dateRaw: dateVal, time: timeVal, timestamp: Date.now() };

  if (cat.type === "bp") {
    const sys = el.querySelector(`#vs-sys-${vsId}`);
    if (!sys || !sys.value) { alert("Enter systolic value."); return; }
    entry.bpSys = sys.value; entry.bpDia = el.querySelector(`#vs-dia-${vsId}`)?.value || "";
    entry.value = entry.bpSys + "/" + entry.bpDia;
  } else if (cat.type === "richtext") {
    entry.value = el.querySelector(`#vs-rt-${vsId}`)?.value || "";
  } else {
    const valEl = el.querySelector(`#vs-val-${vsId}`);
    if (!valEl || !valEl.value.trim()) { alert("Enter a value."); return; }
    entry.value = valEl.value;
    entry.unit = el.querySelector(`#vs-unit-${vsId}`)?.value || cat.unit || "";
  }

  const editIdx = vsEditIndex[vsId];
  if (editIdx !== undefined && editIdx >= 0) {
    if (VS_DATA[pxId] && VS_DATA[pxId][vsId]) VS_DATA[pxId][vsId][editIdx] = entry;
    delete vsEditIndex[vsId];
  } else {
    addVsEntry(pxId, vsId, entry);
  }
  vsEntryFormId = null; vsOpenId = vsId;
  // re-render
  vitals({ id: pxId }, el);
}

function saveVsOxygenEntry(pxId, vsId, el) {
  if (!vsOxygenDetailMethod) { alert("Select an oxygen method."); return; }
  const dateEl = el.querySelector(`#vs-date-${vsId}`);
  const timeEl = el.querySelector(`#vs-time-${vsId}`);
  const dateVal = dateEl ? dateEl.value : nowDate();
  const timeVal = timeEl ? timeEl.value : nowTime();
  addVsEntry(pxId, vsId, {
    date: dispDate(dateVal), dateRaw: dateVal, time: timeVal, timestamp: Date.now(),
    value: vsOxygenDetailMethod,
    flowRate: el.querySelector("#vs-oxygen-fr")?.value || "",
    comments: el.querySelector("#vs-oxygen-comm")?.value || "",
  });
  vsOxygenModalOpen = false; vsOxygenDetailMethod = null; vsEntryFormId = null; vsOpenId = vsId;
  vitals({ id: pxId }, el);
}

// ── LABS (full catalog) ───────────────────────────────────────────────────────

const LAB_CATALOG = [
  {id:"cbc",name:"Complete Blood Count",sectionHeader:true},
  {id:"wbc",name:"WBC",unit:"10³/µL",refLow:4.5,refHigh:11,numeric:true},
  {id:"rbc",name:"RBC",unit:"10⁶/µL",refLow:4.2,refHigh:5.4,numeric:true},
  {id:"hemoglobin",name:"Hemoglobin",unit:"g/dL",refLow:12,refHigh:17,numeric:true},
  {id:"hematocrit",name:"Hematocrit",unit:"%",refLow:36,refHigh:50,numeric:true},
  {id:"platelet",name:"Platelet Count",unit:"10³/µL",refLow:150,refHigh:400,numeric:true},
  {id:"neutrophils",name:"Neutrophils",unit:"%",refLow:50,refHigh:70,numeric:true},
  {id:"lymphocytes",name:"Lymphocytes",unit:"%",refLow:20,refHigh:40,numeric:true},
  {id:"cmp",name:"Comprehensive Metabolic Panel",sectionHeader:true},
  {id:"glucose",name:"Glucose",unit:"mg/dL",refLow:70,refHigh:100,numeric:true},
  {id:"bun",name:"BUN",unit:"mg/dL",refLow:7,refHigh:20,numeric:true},
  {id:"creatinine",name:"Creatinine",unit:"mg/dL",refLow:0.6,refHigh:1.2,numeric:true},
  {id:"sodium",name:"Sodium",unit:"mEq/L",refLow:136,refHigh:145,numeric:true},
  {id:"potassium",name:"Potassium",unit:"mEq/L",refLow:3.5,refHigh:5.0,numeric:true},
  {id:"chloride",name:"Chloride",unit:"mEq/L",refLow:98,refHigh:106,numeric:true},
  {id:"co2",name:"CO2 (Bicarbonate)",unit:"mEq/L",refLow:22,refHigh:29,numeric:true},
  {id:"calcium",name:"Calcium",unit:"mg/dL",refLow:8.5,refHigh:10.5,numeric:true},
  {id:"albumin",name:"Albumin",unit:"g/dL",refLow:3.5,refHigh:5.0,numeric:true},
  {id:"alt",name:"ALT",unit:"U/L",refLow:7,refHigh:56,numeric:true},
  {id:"ast",name:"AST",unit:"U/L",refLow:10,refHigh:40,numeric:true},
  {id:"coag",name:"Coagulation",sectionHeader:true},
  {id:"pt",name:"PT",unit:"sec",refLow:11,refHigh:13.5,numeric:true},
  {id:"inr",name:"INR",unit:"",refLow:0.8,refHigh:1.1,numeric:true},
  {id:"ptt",name:"PTT",unit:"sec",refLow:25,refHigh:35,numeric:true},
  {id:"cardiac",name:"Cardiac Markers",sectionHeader:true},
  {id:"troponin",name:"Troponin I",unit:"ng/mL",refLow:0,refHigh:0.04,numeric:true},
  {id:"bnp",name:"BNP",unit:"pg/mL",refLow:0,refHigh:100,numeric:true},
  {id:"ckmb",name:"CK-MB",unit:"ng/mL",refLow:0,refHigh:5,numeric:true},
  {id:"diabetes",name:"Diabetes",sectionHeader:true},
  {id:"hba1c",name:"HbA1c",unit:"%",refLow:0,refHigh:5.7,numeric:true},
  {id:"fbs",name:"Fasting Blood Sugar",unit:"mg/dL",refLow:70,refHigh:100,numeric:true},
  {id:"thyroid",name:"Thyroid Function",sectionHeader:true},
  {id:"tsh",name:"TSH",unit:"mIU/L",refLow:0.4,refHigh:4.0,numeric:true},
  {id:"t4",name:"Free T4",unit:"ng/dL",refLow:0.8,refHigh:1.8,numeric:true},
  {id:"urinalysis",name:"Urinalysis",sectionHeader:true,results:["Normal","Abnormal — Proteinuria","Abnormal — Hematuria","Abnormal — Glucosuria","Abnormal — Pyuria","Abnormal — Mixed"]},
  {id:"ua-bacteria",name:"Urine Bacteria",sectionHeader:true,results:["None","Few","Moderate","Many"]},
  {id:"blood-culture",name:"Blood Culture",sectionHeader:true,results:["No Growth","Growth — Gram Positive","Growth — Gram Negative","Growth — Fungal","Contaminated","Pending"]},
  {id:"covid",name:"COVID-19 Antigen",sectionHeader:true,results:["Negative","Positive","Indeterminate"]},
];

const LAB_DATA = {};
let labOpenId = null;
let labEntryFormId = null;
let labGraphToggle = {};
let labEditIndex = {};

function getLabEntries(pxId, labId) { return ((LAB_DATA[pxId] || {})[labId]) || []; }
function addLabEntry(pxId, labId, entry) {
  if (!LAB_DATA[pxId]) LAB_DATA[pxId] = {};
  if (!LAB_DATA[pxId][labId]) LAB_DATA[pxId][labId] = [];
  LAB_DATA[pxId][labId].push(entry);
}

export async function labs(p, el) {
  const pxId = p.id;
  const renderLabs = () => {
    const rows = LAB_CATALOG.map(lab => {
      if (lab.sectionHeader && !lab.results) {
        return `<div class="lab-row section-header-row"><span class="lab-section-label">${lab.name}</span></div>`;
      }
      const entries = getLabEntries(pxId, lab.id);
      const hasData = entries.length > 0;
      const graphSvg = `<svg class="lab-graph-icon${hasData ? " lab-graph-icon-active" : ""}" viewBox="0 0 20 14" fill="none"><path d="M1 10 Q3 2 5 7 Q7 12 9 5 Q11 -1 13 8 Q15 14 17 6 Q19 2 19 4" stroke="${hasData ? "#2563EB" : "#A8B5CC"}" stroke-width="1.5" stroke-linecap="round" fill="none"/></svg>`;
      const qualCls = lab.sectionHeader ? " qualitative-row" : "";
      const isOpen = labOpenId === lab.id;

      const entryCols = entries.map((en, ei) => {
        let valCls = "normal", valTxt = "";
        if (!isNaN(parseFloat(en.value))) {
          const v = parseFloat(en.value);
          if (lab.refHigh > 0 && v > lab.refHigh) valCls = "high";
          else if (lab.refLow > 0 && v < lab.refLow) valCls = "low";
          valTxt = v + " " + (lab.unit || "");
        } else { valTxt = en.value || "—"; }
        return `<div class="lab-entry-col">
          <div class="lab-entry-date-bubble">
            <div class="lab-bubble-header">
              <div class="lab-bubble-dot"></div>
              <span class="lab-bubble-pencil" data-lab-action="edit-entry" data-lab-lid="${lab.id}" data-lab-ei="${ei}">&#9998;</span>
            </div>
            <div class="lab-bubble-date">${en.date}</div>
            <div class="lab-bubble-time">${en.time}</div>
          </div>
          <div class="lab-entry-value ${valCls}">${valTxt}</div>
        </div>`;
      }).join("");

      const rowHtml = `<div class="lab-row${qualCls}${hasData ? " has-data" : ""}" data-lab-id="${lab.id}">
        <div class="lab-cell-name">${graphSvg}<span class="lab-name">${lab.name}</span></div>
        ${entryCols}
      </div>`;

      if (!isOpen) return rowHtml;

      // Entry form
      let entryFormHtml = "";
      if (labEntryFormId === lab.id) {
        const editIdx = labEditIndex[lab.id];
        const editEn = (editIdx !== undefined && editIdx >= 0) ? entries[editIdx] : null;
        const preVal = editEn ? editEn.value : "";
        let inputHtml = "";
        if (lab.results && lab.results.length > 0) {
          inputHtml = `<div class="lab-entry-field"><label>Result</label>
            <select id="lab-val-${lab.id}" style="height:36px;border:1.5px solid var(--border);border-radius:7px;padding:0 10px;font-family:inherit;font-size:13px;background:#fff;outline:none;min-width:200px">
              <option value="">— Select —</option>
              ${lab.results.map(r => `<option value="${r}"${r===preVal?" selected":""}>${r}</option>`).join("")}
            </select></div>`;
        } else {
          inputHtml = `<div class="lab-entry-field"><label>${editEn ? "Edit Value" : "Value"}</label>
            <input type="number" step="any" id="lab-val-${lab.id}" placeholder="Enter value" value="${preVal}" style="width:110px"/>
          </div><div class="lab-unit-badge">${lab.unit||""}</div>`;
        }
        entryFormHtml = `<div class="lab-entry-form"><div class="lab-entry-form-row">
          ${inputHtml}
          <div class="lab-entry-field"><label>Date</label><input type="date" id="lab-date-${lab.id}" value="${nowDate()}" style="width:130px"/></div>
          <div class="lab-entry-field"><label>Time</label><input type="text" id="lab-time-${lab.id}" value="${nowTime()}" style="width:85px"/></div>
          <button class="btn-lab-save" data-lab-action="save" data-lab-lid="${lab.id}">Save</button>
        </div></div>`;
      }

      // Chart
      let chartHtml = "";
      const numericEntries = entries.filter(e => !isNaN(parseFloat(e.value)));
      if (numericEntries.length > 0) {
        const graphOn = labGraphToggle[lab.id] !== false;
        const canvasId = "canvas-" + lab.id.replace(/[^a-z0-9]/g, "-");
        chartHtml = `<div class="lab-chart-wrap">
          <div class="lab-chart-title">
            <div class="lab-chart-toggle${graphOn ? "" : " off"}" data-lab-action="toggle-graph" data-lab-lid="${lab.id}"><div class="lab-chart-toggle-dot"></div></div>
            <div class="lab-chart-legend"><span class="lab-chart-legend-dot"></span>${lab.name}</div>
          </div>
          ${graphOn ? `<div class="lab-chart-canvas-wrap"><canvas id="${canvasId}" class="lab-canvas"></canvas></div>
            <span data-pending-chart="${canvasId}"
              data-vals="${encodeURIComponent(JSON.stringify(numericEntries.map(e=>parseFloat(e.value))))}"
              data-labels="${encodeURIComponent(JSON.stringify(numericEntries.map(e=>e.date+" "+e.time)))}"
              data-ref-low="${lab.refLow||0}" data-ref-high="${lab.refHigh||0}"></span>` : ""}
        </div>`;
      } else if (entries.length > 0 && lab.results) {
        chartHtml = `<div class="lab-chart-wrap"><table style="width:100%;border-collapse:collapse;font-size:12px">
          <thead><tr style="background:var(--cream)"><th style="padding:7px 12px;text-align:left;font-size:10px;color:var(--text-muted);text-transform:uppercase">Date</th><th style="padding:7px 12px;text-align:left;font-size:10px;color:var(--text-muted);text-transform:uppercase">Time</th><th style="padding:7px 12px;text-align:left;font-size:10px;color:var(--text-muted);text-transform:uppercase">Result</th></tr></thead>
          <tbody>${entries.map(en => `<tr style="border-bottom:1px solid var(--border)"><td style="padding:8px 12px;color:var(--text-muted)">${en.date}</td><td style="padding:8px 12px;color:var(--text-muted)">${en.time}</td><td style="padding:8px 12px;font-weight:500;color:var(--navy)">${en.value}</td></tr>`).join("")}</tbody>
        </table></div>`;
      }

      const refStr = (lab.refLow > 0 || lab.refHigh > 0) ? `Reference: ${lab.refLow} – ${lab.refHigh} ${lab.unit||""}` : "";
      const detailPanel = `<div class="lab-detail-panel">
        <div class="lab-detail-header">
          <div><div class="lab-detail-name">${lab.name}</div><div class="lab-detail-ref">${refStr}</div></div>
          <button class="btn-lab-entry" data-lab-action="open-entry" data-lab-lid="${lab.id}">+ New Entry</button>
        </div>
        ${entryFormHtml}${chartHtml}
      </div>`;

      return rowHtml + detailPanel;
    }).join("");

    el.innerHTML = `<div class="labs-wrap">
      <div class="labs-header"><span class="labs-header-title">Laboratory Results</span></div>
      ${rows}
    </div>`;

    el.addEventListener("click", e => {
      const labAction = e.target.closest("[data-lab-action]");
      if (labAction) {
        const act = labAction.getAttribute("data-lab-action");
        const lid = labAction.getAttribute("data-lab-lid");
        if (act === "open-entry") { labEntryFormId = lid; labOpenId = lid; renderLabs(); return; }
        if (act === "save") { saveLabEntry(pxId, lid, el, renderLabs); return; }
        if (act === "toggle-graph") { labGraphToggle[lid] = !labGraphToggle[lid]; renderLabs(); return; }
        if (act === "edit-entry") {
          const ei = parseInt(labAction.getAttribute("data-lab-ei") || "0");
          labEditIndex[lid] = ei; labEntryFormId = lid; labOpenId = lid; renderLabs(); return;
        }
        return;
      }
      const labRow = e.target.closest("[data-lab-id]");
      if (labRow && !e.target.closest("[data-lab-action]")) {
        const lid = labRow.getAttribute("data-lab-id");
        labOpenId = labOpenId === lid ? null : lid;
        renderLabs();
      }
    }, { once: true });

    setTimeout(() => renderPendingCharts(el), 80);
  };
  renderLabs();
}

function saveLabEntry(pxId, labId, el, rerender) {
  const valEl = el.querySelector(`#lab-val-${labId}`);
  if (!valEl || !valEl.value.trim()) { alert("Please enter a value."); return; }
  const dateEl = el.querySelector(`#lab-date-${labId}`);
  const timeEl = el.querySelector(`#lab-time-${labId}`);
  const entry = {
    value: parseFloat(valEl.value) || valEl.value,
    date: dispDate(dateEl ? dateEl.value : nowDate()),
    time: timeEl ? timeEl.value : nowTime(),
    timestamp: Date.now(),
  };
  const editIdx = labEditIndex[labId];
  if (editIdx !== undefined && editIdx >= 0) {
    if (LAB_DATA[pxId] && LAB_DATA[pxId][labId]) LAB_DATA[pxId][labId][editIdx] = entry;
    delete labEditIndex[labId];
  } else {
    addLabEntry(pxId, labId, entry);
  }
  labEntryFormId = null; labOpenId = labId;
  rerender();
  setTimeout(() => renderPendingCharts(el), 80);
}

// ── I&O ──────────────────────────────────────────────────────────────────────

const IO_INTAKE_TYPES = ["IV Fluids","PO Intake","NG Tube Feeds","TPN","Blood Products","Medications (IV)","Other Intake"];
const IO_OUTPUT_TYPES = ["Urine (Voided)","Urine (Catheter)","Emesis/Vomitus","NG Output","Wound Drainage","Chest Tube","Stool","Other Output"];
const IO_SHIFTS = ["AM (07:00–15:00)","PM (15:00–23:00)","NOC (23:00–07:00)"];

const IO_DATA = {}; // { pxId: [{id,type,direction,volume,shift,time,notes,date}] }
let ioShift = 0;
let ioDeleteConfirm = null;

function getIoEntries(pxId) { return IO_DATA[pxId] || []; }

export async function io(p, el) {
  const pxId = p.id;
  if (!IO_DATA[pxId]) IO_DATA[pxId] = [];

  const renderIO = () => {
    const entries = getIoEntries(pxId);
    const shiftEntries = entries.filter(e => e.shift === ioShift);
    const totalIntake = entries.reduce((s, e) => e.direction === "intake" ? s + (e.volume || 0) : s, 0);
    const totalOutput = entries.reduce((s, e) => e.direction === "output" ? s + (e.volume || 0) : s, 0);
    const balance = totalIntake - totalOutput;
    const balanceCls = balance < -500 ? "io-color-red" : balance < 0 ? "io-color-amber" : "io-color-teal";
    const shiftIntake = shiftEntries.reduce((s, e) => e.direction === "intake" ? s + (e.volume || 0) : s, 0);
    const shiftOutput = shiftEntries.reduce((s, e) => e.direction === "output" ? s + (e.volume || 0) : s, 0);

    const tblRows = shiftEntries.length ? shiftEntries.map(e => `
      <tr>
        <td>${e.time}</td>
        <td><span class="${e.direction === "intake" ? "io-badge-intake" : "io-badge-output"}">${e.direction}</span></td>
        <td>${e.type}</td>
        <td class="io-vol">${e.volume} mL</td>
        <td style="color:var(--text-muted);font-size:11px">${e.notes||""}</td>
        <td>
          ${ioDeleteConfirm === e.id
            ? `<div class="io-delete-confirm"><span>Delete?</span><button class="io-delete-yes" data-io-del-yes="${e.id}">Yes</button><button class="io-delete-no" data-io-del-no>No</button></div>`
            : `<button class="io-action-btn del" data-io-del="${e.id}">&#128465;</button>`}
        </td>
      </tr>`) .join("")
      : `<tr><td colspan="6"><div class="io-empty-state"><div class="io-empty-icon">&#128197;</div><div class="io-empty-title">No entries for this shift</div></div></td></tr>`;

    // SVG bar chart for quick summary
    const maxVol = Math.max(totalIntake, totalOutput, 500);
    const svgW = 200, svgH = 80;
    const iH = Math.round((totalIntake / maxVol) * 60);
    const oH = Math.round((totalOutput / maxVol) * 60);
    const chartSvg = `<svg viewBox="0 0 200 80" class="io-chart-svg">
      <rect x="20" y="${70-iH}" width="60" height="${iH}" rx="4" fill="#2BBFAD"/>
      <rect x="120" y="${70-oH}" width="60" height="${oH}" rx="4" fill="#D97706"/>
      <text x="50" y="78" text-anchor="middle" font-size="9" fill="#6B7C99">Intake</text>
      <text x="150" y="78" text-anchor="middle" font-size="9" fill="#6B7C99">Output</text>
    </svg>`;

    el.innerHTML = `
      <div class="io-wrap">
        <div class="io-summary-bar">
          <div class="io-tiles">
            <div class="io-tile"><div class="io-tile-label">Total Intake</div><div class="io-tile-value io-color-teal">${totalIntake}<span class="io-tile-unit">mL</span></div></div>
            <div class="io-tile"><div class="io-tile-label">Total Output</div><div class="io-tile-value io-color-amber">${totalOutput}<span class="io-tile-unit">mL</span></div></div>
            <div class="io-tile"><div class="io-tile-label">Net Balance</div><div class="io-tile-value ${balanceCls}">${balance >= 0 ? "+" : ""}${balance}<span class="io-tile-unit">mL</span></div></div>
            <div class="io-tile"><div class="io-tile-label">Shift In</div><div class="io-tile-value io-color-teal">${shiftIntake}<span class="io-tile-unit">mL</span></div></div>
            <div class="io-tile"><div class="io-tile-label">Shift Out</div><div class="io-tile-value io-color-amber">${shiftOutput}<span class="io-tile-unit">mL</span></div></div>
          </div>
        </div>
        ${balance < -500 ? `<div class="io-oliguria-banner">&#9888; Urine output may indicate oliguria — review fluid balance.<button id="io-dismiss-banner">&#10005;</button></div>` : ""}
        <div class="io-middle">
          <div class="io-left">
            <div class="io-table-card">
              <div class="io-table-header">
                <div class="io-table-title">I&O Log</div>
              </div>
              <div class="io-shift-tabs">
                ${IO_SHIFTS.map((s, i) => `<div class="io-shift-tab${i === ioShift ? " active" : ""}" data-io-shift="${i}">${s}</div>`).join("")}
              </div>
              <table class="io-tbl">
                <thead><tr><th>Time</th><th>Type</th><th>Item</th><th>Volume</th><th>Notes</th><th></th></tr></thead>
                <tbody>${tblRows}</tbody>
              </table>
              <div class="io-add-row">
                <div class="fg"><label>Direction</label>
                  <select id="io-dir"><option value="intake">Intake</option><option value="output">Output</option></select>
                </div>
                <div class="fg"><label>Type</label>
                  <select id="io-type">${IO_INTAKE_TYPES.map(t=>`<option>${t}</option>`).join("")}</select>
                </div>
                <div class="fg"><label>Volume (mL)</label><input id="io-vol" type="number" min="0" placeholder="250" style="width:80px"/></div>
                <div class="fg"><label>Notes</label><input id="io-notes" type="text" placeholder="e.g. 0.9% NaCl" style="width:120px"/></div>
                <button class="io-add-btn" id="io-add-btn">+ Add</button>
              </div>
            </div>
          </div>
          <div class="io-right">
            <div class="io-chart-card">
              <div class="io-chart-title">Intake vs Output</div>
              <div class="io-chart-wrap">${chartSvg}</div>
              <div class="io-chart-legend">
                <div class="io-chart-legend-item"><div class="io-chart-legend-dot" style="background:#2BBFAD"></div>Intake</div>
                <div class="io-chart-legend-item"><div class="io-chart-legend-dot" style="background:#D97706"></div>Output</div>
              </div>
            </div>
          </div>
        </div>
      </div>`;

    el.querySelectorAll("[data-io-shift]").forEach(t =>
      t.addEventListener("click", () => { ioShift = parseInt(t.dataset.ioShift); renderIO(); }));

    el.querySelector("#io-add-btn").onclick = () => {
      const dir = el.querySelector("#io-dir").value;
      const type = el.querySelector("#io-type").value;
      const vol = parseFloat(el.querySelector("#io-vol").value);
      if (!vol) { toast("Enter a volume", { kind: "crit" }); return; }
      IO_DATA[pxId].push({ id: uid(), direction: dir, type, volume: vol, shift: ioShift,
        time: nowTime(), date: nowDate(), notes: el.querySelector("#io-notes").value.trim() });
      renderIO();
    };

    el.querySelector("#io-dir")?.addEventListener("change", e => {
      const dir = e.target.value;
      const typeEl = el.querySelector("#io-type");
      const opts = dir === "intake" ? IO_INTAKE_TYPES : IO_OUTPUT_TYPES;
      typeEl.innerHTML = opts.map(t => `<option>${t}</option>`).join("");
    });

    el.querySelectorAll("[data-io-del]").forEach(btn =>
      btn.addEventListener("click", () => { ioDeleteConfirm = btn.dataset.ioDel; renderIO(); }));
    el.querySelectorAll("[data-io-del-yes]").forEach(btn =>
      btn.addEventListener("click", () => {
        IO_DATA[pxId] = IO_DATA[pxId].filter(e => e.id !== btn.dataset.ioDelYes);
        ioDeleteConfirm = null; renderIO();
      }));
    el.querySelectorAll("[data-io-del-no]").forEach(btn =>
      btn.addEventListener("click", () => { ioDeleteConfirm = null; renderIO(); }));
    el.querySelector("#io-dismiss-banner")?.addEventListener("click", renderIO);
  };
  renderIO();
}

// ── ALLERGIES ─────────────────────────────────────────────────────────────────

const ALLERGY_REACTIONS = ["Rash","Hives","Angioedema","Anaphylaxis","Nausea/Vomiting","Diarrhea","Pruritus","Bronchospasm","Hypotension","Flushing","Headache","Dizziness","Swelling","Other"];

export async function allergies(p, el) {
  const list = await api.allergies(p);
  let editingId = null;

  const renderAllergies = () => {
    if (!list.length && !editingId) {
      el.innerHTML = `
        <div class="nkda-box">
          <div class="nkda-icon">✅</div>
          <div class="nkda-text">No Known Drug Allergies (NKDA)</div>
          <div class="nkda-sub">No allergies have been documented for this patient.</div>
        </div>
        <div style="margin-top:14px;text-align:center"><button class="btn-add" id="add-allergy-btn">+ Add Allergy</button></div>`;
      el.querySelector("#add-allergy-btn").onclick = () => { editingId = "__new__"; renderAllergies(); };
      return;
    }

    el.innerHTML = `
      <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:14px">
        <div style="font-size:13px;font-weight:600;color:var(--navy)">${list.length} Allerg${list.length===1?"y":"ies"} on record</div>
        <button class="btn-add" id="add-allergy-btn">+ Add Allergy</button>
      </div>
      ${list.map(a => `
        <div class="allergy-entry">
          <div class="allergy-info">
            <div class="allergy-name">⚠ ${a.substance}</div>
            <div class="allergy-reactions">${(a.reactions||[]).map(r=>`<span class="reaction-pill">${r}</span>`).join("")}</div>
            <div class="allergy-meta">${a.category||""} · Severity: ${a.severity||"unknown"}</div>
            ${a.comment ? `<div class="allergy-comment">${a.comment}</div>` : ""}
          </div>
          <button class="btn-edit-allergy" data-edit-allergy="${a.id}">Edit</button>
        </div>`).join("")}
      ${editingId ? renderAllergyForm(editingId === "__new__" ? null : list.find(a=>a.id===editingId)) : ""}`;

    el.querySelector("#add-allergy-btn").onclick = () => { editingId = "__new__"; renderAllergies(); };
    el.querySelectorAll("[data-edit-allergy]").forEach(btn =>
      btn.onclick = () => { editingId = btn.dataset.editAllergy; renderAllergies(); });
    el.querySelector("#allergy-cancel-btn")?.addEventListener("click", () => { editingId = null; renderAllergies(); });
    el.querySelector("#allergy-save-btn")?.addEventListener("click", async () => {
      const sub = el.querySelector("#al-substance").value.trim();
      if (!sub) { toast("Enter substance name", { kind: "crit" }); return; }
      const reactions = [...el.querySelectorAll(".reaction-cb.selected")].map(r => r.dataset.reaction);
      const newAllergy = {
        substance: sub,
        category: el.querySelector("#al-category").value,
        severity: el.querySelector("#al-severity").value,
        reactions,
        comment: el.querySelector("#al-comment").value.trim(),
      };
      await api.addAllergy(p, newAllergy);
      editingId = null;
      const fresh = await api.allergies(p);
      list.length = 0; list.push(...fresh);
      renderAllergies();
    });
    el.querySelectorAll(".reaction-cb").forEach(cb =>
      cb.addEventListener("click", () => { cb.classList.toggle("selected"); }));
  };

  function renderAllergyForm(existing) {
    return `
      <div class="wide-card" style="margin-top:14px">
        <h4>${existing ? "Edit" : "New"} Allergy</h4>
        <div class="fg"><label>Substance / Allergen</label><input id="al-substance" value="${existing?.substance||""}" placeholder="e.g. Penicillin"></div>
        <div class="frow">
          <div class="fg"><label>Category</label>
            <select id="al-category">
              <option${existing?.category==="medication"?" selected":""}>medication</option>
              <option${existing?.category==="food"?" selected":""}>food</option>
              <option${existing?.category==="environmental"?" selected":""}>environmental</option>
              <option${existing?.category==="contrast"?" selected":""}>contrast</option>
              <option${existing?.category==="latex"?" selected":""}>latex</option>
            </select>
          </div>
          <div class="fg"><label>Severity</label>
            <select id="al-severity">
              <option${existing?.severity==="mild"?" selected":""}>mild</option>
              <option${existing?.severity==="moderate"?" selected":""}>moderate</option>
              <option${existing?.severity==="severe"?" selected":""}>severe</option>
              <option${existing?.severity==="life-threatening"?" selected":""}>life-threatening</option>
            </select>
          </div>
        </div>
        <div class="fg"><label>Reactions</label>
          <div class="reaction-grid">
            ${ALLERGY_REACTIONS.map(r => `<div class="reaction-cb${(existing?.reactions||[]).includes(r)?" selected":""}" data-reaction="${r}">${r}</div>`).join("")}
          </div>
        </div>
        <div class="fg"><label>Comments</label><input id="al-comment" value="${existing?.comment||""}" placeholder="Additional notes…"></div>
        <div class="btn-row">
          <button class="btn-cancel" id="allergy-cancel-btn">Cancel</button>
          <button class="btn-save" id="allergy-save-btn">${existing ? "Update" : "Save"} Allergy</button>
        </div>
      </div>`;
  }

  renderAllergies();
}

// ── IMMUNIZATIONS ─────────────────────────────────────────────────────────────

const VACCINES = [
  { id:"bcg",      name:"BCG",                 doses:1, schedule:"At birth",         disease:"Tuberculosis" },
  { id:"hepb",     name:"Hepatitis B",          doses:3, schedule:"0, 1–2, 6 months", disease:"Hepatitis B" },
  { id:"penta",    name:"Pentavalent (DPT-HepB-Hib)", doses:3, schedule:"6, 10, 14 weeks", disease:"Diphtheria, Pertussis, Tetanus, Hep B, Hib" },
  { id:"opv",      name:"Oral Polio (OPV)",     doses:3, schedule:"6, 10, 14 weeks", disease:"Poliomyelitis" },
  { id:"ipv",      name:"Inactivated Polio (IPV)", doses:1, schedule:"14 weeks",    disease:"Poliomyelitis" },
  { id:"pcv",      name:"Pneumococcal (PCV13)",  doses:3, schedule:"6, 10, 14 weeks", disease:"Pneumococcal" },
  { id:"rotavirus",name:"Rotavirus",            doses:2, schedule:"6, 10 weeks",    disease:"Rotavirus gastroenteritis" },
  { id:"mmr",      name:"MMR",                  doses:2, schedule:"12–15 months, 4–6 yrs", disease:"Measles, Mumps, Rubella" },
  { id:"varicella",name:"Varicella",            doses:2, schedule:"12–15 months, 4–6 yrs", disease:"Chickenpox" },
  { id:"hpv",      name:"HPV",                  doses:2, schedule:"11–12 years",    disease:"Human Papillomavirus" },
  { id:"flu",      name:"Influenza",            doses:1, schedule:"Annual",          disease:"Seasonal influenza" },
  { id:"covid19",  name:"COVID-19",             doses:2, schedule:"Per protocol",   disease:"COVID-19" },
  { id:"td",       name:"Td/Tdap",              doses:1, schedule:"Every 10 years", disease:"Tetanus, Diphtheria, Pertussis" },
  { id:"hepa",     name:"Hepatitis A",          doses:2, schedule:"12–23 months",   disease:"Hepatitis A" },
  { id:"men",      name:"Meningococcal",        doses:1, schedule:"11–12 years",    disease:"Meningococcal disease" },
];

const STATUS_OPTS = ["Given","Refused","Catch-up","Reviewed – Up to Date"];
const IMM_DATA = {}; // { pxId: { vaccineId: { dose1?:{status,date,lot,site}, dose2?:…, … } } }

function getImmDose(pxId, vId, dNum) { return ((IMM_DATA[pxId]||{})[vId]||{})[`dose${dNum}`] || null; }
function setImmDose(pxId, vId, dNum, data) {
  if (!IMM_DATA[pxId]) IMM_DATA[pxId] = {};
  if (!IMM_DATA[pxId][vId]) IMM_DATA[pxId][vId] = {};
  IMM_DATA[pxId][vId][`dose${dNum}`] = data;
}

export async function immunizations(p, el) {
  const pxId = p.id;
  let editingVaccine = null;
  let editingDose = null;

  const renderImm = () => {
    const rows = VACCINES.map(v => {
      const doseDots = Array.from({ length: v.doses }, (_, i) => {
        const d = getImmDose(pxId, v.id, i + 1);
        let cls = "dose-dot-none", label = (i+1).toString();
        if (d) {
          if (d.status === "Given") { cls = "dose-dot-given"; label = "✓"; }
          else if (d.status === "Refused") { cls = "dose-dot-refused"; label = "✗"; }
          else if (d.status === "Catch-up") { cls = "dose-dot-catchup"; label = "↑"; }
          else if (d.status.startsWith("Reviewed")) { cls = "dose-dot-reviewed"; label = "R"; }
        }
        return `<td class="immu-dose-cell">
          <div class="${cls}" title="${d ? d.status + (d.date ? " — " + d.date : "") : "Not given"}"
            data-imm-vac="${v.id}" data-imm-dose="${i+1}"
            style="cursor:pointer" title="Click to record dose ${i+1}">${label}</div>
          ${d ? `<div style="font-size:9px;color:var(--text-muted);margin-top:3px;text-align:center">${d.date||""}</div>` : ""}
        </td>`;
      }).join("");

      const editRow = (editingVaccine === v.id) ? `<tr><td colspan="${v.doses + 1}" style="padding:0">
        <div style="padding:14px;background:#f7f9ff;border-top:2px solid var(--teal)">
          <div style="font-size:13px;font-weight:600;color:var(--navy);margin-bottom:12px">${v.name} — Dose ${editingDose}</div>
          <div style="display:flex;gap:10px;flex-wrap:wrap;align-items:flex-end">
            <div class="lab-entry-field"><label>Status</label>
              <select id="imm-status" style="height:36px;border:1.5px solid var(--border);border-radius:7px;padding:0 10px;font-family:inherit;font-size:12px;background:#fff;outline:none;min-width:180px">
                ${STATUS_OPTS.map(s=>`<option value="${s}">${s}</option>`).join("")}
              </select>
            </div>
            <div class="lab-entry-field"><label>Date Given</label><input id="imm-date" type="date" value="${nowDate()}" style="width:130px"/></div>
            <div class="lab-entry-field"><label>Lot #</label><input id="imm-lot" type="text" placeholder="Lot number" style="width:110px"/></div>
            <div class="lab-entry-field"><label>Site</label>
              <select id="imm-site" style="height:36px;border:1.5px solid var(--border);border-radius:7px;padding:0 10px;font-family:inherit;font-size:12px;background:#fff;outline:none">
                <option>Right Deltoid</option><option>Left Deltoid</option><option>Right Thigh</option><option>Left Thigh</option><option>Oral</option><option>Intradermal</option>
              </select>
            </div>
            <button class="btn-lab-save" id="imm-save-btn">Save</button>
            <button class="btn-cancel" id="imm-cancel-btn">Cancel</button>
          </div>
        </div>
      </td></tr>` : "";

      return `<tr>
        <td class="immu-vaccine-cell">
          <div class="immu-vaccine-name">${v.name}</div>
          <div class="immu-vaccine-detail">${v.disease}<br>${v.schedule}</div>
        </td>
        ${doseDots}
      </tr>${editRow}`;
    }).join("");

    el.innerHTML = `
      <div style="overflow-x:auto">
        <table class="immu-grid">
          <thead class="immu-grid-header"><tr>
            <th style="text-align:left;min-width:220px">Vaccine</th>
            ${Array.from({length: Math.max(...VACCINES.map(v=>v.doses))}, (_,i) => `<th>Dose ${i+1}</th>`).join("")}
          </tr></thead>
          <tbody>${rows}</tbody>
        </table>
      </div>`;

    el.querySelectorAll("[data-imm-vac]").forEach(dot =>
      dot.addEventListener("click", () => {
        const vId = dot.dataset.immVac;
        const dNum = parseInt(dot.dataset.immDose);
        if (editingVaccine === vId && editingDose === dNum) {
          editingVaccine = null; editingDose = null;
        } else {
          editingVaccine = vId; editingDose = dNum;
        }
        renderImm();
      }));

    el.querySelector("#imm-save-btn")?.addEventListener("click", () => {
      const status = el.querySelector("#imm-status").value;
      const date = el.querySelector("#imm-date").value;
      const lot = el.querySelector("#imm-lot").value;
      const site = el.querySelector("#imm-site").value;
      setImmDose(pxId, editingVaccine, editingDose, { status, date: dispDate(date), lot, site });
      editingVaccine = null; editingDose = null;
      renderImm();
    });
    el.querySelector("#imm-cancel-btn")?.addEventListener("click", () => { editingVaccine = null; editingDose = null; renderImm(); });
  };
  renderImm();
}

// ── SCALES ────────────────────────────────────────────────────────────────────

const GCS_ITEMS = {
  eye:    { label:"Eye Opening", options:[{s:4,l:"Spontaneous"},{s:3,l:"To Voice"},{s:2,l:"To Pain"},{s:1,l:"None"}] },
  verbal: { label:"Verbal Response", options:[{s:5,l:"Oriented"},{s:4,l:"Confused"},{s:3,l:"Inappropriate words"},{s:2,l:"Incomprehensible sounds"},{s:1,l:"None"}] },
  motor:  { label:"Motor Response", options:[{s:6,l:"Obeys commands"},{s:5,l:"Localizes pain"},{s:4,l:"Withdrawal"},{s:3,l:"Abnormal flexion"},{s:2,l:"Extension"},{s:1,l:"None"}] },
};

const GCS_DATA = {}; // { pxId: { eye, verbal, motor } }

export async function gcs(p, el) {
  const pxId = p.id;
  if (!GCS_DATA[pxId]) GCS_DATA[pxId] = { eye: 4, verbal: 5, motor: 6 };

  const renderGcs = () => {
    const scores = GCS_DATA[pxId];
    const total = scores.eye + scores.verbal + scores.motor;
    const interp = total >= 14 ? "Normal" : total >= 9 ? "Moderate brain injury" : total >= 3 ? "Severe brain injury" : "Deep coma";
    const bkgCls = total >= 14 ? "background:var(--admitted-bg);color:var(--admitted)" : total >= 9 ? "background:var(--discharge-bg);color:var(--discharge)" : "background:var(--critical-bg);color:var(--critical)";

    el.innerHTML = `
      <div class="wide-card">
        <h4>Glasgow Coma Scale (GCS)</h4>
        ${Object.entries(GCS_ITEMS).map(([key, item]) => `
          <div style="margin-bottom:12px">
            <div style="font-size:11px;font-weight:600;color:var(--text-muted);text-transform:uppercase;letter-spacing:.5px;margin-bottom:6px">${item.label}</div>
            <div style="display:flex;gap:6px;flex-wrap:wrap">
              ${item.options.map(opt => `
                <button class="btn-sm ${scores[key]===opt.s ? "" : "ghost"}" style="font-size:11px" data-gcs="${key}" data-score="${opt.s}">
                  ${opt.s} — ${opt.l}
                </button>`).join("")}
            </div>
          </div>`).join("")}
        <div class="score-total" style="${bkgCls};border-radius:9px">
          <div>
            <div style="font-size:11px;font-weight:600;letter-spacing:.5px;text-transform:uppercase">Total GCS Score</div>
            <div style="font-size:11px;margin-top:2px">${interp}</div>
          </div>
          <div class="stv">${total}/15</div>
        </div>
        <div style="margin-top:10px;text-align:right"><button class="btn-sm" id="save-gcs">Save Score</button></div>
      </div>`;

    el.querySelectorAll("[data-gcs]").forEach(btn =>
      btn.addEventListener("click", () => {
        GCS_DATA[pxId][btn.dataset.gcs] = parseInt(btn.dataset.score);
        renderGcs();
      }));
    el.querySelector("#save-gcs").onclick = async () => {
      const s = GCS_DATA[pxId];
      await api.addNote(p, { kind: "gcs", text: `GCS: E${s.eye}V${s.verbal}M${s.motor} = ${s.eye+s.verbal+s.motor}` });
      toast("GCS score saved");
    };
  };
  renderGcs();
}

const MORSE_ITEMS = [
  { id:"falls_history", label:"History of Falls", options:[{s:25,l:"Yes"},{s:0,l:"No"}] },
  { id:"secondary_dx",  label:"Secondary Diagnosis", options:[{s:15,l:"Yes"},{s:0,l:"No"}] },
  { id:"ambulatory_aid",label:"Ambulatory Aid", options:[{s:0,l:"None / bed rest / nurse assist"},{s:15,l:"Crutches / cane / walker"},{s:30,l:"Furniture"}] },
  { id:"iv_heplock",    label:"IV / Heparin Lock", options:[{s:20,l:"Yes"},{s:0,l:"No"}] },
  { id:"gait",          label:"Gait / Transferring", options:[{s:0,l:"Normal / bed rest / immobile"},{s:10,l:"Weak"},{s:20,l:"Impaired"}] },
  { id:"mental_status", label:"Mental Status", options:[{s:0,l:"Oriented to own ability"},{s:15,l:"Forgets limitations"}] },
];

const MORSE_DATA = {};

export async function morse(p, el) {
  const pxId = p.id;
  if (!MORSE_DATA[pxId]) MORSE_DATA[pxId] = { falls_history:0, secondary_dx:0, ambulatory_aid:0, iv_heplock:0, gait:0, mental_status:0 };

  const renderMorse = () => {
    const scores = MORSE_DATA[pxId];
    const total = Object.values(scores).reduce((s, v) => s + v, 0);
    const risk = total >= 55 ? "High Risk" : total >= 25 ? "Medium Risk" : "Low Risk";
    const riskCls = total >= 55 ? "background:var(--critical-bg);color:var(--critical)" : total >= 25 ? "background:var(--discharge-bg);color:var(--discharge)" : "background:var(--admitted-bg);color:var(--admitted)";

    el.innerHTML = `
      <div class="wide-card">
        <h4>Morse Falls Scale</h4>
        ${MORSE_ITEMS.map(item => `
          <div style="margin-bottom:12px">
            <div style="font-size:11px;font-weight:600;color:var(--text-muted);text-transform:uppercase;letter-spacing:.5px;margin-bottom:6px">${item.label}</div>
            <div style="display:flex;gap:6px;flex-wrap:wrap">
              ${item.options.map(opt => `
                <button class="btn-sm ${scores[item.id]===opt.s ? "" : "ghost"}" style="font-size:11px" data-morse="${item.id}" data-score="${opt.s}">
                  ${opt.l} (+${opt.s})
                </button>`).join("")}
            </div>
          </div>`).join("")}
        <div class="score-total" style="${riskCls};border-radius:9px">
          <div>
            <div style="font-size:11px;font-weight:600;letter-spacing:.5px;text-transform:uppercase">Morse Falls Score</div>
            <div style="font-size:11px;margin-top:2px">${risk}</div>
          </div>
          <div class="stv">${total}</div>
        </div>
        <div class="score-interp">0–24: Low risk · 25–44: Medium risk · ≥45: High risk. Implement fall precautions as indicated.</div>
        <div style="margin-top:10px;text-align:right"><button class="btn-sm" id="save-morse">Save Score</button></div>
      </div>`;

    el.querySelectorAll("[data-morse]").forEach(btn =>
      btn.addEventListener("click", () => {
        MORSE_DATA[pxId][btn.dataset.morse] = parseInt(btn.dataset.score);
        renderMorse();
      }));
    el.querySelector("#save-morse").onclick = async () => {
      const total = Object.values(MORSE_DATA[pxId]).reduce((s,v)=>s+v,0);
      await api.addNote(p, { kind: "morse", text: `Morse Falls Score: ${total} — ${total>=55?"High":total>=25?"Medium":"Low"} Risk` });
      toast("Morse Falls score saved");
    };
  };
  renderMorse();
}

const BRADEN_ITEMS = [
  { id:"sensory",     label:"Sensory Perception", options:[{s:1,l:"Completely Limited"},{s:2,l:"Very Limited"},{s:3,l:"Slightly Limited"},{s:4,l:"No Impairment"}] },
  { id:"moisture",    label:"Moisture", options:[{s:1,l:"Constantly Moist"},{s:2,l:"Often Moist"},{s:3,l:"Occasionally Moist"},{s:4,l:"Rarely Moist"}] },
  { id:"activity",    label:"Activity", options:[{s:1,l:"Bedfast"},{s:2,l:"Chairfast"},{s:3,l:"Walks Occasionally"},{s:4,l:"Walks Frequently"}] },
  { id:"mobility",    label:"Mobility", options:[{s:1,l:"Completely Immobile"},{s:2,l:"Very Limited"},{s:3,l:"Slightly Limited"},{s:4,l:"No Limitations"}] },
  { id:"nutrition",   label:"Nutrition", options:[{s:1,l:"Very Poor"},{s:2,l:"Probably Inadequate"},{s:3,l:"Adequate"},{s:4,l:"Excellent"}] },
  { id:"friction",    label:"Friction & Shear", options:[{s:1,l:"Problem"},{s:2,l:"Potential Problem"},{s:3,l:"No Apparent Problem"}] },
];

const BRADEN_DATA = {};

export async function braden(p, el) {
  const pxId = p.id;
  if (!BRADEN_DATA[pxId]) BRADEN_DATA[pxId] = { sensory:4, moisture:4, activity:4, mobility:4, nutrition:4, friction:3 };

  const renderBraden = () => {
    const scores = BRADEN_DATA[pxId];
    const total = Object.values(scores).reduce((s, v) => s + v, 0);
    const risk = total <= 9 ? "Very High Risk" : total <= 12 ? "High Risk" : total <= 14 ? "Moderate Risk" : total <= 18 ? "Mild Risk" : "No Risk";
    const riskCls = total <= 9 ? "background:var(--critical-bg);color:var(--critical)" : total <= 14 ? "background:var(--discharge-bg);color:var(--discharge)" : "background:var(--admitted-bg);color:var(--admitted)";

    el.innerHTML = `
      <div class="wide-card">
        <h4>Braden Scale for Pressure Ulcer Risk</h4>
        ${BRADEN_ITEMS.map(item => `
          <div style="margin-bottom:12px">
            <div style="font-size:11px;font-weight:600;color:var(--text-muted);text-transform:uppercase;letter-spacing:.5px;margin-bottom:6px">${item.label}</div>
            <div style="display:flex;gap:6px;flex-wrap:wrap">
              ${item.options.map(opt => `
                <button class="btn-sm ${scores[item.id]===opt.s ? "" : "ghost"}" style="font-size:11px" data-braden="${item.id}" data-score="${opt.s}">
                  ${opt.s} — ${opt.l}
                </button>`).join("")}
            </div>
          </div>`).join("")}
        <div class="score-total" style="${riskCls};border-radius:9px">
          <div>
            <div style="font-size:11px;font-weight:600;letter-spacing:.5px;text-transform:uppercase">Braden Score</div>
            <div style="font-size:11px;margin-top:2px">${risk}</div>
          </div>
          <div class="stv">${total}/23</div>
        </div>
        <div class="score-interp">≤9: Very High · 10-12: High · 13-14: Moderate · 15-18: Mild · ≥19: No Risk. Reposition Q2H if ≤18.</div>
        <div style="margin-top:10px;text-align:right"><button class="btn-sm" id="save-braden">Save Score</button></div>
      </div>`;

    el.querySelectorAll("[data-braden]").forEach(btn =>
      btn.addEventListener("click", () => { BRADEN_DATA[pxId][btn.dataset.braden] = parseInt(btn.dataset.score); renderBraden(); }));
    el.querySelector("#save-braden").onclick = async () => {
      const t = Object.values(BRADEN_DATA[pxId]).reduce((s,v)=>s+v,0);
      await api.addNote(p, { kind:"braden", text:`Braden Score: ${t} — ${t<=9?"Very High":t<=12?"High":t<=14?"Moderate":t<=18?"Mild":"No"} Risk` });
      toast("Braden score saved");
    };
  };
  renderBraden();
}

export async function news2(p, el) {
  const obs = await api.observations(p);
  const latest = latestByCode(obs);
  const v = numericVitals(latest);
  const score = api.offline ? localNews2(v) : await api.scoreNews2(p, v);

  const subItems = [
    ["Respiratory Rate", `${v.RR} /min`, score.subscores?.rr ?? "—"],
    ["SpO₂", `${v.SPO2}%`, score.subscores?.spo2 ?? "—"],
    ["Supplemental O₂", v.onO2 ? "Yes" : "No", score.subscores?.o2 ?? "—"],
    ["Blood Pressure", `${v.BP_SYS} mmHg`, score.subscores?.sbp ?? "—"],
    ["Heart Rate", `${v.HR} BPM`, score.subscores?.hr ?? "—"],
    ["Temperature", `${v.TEMP}°C`, score.subscores?.temp ?? "—"],
    ["Consciousness (AVPU)", v.consciousness || "Alert", score.subscores?.con ?? "—"],
  ];

  el.innerHTML = `
    <div class="wide-card">
      <h4>NEWS2 — National Early Warning Score</h4>
      <div style="background:${score.band==="high"?"var(--critical-bg)":score.band==="medium"?"var(--discharge-bg)":"var(--admitted-bg)"};border-radius:9px;padding:14px 18px;margin-bottom:14px;display:flex;align-items:center;justify-content:space-between">
        <div>
          <div style="font-size:11px;font-weight:600;letter-spacing:.5px;text-transform:uppercase;color:${score.band==="high"?"var(--critical)":score.band==="medium"?"var(--discharge)":"var(--admitted)"}">NEWS2 Score — ${score.band?.toUpperCase()}</div>
          <div style="font-size:11px;color:var(--text-muted);margin-top:3px">${score.band==="high"?"Immediate escalation required":score.band==="medium"?"Increase monitoring frequency":"Continue routine monitoring"}</div>
        </div>
        <div style="font-size:32px;font-weight:700;color:${score.band==="high"?"var(--critical)":score.band==="medium"?"var(--discharge)":"var(--admitted)"}">${score.total}</div>
      </div>
      ${subItems.map(([name, val, sub]) => `
        <div class="scale-item">
          <div><div style="font-size:12px;color:var(--navy);font-weight:500">${name}</div><div style="font-size:11px;color:var(--text-muted)">${val}</div></div>
          <div class="scale-score">${sub}</div>
        </div>`).join("")}
      <div style="margin-top:14px;font-size:11px;color:var(--text-muted)">Score auto-calculated from latest vital signs. Scores ≥7 require immediate clinical review.</div>
    </div>`;
}

// ── CANVAS CHART RENDERER ─────────────────────────────────────────────────────

function renderPendingCharts(el) {
  el.querySelectorAll("[data-pending-chart]").forEach(span => {
    const cid = span.getAttribute("data-pending-chart");
    const vals = JSON.parse(decodeURIComponent(span.getAttribute("data-vals") || "[]"));
    const labels = JSON.parse(decodeURIComponent(span.getAttribute("data-labels") || "[]"));
    const rl = parseFloat(span.getAttribute("data-ref-low")) || 0;
    const rh = parseFloat(span.getAttribute("data-ref-high")) || 0;
    if (vals.length > 0) drawLineChart(cid, vals, labels, rl, rh, el);
    span.removeAttribute("data-pending-chart");
  });
}

function drawLineChart(canvasId, vals, labels, refLow, refHigh, root) {
  const canvas = (root || document).getElementById(canvasId);
  if (!canvas) return;
  const wrap = canvas.parentElement;
  const W = wrap ? wrap.offsetWidth : 680;
  const H = 200;
  canvas.width = W; canvas.height = H;
  const c = canvas.getContext("2d");
  const pad = { t:20, r:20, b:42, l:58 };
  const allVals = [...vals];
  if (refLow > 0) allVals.push(refLow);
  if (refHigh > 0) allVals.push(refHigh);
  let minV = Math.min(...allVals), maxV = Math.max(...allVals);
  const margin = (maxV - minV) * 0.2 || 1;
  minV -= margin; maxV += margin;
  const scX = i => pad.l + (vals.length < 2 ? 0.5 : i / (vals.length - 1)) * (W - pad.l - pad.r);
  const scY = v => pad.t + (1 - (v - minV) / (maxV - minV)) * (H - pad.t - pad.b);
  c.fillStyle = "#fff"; c.fillRect(0, 0, W, H);
  if (refLow > 0 && refHigh > 0) {
    c.fillStyle = "rgba(39,174,135,0.08)";
    c.fillRect(pad.l, scY(refHigh), W - pad.l - pad.r, scY(refLow) - scY(refHigh));
  }
  for (let ti = 0; ti <= 5; ti++) {
    const tv = minV + (maxV - minV) * (ti / 5);
    const ty = scY(tv);
    c.strokeStyle = "#E4E8F0"; c.lineWidth = 1;
    c.beginPath(); c.moveTo(pad.l, ty); c.lineTo(W - pad.r, ty); c.stroke();
    c.fillStyle = "#6B7C99"; c.font = "10px sans-serif";
    c.textAlign = "right"; c.textBaseline = "middle";
    c.fillText(tv.toFixed(1).replace(/\.?0+$/, ""), pad.l - 5, ty);
  }
  if (vals.length > 1) {
    c.strokeStyle = "#2563EB"; c.lineWidth = 2;
    c.lineJoin = "round"; c.lineCap = "round";
    c.beginPath();
    vals.forEach((v, i) => { if (i === 0) c.moveTo(scX(i), scY(v)); else c.lineTo(scX(i), scY(v)); });
    c.stroke();
  }
  vals.forEach((v, i) => {
    const col = (refHigh > 0 && v > refHigh) || (refLow > 0 && v < refLow) ? "#D64045" : "#2563EB";
    c.beginPath(); c.arc(scX(i), scY(v), 5, 0, Math.PI * 2);
    c.fillStyle = col; c.fill();
    c.strokeStyle = "#fff"; c.lineWidth = 2; c.stroke();
    c.fillStyle = col; c.font = "bold 10px sans-serif";
    c.textAlign = "center"; c.textBaseline = "bottom";
    c.fillText(String(v), scX(i), scY(v) - 8);
  });
  c.fillStyle = "#6B7C99"; c.font = "9px sans-serif";
  c.textAlign = "center"; c.textBaseline = "top";
  labels.forEach((l, i) => c.fillText(l, scX(i), H - pad.b + 6));
}

// ── HELPERS ──────────────────────────────────────────────────────────────────

function latestByCode(obs) {
  const m = {};
  obs.forEach(o => { if (!m[o.code] || new Date(o.recorded_at) > new Date(m[o.code].recorded_at)) m[o.code] = o; });
  return m;
}
function numericVitals(latest) {
  const g = (c, d) => latest[c] ? latest[c].value_num : d;
  return { HR: g("HR", 80), RR: g("RR", 16), SPO2: g("SPO2", 97), BP_SYS: g("BP_SYS", 120), TEMP: g("TEMP", 36.8) };
}
function vitalCards(latest) {
  const order = [["HR","BPM"],["RR","/min"],["SPO2","%"],["BP_SYS","mmHg"],["TEMP","°C"]];
  return `<div class="vgrid">${order.map(([c, u]) => {
    const o = latest[c];
    const cls = abnormal(c, o?.value_num);
    return `<div class="vcrd ${cls}"><div class="vval">${o ? o.value_num : "—"}</div><div class="vunit">${u}</div><div class="vname">${o?.display || c}</div></div>`;
  }).join("")}</div>`;
}
function abnormal(code, v) {
  if (v == null) return "";
  const bad  = { HR: v<50||v>110, RR: v<10||v>24, SPO2: v<94, BP_SYS: v<100||v>180, TEMP: v<36||v>38 };
  const crit = { HR: v<40||v>130, RR: v<8||v>28,  SPO2: v<91, BP_SYS: v<90||v>200,  TEMP: v<35||v>39.5 };
  return crit[code] ? "crit" : bad[code] ? "warn" : "";
}
