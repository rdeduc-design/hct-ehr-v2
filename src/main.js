// ============================================================================
//  main.js — application bootstrap. Wires routes to features and guards
//  authenticated routes behind a restored session.
// ============================================================================
import { route, startRouter, navigate } from "./core/router.js";
import { auth } from "./core/auth.js";
import { store } from "./core/store.js";
import { realtime } from "./core/realtime.js";
import { renderLogin } from "./features/auth/login.js";
import { renderRoster, renderSetting } from "./features/roster/roster.js";
import { renderChart } from "./features/chart/chart.js";
import { renderScenarios } from "./features/scenarios/scenarios.js";

// Leave any realtime channel when navigating away from a chart.
let lastWasChart = false;
function maybeLeaveRealtime(isChart) {
  if (lastWasChart && !isChart) realtime.leave();
  lastWasChart = isChart;
}

const guard = (fn, isChart = false) => (params) => {
  if (!store.get("session")) return navigate("#/login");
  maybeLeaveRealtime(isChart);
  fn(params);
};

route("/login", () => { realtime.leave(); renderLogin(); });
route("/roster/:tab", guard((p) => renderRoster(p.tab)));
route("/setting/:id", guard((p) => renderSetting(p.id)));
route("/chart/:patientId/:section", guard((p) => renderChart(p.patientId, p.section), true));
route("/scenarios", guard(() => renderScenarios()));

// Restore session, then start routing.
(async () => {
  await auth.restore();
  if (!location.hash || location.hash === "#/") {
    location.hash = store.get("session") ? "#/roster/wards" : "#/login";
  }
  startRouter();
})();
