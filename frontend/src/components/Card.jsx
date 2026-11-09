// Copyright 2026 Soham Raut
// SPDX-License-Identifier: Apache-2.0

export default function Card({ title, children, className = "" }) {
  return (
    <section className={`rounded border border-stone-300 bg-white p-4 ${className}`}>
      {title && <h2 className="mb-3 text-sm font-semibold text-stone-600">{title}</h2>}
      {children}
    </section>
  );
}
