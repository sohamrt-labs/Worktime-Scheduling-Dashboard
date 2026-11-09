// Copyright 2026 Soham Raut
// SPDX-License-Identifier: Apache-2.0

import { useState } from "react";
import { api } from "../api/client";
import Card from "../components/Card";
import { useConfirm } from "../components/ConfirmDialog";

const input = "mt-1 w-full rounded border border-stone-300 px-3 py-2 text-sm";

export default function Account({ me, onSignedOut }) {
  const [pw, setPw] = useState({ current: "", next: "", again: "" });
  const [pwMsg, setPwMsg] = useState(null); // { ok, text }
  const [deletePassword, setDeletePassword] = useState("");
  const [deleteMsg, setDeleteMsg] = useState("");
  const [exportMsg, setExportMsg] = useState("");
  const [verifyMsg, setVerifyMsg] = useState("");
  const [confirm, confirmDialog] = useConfirm();
  const sendConfirmation = () => api.resendVerification().then((r) => setVerifyMsg(r.message)).catch((e) => setVerifyMsg(e.message));

  async function changePassword(e) {
    e.preventDefault();
    if (pw.next.length < 8) return setPwMsg({ ok: false, text: "New password must be at least 8 characters." });
    if (pw.next !== pw.again) return setPwMsg({ ok: false, text: "The two new passwords do not match." });
    try { await api.changePassword(pw.current, pw.next); setPw({ current: "", next: "", again: "" }); setPwMsg({ ok: true, text: "Password changed. Other devices have been signed out." }); }
    catch (err) { setPwMsg({ ok: false, text: err.message }); }
  }
  async function download() {
    try {
      const data = await api.exportData();
      const url = URL.createObjectURL(new Blob([JSON.stringify(data, null, 2)], { type: "application/json" }));
      Object.assign(document.createElement("a"), { href: url, download: "my-work-time-data.json" }).click();
      URL.revokeObjectURL(url);
      setExportMsg("Download started.");
    } catch (err) { setExportMsg(err.message); }
  }
  async function deleteAccount(e) {
    e.preventDefault();
    if (!(await confirm({ title: "Delete your account?", message: "This permanently deletes your account and ALL your businesses, projects, work items, meetings and equipment. This cannot be undone.", confirmLabel: "Yes, delete everything", danger: true }))) return;
    try { await api.deleteAccount(deletePassword); onSignedOut(); } catch (err) { setDeleteMsg(err.message); }
  }

  return (
    <div className="mx-auto max-w-2xl space-y-4">
      <h1 className="text-xl font-bold">Your account</h1>
      {confirmDialog}
      <Card title="Profile">
        <dl className="space-y-1 text-sm">
          <div><dt className="inline text-stone-500">Username: </dt><dd className="inline font-medium">{me.username}</dd></div>
          <div><dt className="inline text-stone-500">Email: </dt><dd className="inline font-medium">{me.email}</dd>{" "}
            <span className={`rounded px-2 py-0.5 text-xs font-medium ${me.email_verified ? "bg-green-100 text-green-800" : "bg-amber-100 text-amber-800"}`}>{me.email_verified ? "confirmed" : "not confirmed"}</span>
            {!me.email_verified && <button onClick={sendConfirmation} className="ml-2 text-xs font-medium text-stone-700 underline hover:text-stone-900">Send confirmation email</button>}
            {verifyMsg && <p role="status" className="mt-1 text-xs text-stone-600">{verifyMsg}</p>}</div>
        </dl>
      </Card>
      <Card title="Change password">
        <form onSubmit={changePassword} className="space-y-3">
          <label className="block text-sm">Current password<input type="password" autoComplete="current-password" className={input} value={pw.current} onChange={(e) => setPw({ ...pw, current: e.target.value })} /></label>
          <label className="block text-sm">New password<input type="password" autoComplete="new-password" className={input} value={pw.next} onChange={(e) => setPw({ ...pw, next: e.target.value })} /></label>
          <label className="block text-sm">Repeat new password<input type="password" autoComplete="new-password" className={input} value={pw.again} onChange={(e) => setPw({ ...pw, again: e.target.value })} /></label>
          {pwMsg && <p role={pwMsg.ok ? "status" : "alert"} className={`text-sm ${pwMsg.ok ? "text-green-700" : "text-red-700"}`}>{pwMsg.text}</p>}
          <button disabled={!pw.current || !pw.next} className="rounded bg-stone-900 px-4 py-1.5 text-sm text-white hover:bg-stone-700 disabled:opacity-50">Change password</button>
        </form>
      </Card>
      <Card title="Your data">
        <p className="text-sm text-stone-600">Download everything we hold about you (account and all businesses) as a JSON file.</p>
        <button onClick={download} className="mt-3 rounded border border-stone-300 bg-white px-4 py-1.5 text-sm hover:bg-stone-100">⬇ Download my data</button>
        {exportMsg && <p role="status" className="mt-2 text-sm text-stone-600">{exportMsg}</p>}
      </Card>
      <Card title="Delete account">
        <p className="text-sm text-stone-600">Permanently deletes your account and every business, project, work item, meeting and equipment record in it. This cannot be undone.</p>
        <form onSubmit={deleteAccount} className="mt-3 flex flex-wrap items-end gap-2">
          <label className="text-sm">Confirm with your password<input type="password" autoComplete="current-password" className={`${input} w-64`} value={deletePassword} onChange={(e) => setDeletePassword(e.target.value)} /></label>
          <button disabled={!deletePassword} className="rounded border border-red-500 px-4 py-2 text-sm font-medium text-red-700 hover:bg-red-600 hover:text-white disabled:opacity-50">Delete my account</button>
        </form>
        {deleteMsg && <p role="alert" className="mt-2 text-sm text-red-700">{deleteMsg}</p>}
      </Card>
    </div>
  );
}
