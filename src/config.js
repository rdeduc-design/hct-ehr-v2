// ============================================================================
//  config.js — runtime configuration & feature flags.
//  These are PUBLIC values (anon key is safe to ship; RLS is the real guard).
//  Swap them for your own project, or leave blank to run in OFFLINE/demo mode
//  (api.js falls back to localStorage so the app is usable with zero backend).
// ============================================================================
export const CONFIG = {
  SUPABASE_URL: "https://srkvgzvovuuyzcctgpes.supabase.co",        // e.g. "https://xxxx.supabase.co"
  SUPABASE_ANON_KEY: "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InNya3ZnenZvdnV1eXpjY3RncGVzIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODA1MDM5NTIsImV4cCI6MjA5NjA3OTk1Mn0.jBT6X9Mek5TDkYXMrWrcI51msGcYrp7-c5EIc5qj0t8",   // public anon key

  // When true (or when URL/key are blank), all data ops use a localStorage
  // adapter instead of Supabase. Lets students demo on GitHub Pages offline.
  get OFFLINE() {
    return !this.SUPABASE_URL || !this.SUPABASE_ANON_KEY;
  },

  FLAGS: {
    realtimeCharting: true,   // Supabase Realtime collaborative charting
    adaptiveEngine: true,     // live deteriorating/improving vitals
    serverReport: true,       // generate-report Edge Function (vs client print)
  },

  ORG_SLUG: "hct-academy",
  BRAND: { name: "HCT Academy", tagline: "How Care Transforms" },
};
