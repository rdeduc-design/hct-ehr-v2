// ============================================================================
//  features/chart/chart.js — patient chart orchestrator.
//  Full NAV taxonomy matching the reference EHR.
// ============================================================================
import { api } from "../../core/api.js";
import { store } from "../../core/store.js";
import { renderShell } from "../../ui/shell.js";
import { realtime } from "../../core/realtime.js";
import { initials } from "../../ui/components.js";
import { toast } from "../../ui/toast.js";
import * as sections from "./sections.js";

// ── NAV taxonomy: groups with child sections ────────────────────────────────
const NAV = [
  { label: "Patient Info", children: [
    { key: "summary",   label: "Visit Summary" },
    { key: "adminfo",   label: "Admission Info" },
    { key: "hpi",       label: "History & Physical" },
    { key: "pmsh",      label: "PMSH" },
  ]},
  { label: "Nursing", children: [
    { key: "careplan",  label: "Care Plan" },
    { key: "sbar",      label: "SBAR Handoff" },
    { key: "notes",     label: "Notes" },
  ]},
  { label: "Medications", children: [
    { key: "mar",       label: "MAR" },
  ]},
  { label: "Monitoring", children: [
    { key: "vitals",    label: "Vital Signs" },
    { key: "gcs",       label: "GCS" },
    { key: "morse",     label: "Morse Falls Scale" },
    { key: "braden",    label: "Braden Scale" },
    { key: "news2",     label: "NEWS2" },
  ]},
  { label: "Diagnostics", children: [
    { key: "labs",      label: "Labs" },
  ]},
  { label: "Fluid Balance", children: [
    { key: "io",        label: "Intake & Output" },
  ]},
  { label: "Allergies", children: [
    { key: "allergies", label: "Allergies" },
  ]},
  { label: "Immunizations", children: [
    { key: "immunizations", label: "Immunizations" },
  ]},
];

// Flat map key → render fn
const SECTION_FNS = {
  summary:      sections.summary,
  adminfo:      sections.adminfo,
  hpi:          sections.hpi,
  pmsh:         sections.pmsh,
  careplan:     sections.careplan,
  sbar:         sections.sbar,
  notes:        sections.notes,
  mar:          sections.mar,
  vitals:       sections.vitals,
  gcs:          sections.gcs,
  morse:        sections.morse,
  braden:       sections.braden,
  news2:        sections.news2,
  labs:         sections.labs,
  io:           sections.io,
  allergies:    sections.allergies,
  immunizations:sections.immunizations,
};

const SECTION_LABELS = {};
NAV.forEach(g => g.children.forEach(c => { SECTION_LABELS[c.key] = c.label; }));

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
  const allergyTag = allergies.length
    ? `<span class="chart-tag ctag-allergy-yes">⚠ ${allergies.length} ALLERG${allergies.length > 1 ? "IES" : "Y"}</span>`
    : `<span class="chart-tag ctag-allergy-none">NKDA</span>`;
  const age = p.dob ? calcAge(p.dob) : (p.age ?? "");
  const sectionLabel = SECTION_LABELS[section] || section;

  view.innerHTML = `
    <div class="chart-wrap">
      <div class="chart-nav">
        <div class="sb-px">
          <div class="sb-px-name">${p.full_name}</div>
          <div class="sb-px-meta">${p.room || ""} · ${age ? age + "y" : ""} ${p.sex || ""}</div>
          <div class="sb-badges">
            <span class="sb-badge bb-teal">${p.status || "admitted"}</span>
            ${allergies.length ? `<span class="sb-badge bb-red">⚠ Allergy</span>` : ""}
          </div>
        </div>
        <div class="sb-nav" id="sb-nav">
          ${buildNav(section)}
        </div>
      </div>
      <div class="chart-main">
        <div class="chart-banner">
          <div class="chart-banner-left">
            <div class="chart-avatar-ph">${initials(p.full_name)}</div>
            <div class="chart-patient-info">
              <div class="chart-pt-name">
                ${p.full_name}
                <span class="chart-mrn">MRN ${p.mrn || "—"}</span>
              </div>
              <div class="chart-pt-row1">
                <span>${age ? age + " y/o" : ""} ${p.sex || ""}</span>
                ${p.room ? `<span>Room ${p.room}</span>` : ""}
                ${p.admitting_physician ? `<span>Dr. ${p.admitting_physician}</span>` : ""}
              </div>
              <div class="chart-pt-row2">
                <span class="chart-tag ctag-dx">${p.chief_complaint || p.admitting_diagnosis || "—"}</span>
                ${allergyTag}
              </div>
            </div>
          </div>
          <div style="padding:12px 16px;display:flex;align-items:center;gap:8px;flex-shrink:0">
            <div id="presence" class="presence"></div>
            <button class="tb-btn" id="print-report">&#128438; Print</button>
          </div>
        </div>
        <div class="ehr-ch">
          <div>
            <div class="ehr-ct">${sectionLabel}</div>
          </div>
        </div>
        <div class="ehr-body" id="section-root">Loading…</div>
      </div>
    </div>`;

  // nav item clicks
  view.querySelector("#sb-nav").addEventListener("click", e => {
    const item = e.target.closest("[data-sec]");
    if (item) navigate(`#/chart/${patientId}/${item.dataset.sec}`);
    // group expand/collapse (parent rows)
    const parent = e.target.closest("[data-group]");
    if (parent) {
      const key = parent.dataset.group;
      const kids = document.getElementById(`nav-group-${key}`);
      const chev = parent.querySelector(".nav-chev");
      if (kids) {
        const hidden = kids.style.display === "none";
        kids.style.display = hidden ? "block" : "none";
        if (chev) chev.classList.toggle("open", hidden);
      }
    }
  });

  const sectionEl = view.querySelector("#section-root");
  const renderFn = SECTION_FNS[section] || SECTION_FNS.summary;
  await renderFn(p, sectionEl);

  // realtime
  const session = store.get("session");
  realtime.join(p.encounter_id, session?.user || { email: "demo" }, table => {
    toast(`Live update: ${table.replace("_", " ")}`);
    renderFn(p, sectionEl);
  });
  renderPresence();
  store.subscribe(renderPresence);

  view.querySelector("#print-report").onclick = async () => {
    try {
      const html = await api.generateReport(p);
      const iframe = document.createElement("iframe");
      iframe.style.cssText = "position:fixed;right:0;bottom:0;width:0;height:0;border:0";
      document.body.appendChild(iframe);
      iframe.srcdoc = html;
      iframe.onload = () => {
        iframe.contentWindow.focus();
        iframe.contentWindow.print();
        setTimeout(() => iframe.remove(), 1000);
      };
    } catch (e) { toast("Report failed: " + (e.message || e), { kind: "crit" }); }
  };
}

function buildNav(activeSection) {
  return NAV.map((group, gi) => {
    const isGroupActive = group.children.some(c => c.key === activeSection);
    const children = group.children.map(c => `
      <div class="nav-child ${c.key === activeSection ? "active" : ""}" data-sec="${c.key}">${c.label}</div>
    `).join("");
    return `
      <div class="nav-item parent" data-group="g${gi}">
        <span>${group.label}</span>
        <span class="nav-chev ${isGroupActive ? "open" : ""}">▾</span>
      </div>
      <div class="nav-children" id="nav-group-g${gi}" style="display:${isGroupActive || gi === 0 ? "block" : "none"}">
        ${children}
      </div>`;
  }).join("");
}

function calcAge(dob) {
  const d = new Date(dob);
  const today = new Date();
  let age = today.getFullYear() - d.getFullYear();
  if (today.getMonth() < d.getMonth() || (today.getMonth() === d.getMonth() && today.getDate() < d.getDate())) age--;
  return age;
}

function renderPresence() {
  const box = document.getElementById("presence");
  if (!box) return;
  const people = store.get("presence") || [];
  box.innerHTML = people.length
    ? `<span class="live-dot"></span> ` + people.map(n => `<div class="px-av" style="width:22px;height:22px;font-size:8px">${initials(n)}</div>`).join("")
    : "";
}
