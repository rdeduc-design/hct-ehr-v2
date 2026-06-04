// ============================================================================
//  core/supabase.js — Supabase client singleton.
//  Returns null in OFFLINE mode so callers can branch to the localStorage
//  adapter. Everything else imports the client from here.
// ============================================================================
import { createClient } from "@supabase/supabase-js";
import { CONFIG } from "../config.js";

export const sb = CONFIG.OFFLINE
  ? null
  : createClient(CONFIG.SUPABASE_URL, CONFIG.SUPABASE_ANON_KEY, {
      auth: { persistSession: true, autoRefreshToken: true },
      realtime: { params: { eventsPerSecond: 5 } },
    });
