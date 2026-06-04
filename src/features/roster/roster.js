// ============================================================================
//  features/roster/roster.js — two views:
//    1) care-setting grid (wards / OPD / LTC) for the active tab
//    2) patient list inside a chosen setting
//  Tapping a patient routes to the chart.
// ============================================================================
import { api } from "../../core/api.js";
import { store } from "../../core/store.js";
import { renderShell } from "../../ui/shell.js";
import { navigate } from "../../core/router.js";
import { initials, statusTag } from "../../ui/components.js";

const TAB_META = {
  wards: { kind: "ward", title: "Inpatient Wards", sub: "Select a ward to view admitted patients" },
  opd:   { kind: "opd",  title: "Outpatient Clinics", sub: "Select a clinic to view today's roster" },
  ltc:   { kind: "ltc",  title: "Long-Term Care", sub: "Select a wing to view residents" },
};

export async function renderRoster(tab) {
  store.set({ tab });
  const meta = TAB_META[tab] || TAB_META.wards;
  const view = renderShell(tab, [{ label: meta.title }]);
  view.innerHTML = `<div class="view"><div class="sec-hdr"><div>
      <div class="sec-title">${meta.title}</div><div class="sec-sub">${meta.sub}</div>
    </div></div><div class="card-grid" id="grid">Loading…</div></div>`;

  const settings = await api.settings(meta.kind);
  document.getElementById("grid").innerHTML = settings.map((s) => `
    <div class="dept-card ${s.color_class}" data-id="${s.id}">
      <div class="dept-name">${s.name}</div>
      <div class="dept-desc">${s.description || ""}</div>
      <div class="dept-cap">Capacity: ${s.capacity ?? "—"}</div>
    </div>`).join("") || "<p>No settings configured.</p>";

  document.querySelectorAll(".dept-card").forEach((el) =>
    el.addEventListener("click", () => navigate(`#/setting/${el.dataset.id}`)));
}

export async function renderSetting(settingId) {
  const tab = store.get("tab") || "wards";
  const meta = TAB_META[tab];
  const settings = await api.settings(meta.kind);
  const setting = settings.find((s) => s.id === settingId);
  store.set({ setting });

  const view = renderShell(tab, [
    { label: meta.title, path: `#/roster/${tab}` },
    { label: setting?.name || "Setting" },
  ]);
  view.innerHTML = `<div class="view"><div class="sec-hdr"><div>
      <div class="sec-title">${setting?.name || "Patients"}</div>
      <div class="sec-sub">${setting?.description || ""}</div>
    </div></div><div id="list">Loading…</div></div>`;

  const patients = await api.patientsBySetting(settingId);
  document.getElementById("list").innerHTML = patients.map((p) => `
    <div class="px-row" data-id="${p.id}">
      <div class="px-av">${initials(p.full_name)}</div>
      <div class="px-main">
        <div class="px-name">${p.full_name}</div>
        <div class="px-meta">${p.room || ""} · ${p.chief_complaint || ""} · ${p.admitting_physician || ""}</div>
      </div>
      ${statusTag(p.status)}
    </div>`).join("") || "<p>No patients in this setting.</p>";

  document.querySelectorAll(".px-row").forEach((el) =>
    el.addEventListener("click", () => navigate(`#/chart/${el.dataset.id}/summary`)));
}
