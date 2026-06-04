// ============================================================================
//  ui/shell.js — persistent chrome (top bar + tabs + breadcrumb + alerts).
// ============================================================================
import { store } from "../core/store.js";
import { auth } from "../core/auth.js";
import { navigate } from "../core/router.js";
import { initials } from "./components.js";
import { CONFIG } from "../config.js";

const TABS = [
  { key: "wards",     label: "Wards" },
  { key: "opd",       label: "OPD Clinics" },
  { key: "ltc",       label: "Long-Term Care" },
  { key: "scenarios", label: "Scenarios", staffOnly: true },
];

// Module-level alert registry — persists across nav
let GLOBAL_ALERTS = [];
let alertPanelOpen = false;

export function pushAlerts(alerts, pxId, pxName, section) {
  GLOBAL_ALERTS = GLOBAL_ALERTS.filter(a => !(a.pxId === pxId && a.section === section));
  alerts.forEach(a => GLOBAL_ALERTS.push({ ...a, pxId, pxName, section }));
  updateAlertBadge();
}

function updateAlertBadge() {
  const badge = document.getElementById("alerts-badge");
  if (!badge) return;
  const count = GLOBAL_ALERTS.length;
  badge.textContent = count > 9 ? "9+" : String(count);
  if (count > 0) badge.classList.add("visible");
  else badge.classList.remove("visible");
  if (alertPanelOpen) renderAlertPanel();
}

function renderAlertPanel() {
  const body = document.getElementById("alert-panel-body");
  if (!body) return;
  if (GLOBAL_ALERTS.length === 0) {
    body.innerHTML = `<div class="alert-empty">No active alerts</div>`;
    return;
  }
  body.innerHTML = GLOBAL_ALERTS.map(a => `
    <div class="alert-item" data-alert-px="${a.pxId}" data-alert-sec="${a.section}">
      <div class="alert-dot ${a.sev === "critical" ? "critical" : "warning"}"></div>
      <div>
        <div class="alert-item-name">${a.pxName} — ${a.label}</div>
        <div class="alert-item-detail">${a.val} &nbsp;|&nbsp;
          <strong style="color:${a.flag === "HIGH" ? "var(--critical)" : "var(--discharge)"}">${a.flag}</strong>
          &nbsp;|&nbsp; ${a.section}
        </div>
      </div>
    </div>`).join("");
}

function toggleAlertPanel() {
  alertPanelOpen = !alertPanelOpen;
  const panel = document.getElementById("alert-panel");
  if (!panel) return;
  if (alertPanelOpen) { panel.classList.add("open"); renderAlertPanel(); }
  else panel.classList.remove("open");
}

export function renderShell(activeTab, breadcrumb = []) {
  const s = store.get("session");
  const role = s?.profile?.role ?? "student";
  const tabs = TABS.filter(t => !t.staffOnly || auth.isStaff())
    .map(t => `<div class="main-tab ${t.key === activeTab ? "active" : ""}" data-tab="${t.key}">${t.label}</div>`)
    .join("");

  const crumbs = breadcrumb.map((c, i) =>
    i === breadcrumb.length - 1
      ? `<span class="cur">${c.label}</span>`
      : `<span class="crumb" data-go="${c.path}">${c.label}</span><span class="sep">›</span>`,
  ).join("");

  const offlineBadge = CONFIG.OFFLINE ? `<span class="role-pill" style="background:#E08B2A">demo</span>` : "";
  const userName = s?.profile?.full_name || s?.user?.email || "User";

  document.getElementById("app").innerHTML = `
  <div class="app-shell">
    <div class="top-bar">
      <div class="tb-logo" id="home-link">
        <div class="tb-title">HCT Academy</div>
        <div class="tb-sub">EHR</div>
      </div>
      <div class="tb-right">
        ${offlineBadge}
        <span class="role-pill">${role}</span>
        <div class="alert-btn-wrap">
          <button class="tb-btn" id="alerts-btn" title="Clinical Alerts">&#9888;</button>
          <div class="alert-btn-badge" id="alerts-badge">0</div>
        </div>
        <div class="tb-avatar" title="${userName}">${initials(userName)}</div>
        <button class="tb-btn" id="signout">Sign out</button>
      </div>
    </div>
    <div class="main-tabs">${tabs}</div>
    <div class="bc">${crumbs || "<span class='cur'>Home</span>"}</div>
    <div class="app-body">
      <div id="view-root" style="flex:1;display:flex;overflow:hidden"></div>
    </div>
  </div>

  <div class="alert-panel" id="alert-panel">
    <div class="alert-panel-hdr">
      <span class="alert-panel-title">&#9888; Clinical Alerts</span>
      <span class="alert-panel-close" id="alert-panel-close">&#10005;</span>
    </div>
    <div class="alert-panel-body" id="alert-panel-body">
      <div class="alert-empty">No active alerts</div>
    </div>
  </div>`;

  document.getElementById("home-link").onclick = () => navigate("#/roster/wards");
  document.getElementById("signout").onclick = async () => { await auth.signOut(); navigate("#/login"); };
  document.getElementById("alerts-btn").onclick = toggleAlertPanel;
  document.getElementById("alert-panel-close").onclick = toggleAlertPanel;

  document.querySelectorAll(".main-tab").forEach(el =>
    el.addEventListener("click", () => navigate(`#/roster/${el.dataset.tab}`)));
  document.querySelectorAll("[data-go]").forEach(el =>
    el.addEventListener("click", () => navigate(el.dataset.go)));

  // close alert panel on outside click
  document.addEventListener("click", function onOutsideClick(e) {
    if (alertPanelOpen && !e.target.closest("#alert-panel") && !e.target.closest("#alerts-btn") && !e.target.closest(".alert-btn-wrap")) {
      alertPanelOpen = false;
      document.getElementById("alert-panel")?.classList.remove("open");
    }
  }, { once: false });

  // alert item click → navigate to patient section
  document.getElementById("alert-panel").addEventListener("click", e => {
    const item = e.target.closest("[data-alert-px]");
    if (item) {
      const pxId = item.dataset.alertPx;
      const sec = item.dataset.alertSec || "vitals";
      alertPanelOpen = false;
      document.getElementById("alert-panel").classList.remove("open");
      navigate(`#/chart/${pxId}/${sec}`);
    }
  });

  updateAlertBadge();
  return document.getElementById("view-root");
}
