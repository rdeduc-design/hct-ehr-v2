// ============================================================================
//  core/router.js — hash router. Hash routing works on GitHub Pages with no
//  server rewrites. Routes:
//    #/login
//    #/roster/:tab                         (tab = wards|opd|ltc)
//    #/setting/:settingId
//    #/chart/:patientId/:section
//    #/scenarios
// ============================================================================
const routes = [];

export function route(pattern, handler) {
  const keys = [];
  const rx = new RegExp(
    "^#" + pattern.replace(/:[^/]+/g, (m) => {
      keys.push(m.slice(1));
      return "([^/]+)";
    }) + "$",
  );
  routes.push({ rx, keys, handler });
}

export function navigate(path) {
  if (location.hash === path) dispatch();
  else location.hash = path;
}

function dispatch() {
  const hash = location.hash || "#/login";
  for (const r of routes) {
    const m = hash.match(r.rx);
    if (m) {
      const params = {};
      r.keys.forEach((k, i) => (params[k] = decodeURIComponent(m[i + 1])));
      return r.handler(params);
    }
  }
  navigate("#/login");
}

export function startRouter() {
  addEventListener("hashchange", dispatch);
  dispatch();
}
