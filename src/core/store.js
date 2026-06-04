// ============================================================================
//  core/store.js — minimal reactive store (no framework, no dependencies).
//  A single shared state object + subscribe/notify. Feature modules read from
//  it and subscribe to re-render on change. This is the seam where you could
//  later drop in Zustand/Redux without touching feature code.
// ============================================================================
const state = {
  session: null,      // { user, profile }
  tab: "wards",       // wards | opd | ltc | scenarios
  setting: null,      // selected care_setting row
  patient: null,      // selected patient row
  encounter: null,    // active encounter for that patient
  section: "summary", // active chart section key
  presence: [],       // realtime collaborators on the current chart
};

const subs = new Set();

export const store = {
  get: (k) => (k ? state[k] : state),
  set(patch) {
    Object.assign(state, patch);
    subs.forEach((fn) => fn(state));
  },
  subscribe(fn) {
    subs.add(fn);
    return () => subs.delete(fn);
  },
};
