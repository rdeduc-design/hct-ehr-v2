// ============================================================================
//  core/realtime.js — collaborative charting + presence over Supabase Realtime.
//  When two students open the same patient chart, each sees the other's avatar
//  (presence) and any new observation/note row appears live (postgres_changes).
//  No-ops gracefully in OFFLINE mode.
// ============================================================================
import { sb } from "./supabase.js";
import { CONFIG } from "../config.js";
import { store } from "./store.js";

let channel = null;

export const realtime = {
  // Join the channel for one encounter. onChange fires when a row is inserted.
  join(encounterId, user, onChange) {
    if (CONFIG.OFFLINE || !CONFIG.FLAGS.realtimeCharting || !sb) return;
    this.leave();

    channel = sb.channel(`enc:${encounterId}`, { config: { presence: { key: user.email } } });

    // Live row inserts on this encounter's clinical tables.
    ["observations", "clinical_notes", "medication_administrations"].forEach((table) => {
      channel.on("postgres_changes",
        { event: "INSERT", schema: "public", table, filter: `encounter_id=eq.${encounterId}` },
        (payload) => onChange?.(table, payload.new));
    });

    // Presence: who else is on this chart.
    channel.on("presence", { event: "sync" }, () => {
      const stateObj = channel.presenceState();
      const people = Object.values(stateObj).flat().map((m) => m.name || m.email);
      store.set({ presence: [...new Set(people)] });
    });

    channel.subscribe((status) => {
      if (status === "SUBSCRIBED") {
        channel.track({ email: user.email, name: user.profile?.full_name, at: Date.now() });
      }
    });
  },

  leave() {
    if (channel) { sb?.removeChannel(channel); channel = null; store.set({ presence: [] }); }
  },
};
