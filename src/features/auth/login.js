// ============================================================================
//  features/auth/login.js — login + signup screen with HCT brand panel.
// ============================================================================
import { auth } from "../../core/auth.js";
import { navigate } from "../../core/router.js";
import { CONFIG } from "../../config.js";

const SVG_LOGO = `<svg width="62" height="62" viewBox="0 0 62 62" fill="none" xmlns="http://www.w3.org/2000/svg">
  <circle cx="31" cy="31" r="31" fill="rgba(255,255,255,0.12)"/>
  <text x="31" y="36" text-anchor="middle" font-family="DM Serif Display,serif" font-size="20" fill="#fff" font-weight="700">HCT</text>
</svg>`;

export function renderLogin() {
  let mode = "login";
  const root = document.getElementById("app");

  function paint() {
    const isSignup = mode === "signup";
    root.innerHTML = `
    <div class="auth-wrap">
      <div class="auth-brand">
        ${SVG_LOGO}
        <div class="brand-name">HCT Academy</div>
        <div class="brand-div"></div>
        <div class="brand-tag">Electronic Health Record</div>
        <div class="brand-desc">A simulation-grade clinical platform for nursing students and clinical instructors.</div>
      </div>
      <div class="auth-area">
        <div class="auth-card">
          <h2>${isSignup ? "Create account" : "Welcome back"}</h2>
          <p>Electronic Health Record · Nursing Simulation Platform</p>
          ${isSignup ? `<div class="fg"><label>Full name</label><input id="name" placeholder="Juan dela Cruz"></div>` : ""}
          <div class="fg"><label>Email</label><input id="email" type="email" placeholder="you@hct.ph" autocomplete="email"></div>
          <div class="fg"><label>Password</label><input id="pw" type="password" placeholder="••••••••" autocomplete="current-password"></div>
          <div class="fg"><label>Role</label>
            <select id="role">
              <option value="student">Student Nurse</option>
              <option value="instructor">Clinical Instructor</option>
              <option value="staff">Nursing Staff</option>
            </select>
          </div>
          <button class="btn-p" id="go">${isSignup ? "Create account" : "Sign in"}</button>
          <div class="err" id="err"></div>
          <div class="auth-sw">${isSignup ? "Already enrolled?" : "New here?"}
            <a id="swap">${isSignup ? "Sign in" : "Create an account"}</a></div>
        </div>
      </div>
    </div>`;

    document.getElementById("swap").onclick = () => { mode = isSignup ? "login" : "signup"; paint(); };
    document.getElementById("go").onclick = submit;
    document.getElementById("pw").onkeydown = (e) => { if (e.key === "Enter") submit(); };
  }

  async function submit() {
    const email = document.getElementById("email").value.trim();
    const pw = document.getElementById("pw").value;
    const role = document.getElementById("role").value;
    const err = document.getElementById("err");
    err.textContent = "";
    try {
      if (mode === "signup") {
        const name = document.getElementById("name").value.trim();
        await auth.signUp(email, pw, name, role);
        if (!CONFIG.OFFLINE) { err.textContent = "Check your email to confirm, then sign in."; mode = "login"; return paint(); }
      } else {
        await auth.signIn(email, pw, role);
      }
      navigate("#/roster/wards");
    } catch (e) {
      err.textContent = e.message || "Authentication failed.";
    }
  }

  paint();
}
