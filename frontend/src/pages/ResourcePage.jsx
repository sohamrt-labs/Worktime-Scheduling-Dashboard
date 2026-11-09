// Copyright 2026 Soham Raut
// SPDX-License-Identifier: Apache-2.0

import { Fragment, useCallback, useEffect, useState } from "react";
import { api } from "../api/client";
import Card from "../components/Card";
import { useConfirm } from "../components/ConfirmDialog";
import { RESOURCES } from "../resources";

const box = "w-full rounded border border-stone-300 px-2 py-1.5 text-sm";
const BADGE = {
  active: "bg-green-100 text-green-800", in_use: "bg-green-100 text-green-800", done: "bg-green-100 text-green-800", low: "bg-stone-200 text-stone-700",
  planned: "bg-blue-100 text-blue-800", in_progress: "bg-amber-100 text-amber-800", medium: "bg-amber-100 text-amber-800",
  maintenance: "bg-red-100 text-red-800", high: "bg-red-100 text-red-800",
  completed: "bg-stone-200 text-stone-700", inactive: "bg-stone-200 text-stone-700", idle: "bg-stone-200 text-stone-700", todo: "bg-stone-200 text-stone-700",
};
// Only date-times ("2026-10-19T10:00:00") get a space instead of the T. Never touch ordinary text.
const fmt = (v) => String(v).replace(/^(\d{4}-\d{2}-\d{2})T/, "$1 ");
const today = () => new Date().toISOString().slice(0, 10);

// One table cell: names for foreign keys, badges, inline status dropdown, money, overdue flag.
function Cell({ field, row, lookup, quick, onStatus }) {
  const v = row[field.name];
  if (field.type === "ref") return lookup(field, v);
  if (field.name === "status" && quick)
    return (
      <select aria-label="Change status" value={v} onClick={(e) => e.stopPropagation()} onChange={(e) => onStatus(row, e.target.value)}
              className={`rounded px-1 py-0.5 text-xs font-medium ${BADGE[v] || ""}`}>
        {field.options.map((o) => <option key={o} value={o}>{o.replace("_", " ")}</option>)}
      </select>
    );
  if (field.name === "status" || field.name === "priority")
    return <span className={`rounded px-2 py-0.5 text-xs font-medium ${BADGE[v] || ""}`}>{v}</span>;
  if (field.name === "due_date" && row.status !== "done" && v < today()) return <span className="font-medium text-red-700">{v} (overdue)</span>;
  if (field.money) return `₹${Number(v).toLocaleString("en-IN")}`;
  return v === null || v === "" ? "—" : fmt(v);
}

function validate(fields, values) {
  const errors = {};
  for (const f of fields) {
    const v = values[f.name];
    if (f.required && (v === "" || v == null)) errors[f.name] = "Required";
    else if (f.type === "number" && v !== "" && f.min != null && Number(v) < f.min) errors[f.name] = `Must be at least ${f.min}`;
  }
  if (values.start_date && values.end_date && values.end_date < values.start_date) errors.end_date = "Must be on or after start date";
  return errors;
}

function Form({ fields, refs, initial, onSave, onCancel }) {
  const [values, setValues] = useState(initial);
  const [errors, setErrors] = useState({});
  const [serverError, setServerError] = useState("");
  const set = (name, v) => setValues({ ...values, [name]: v });

  async function submit(e) {
    e.preventDefault();
    const found = validate(fields, values);
    setErrors(found);
    if (Object.keys(found).length) return;
    const body = Object.fromEntries(fields.map((f) => {
      const v = values[f.name];
      if (f.type === "number" || f.type === "ref") return [f.name, Number(v)];
      if ((f.type === "date" || f.nullable) && !v) return [f.name, null]; // optional dates are sent as null
      return [f.name, v ?? ""];
    }));
    try { await onSave(body); } catch (err) { setServerError(err.message); }
  }

  return (
    <form onSubmit={submit} className="grid grid-cols-1 gap-3 sm:grid-cols-2">
      {fields.map((f) => (
        <label key={f.name} className={`text-sm ${f.type === "textarea" ? "sm:col-span-2" : ""}`}>{f.label}{f.required && " *"}
          {f.type === "select" || f.type === "ref" ? (
            <select className={box} value={values[f.name] ?? ""} onChange={(e) => set(f.name, e.target.value)}>
              <option value="">{f.nullable ? "Auto (use model)" : "Select…"}</option>
              {f.type === "select" ? f.options.map((o) => <option key={o}>{o}</option>)
                : (refs[f.ref] || []).map((r) => <option key={r.id} value={r.id}>{r.name}</option>)}
            </select>
          ) : f.type === "textarea" ? (
            <textarea className={box} rows={2} value={values[f.name] ?? ""} onChange={(e) => set(f.name, e.target.value)} />
          ) : (
            <input className={box} min={f.min} step={f.type === "number" ? "any" : undefined}
                   type={f.type === "datetime" ? "datetime-local" : f.type}
                   value={values[f.name] ?? ""} onChange={(e) => set(f.name, e.target.value)} />
          )}
          {errors[f.name] && <span role="alert" className="text-xs text-red-700">{errors[f.name]}</span>}
        </label>
      ))}
      {serverError && <p role="alert" className="text-sm text-red-700 sm:col-span-2">{serverError}</p>}
      <div className="flex gap-2 sm:col-span-2">
        <button className="rounded bg-stone-900 px-4 py-1.5 text-sm text-white hover:bg-stone-700">Save</button>
        <button type="button" onClick={onCancel} className="rounded border border-stone-300 px-4 py-1.5 text-sm">Cancel</button>
      </div>
    </form>
  );
}

export default function ResourcePage({ resource, onChange }) {
  const cfg = RESOURCES[resource];
  const [rows, setRows] = useState([]);
  const [refs, setRefs] = useState({});
  const [filters, setFilters] = useState({});
  const [editing, setEditing] = useState(null); // null = closed, {} = new, {id,...} = edit
  const [error, setError] = useState("");
  const [q, setQ] = useState("");
  const [sort, setSort] = useState(null); // { key, dir }
  const [openId, setOpenId] = useState(null); // row whose detail panel is expanded
  const [toast, setToast] = useState("");
  const [confirm, confirmDialog] = useConfirm();

  const notify = (msg) => { setToast(msg); setTimeout(() => setToast(""), 2500); };
  const load = useCallback(() => api.list(resource, filters).then(setRows).catch((e) => setError(e.message)), [resource, filters]);
  useEffect(() => { load(); }, [load]);
  useEffect(() => {
    Promise.all(["sites", "projects"].map((r) => api.list(r).then((d) => [r, d]))).then((e) => setRefs(Object.fromEntries(e)));
  }, [resource]);

  const lookup = (field, id) => (refs[field.ref] || []).find((r) => r.id === id)?.name ?? id;
  const val = (f, r) => (f.type === "ref" ? lookup(f, r[f.name]) : r[f.name]);
  const text = (f, r) => fmt(val(f, r) ?? "—");
  const colFields = cfg.columns.map((n) => cfg.fields.find((f) => f.name === n));
  const statusField = cfg.fields.find((f) => f.name === "status");
  const hasProject = cfg.fields.some((f) => f.name === "project_id");
  const setF = (k, v) => setFilters({ ...filters, [k]: v });

  let view = rows.filter((r) => !q || cfg.fields.some((f) => text(f, r).toLowerCase().includes(q.toLowerCase())));
  if (sort) {
    const sf = cfg.fields.find((f) => f.name === sort.key);
    view = [...view].sort((a, b) => {
      const x = val(sf, a), y = val(sf, b);
      const c = typeof x === "number" ? x - y : String(x ?? "").localeCompare(String(y ?? ""));
      return sort.dir === "asc" ? c : -c;
    });
  }

  async function save(body) {
    if (editing.id) await api.update(resource, editing.id, body); else await api.create(resource, body);
    notify(editing.id ? "Changes saved" : "Record created");
    setEditing(null); load(); onChange?.();
  }
  async function remove(row) {
    if (!(await confirm({ title: "Delete this record?", message: `${cfg.deleteWarning ? cfg.deleteWarning + "\n\n" : ""}This cannot be undone.`, confirmLabel: "Delete", danger: true }))) return;
    try { await api.remove(resource, row.id); notify("Record deleted"); load(); onChange?.(); } catch (e) { setError(e.message); }
  }
  async function changeStatus(row, status) {
    try {
      await api.update(resource, row.id, { ...Object.fromEntries(cfg.fields.map((f) => [f.name, row[f.name]])), status });
      notify("Status updated"); load();
    } catch (e) { setError(e.message); }
  }
  function exportCsv() {
    const esc = (s) => `"${String(s).replace(/"/g, '""')}"`;
    const lines = [cfg.fields.map((f) => esc(f.label)).join(","), ...view.map((r) => cfg.fields.map((f) => esc(text(f, r))).join(","))];
    const url = URL.createObjectURL(new Blob([lines.join("\n")], { type: "text/csv" }));
    Object.assign(document.createElement("a"), { href: url, download: `${resource}.csv` }).click();
    URL.revokeObjectURL(url);
  }
  const defaults = Object.fromEntries(cfg.fields.filter((f) => f.type === "select" && !f.nullable).map((f) => [f.name, f.options[0]]))
  Object.assign(defaults, Object.fromEntries(cfg.fields.filter((f) => f.default !== undefined).map((f) => [f.name, f.default])));

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h1 className="text-xl font-bold">{cfg.label} <span className="text-sm font-normal text-stone-500">({view.length} of {rows.length})</span></h1>
        <div className="flex gap-2">
          <button onClick={exportCsv} className="rounded border border-stone-300 bg-white px-3 py-1.5 text-sm hover:bg-stone-100">⬇ Export CSV</button>
          <button onClick={() => setEditing({})} className="rounded bg-hivis px-4 py-1.5 text-sm font-medium text-white hover:opacity-90">+ Add new</button>
        </div>
      </div>

      <Card>
        <div className="grid grid-cols-2 gap-2 lg:grid-cols-6">
          <input aria-label="Search" placeholder="🔍 Search…" className={`${box} col-span-2 lg:col-span-1`} value={q} onChange={(e) => setQ(e.target.value)} />
          {!cfg.noScope && resource !== "sites" && <select aria-label="Filter by location" className={box} value={filters.site_id ?? ""} onChange={(e) => setF("site_id", e.target.value)}>
            <option value="">All locations</option>{(refs.sites || []).map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}</select>}
          {hasProject && <select aria-label="Filter by project" className={box} value={filters.project_id ?? ""} onChange={(e) => setF("project_id", e.target.value)}>
            <option value="">All projects</option>{(refs.projects || []).map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}</select>}
          {statusField && <select aria-label="Filter by status" className={box} value={filters.status ?? ""} onChange={(e) => setF("status", e.target.value)}>
            <option value="">All statuses</option>{statusField.options.map((o) => <option key={o}>{o}</option>)}</select>}
          {cfg.dateField && <>
            <label className="text-xs text-stone-500">From date<input aria-label="From date" type="date" className={box} value={filters.date_from ?? ""} onChange={(e) => setF("date_from", e.target.value)} /></label>
            <label className="text-xs text-stone-500">To date<input aria-label="To date" type="date" className={box} value={filters.date_to ?? ""} onChange={(e) => setF("date_to", e.target.value)} /></label></>}
        </div>
      </Card>

      {error && <p role="alert" className="text-sm text-red-700">{error}</p>}
      {editing && <Card title={editing.id ? "Edit record" : "New record"}>
        <Form key={editing.id ?? "new"} fields={cfg.fields} refs={refs} onCancel={() => setEditing(null)} onSave={save}
              initial={editing.id ? { ...editing, datetime: editing.datetime?.slice(0, 16) } : defaults} />
      </Card>}

      <Card><div className="overflow-x-auto"><table className="w-full text-left text-sm">
        <thead><tr className="border-b text-stone-600">
          {colFields.map((f) => (
            <th key={f.name} onClick={() => setSort({ key: f.name, dir: sort?.key === f.name && sort.dir === "asc" ? "desc" : "asc" })}
                className="cursor-pointer select-none whitespace-nowrap py-1 pr-3 hover:text-stone-900">
              {f.label}{sort?.key === f.name && (sort.dir === "asc" ? " ▲" : " ▼")}</th>))}
          <th /></tr></thead>
        <tbody>
          {view.length === 0 && <tr><td colSpan={colFields.length + 1} className="py-4 text-stone-500">{rows.length === 0 && !q && !Object.values(filters).some(Boolean) ? "Nothing here yet. Click “+ Add new” to create your first record." : "No records match. Add one or clear the filters."}</td></tr>}
          {view.map((row) => (
            <Fragment key={row.id}>
              <tr onClick={() => setOpenId(openId === row.id ? null : row.id)} className="cursor-pointer border-b hover:bg-stone-50">
                {colFields.map((f) => <td key={f.name} className="py-1.5 pr-3"><Cell field={f} row={row} lookup={lookup} quick={cfg.quickStatus} onStatus={changeStatus} /></td>)}
                <td className="whitespace-nowrap py-1.5 text-right" onClick={(e) => e.stopPropagation()}>
                  <button onClick={() => { setEditing(row); window.scrollTo({ top: 0, behavior: "smooth" }); }} className="mr-3 text-stone-700 underline">Edit</button>
                  <button onClick={() => remove(row)} className="text-red-700 underline">Delete</button></td>
              </tr>
              {openId === row.id && <tr className="border-b bg-stone-50"><td colSpan={colFields.length + 1} className="p-3">
                <dl className="grid grid-cols-1 gap-x-6 gap-y-1 text-sm sm:grid-cols-2 lg:grid-cols-3">
                  {cfg.fields.map((f) => <div key={f.name}><dt className="inline text-stone-500">{f.label}: </dt><dd className="inline">{text(f, row)}</dd></div>)}
                </dl></td></tr>}
            </Fragment>))}
        </tbody></table></div>
        <p className="mt-2 text-xs text-stone-500">Click a column to sort, click a row to see all details.</p>
      </Card>
      {confirmDialog}
      {toast && <div role="status" className="fixed bottom-4 left-1/2 -translate-x-1/2 rounded bg-stone-900 px-4 py-2 text-sm text-white shadow-lg">{toast}</div>}
    </div>
  );
}
