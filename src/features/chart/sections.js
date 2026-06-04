// ============================================================================
//  features/chart/sections.js — the individual chart panels.
//  Each export renders into the chart main pane for the current patient.
//  This is where the existing app's 6000 lines decompose into focused units;
//  add a new section by writing one function and registering it in chart.js.
// ============================================================================
import { api, localNews2 } from "../../core/api.js";
import { row, statusTag } from "../../ui/components.js";
import { toast } from "../../ui/toast.js";
import { store } from "../../core/store.js";
import { auth } from "../../core/auth.js";

/* ---- Summary ------------------------------------------------------------- */
export async function summary(p, el) {
  const [allergies, conditions, vitals] = await Promise.all([
    api.allergies(p), api.conditions(p), api.observations(p),
  ]);
  const latest = latestByCode(vitals);
  el.innerHTML = `
    <div class="panel"><h3>Demographics</h3>
      ${row("Name", p.full_name)}${row("MRN", p.mrn)}${row("Sex", p.sex)}
      ${row("DOB", p.dob)}${row("Room", p.room)}${row("Status", statusTag(p.status))}
      ${row("Admitting physician", p.admitting_physician)}${row("Chief complaint", p.chief_complaint)}
    </div>
    <div class="panel"><h3>Active Problems</h3>${conditions.map((c)=>row(c.label, c.status)).join("") || "<p>None recorded.</p>"}</div>
    <div class="panel"><h3>Allergies</h3>${allergies.map((a)=>row(a.substance, (a.reactions||[]).join(", ")+(a.severity?` · ${a.severity}`:""))).join("") || "<p>NKDA.</p>"}</div>
    <div class="panel"><h3>Latest Vitals</h3>${vitalCards(latest)}</div>`;
}

/* ---- Vital Signs (with NEWS2 + adaptive-engine awareness) ---------------- */
export async function vitals(p, el) {
  const obs = await api.observations(p);
  const latest = latestByCode(obs);
  const v = numericVitals(latest);
  const news = api.offline ? localNews2(v) : await api.scoreNews2(p, v);

  el.innerHTML = `
    <div class="panel">
      <h3>NEWS2 — Early Warning Score
        <span class="news-badge ${news.band}" style="float:right">${news.total} · ${news.band}</span></h3>
      <div class="sec-sub">Auto-scored from the latest set. High band (≥7) = urgent clinical review.</div>
    </div>
    <div class="panel"><h3>Current Vital Signs</h3>${vitalCards(latest)}</div>
    <div class="panel"><h3>Record a new set</h3>
      <div class="vgrid">
        ${vsInput("HR","Heart Rate","bpm",v.HR)}
        ${vsInput("RR","Resp Rate","/min",v.RR)}
        ${vsInput("SPO2","SpO₂","%",v.SPO2)}
        ${vsInput("BP_SYS","Systolic","mmHg",v.BP_SYS)}
        ${vsInput("TEMP","Temp","°C",v.TEMP)}
      </div>
      <div style="margin-top:12px"><button class="btn-sm" id="save-vs">Save & re-score</button></div>
    </div>`;

  el.querySelector("#save-vs").onclick = async () => {
    const codes = [["HR","Heart Rate","bpm"],["RR","Respiratory Rate","/min"],["SPO2","SpO₂","%"],["BP_SYS","Systolic BP","mmHg"],["TEMP","Temperature","°C"]];
    for (const [code, display, unit] of codes) {
      const val = parseFloat(el.querySelector(`#vs-${code}`).value);
      if (!isNaN(val)) await api.addObservation(p, { code, display, unit, value_num: val });
    }
    const nv = {};
    codes.forEach(([c]) => (nv[c] = parseFloat(el.querySelector(`#vs-${c}`).value)));
    const score = api.offline ? localNews2(nv) : await api.scoreNews2(p, nv);
    if (score.band === "high") toast(`NEWS2 ${score.total} — urgent review for ${p.full_name}`, { kind: "crit", ms: 8000 });
    vitals(p, el);
  };
}

/* ---- MAR (high-alert independent double-check) --------------------------- */
export async function mar(p, el) {
  const orders = await api.medOrders(p);
  const session = store.get("session");
  const rows = await Promise.all(orders.map(async (o) => {
    const hist = await api.adminHistory(o);
    const last = hist.at(-1);
    return `<tr>
      <td>${o.drug_name}${o.is_high_alert ? `<span class="hi-alert">HIGH-ALERT</span>` : ""}</td>
      <td>${o.dose || ""}</td><td>${o.route || ""}</td><td>${o.frequency || ""}</td>
      <td>${last ? `${last.status} · ${new Date(last.administered_at).toLocaleTimeString()}` : "—"}</td>
      <td>
        <button class="btn-sm" data-give="${o.id}">Give</button>
        <button class="btn-sm ghost" data-hold="${o.id}">Hold</button>
      </td></tr>`;
  }));

  el.innerHTML = `<div class="panel"><h3>Medication Administration Record</h3>
    <table class="t"><tr><th>Drug</th><th>Dose</th><th>Route</th><th>Freq</th><th>Last action</th><th></th></tr>
    ${rows.join("") || "<tr><td colspan=6>No active orders.</td></tr>"}</table>
    <div class="sec-sub" style="margin-top:10px">High-alert meds require an independent second-nurse verification before administration.</div>
    </div>`;

  el.querySelectorAll("[data-give]").forEach((b) => b.onclick = async () => {
    const o = orders.find((x) => x.id === b.dataset.give);
    let witness = null;
    if (o.is_high_alert) {
      witness = prompt(`HIGH-ALERT: ${o.drug_name}\nIndependent double-check — enter verifying nurse's name:`);
      if (!witness) return toast("High-alert med requires a second-nurse check.", { kind: "crit" });
    }
    await api.administer(p, o, { status: "given", by: session?.user?.email, witness });
    toast(`${o.drug_name} given`);
    mar(p, el);
  });
  el.querySelectorAll("[data-hold]").forEach((b) => b.onclick = async () => {
    const o = orders.find((x) => x.id === b.dataset.hold);
    const reason = prompt(`Hold ${o.drug_name} — reason:`);
    if (!reason) return;
    await api.administer(p, o, { status: "held", by: session?.user?.email, holdReason: reason });
    mar(p, el);
  });
}

/* ---- Notes (incl. SBAR) -------------------------------------------------- */
export async function notes(p, el) {
  const list = await api.notes(p);
  el.innerHTML = `
    <div class="panel"><h3>New Note</h3>
      <div class="fg"><label>Type</label>
        <select id="note-kind"><option value="nursing">Nursing</option><option value="progress">Progress</option><option value="sbar">SBAR Handoff</option></select>
      </div>
      <div class="fg"><label>Note</label><textarea id="note-body" style="width:100%;min-height:90px;border:1.5px solid var(--border);border-radius:9px;padding:10px;font-family:inherit"></textarea></div>
      <button class="btn-sm" id="save-note">Save note</button>
    </div>
    <div class="panel"><h3>Note History</h3>
      ${list.slice().reverse().map((n)=>`<div class="banner"><div><b>${n.kind}</b> · ${new Date(n.created_at).toLocaleString()}<div class="sec-sub">${n.text_body||""}</div></div></div>`).join("") || "<p>No notes yet.</p>"}
    </div>`;
  el.querySelector("#save-note").onclick = async () => {
    const kind = el.querySelector("#note-kind").value;
    const text = el.querySelector("#note-body").value.trim();
    if (!text) return;
    await api.addNote(p, { kind, text });
    toast("Note saved"); notes(p, el);
  };
}

/* ---- helpers ------------------------------------------------------------- */
function latestByCode(obs) {
  const m = {};
  obs.forEach((o) => { if (!m[o.code] || new Date(o.recorded_at) > new Date(m[o.code].recorded_at)) m[o.code] = o; });
  return m;
}
function numericVitals(latest) {
  const g = (c, d) => (latest[c] ? latest[c].value_num : d);
  return { HR: g("HR", 80), RR: g("RR", 16), SPO2: g("SPO2", 97), BP_SYS: g("BP_SYS", 120), TEMP: g("TEMP", 36.8) };
}
function vitalCards(latest) {
  const order = [["HR","bpm"],["RR","/min"],["SPO2","%"],["BP_SYS","mmHg"],["TEMP","°C"]];
  return `<div class="vgrid">${order.map(([c,u]) => {
    const o = latest[c];
    const cls = abnormal(c, o?.value_num);
    return `<div class="vcrd ${cls}"><div class="vval">${o ? o.value_num : "—"}</div><div class="vunit">${u}</div><div class="vname">${o?.display || c}</div></div>`;
  }).join("")}</div>`;
}
function vsInput(code, name, unit, val) {
  return `<div class="vcrd"><input id="vs-${code}" value="${val ?? ""}" style="width:100%;border:1px solid var(--border);border-radius:7px;text-align:center;height:30px;font-size:16px;font-weight:700">
    <div class="vunit">${unit}</div><div class="vname">${name}</div></div>`;
}
function abnormal(code, v) {
  if (v == null) return "";
  const bad = { HR: v < 50 || v > 110, RR: v < 10 || v > 24, SPO2: v < 94, BP_SYS: v < 100 || v > 180, TEMP: v < 36 || v > 38 };
  const crit = { HR: v < 40 || v > 130, RR: v < 8 || v > 28, SPO2: v < 91, BP_SYS: v < 90 || v > 200, TEMP: v < 35 || v > 39.5 };
  return crit[code] ? "crit" : bad[code] ? "warn" : "";
}
