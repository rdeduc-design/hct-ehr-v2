// ============================================================================
//  Edge Function: adaptive-vitals
//  The "live adaptive scenario engine" from the sprint. On each tick it reads
//  the encounter's scenario_runtime trajectory, nudges the latest vital signs
//  up or down per the active phase, writes new observation rows, re-scores
//  NEWS2 server-side, and returns the new snapshot. The front end (or a cron /
//  pg_cron schedule) calls this; Realtime then pushes the new rows to every
//  connected nurse station.
//
//  POST body: { encounter_id, action? }
//    action (optional) lets a nurse's intervention bend the trajectory, e.g.
//    { encounter_id, action: "gave_o2" } -> improve SpO2 drift.
// ============================================================================
import { serve } from "https://deno.land/std@0.224.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { cors, json } from "../_shared/cors.ts";

// Default drift per phase (per tick), keyed by observation code.
const PHASE_DRIFT: Record<string, Record<string, number>> = {
  deteriorating: { HR: +6, RR: +2, SPO2: -2, BP_SYS: -5, TEMP: +0.2 },
  improving:     { HR: -4, RR: -1, SPO2: +2, BP_SYS: +4, TEMP: -0.1 },
  stable:        {},
  baseline:      {},
};

// Nurse interventions that bend the trajectory.
const ACTION_EFFECT: Record<string, Record<string, number>> = {
  gave_o2:        { SPO2: +4, RR: -2 },
  gave_fluids:    { BP_SYS: +8, HR: -4 },
  gave_antipyretic:{ TEMP: -0.6 },
  gave_pressor:   { BP_SYS: +12 },
};

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  try {
    const { encounter_id, action } = await req.json();
    if (!encounter_id) return json({ error: "encounter_id required" }, 400);

    // Service-role client: this function owns the simulation tick.
    const sb = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    );

    const { data: rt } = await sb
      .from("scenario_runtime").select("*").eq("encounter_id", encounter_id).single();
    if (!rt || !rt.is_active) return json({ skipped: true, reason: "inactive" });

    const drift = { ...(PHASE_DRIFT[rt.phase] ?? {}) };
    if (action && ACTION_EFFECT[action]) {
      for (const [k, v] of Object.entries(ACTION_EFFECT[action])) {
        drift[k] = (drift[k] ?? 0) + v;
      }
    }

    // Latest value for each vital we manage.
    const codes = ["HR", "RR", "SPO2", "BP_SYS", "TEMP"];
    const snapshot: Record<string, number> = {};
    for (const code of codes) {
      const { data: last } = await sb
        .from("observations")
        .select("value_num")
        .eq("encounter_id", encounter_id).eq("code", code)
        .order("recorded_at", { ascending: false }).limit(1).maybeSingle();
      const base = last?.value_num ??
        ({ HR: 80, RR: 16, SPO2: 97, BP_SYS: 120, TEMP: 36.8 }[code]!);
      const next = clamp(code, base + (drift[code] ?? 0));
      snapshot[code] = next;
    }

    // Persist the new tick as observation rows.
    const rows = codes.map((code) => ({
      encounter_id, category: "vital-sign", code,
      display: DISPLAY[code], value_num: snapshot[code], unit: UNIT[code],
      recorded_at: new Date().toISOString(),
    }));
    await sb.from("observations").insert(rows);

    // Re-score NEWS2 in the DB so it's authoritative.
    const { data: news } = await sb.rpc("score_news2", {
      p_encounter: encounter_id,
      p_rr: Math.round(snapshot.RR), p_spo2: snapshot.SPO2, p_on_o2: action === "gave_o2",
      p_sbp: Math.round(snapshot.BP_SYS), p_hr: Math.round(snapshot.HR),
      p_temp: snapshot.TEMP, p_consciousness: "A",
    });

    await sb.from("scenario_runtime")
      .update({ last_tick_at: new Date().toISOString() })
      .eq("encounter_id", encounter_id);

    return json({ snapshot, news2: news, phase: rt.phase, action: action ?? null });
  } catch (e) {
    return json({ error: String(e) }, 500);
  }
});

function clamp(code: string, v: number): number {
  const bounds: Record<string, [number, number]> = {
    HR: [20, 220], RR: [4, 60], SPO2: [50, 100], BP_SYS: [40, 260], TEMP: [32, 43],
  };
  const [lo, hi] = bounds[code] ?? [-1e9, 1e9];
  return Math.round(Math.min(hi, Math.max(lo, v)) * 10) / 10;
}

const DISPLAY: Record<string, string> = {
  HR: "Heart Rate", RR: "Respiratory Rate", SPO2: "SpO₂",
  BP_SYS: "Systolic BP", TEMP: "Temperature",
};
const UNIT: Record<string, string> = {
  HR: "bpm", RR: "/min", SPO2: "%", BP_SYS: "mmHg", TEMP: "°C",
};
