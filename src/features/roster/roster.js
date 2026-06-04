// ============================================================================
//  features/roster/roster.js — care-setting grid + patient card list.
// ============================================================================
import { api } from "../../core/api.js";
import { store } from "../../core/store.js";
import { renderShell } from "../../ui/shell.js";
import { navigate } from "../../core/router.js";
import { initials } from "../../ui/components.js";

const TAB_META = {
  wards: { kind: "ward", title: "Inpatient Wards",    sub: "Select a ward to view admitted patients" },
  opd:   { kind: "opd",  title: "Outpatient Clinics", sub: "Select a clinic to view today's roster" },
  ltc:   { kind: "ltc",  title: "Long-Term Care",     sub: "Select a wing to view residents" },
};

const STATUS_FILTERS = ["All", "Admitted", "Critical", "For Discharge", "Isolation"];

function statusBadge(status) {
  const map = {
    critical:  "sb-critical",
    admitted:  "sb-admitted",
    discharge: "sb-discharge",
    isolation: "sb-isolation",
  };
  const cls = map[status] || "sb-admitted";
  return `<span class="status-badge ${cls}">${status || "admitted"}</span>`;
}

function matchFilter(p, filter) {
  if (!filter || filter === "All") return true;
  const s = (p.status || "admitted").toLowerCase();
  const f = filter.toLowerCase();
  if (f === "critical")      return s === "critical";
  if (f === "admitted")      return s === "admitted";
  if (f === "for discharge") return s === "discharge";
  if (f === "isolation")     return s === "isolation";
  return true;
}

export async function renderRoster(tab) {
  store.set({ tab });
  const meta = TAB_META[tab] || TAB_META.wards;
  const view = renderShell(tab, [{ label: meta.title }]);
  view.innerHTML = `
    <div class="view">
      <div class="sec-hdr">
        <div>
          <div class="sec-title">${meta.title}</div>
          <div class="sec-sub">${meta.sub}</div>
        </div>
      </div>
      <div class="card-grid" id="grid">
        <div style="color:var(--text-muted);font-size:13px">Loading…</div>
      </div>
    </div>`;

  const settings = await api.settings(meta.kind);
  document.getElementById("grid").innerHTML = settings.length
    ? settings.map(s => `
      <div class="dept-card ${s.color_class || "c-teal"}" data-id="${s.id}">
        <div class="dept-name">${s.name}</div>
        <div class="dept-desc">${s.description || ""}</div>
        <div class="dept-stats">
          <div><div class="ds-val">${s.capacity ?? "—"}</div><div class="ds-lbl">Beds</div></div>
        </div>
        <span class="dept-arrow">›</span>
      </div>`).join("")
    : `<p style="color:var(--text-muted);font-size:13px">No settings configured.</p>`;

  document.querySelectorAll(".dept-card").forEach(el =>
    el.addEventListener("click", () => navigate(`#/setting/${el.dataset.id}`)));
}

export async function renderSetting(settingId) {
  const tab  = store.get("tab") || "wards";
  const meta = TAB_META[tab] || TAB_META.wards;
  const settings = await api.settings(meta.kind);
  const setting  = settings.find(s => s.id === settingId);
  store.set({ setting });

  const view = renderShell(tab, [
    { label: meta.title, path: `#/roster/${tab}` },
    { label: setting?.name || "Setting" },
  ]);

  let activeFilter = "All";
  let allPatients = [];

  view.innerHTML = `
    <div style="flex:1;display:flex;flex-direction:column;overflow:hidden">
      <div class="px-toolbar">
        <div class="filter-wrap" id="filter-wrap">
          ${STATUS_FILTERS.map(f => `<div class="fc ${f === activeFilter ? "active" : ""}" data-filter="${f}">${f}</div>`).join("")}
        </div>
        <button class="btn-new" id="btn-new-adm">+ New Admission</button>
      </div>
      <div style="padding:10px 14px 4px 22px;background:#fff;border-bottom:1px solid var(--border);display:flex;align-items:center;gap:8px;flex-shrink:0">
        <span style="font-size:14px;font-weight:600;color:var(--navy)">${setting?.name || "Patients"}</span>
        <span style="font-size:12px;color:var(--text-muted)">${setting?.description || ""}</span>
      </div>
      <div class="px-grid" id="px-grid">
        <div style="color:var(--text-muted);font-size:13px;padding:20px">Loading…</div>
      </div>
    </div>`;

  document.getElementById("filter-wrap").addEventListener("click", e => {
    const chip = e.target.closest(".fc");
    if (!chip) return;
    activeFilter = chip.dataset.filter;
    document.querySelectorAll(".fc").forEach(c => c.classList.toggle("active", c.dataset.filter === activeFilter));
    renderCards();
  });

  document.getElementById("btn-new-adm").onclick = () => showNewAdmissionModal(settingId, tab);

  allPatients = await api.patientsBySetting(settingId);
  renderCards();

  function renderCards() {
    const filtered = allPatients.filter(p => matchFilter(p, activeFilter));
    const grid = document.getElementById("px-grid");
    if (!grid) return;

    const cards = filtered.map(p => {
      const age = p.dob ? calcAge(p.dob) : (p.age ?? "");
      const ageStr = age ? `${age}y` : "";
      const sexStr = p.sex || "";
      return `
        <div class="px-card" data-id="${p.id}">
          <div class="px-card-top">
            <span class="room-badge">${p.room || "—"}</span>
            ${statusBadge(p.status)}
          </div>
          <div class="px-card-inner">
            <div class="px-photo-placeholder">${initials(p.full_name)}</div>
            <div class="px-card-info">
              <div class="px-name">${p.full_name}</div>
              <div class="px-meta">${[ageStr, sexStr, p.mrn ? "MRN "+p.mrn : ""].filter(Boolean).join(" · ")}</div>
            </div>
          </div>
          <div class="px-dx-lbl">Diagnosis</div>
          <div class="px-dx">${p.chief_complaint || p.admitting_diagnosis || "—"}</div>
        </div>`;
    });

    cards.push(`
      <div class="new-adm-card" id="new-adm-card-inline">
        <div class="na-icon">+</div>
        <div class="na-text">New Admission</div>
        <div class="na-sub">Admit a new patient</div>
      </div>`);

    grid.innerHTML = cards.join("") || `<div class="px-card" style="grid-column:1/-1;text-align:center;color:var(--text-muted);padding:40px">No patients match the selected filter.</div>`;

    grid.querySelectorAll(".px-card[data-id]").forEach(el =>
      el.addEventListener("click", () => navigate(`#/chart/${el.dataset.id}/summary`)));
    grid.querySelector("#new-adm-card-inline")?.addEventListener("click", () => showNewAdmissionModal(settingId, tab));
  }
}

function calcAge(dob) {
  if (!dob) return null;
  const d = new Date(dob);
  const today = new Date();
  let age = today.getFullYear() - d.getFullYear();
  if (today.getMonth() < d.getMonth() || (today.getMonth() === d.getMonth() && today.getDate() < d.getDate())) age--;
  return age;
}

function showNewAdmissionModal(settingId, tab) {
  const existing = document.getElementById("new-adm-modal");
  if (existing) existing.remove();

  const overlay = document.createElement("div");
  overlay.className = "modal-overlay";
  overlay.id = "new-adm-modal";

  const today = new Date().toISOString().split("T")[0];
  overlay.innerHTML = `
    <div class="modal-box" style="width:600px">
      <div class="modal-hdr">
        <div class="modal-title">New Admission</div>
        <button class="modal-close" id="modal-close-btn">&#10005;</button>
      </div>
      <div class="visit-type-tabs">
        <div class="vt-tab active" data-vtype="inpatient">Inpatient</div>
        <div class="vt-tab" data-vtype="opd">OPD Visit</div>
        <div class="vt-tab" data-vtype="er">ER</div>
      </div>
      <div class="section-divider">Patient Information</div>
      <div class="frow">
        <div class="fg"><label>Last Name</label><input id="adm-ln" placeholder="Dela Cruz"></div>
        <div class="fg"><label>First Name</label><input id="adm-fn" placeholder="Juan"></div>
      </div>
      <div class="frow">
        <div class="fg"><label>Date of Birth</label><input id="adm-dob" type="date"></div>
        <div class="fg"><label>Sex</label>
          <select id="adm-sex"><option value="">—</option><option value="M">Male</option><option value="F">Female</option></select>
        </div>
      </div>
      <div class="section-divider">Admission Details</div>
      <div class="frow">
        <div class="fg"><label>Admission Date</label><input id="adm-date" type="date" value="${today}"></div>
        <div class="fg"><label>Room / Bed</label><input id="adm-room" placeholder="e.g. ICU-3"></div>
      </div>
      <div class="fg"><label>Chief Complaint / Diagnosis</label><input id="adm-dx" placeholder="e.g. Acute Myocardial Infarction"></div>
      <div class="fg"><label>Admitting Physician</label><input id="adm-doc" placeholder="e.g. Dr. Santos"></div>
      <div class="btn-row">
        <button class="btn-cancel" id="modal-cancel-btn">Cancel</button>
        <button class="btn-save" id="modal-save-btn">Admit Patient</button>
      </div>
    </div>`;

  document.body.appendChild(overlay);

  overlay.querySelectorAll(".vt-tab").forEach(t =>
    t.addEventListener("click", () => {
      overlay.querySelectorAll(".vt-tab").forEach(x => x.classList.remove("active"));
      t.classList.add("active");
    }));

  overlay.querySelector("#modal-close-btn").onclick = () => overlay.remove();
  overlay.querySelector("#modal-cancel-btn").onclick = () => overlay.remove();
  overlay.addEventListener("click", e => { if (e.target === overlay) overlay.remove(); });

  overlay.querySelector("#modal-save-btn").onclick = async () => {
    const ln = overlay.querySelector("#adm-ln").value.trim();
    const fn = overlay.querySelector("#adm-fn").value.trim();
    if (!fn && !ln) { alert("Please enter the patient name."); return; }
    const fullName = `${fn} ${ln}`.trim();
    const dob    = overlay.querySelector("#adm-dob").value;
    const sex    = overlay.querySelector("#adm-sex").value;
    const room   = overlay.querySelector("#adm-room").value.trim();
    const dx     = overlay.querySelector("#adm-dx").value.trim();
    const doc    = overlay.querySelector("#adm-doc").value.trim();
    const admDate = overlay.querySelector("#adm-date").value;

    await api.admitPatient({ full_name: fullName, dob, sex, room, chief_complaint: dx,
      admitting_physician: doc, admission_date: admDate, setting_id: settingId });
    overlay.remove();
    navigate(`#/setting/${settingId}`);
  };
}
