// ============================================================================
//  ui/shell.js — persistent chrome (top bar + main tabs + breadcrumb).
//  Renders once; feature views render into #view-root inside it.
// ============================================================================
import { store } from "../core/store.js";
import { auth } from "../core/auth.js";
import { navigate } from "../core/router.js";
import { initials } from "./components.js";
import { CONFIG } from "../config.js";

const TABS = [
  { key: "wards", label: "Wards" },
  { key: "opd", label: "OPD Clinics" },
  { key: "ltc", label: "Long-Term Care" },
  { key: "scenarios", label: "Scenarios", staffOnly: true },
];

export function renderShell(activeTab, breadcrumb = []) {
  const s = store.get("session");
  const role = s?.profile?.role ?? "student";
  const tabs = TABS.filter((t) => !t.staffOnly || auth.isStaff())
    .map((t) => `<div class="main-tab ${t.key === activeTab ? "active" : ""}" data-tab="${t.key}">${t.label}</div>`)
    .join("");

  const crumbs = breadcrumb.map((c, i) =>
    i === breadcrumb.length - 1
      ? `<span class="cur">${c.label}</span>`
      : `<span class="crumb" data-go="${c.path}">${c.label}</span><span class="sep">›</span>`,
  ).join("");

  const offlineBadge = CONFIG.OFFLINE ? `<span class="role-pill" style="background:#E08B2A">demo</span>` : "";

  document.getElementById("app").innerHTML = `
  <div class="app-shell">
    <div class="top-bar">
      <div class="tb-title" id="home-link">HCT Academy</div>
      <div class="tb-sub">Electronic Health Record</div>
      <div class="tb-right">
        ${offlineBadge}
        <span class="role-pill">${role}</span>
        <div class="tb-avatar">${initials(s?.profile?.full_name || "User")}</div>
        <button class="tb-btn" id="signout">Sign out</button>
      </div>
    </div>
    <div class="main-tabs">${tabs}</div>
    <div class="bc">${crumbs || "<span class='cur'>Home</span>"}</div>
    <div class="app-body"><div id="view-root" style="flex:1;display:flex;overflow:hidden"></div></div>
  </div>`;

  document.getElementById("home-link").onclick = () => navigate("#/roster/wards");
  document.getElementById("signout").onclick = async () => { await auth.signOut(); navigate("#/login"); };
  document.querySelectorAll(".main-tab").forEach((el) =>
    el.addEventListener("click", () => navigate(`#/roster/${el.dataset.tab}`)));
  document.querySelectorAll("[data-go]").forEach((el) =>
    el.addEventListener("click", () => navigate(el.dataset.go)));

  return document.getElementById("view-root");
}
