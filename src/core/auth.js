// ============================================================================
//  core/auth.js — session + role handling.
//  ONLINE: Supabase Auth (email/password). The DB trigger handle_new_user()
//  mirrors a profile with org + role; we fetch it to populate the session.
//  OFFLINE: a fake session is created so the app is fully demoable; role is
//  chosen at login so you can preview student vs instructor gating.
// ============================================================================
import { sb } from "./supabase.js";
import { CONFIG } from "../config.js";
import { store } from "./store.js";

const LS_SESSION = "hct_ehr_session";

export const auth = {
  async restore() {
    if (CONFIG.OFFLINE) {
      const s = JSON.parse(localStorage.getItem(LS_SESSION) || "null");
      if (s) store.set({ session: s });
      return s;
    }
    const { data } = await sb.auth.getSession();
    if (data.session) {
      const profile = await fetchProfile(data.session.user.id);
      const session = { user: data.session.user, profile };
      store.set({ session });
      return session;
    }
    return null;
  },

  async signIn(email, password, demoRole = "student") {
    if (CONFIG.OFFLINE) {
      const session = { user: { email }, profile: { full_name: email.split("@")[0], role: demoRole, organization_id: "demo" } };
      localStorage.setItem(LS_SESSION, JSON.stringify(session));
      store.set({ session });
      return session;
    }
    const { data, error } = await sb.auth.signInWithPassword({ email, password });
    if (error) throw error;
    const profile = await fetchProfile(data.user.id);
    const session = { user: data.user, profile };
    store.set({ session });
    return session;
  },

  async signUp(email, password, fullName, role) {
    if (CONFIG.OFFLINE) return this.signIn(email, password, role);
    const { data, error } = await sb.auth.signUp({
      email, password,
      options: { data: { full_name: fullName, role } },
    });
    if (error) throw error;
    return data;
  },

  async signOut() {
    if (CONFIG.OFFLINE) localStorage.removeItem(LS_SESSION);
    else await sb.auth.signOut();
    store.set({ session: null });
  },

  role() { return store.get("session")?.profile?.role ?? null; },
  isStaff() { return ["instructor", "admin"].includes(this.role()); },
};

async function fetchProfile(userId) {
  const { data } = await sb.from("profiles").select("*").eq("id", userId).single();
  return data;
}
