// Copyright 2026 Soham Raut
// SPDX-License-Identifier: Apache-2.0

import { useEffect, useState } from "react";
import { api } from "../api/client";

import { PRIVACY, TERMS, UPDATED } from "../legalText";

export default function Legal({ kind }) {
  const [contact, setContact] = useState("");
  useEffect(() => { api.authConfig().then((c) => setContact(c.contact_email || "")).catch(() => {}); }, []);
  const terms = kind === "terms";
  return (
    <main className="mx-auto max-w-3xl px-5 py-10">
      <a href="/" className="text-sm font-medium text-stone-600 underline hover:text-stone-900">← Back to Work-Time</a>
      <h1 className="mt-6 text-3xl font-bold">{terms ? "Terms of Service" : "Privacy Policy"}</h1>
      <p className="mt-1 text-sm text-stone-500">Last updated {UPDATED}</p>
      <div className="mt-8 space-y-6">
        {(terms ? TERMS : PRIVACY).map(([head, text]) => (
          <section key={head}><h2 className="text-lg font-semibold">{head}</h2><p className="mt-1 leading-relaxed text-stone-700">{text}</p></section>))}
        <section><h2 className="text-lg font-semibold">Contact</h2>
          <p className="mt-1 text-stone-700">{contact ? <>Questions about this {terms ? "agreement" : "policy"}? Email <a className="underline" href={`mailto:${contact}`}>{contact}</a>.</> : "Contact the operator of this service."}</p></section>
      </div>
      <p className="mt-10 text-sm text-stone-500">{terms ? <a href="/privacy" className="underline">Privacy Policy</a> : <a href="/terms" className="underline">Terms of Service</a>}</p>
    </main>
  );
}
