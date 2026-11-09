// Copyright 2026 Soham Raut
// SPDX-License-Identifier: Apache-2.0

import { useEffect, useState } from "react";
import { api } from "../api/client";

// Opened from an emailed link: /?verify=TOKEN confirms the email, /?reset=TOKEN lets the user choose a new password.
export default function TokenScreen({ kind, token }) {
  const [state, setState] = useState({ status: kind === "verify" ? "working" : "form", message: "" });
  const [password, setPassword] = useState("");
  const [again, setAgain] = useState("");
  const field = "mt-1.5 w-full rounded-lg border border-stone-300 bg-white px-3.5 py-2.5 outline-none focus:border-hivis focus:ring-2 focus:ring-amber-200";

  useEffect(() => {
    if (kind === "verify") api.verifyEmail(token).then((r) => setState({ status: "done", message: r.message })).catch((e) => setState({ status: "error", message: e.message }));
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  async function submit(e) {
    e.preventDefault();
    if (password.length < 8) return setState({ status: "form", message: "Password must be at least 8 characters." });
    if (password !== again) return setState({ status: "form", message: "The two passwords do not match." });
    try { setState({ status: "done", message: (await api.resetPassword(token, password)).message }); }
    catch (err) { setState({ status: "error", message: err.message }); }
  }

  return (
    <main className="flex min-h-screen items-center justify-center bg-stone-50 p-6">
      <div className="w-full max-w-sm rounded-xl border border-stone-200 bg-white p-8 text-center shadow-sm">
        <p className="text-4xl">{state.status === "done" ? "✅" : state.status === "error" ? "⚠️" : kind === "reset" ? "🔑" : "⏳"}</p>
        <h1 className="mt-3 text-xl font-bold">{kind === "verify" ? "Email confirmation" : "Choose a new password"}</h1>
        {state.status === "working" && <p className="mt-3 text-stone-600">Confirming your email…</p>}
        {kind === "reset" && state.status === "form" && (
          <form onSubmit={submit} className="mt-5 space-y-4 text-left">
            <div><label htmlFor="new" className="text-sm font-medium text-stone-700">New password</label><input id="new" type="password" autoComplete="new-password" className={field} value={password} onChange={(e) => setPassword(e.target.value)} /></div>
            <div><label htmlFor="again" className="text-sm font-medium text-stone-700">Repeat new password</label><input id="again" type="password" autoComplete="new-password" className={field} value={again} onChange={(e) => setAgain(e.target.value)} /></div>
            {state.message && <p role="alert" className="text-sm text-red-700">{state.message}</p>}
            <button className="w-full rounded-lg bg-stone-900 py-2.5 font-semibold text-white hover:bg-stone-700">Save new password</button>
          </form>)}
        {(state.status === "done" || state.status === "error") && (
          <>
            <p role={state.status === "error" ? "alert" : "status"} className={`mt-3 ${state.status === "error" ? "text-red-700" : "text-stone-700"}`}>{state.message}</p>
            <a href="/" className="mt-6 inline-block rounded-lg bg-stone-900 px-5 py-2.5 font-semibold text-white hover:bg-stone-700">Continue to the app</a>
          </>)}
      </div>
    </main>
  );
}
