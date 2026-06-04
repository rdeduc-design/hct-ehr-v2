// ============================================================================
//  ui/components.js — tiny render helpers. Keeps feature modules declarative
//  without pulling in a framework. `h` builds elements; `mount` swaps HTML and
//  wires declarative data-action handlers.
// ============================================================================
export const $ = (sel, root = document) => root.querySelector(sel);
export const $$ = (sel, root = document) => [...root.querySelectorAll(sel)];

export function initials(name = "") {
  return name.split(" ").filter(Boolean).slice(0, 2).map((w) => w[0]?.toUpperCase()).join("");
}

export function statusTag(status) {
  const s = (status || "admitted").toLowerCase();
  const label = { critical: "Critical", admitted: "Admitted", discharge: "For Discharge", isolation: "Isolation" }[s] || status;
  return `<span class="tag ${s}">${label}</span>`;
}

export function row(label, value) {
  return `<div class="irow"><span class="il">${label}</span><span class="iv">${value ?? "—"}</span></div>`;
}

// Render html into a root and bind [data-action] click handlers from a map.
export function bind(root, html, handlers = {}) {
  root.innerHTML = html;
  for (const [action, fn] of Object.entries(handlers)) {
    $$(`[data-action="${action}"]`, root).forEach((el) =>
      el.addEventListener("click", (e) => fn(e, el.dataset)));
  }
}
