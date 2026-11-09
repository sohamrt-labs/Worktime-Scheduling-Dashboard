// Copyright 2026 Soham Raut
// SPDX-License-Identifier: Apache-2.0

import { useEffect, useState } from "react";
import { api, isReturning, login, register } from "../api/client";

const FEATURES = [
  ["📊", "Live dashboard", "Progress, costs and deadlines across every location"],
  ["⚠️", "Delay-risk alerts", "See which projects are slipping, and why"],
  ["🏢", "Many businesses, one login", "Switch between your businesses in one click"],
];
const TITLES = {
  register: ["Create your account", "Set up your first business in under a minute. You can add more later."],
  login: ["Welcome back", "Sign in to manage your projects, teams and equipment."],
  forgot: ["Reset your password", "Enter your account email and we will send you a reset link."],
};

// First visit: registration. After that this browser remembers you have an account and opens on "Sign in".
export default function Login({ onLogin }) {
  const [mode, setMode] = useState(isReturning() ? "login" : "register"); // register | login | forgot
  const [form, setForm] = useState({ username: "", password: "", email: "", business: "", invite: "" });
  const [agreed, setAgreed] = useState(false);
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState("");
  const [info, setInfo] = useState("");
  const [busy, setBusy] = useState(false);
  const [policy, setPolicy] = useState({ signup: true, invite: false, email: true }); // what the server allows
  useEffect(() => {
    api.authConfig().then((c) => {
      const signup = c.signup_enabled !== false;
      setPolicy({ signup, invite: c.invite_required === true, email: c.email_enabled !== false });
      if (!signup) setMode((m) => (m === "register" ? "login" : m));
    }).catch(() => {});
  }, []);

  const go = (next) => { setMode(next); setError(""); setInfo(""); };
  const set = (name) => (e) => setForm({ ...form, [name]: e.target.value });

  async function submit(e) {
    e.preventDefault();
    setError("");
    setInfo("");
    if (mode === "register" && form.password.length < 8) return setError("Password must be at least 8 characters.");
    setBusy(true);
    try {
      if (mode === "forgot") {
        setInfo((await api.forgotPassword(form.email.trim())).message);
        setBusy(false);
        return;
      }
      if (mode === "register") {
        await register({ username: form.username.trim(), password: form.password, email: form.email.trim(), business_name: form.business.trim(), invite_code: form.invite.trim(), accepted_terms: agreed });
      } else {
        await login(form.username.trim(), form.password);
      }
      onLogin();
    } catch (err) {
      setError(err.message);
      setBusy(false);
    }
  }

  const needs = {
    username: mode !== "forgot", email: mode !== "login", password: mode !== "forgot", business: mode === "register",
    invite: mode === "register" && policy.invite, terms: mode === "register",
  };
  const complete = (!needs.username || form.username) && (!needs.email || form.email) && (!needs.password || form.password)
    && (!needs.business || form.business) && (!needs.invite || form.invite) && (!needs.terms || agreed);
  const field = "mt-1.5 w-full rounded-lg border border-stone-300 bg-white px-3.5 py-2.5 text-stone-900 outline-none transition focus:border-hivis focus:ring-2 focus:ring-amber-200";
  const label = "text-sm font-medium text-stone-700";
  const [title, subtitle] = TITLES[mode];
  return (
    <div className="grid min-h-screen bg-stone-50 lg:grid-cols-2">
      <aside className="hidden flex-col justify-between bg-stone-900 p-12 text-white lg:flex">
        <div className="flex items-center gap-3 text-xl font-bold"><span className="text-3xl">🗓️</span> Work-Time</div>
        <div>
          <h2 className="max-w-md text-4xl font-bold leading-tight">Plan, track and deliver <span className="text-hivis">all your work.</span></h2>
          <ul className="mt-10 space-y-6">
            {FEATURES.map(([icon, head, text]) => (
              <li key={head} className="flex gap-4">
                <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-lg bg-stone-800 text-xl">{icon}</span>
                <div><p className="font-semibold">{head}</p><p className="text-sm text-stone-400">{text}</p></div>
              </li>))}
          </ul>
        </div>
        <p className="text-sm text-stone-500">Work and project scheduling for any business</p>
      </aside>

      <main className="flex items-center justify-center p-6">
        <div className="w-full max-w-sm">
          <div className="mb-8 text-center lg:hidden"><span className="text-4xl">🗓️</span><p className="mt-2 text-xl font-bold">Work-Time Scheduling</p></div>
          <h1 className="text-2xl font-bold text-stone-900">{title}</h1>
          <p className="mt-1 text-sm text-stone-500">{subtitle}</p>

          <form onSubmit={submit} className="mt-8 space-y-5" noValidate>
            {needs.username && (
              <div><label htmlFor="username" className={label}>Username</label>
                <input id="username" name="username" autoComplete="username" autoFocus required className={field} value={form.username} onChange={set("username")} /></div>)}
            {needs.email && (
              <div><label htmlFor="email" className={label}>Email address</label>
                <input id="email" name="email" type="email" autoComplete="email" required className={field} value={form.email} onChange={set("email")} />
                {mode === "register" && <p className="mt-1 text-xs text-stone-500">We send a confirmation link here, and use it if you forget your password.</p>}</div>)}
            {needs.password && (
              <div>
                <div className="flex items-center justify-between"><label htmlFor="password" className={label}>Password</label>
                  </div>
                <div className="relative">
                  <input id="password" name="password" autoComplete={mode === "register" ? "new-password" : "current-password"} required className={`${field} pr-16`}
                         type={showPassword ? "text" : "password"} value={form.password} onChange={set("password")} />
                  <button type="button" aria-label={showPassword ? "Hide password" : "Show password"} onClick={() => setShowPassword(!showPassword)}
                          className="absolute inset-y-0 right-0 mt-1.5 px-3.5 text-sm font-medium text-stone-500 hover:text-stone-900">{showPassword ? "Hide" : "Show"}</button>
                </div>
                {mode === "register" && <p className="mt-1 text-xs text-stone-500">At least 8 characters.</p>}
                {mode === "login" && <button type="button" onClick={() => go("forgot")} className="mt-2.5 text-sm font-medium text-stone-700 underline hover:text-stone-900">Forgot your password?</button>}
              </div>)}
            {needs.business && (
              <div><label htmlFor="business" className={label}>Business name</label>
                <input id="business" name="business" required className={field} value={form.business} onChange={set("business")} /></div>)}
            {needs.invite && (
              <div><label htmlFor="invite" className={label}>Invite code</label>
                <input id="invite" name="invite" required className={field} value={form.invite} onChange={set("invite")} /></div>)}
            {needs.terms && (
              <label htmlFor="terms" className="flex items-start gap-2.5 text-sm text-stone-600">
                <input id="terms" type="checkbox" checked={agreed} onChange={(e) => setAgreed(e.target.checked)} className="mt-0.5 h-4 w-4 rounded border-stone-300" />
                <span>I agree to the <a href="/terms" target="_blank" rel="noreferrer" className="font-medium text-stone-900 underline">Terms of Service</a> and the <a href="/privacy" target="_blank" rel="noreferrer" className="font-medium text-stone-900 underline">Privacy Policy</a></span>
              </label>)}
            {mode === "forgot" && !policy.email && <p className="rounded-lg border border-amber-200 bg-amber-50 px-3.5 py-2.5 text-sm text-amber-900">Email sending is not set up on this server, so no message will arrive. Running this on your own computer? The reset link is printed in the backend window, or run <code>python reset_password.py YOUR_USERNAME</code> there.</p>}
            {error && <p role="alert" className="rounded-lg border border-red-200 bg-red-50 px-3.5 py-2.5 text-sm text-red-700">{error}{mode === "login" && /incorrect/i.test(error) && <> <button type="button" onClick={() => go("forgot")} className="font-medium underline">Forgot your password?</button></>}</p>}
            {info && <p role="status" className="rounded-lg border border-green-200 bg-green-50 px-3.5 py-2.5 text-sm text-green-800">{info}</p>}
            <button disabled={busy || !complete} className="w-full rounded-lg bg-stone-900 py-2.5 font-semibold text-white transition hover:bg-stone-700 disabled:cursor-not-allowed disabled:opacity-50">
              {busy ? "Please wait…" : { register: "Create account", login: "Sign in", forgot: "Send reset link" }[mode]}</button>
          </form>

          <p className="mt-8 text-center text-sm text-stone-500">
            {mode === "register" && <>Already have an account? <button type="button" onClick={() => go("login")} className="font-medium text-stone-900 underline">Sign in instead</button></>}
            {mode === "login" && policy.signup && <>New here? <button type="button" onClick={() => go("register")} className="font-medium text-stone-900 underline">Create an account</button></>}
            {mode === "forgot" && <button type="button" onClick={() => go("login")} className="font-medium text-stone-900 underline">Back to sign in</button>}
          </p>
          <p className="mt-6 text-center text-xs text-stone-400"><a href="/terms" className="hover:underline">Terms</a> · <a href="/privacy" className="hover:underline">Privacy</a> · © 2026 Soham Raut</p>
        </div>
      </main>
    </div>
  );
}
