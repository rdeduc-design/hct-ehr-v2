// ============================================================================
//  features/chart/chart.js — the patient chart orchestrator.
//  Renders the left section nav + the allergy/identity banner + the active
//  section, joins the realtime channel for collaborative charting & presence,
//  and wires the Print Report button to the server-rendered report.
// ============================================================================
import { api } from "../../core/api.js";
import { store } from "../../core/store.js";
import { renderShell } from "../../ui/shell.js";
import { realtime } from "../../core/realtime.js";
import { initials, statusTag } from "../../ui/components.js";
import { toast } from "../../ui/toast.js";
import * as sections from "./sections.js";

// Section registry — add a panel here and it appears in the nav. Mirrors the
// existing NAV taxonomy; only the MVP-complete sections are wired so far.
const SECTIONS = [
  { key: "summary",  label: "Visit Summary",  render: sections.summary },
  { key: "vitals",   label: "Vital Signs",    render: sections.vitals  },
  { key: "mar",      label: "MAR",            render: sections.mar     },
  { key: "notes",    label: "Notes",          render: sections.notes   },
];

export async function renderChart(patientId, section = "summary") {
  const p = await api.patient(patientId);
  if (!p) return toast("Patient not found or no access", { kind: "crit" });
  store.set({ patient: p, encounter: { id: p.encounter_id }, section });

  const tab = store.get("tab") || "wards";
  const setting = store.get("setting");
  const view = renderShell(tab, [
    { label: setting?.name || "Roster", path: setting ? `#/setting/${setting.id}` : `#/roster/${tab}` },
    { label: p.full_name },
  ]);

  const allergies = await api.allergies(p);
  const allergyChips = allergies.length
    ? allergies.map((a) => `<span class="allergy-chip">⚠ ${a.substance}</span>`).join(" ")
    : `<span class="sec-sub">NKDA</span>`;

  view.innerHTML = `
    <div class="chart-wrap">
      <div class="chart-nav" id="chart-nav">
        ${SECTIONS.map((s) => `<div class="nav-item ${s.key === section ? "active" : ""}" data-sec="${s.key}">${s.label}</div>`).join("")}
      </div>
      <div class="chart-main">
        <div class="banner ${p.status === "critical" ? "crit" : ""}">
          <div class="px-av">${initials(p.full_name)}</div>
          <div style="flex:1">
            <div class="px-name">${p.full_name} ${statusTag(p.status)}</div>
            <div class="px-meta">MRN ${p.mrn} · ${p.room || ""} · ${p.chief_complaint || ""}</div>
            <div style="margin-top:6px">${allergyChips}</div>
          </div>
          <div style="text-align:right">
            <div id="presence" class="presence"></div>
            <button class="btn-sm ghost" id="print-report">Print Report</button>
          </div>
        </div>
        <div id="section-root">Loading…</div>
      </div>
    </div>`;

  // section nav
  view.querySelectorAll("[data-sec]").forEach((el) =>
    el.addEventListener("click", () => location.hash = `#/chart/${patientId}/${el.dataset.sec}`));

  // render active section
  const sec = SECTIONS.find((s) => s.key === section) || SECTIONS[0];
  await sec.render(p, view.querySelector("#section-root"));

  // realtime: presence + live inserts re-render the open section
  const session = store.get("session");
  realtime.join(p.encounter_id, session?.user || { email: "demo" }, (table) => {
    toast(`Live update: ${table.replace("_", " ")}`);
    sec.render(p, view.querySelector("#section-root"));
  });
  renderPresence();
  store.subscribe(renderPresence);

  // print/report — server-rendered HTML printed via hidden iframe (fixes blank print)
  view.querySelector("#print-report").onclick = async () => {
    try {
      const html = await api.generateReport(p);
      const iframe = document.createElement("iframe");
      iframe.style.cssText = "position:fixed;right:0;bottom:0;width:0;height:0;border:0";
      document.body.appendChild(iframe);
      iframe.srcdoc = html;
      iframe.onload = () => { iframe.contentWindow.focus(); iframe.contentWindow.print(); setTimeout(() => iframe.remove(), 1000); };
    } catch (e) { toast("Report failed: " + (e.message || e), { kind: "crit" }); }
  };
}

function renderPresence() {
  const box = document.getElementById("presence");
  if (!box) return;
  const people = store.get("presence") || [];
  box.innerHTML = people.length
    ? `<span class="live-dot"></span> ` + people.map((n) => `<span class="px-av">${initials(n)}</span>`).join("")
    : "";
}
