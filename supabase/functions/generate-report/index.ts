// ============================================================================
//  Edge Function: generate-report
//  Renders a self-contained, print-ready HTML after-action report for an
//  encounter (PEARLS-structured). Rendering server-side fixes the blank
//  Print Report bug in the current app: the print window receives a complete,
//  already-populated document instead of relying on client DOM that may not be
//  mounted at print time.
//
//  POST body: { encounter_id }
//  Returns:   { html }  — the client opens it in a hidden iframe and prints.
// ============================================================================
import { serve } from "https://deno.land/std@0.224.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { cors, json } from "../_shared/cors.ts";

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  try {
    const { encounter_id } = await req.json();
    if (!encounter_id) return json({ error: "encounter_id required" }, 400);

    // Forward the caller's JWT so RLS still applies (student can only report
    // on a patient they can access).
    const authHeader = req.headers.get("Authorization") ?? "";
    const sb = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_ANON_KEY")!,
      { global: { headers: { Authorization: authHeader } } },
    );

    const { data: enc } = await sb
      .from("encounters")
      .select("*, patient:patients(*), care_setting:care_settings(name)")
      .eq("id", encounter_id).single();
    if (!enc) return json({ error: "not found or no access" }, 404);

    const [{ data: vitals }, { data: meds }, { data: notes }, { data: scores }] =
      await Promise.all([
        sb.from("observations").select("*").eq("encounter_id", encounter_id)
          .eq("category", "vital-sign").order("recorded_at"),
        sb.from("medication_administrations")
          .select("*, order:medication_orders(drug_name,dose,route)")
          .order("administered_at"),
        sb.from("clinical_notes").select("*").eq("encounter_id", encounter_id)
          .order("created_at"),
        sb.from("assessment_scores").select("*").eq("encounter_id", encounter_id)
          .eq("scale", "NEWS2").order("recorded_at"),
      ]);

    const html = renderReport(enc, vitals ?? [], meds ?? [], notes ?? [], scores ?? []);
    return json({ html });
  } catch (e) {
    return json({ error: String(e) }, 500);
  }
});

function esc(s: unknown): string {
  return String(s ?? "").replace(/[&<>]/g, (c) =>
    ({ "&": "&amp;", "<": "&lt;", ">": "&gt;" }[c]!));
}

function renderReport(enc: any, vitals: any[], meds: any[], notes: any[], scores: any[]): string {
  const p = enc.patient ?? {};
  const lastNews = scores.at(-1);
  const vrows = vitals.slice(-12).map((v) =>
    `<tr><td>${esc(v.display ?? v.code)}</td><td>${esc(v.value_num)} ${esc(v.unit)}</td>
     <td>${new Date(v.recorded_at).toLocaleString()}</td></tr>`).join("");
  const mrows = meds.map((m) =>
    `<tr><td>${esc(m.order?.drug_name)}</td><td>${esc(m.order?.dose)}</td>
     <td>${esc(m.status)}</td><td>${m.administered_at ? new Date(m.administered_at).toLocaleString() : "—"}</td></tr>`).join("");
  const nrows = notes.map((n) =>
    `<div class="note"><b>${esc(n.kind)}</b> · ${new Date(n.created_at).toLocaleString()}<p>${esc(n.text_body ?? JSON.stringify(n.body))}</p></div>`).join("");

  // PEARLS debrief scaffold appended for faculty.
  return `<!doctype html><html><head><meta charset="utf-8">
  <title>After-Action Report — ${esc(p.full_name)}</title>
  <style>
    body{font-family:'DM Sans',Arial,sans-serif;color:#1B2A4A;margin:32px;font-size:13px}
    h1{font-family:'DM Serif Display',serif;font-size:22px;border-bottom:3px solid #2BBFAD;padding-bottom:8px}
    h2{color:#1A9E8D;font-size:15px;margin-top:22px}
    table{width:100%;border-collapse:collapse;margin-top:8px}
    th,td{border:1px solid #E4E8F0;padding:6px 9px;text-align:left}
    th{background:#F8F7F3}
    .meta{display:grid;grid-template-columns:1fr 1fr;gap:6px 24px;margin:12px 0}
    .badge{display:inline-block;background:#1B2A4A;color:#fff;padding:2px 10px;border-radius:10px}
    .note{border-left:3px solid #2BBFAD;padding:4px 10px;margin:6px 0;background:#F8F7F3}
    .pearls li{margin:4px 0}
  </style></head><body>
  <h1>HCT Academy · Simulation After-Action Report</h1>
  <div class="meta">
    <div><b>Patient:</b> ${esc(p.full_name)} (MRN ${esc(p.mrn)})</div>
    <div><b>Setting:</b> ${esc(enc.care_setting?.name)}</div>
    <div><b>Chief complaint:</b> ${esc(enc.chief_complaint)}</div>
    <div><b>Status:</b> <span class="badge">${esc(enc.status)}</span></div>
    <div><b>Latest NEWS2:</b> ${lastNews ? `${lastNews.total_score} (${lastNews.risk_band})` : "—"}</div>
    <div><b>Generated:</b> ${new Date().toLocaleString()}</div>
  </div>

  <h2>Vital Signs (recent)</h2>
  <table><tr><th>Parameter</th><th>Value</th><th>Recorded</th></tr>${vrows || "<tr><td colspan=3>No data</td></tr>"}</table>

  <h2>Medication Administration</h2>
  <table><tr><th>Drug</th><th>Dose</th><th>Status</th><th>Time</th></tr>${mrows || "<tr><td colspan=4>No data</td></tr>"}</table>

  <h2>Clinical Notes</h2>
  ${nrows || "<p>No notes recorded.</p>"}

  <h2>PEARLS Debrief</h2>
  <ol class="pearls">
    <li><b>Reactions</b> — How did the team feel about the simulation?</li>
    <li><b>Description</b> — Summarize the case in one sentence.</li>
    <li><b>Analysis</b> — What clinical decisions went well? Where did escalation lag?</li>
    <li><b>Summary</b> — Two key takeaways for the next shift.</li>
  </ol>
  </body></html>`;
}
