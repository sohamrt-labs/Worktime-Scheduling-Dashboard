// Copyright 2026 Soham Raut
// SPDX-License-Identifier: Apache-2.0

import { Fragment, useEffect, useState } from "react";
import { Bar, BarChart, CartesianGrid, Legend, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { api } from "../api/client";
import Card from "../components/Card";
import RiskBadge from "../components/RiskBadge";

const UNITS = { Cr: 1e7, Lkh: 1e5, "₹": 1 }; // 1 Crore = 100 Lakh = Rs 1,00,00,000
const bestUnit = (max) => (max >= 1e7 ? "Cr" : max >= 1e5 ? "Lkh" : "₹"); // start with the unit that keeps the bars visible
const money = (n) =>
  n >= 1e7 ? `₹${(n / 1e7).toFixed(2)} Cr` : n >= 1e5 ? `₹${(n / 1e5).toFixed(2)} Lkh` : `₹${Math.round(n).toLocaleString("en-IN")}`;

// Why is this project at this risk level, plus a box for the manager's own rating.
function RiskDetail({ p, onSaved }) {
  const [level, setLevel] = useState(p.manual_risk || "");
  const [note, setNote] = useState(p.risk_note || "");
  const [msg, setMsg] = useState("");
  const causes = p.risk?.causes || [];
  const main = causes[0]?.impact > 0 ? causes[0] : null;

  async function save() {
    try { await api.setRisk(p.id, level || null, note); setMsg("Saved"); onSaved(); } catch (e) { setMsg(e.message); }
  }
  return (
    <div className="space-y-3 text-sm">
      {p.work_item_count === 0 && <p className="rounded bg-stone-100 px-3 py-2 text-stone-700">This project has no work items yet, so completion shows 0%. Add work items (Work items tab) to get a meaningful estimate.</p>}
      {!p.risk ? <p>Delay risk is only calculated for active projects.</p> : (
        <>
          <p><span className="font-semibold">Main cause: </span>{main ? main.text : "No single factor is pushing the risk up."}</p>
          {p.manual_risk && <p className="text-stone-600">Model estimate: {p.risk.level} ({(p.risk.probability * 100).toFixed(0)}%). You rated it {p.manual_risk}{p.risk_note ? `: ${p.risk_note}` : "."}</p>}
          <ul className="space-y-0.5 text-stone-700">
            {causes.map((c) => (
              <li key={c.factor}>{c.impact > 0 ? "🔺" : "🔻"} {c.text}{" "}
                <span className="text-stone-500">({c.impact > 0 ? "raises" : "lowers"} risk vs an average project)</span></li>))}
          </ul>
        </>
      )}
      <div className="flex flex-wrap items-center gap-2 border-t pt-3">
        <label className="text-stone-700">Your own rating
          <select aria-label="Your risk rating" value={level} onChange={(e) => setLevel(e.target.value)}
                  className="ml-2 rounded border border-stone-300 px-2 py-1">
            <option value="">Auto (use model)</option><option>Low</option><option>Medium</option><option>High</option></select></label>
        <input aria-label="Reason" placeholder="Why? (optional)" maxLength={300} value={note} onChange={(e) => setNote(e.target.value)}
               className="min-w-[12rem] flex-1 rounded border border-stone-300 px-2 py-1" />
        <button onClick={save} className="rounded bg-stone-900 px-3 py-1 text-white hover:bg-stone-700">Save</button>
        {msg && <span role="status" className="text-stone-600">{msg}</span>}
      </div>
    </div>
  );
}

export default function Dashboard() {
  const [data, setData] = useState(null);
  const [error, setError] = useState("");
  const [openId, setOpenId] = useState(null);
  const [updated, setUpdated] = useState(null);
  const [chosenUnit, setChosenUnit] = useState(null); // null = pick automatically from the amounts
  const load = () => api.dashboard().then((d) => { setData(d); setUpdated(new Date()); setError(""); }).catch((e) => setError(e.message));
  useEffect(() => { load(); }, []);

  if (error) return <p role="alert" className="text-red-700">{error}</p>;
  if (!data) return <p>Loading dashboard…</p>;

  const { summary: s, projects, upcoming, equipment } = data;
  const workforce = data.workforce || [];
  const unit = chosenUnit || bestUnit(Math.max(0, ...projects.map((p) => Math.max(p.budget, p.actual_cost))));
  const div = UNITS[unit];
  const cost = projects.map((p) => ({ name: p.name, Budget: +(p.budget / div).toFixed(2), Actual: +(p.actual_cost / div).toFixed(2) }));
  const cards = [
    ["Active projects", s.active_projects],
    ["Work items due this week", s.items_due_this_week],
    ["Overdue work items", s.overdue_items],
    ["Meetings today", s.meetings_today],
    ["Team members (M / F)", `${s.total_workers ?? 0} (${s.workers_male ?? 0} / ${s.workers_female ?? 0})`],
    ["Cost invested / budget", `${money(s.total_actual_cost)} / ${money(s.total_budget)}`],
  ];

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h1 className="text-xl font-bold">Overview</h1>
        <div className="flex items-center gap-3 text-sm text-stone-500"><span>{updated && `Updated ${updated.toLocaleTimeString()}`}</span>
          <button onClick={load} className="rounded border border-stone-300 bg-white px-3 py-1 text-stone-800 hover:bg-stone-100">↻ Refresh</button></div>
      </div>
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {cards.map(([label, value]) => (
          <Card key={label}><p className="text-sm text-stone-600">{label}</p><p className="mt-1 text-2xl font-bold">{value}</p></Card>
        ))}
      </div>

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        <Card title="Completion per project (% of work items done)">
          <ResponsiveContainer width="100%" height={260}>
            <BarChart layout="vertical" data={projects}><CartesianGrid strokeDasharray="3 3" /><XAxis type="number" domain={[0, 100]} unit="%" />
              <YAxis type="category" dataKey="name" width={140} tick={{ fontSize: 12 }} /><Tooltip /><Bar dataKey="completion_pct" name="Completion %" fill="#d97706" /></BarChart>
          </ResponsiveContainer>
        </Card>
        <Card title={`Budget vs actual cost (in ₹${unit === "₹" ? "" : " " + unit})`}>
          <div className="mb-2 flex items-center gap-1 text-xs" role="group" aria-label="Currency unit">
            {Object.keys(UNITS).map((u) => (
              <button key={u} aria-pressed={unit === u} onClick={() => setChosenUnit(u)}
                      className={`rounded border px-2 py-0.5 ${unit === u ? "border-stone-900 bg-stone-900 text-white" : "border-stone-300 bg-white"}`}>
                {{ Cr: "Crore (Cr)", Lkh: "Lakh (Lkh)", "₹": "Rupees (₹)" }[u]}</button>))}
            <span className="ml-2 text-stone-500">1 Cr = 100 Lkh</span>
          </div>
          <ResponsiveContainer width="100%" height={240}>
            <BarChart layout="vertical" data={cost}><CartesianGrid strokeDasharray="3 3" /><XAxis type="number" tickFormatter={(v) => (unit === "₹" ? `₹${v.toLocaleString("en-IN")}` : `${v} ${unit}`)} />
              <YAxis type="category" dataKey="name" width={140} tick={{ fontSize: 12 }} />
              <Tooltip formatter={(v) => (unit === "₹" ? `₹${v.toLocaleString("en-IN")}` : `₹${v.toLocaleString("en-IN")} ${unit}`)} /><Legend />
              <Bar dataKey="Budget" fill="#78716c" /><Bar dataKey="Actual" fill="#d97706" /></BarChart>
          </ResponsiveContainer>
        </Card>
      </div>

      <Card title="Projects, team and delay risk (click a row to see why)">
        <p className="mb-3 rounded border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-900">ⓘ Delay risk comes from a demo model trained on <strong>synthetic data</strong>. It illustrates the idea and is not a reliable forecast. Use “Your own rating” for real decisions.</p>
        <div className="overflow-x-auto"><table className="w-full text-left text-sm">
          <thead><tr className="border-b text-stone-600"><th className="py-1">Project</th><th>Status</th><th>Done</th><th>Team (M / F)</th><th>Delay risk</th></tr></thead>
          <tbody>{projects.map((p) => (
            <Fragment key={p.id}>
              <tr onClick={() => setOpenId(openId === p.id ? null : p.id)} className="cursor-pointer border-b hover:bg-stone-50">
                <td className="py-1.5">{p.name}</td><td>{p.status}</td><td>{p.completion_pct}%{p.work_item_count === 0 && <span className="ml-1 text-xs text-stone-400">(no work items)</span>}</td>
                <td>{(p.workers_male ?? 0) + (p.workers_female ?? 0)} ({p.workers_male ?? 0} / {p.workers_female ?? 0})</td>
                <td><RiskBadge risk={p.manual_risk ? { level: p.manual_risk } : p.risk} manual={Boolean(p.manual_risk)} /></td></tr>
              {openId === p.id && <tr className="border-b bg-stone-50"><td colSpan={5} className="p-3"><RiskDetail p={p} onSaved={load} /></td></tr>}
            </Fragment>))}</tbody>
        </table></div>
      </Card>

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        <Card title="Next 7 days">
          {upcoming.length === 0 ? <p className="text-sm text-stone-500">Nothing scheduled in the next 7 days.</p> : (
            <ul className="divide-y text-sm">{upcoming.map((u, i) => (
              <li key={i} className="flex justify-between gap-2 py-1.5"><span>{u.type === "meeting" ? "Meeting: " : "Due: "}{u.title}{u.project && <span className="text-stone-500"> · {u.project}</span>}</span>
                <time className="shrink-0 text-stone-500">{u.when.replace("T", " ").slice(0, 16)}</time></li>))}</ul>)}
        </Card>
        <div className="space-y-4">
          <Card title="Equipment by location">
            <ul className="space-y-2 text-sm">{equipment.map((m) => (
              <li key={m.site} className="flex flex-wrap justify-between gap-2"><span className="font-medium">{m.site}</span>
                <span>{m.in_use} in use · {m.idle} idle · {m.maintenance} maintenance</span></li>))}</ul>
          </Card>
          <Card title="Team by location (active projects)">
            <ResponsiveContainer width="100%" height={200}>
              <BarChart data={workforce}><CartesianGrid strokeDasharray="3 3" /><XAxis dataKey="site" tick={{ fontSize: 11 }} /><YAxis allowDecimals={false} /><Tooltip /><Legend />
                <Bar dataKey="male" name="Male" stackId="w" fill="#78716c" /><Bar dataKey="female" name="Female" stackId="w" fill="#d97706" /></BarChart>
            </ResponsiveContainer>
            <ul className="mt-2 space-y-1 text-sm">{workforce.map((w) => (
              <li key={w.site} className="flex flex-wrap justify-between gap-2"><span className="font-medium">{w.site}</span>
                <span>{w.male + w.female} workers · {w.male} male · {w.female} female</span></li>))}</ul>
          </Card>
        </div>
      </div>
    </div>
  );
}
