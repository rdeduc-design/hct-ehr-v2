// ============================================================================
//  ui/toast.js — transient notifications (used by the alert engine, e.g. a
//  NEWS2 spike or a high-alert medication double-check reminder).
// ============================================================================
export function toast(message, { kind = "info", ms = 4000 } = {}) {
  const wrap = document.getElementById("toasts");
  const el = document.createElement("div");
  el.className = "toast" + (kind === "crit" ? " crit" : "");
  el.textContent = message;
  wrap.appendChild(el);
  setTimeout(() => el.remove(), ms);
}
