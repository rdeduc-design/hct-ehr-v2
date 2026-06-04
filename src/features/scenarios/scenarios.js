// ============================================================================
//  features/scenarios/scenarios.js — instructor-only.
//  Lists scenarios and exposes the adaptive-vitals engine controls: start a
//  patient deteriorating/improving, or apply a nurse intervention. In ONLINE
//  mode this calls the adaptive-vitals Edge Function; OFFLINE it simulates one
//  tick locally so the feature is demoable.
// ============================================================================
import { renderShell } from "../../ui/shell.js";
import { store } from "../../core/store.js";
import { auth } from "../../core/auth.js";
import { api } from "../../core/api.js";
import { sb } from "../../core/supabase.js";
import { CONFIG } from "../../config.js";
import { toast } from "../../ui/toast.js";

export async function renderScenarios() {
  if (!auth.isStaff()) { location.hash = "#/roster/wards"; return; }
  const view = renderShell("scenarios", [{ label: "Scenarios" }]);

  const patients = await api.patientsBySetting("icu").catch(() => []);
  const medPatients = await api.patientsBySetting("med").catch(() => []);
  const all = [...patients, ...medPatients];

  view.innerHTML = `<div class="view">
    <div class="sec-hdr"><div>
      <div class="sec-title">Simulation Control</div>
      <div class="sec-sub">Drive the live adaptive vitals engine for an active encounter.</div>
    </div></div>
    <div class="panel">
      <h3>Adaptive Vitals Engine</h3>
      <div class="fg"><label>Patient</label>
        <select id="scn-patient">${all.map((p) => `<option value="${p.id}">${p.full_name} · ${p.room || ""}</option>`).join("")}</select>
      </div>
      <div class="fg"><label>Trajectory</label>
        <select id="scn-phase">
          <option value="deteriorating">Deteriorating</option>
          <option value="improving">Improving</option>
          <option value="stable">Stable</option>
        </select>
      </div>
      <button class="btn-sm" id="scn-tick">Advance one tick</button>
      <span class="sec-sub" style="margin-left:10px">Interventions:</span>
      <button class="btn-sm ghost" data-act="gave_o2">O₂</button>
      <button class="btn-sm ghost" data-act="gave_fluids">Fluids</button>
      <button class="btn-sm ghost" data-act="gave_pressor">Pressor</button>
      <div id="scn-out" class="sec-sub" style="margin-top:14px"></div>
    </div>
    ${CONFIG.OFFLINE ? `<div class="panel"><h3>Demo mode</h3><div class="sec-sub">Edge Functions aren't called offline; ticks are simulated locally so you can preview the flow. Connect a Supabase project to run the real engine + Realtime fan-out.</div></div>` : ""}
  </div>`;

  async function tick(action = null) {
    const pid = document.getElementById("scn-patient").value;
    const phase = document.getElementById("scn-phase").value;
    const p = await api.patient(pid);
    const out = document.getElementById("scn-out");

    if (!CONFIG.OFFLINE && CONFIG.FLAGS.adaptiveEngine && sb) {
      // ensure runtime row exists and is active
      await sb.from("scenario_runtime").upsert({ encounter_id: p.encounter_id, phase, is_active: true });
      const { data, error } = await sb.functions.invoke("adaptive-vitals", { body: { encounter_id: p.encounter_id, action } });
      if (error) return toast("Engine error: " + error.message, { kind: "crit" });
      out.textContent = `Tick → NEWS2 ${data.news2?.total} (${data.news2?.band}). HR ${data.snapshot.HR}, SpO₂ ${data.snapshot.SPO2}, BP ${data.snapshot.BP_SYS}.`;
      if (data.news2?.band === "high") toast(`${p.full_name} deteriorating — NEWS2 ${data.news2.total}`, { kind: "crit", ms: 7000 });
    } else {
      // local simulation
      const obs = await api.observations(p);
      const last = {}; obs.forEach((o) => last[o.code] = o.value_num);
      const drift = phase === "deteriorating" ? { HR: 6, RR: 2, SPO2: -2, BP_SYS: -5, TEMP: 0.2 }
                  : phase === "improving" ? { HR: -4, RR: -1, SPO2: 2, BP_SYS: 4, TEMP: -0.1 } : {};
      const eff = { gave_o2: { SPO2: 4 }, gave_fluids: { BP_SYS: 8, HR: -4 }, gave_pressor: { BP_SYS: 12 } }[action] || {};
      const codes = [["HR","Heart Rate","bpm",80],["RR","Respiratory Rate","/min",16],["SPO2","SpO₂","%",97],["BP_SYS","Systolic BP","mmHg",120],["TEMP","Temperature","°C",36.8]];
      for (const [c, d, u, def] of codes) {
        const nv = Math.round(((last[c] ?? def) + (drift[c] || 0) + (eff[c] || 0)) * 10) / 10;
        await api.addObservation(p, { code: c, display: d, unit: u, value_num: nv });
      }
      out.textContent = `Local tick applied (${action || phase}). Open the patient's Vital Signs to see the new set + NEWS2.`;
    }
  }

  document.getElementById("scn-tick").onclick = () => tick(null);
  view.querySelectorAll("[data-act]").forEach((b) => b.onclick = () => tick(b.dataset.act));
}
