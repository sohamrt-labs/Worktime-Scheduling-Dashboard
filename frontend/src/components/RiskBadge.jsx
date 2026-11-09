// Copyright 2026 Soham Raut
// SPDX-License-Identifier: Apache-2.0

const STYLES = {
  Low: "bg-green-100 text-green-800",
  Medium: "bg-amber-100 text-amber-800",
  High: "bg-red-100 text-red-800",
};

// `manual` = the level was set by a manager, not computed by the model.
export default function RiskBadge({ risk, manual = false }) {
  if (!risk) return <span className="text-stone-400">n/a</span>;
  const pct = risk.probability != null ? ` (${(risk.probability * 100).toFixed(0)}%)` : "";
  return (
    <span className={`rounded px-2 py-0.5 text-xs font-medium ${STYLES[risk.level]}`}
          title={manual ? "Rated manually by a manager" : "Demo model trained on synthetic data: not a reliable forecast"}>
      {`${risk.level}${manual ? " · manual" : pct}`}
    </span>
  );
}
