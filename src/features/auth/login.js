// ============================================================================
//  features/auth/login.js — login + signup screen.
//  In OFFLINE mode the role selector lets you preview student vs instructor
//  gating without a backend.
// ============================================================================
import { auth } from "../../core/auth.js";
import { navigate } from "../../core/router.js";
import { CONFIG } from "../../config.js";

export function renderLogin() {
  let mode = "login";
  const root = document.getElementById("app");

  function paint() {
    const isSignup = mode === "signup";
    root.innerHTML = `
    <div class="auth-wrap">
      <div class="auth-brand">
        <div class="brand-name">${CONFIG.BRAND.name}</div>
        <div class="brand-div"></div>
        <div class="brand-tag">${CONFIG.BRAND.tagline}</div>
      </div>
      <div class="auth-area">
        <div class="auth-card">
          <h2>${isSignup ? "Create account" : "Sign in"}</h2>
          <p>Electronic Health Record · Nursing Simulation Platform</p>
          ${isSignup ? `<div class="fg"><label>Full name</label><input id="name" placeholder="Juan dela Cruz"></div>` : ""}
          <div class="fg"><label>Email</label><input id="email" type="email" placeholder="you@hct.ph"></div>
          <div class="fg"><label>Password</label><input id="pw" type="password" placeholder="••••••••"></div>
          <div class="fg"><label>Role</label>
            <select id="role">
              <option value="student">Student Nurse</option>
              <option value="instructor">Clinical Instructor</option>
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
