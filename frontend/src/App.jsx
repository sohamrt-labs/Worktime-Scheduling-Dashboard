// Copyright 2026 Soham Raut
// SPDX-License-Identifier: Apache-2.0

import { lazy, Suspense, useCallback, useEffect, useState } from "react";
import { api, getBusiness, logout, setBusiness } from "./api/client";
import { RESOURCES } from "./resources";
import Account from "./pages/Account";
import Legal from "./pages/Legal";
import Login from "./pages/Login";
import ResourcePage from "./pages/ResourcePage";
import TokenScreen from "./pages/TokenScreen";

// Charts (recharts) are heavy, so the dashboard is loaded on demand.
const Dashboard = lazy(() => import("./pages/Dashboard"));

// Public pages that need no login: legal texts and the links we email (confirm email, reset password).
export default function App() {
  const { pathname, search } = window.location;
  const params = new URLSearchParams(search);
  if (pathname === "/terms" || pathname === "/privacy") return <Legal kind={pathname.slice(1)} />;
  if (params.get("verify")) return <TokenScreen kind="verify" token={params.get("verify")} />;
  if (params.get("reset")) return <TokenScreen kind="reset" token={params.get("reset")} />;
  return <Shell />;
}

function VerifyGate({ me, onRefresh, onSignOut }) {
  const [msg, setMsg] = useState("");
  const resend = () => api.resendVerification().then((r) => setMsg(r.message)).catch((e) => setMsg(e.message));
  return (
    <main className="flex min-h-screen items-center justify-center bg-stone-50 p-6">
      <div className="w-full max-w-md rounded-xl border border-stone-200 bg-white p-8 text-center shadow-sm">
        <p className="text-4xl">📧</p>
        <h1 className="mt-3 text-xl font-bold">Check your email</h1>
        <p className="mt-2 text-stone-600">We sent a confirmation link to <strong>{me.email}</strong>. Open it to start using Work-Time.</p>
        {msg && <p role="status" className="mt-3 text-sm text-stone-700">{msg}</p>}
        <div className="mt-6 flex flex-col gap-2">
          <button onClick={onRefresh} className="rounded-lg bg-stone-900 py-2.5 font-semibold text-white hover:bg-stone-700">I have confirmed, continue</button>
          <button onClick={resend} className="rounded-lg border border-stone-300 py-2.5 hover:bg-stone-100">Resend the email</button>
          <button onClick={onSignOut} className="py-2 text-sm text-stone-500 underline">Sign out</button>
        </div>
      </div>
    </main>
  );
}

function Shell() {
  const [me, setMe] = useState(undefined); // undefined = checking, null = signed out
  const [page, setPage] = useState("dashboard");
  const [businesses, setBusinesses] = useState(null); // null = still loading
  const [current, setCurrent] = useState(getBusiness());

  const loadMe = useCallback(() => api.me().then(setMe).catch(() => setMe(null)), []);
  useEffect(() => { loadMe(); }, [loadMe]);
  const ready = Boolean(me) && !(me.verification_required && !me.email_verified);

  // Load the user's businesses; keep the remembered one if it still exists, otherwise fall back to the first.
  const refreshBusinesses = useCallback(async () => {
    const list = await api.businesses().catch(() => []);
    const safe = Array.isArray(list) ? list : [];
    const id = safe.some((b) => String(b.id) === current) ? current : String(safe[0]?.id ?? "");
    setBusiness(id);
    setCurrent(id);
    setBusinesses(safe);
  }, [current]);
  useEffect(() => { if (ready) refreshBusinesses(); }, [ready]); // eslint-disable-line react-hooks/exhaustive-deps

  const signOut = async () => { await logout(); setMe(null); setBusinesses(null); setCurrent(""); setPage("dashboard"); };

  if (me === undefined) return <p className="p-6 text-stone-600">Loading…</p>;
  if (me === null) return <Login onLogin={loadMe} />;
  if (!ready) return <VerifyGate me={me} onRefresh={loadMe} onSignOut={signOut} />;
  if (businesses === null) return <p className="p-6 text-stone-600">Loading…</p>;

  const choose = (value) => {
    if (value === "__manage") return setPage("businesses");
    setBusiness(value);
    setCurrent(value);
  };
  const tabs = [["dashboard", "Dashboard"], ...Object.entries(RESOURCES).map(([k, v]) => [k, v.label])];
  return (
    <>
      <header className="sticky top-0 z-10 bg-stone-900 text-white shadow">
        <div className="mx-auto flex max-w-6xl items-center justify-between gap-3 px-3 pt-3">
          <span className="text-lg font-bold">🗓️ Work-Time</span>
          <div className="flex items-center gap-3">
            <select aria-label="Business" value={current} onChange={(e) => choose(e.target.value)}
                    className="max-w-[11rem] rounded border border-stone-600 bg-stone-800 px-2 py-1 text-sm text-white">
              {businesses.map((b) => <option key={b.id} value={b.id}>{b.name}</option>)}
              <option value="__manage">⚙ Manage businesses…</option>
            </select>
            <button onClick={() => setPage("account")} className="hidden rounded px-2 py-1 text-sm text-stone-300 hover:bg-stone-700 sm:inline">👤 {me.username}</button>
            <button onClick={signOut} className="rounded border border-red-400 px-3 py-1 text-sm font-medium text-red-300 hover:bg-red-500 hover:text-white">Sign out</button>
          </div>
        </div>
        <nav className="mx-auto flex max-w-6xl gap-1 overflow-x-auto px-3 py-2 text-sm">
          {[...tabs, ["account", "Account"]].map(([key, label]) => (
            <button key={key} onClick={() => setPage(key)}
                    className={`shrink-0 rounded px-3 py-1.5 ${page === key ? "bg-hivis font-medium" : "hover:bg-stone-700"} ${key === "account" ? "sm:hidden" : ""}`}>{label}</button>))}
        </nav>
      </header>
      <main className="mx-auto max-w-6xl p-3 sm:p-4">
        {/* the key makes every page reload its data when the business changes */}
        {page === "dashboard" && <Suspense fallback={<p>Loading dashboard…</p>}><Dashboard key={current} /></Suspense>}
        {page === "account" && <Account me={me} onSignedOut={signOut} />}
        {page !== "dashboard" && page !== "account" && <ResourcePage key={`${page}-${current}`} resource={page} onChange={refreshBusinesses} />}
      </main>
      <footer className="mx-auto max-w-6xl px-4 pb-8 pt-2 text-center text-xs text-stone-500">
        <a href="/terms" className="hover:underline">Terms</a> · <a href="/privacy" className="hover:underline">Privacy</a>
        <p className="mt-1">Delay-risk estimates come from a demo model trained on synthetic data and are not a reliable forecast.</p>
        <p className="mt-1">© 2026 Soham Raut · Open source under the Apache License 2.0</p>
      </footer>
    </>
  );
}
