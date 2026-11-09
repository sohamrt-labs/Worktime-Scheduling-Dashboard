// Copyright 2026 Soham Raut
// SPDX-License-Identifier: Apache-2.0

import { useCallback, useEffect, useRef, useState } from "react";

// An in-app confirmation window (instead of the browser's pop-up).
//   const [confirm, dialog] = useConfirm();
//   if (await confirm({ title, message, confirmLabel, danger: true })) { ...do it... }   // and render {dialog}
export function useConfirm() {
  const [state, setState] = useState(null);
  const confirm = useCallback((options) => new Promise((resolve) => setState({ ...options, resolve })), []);
  const answer = (yes) => { state.resolve(yes); setState(null); };
  return [confirm, state && <ConfirmDialog {...state} onAnswer={answer} />];
}

function ConfirmDialog({ title, message, confirmLabel = "Confirm", danger = false, onAnswer }) {
  const cancelButton = useRef(null);
  useEffect(() => {
    cancelButton.current?.focus(); // the safe choice is focused first, so Enter never deletes by accident
    const onKey = (e) => { if (e.key === "Escape") onAnswer(false); };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4" onClick={() => onAnswer(false)}>
      <div role="dialog" aria-modal="true" aria-labelledby="confirm-title" onClick={(e) => e.stopPropagation()}
           className="w-full max-w-md rounded-xl bg-white p-6 shadow-xl">
        <div className="flex items-start gap-3">
          <span className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-full text-xl ${danger ? "bg-red-100" : "bg-amber-100"}`}>{danger ? "⚠️" : "❓"}</span>
          <div>
            <h2 id="confirm-title" className="text-lg font-semibold text-stone-900">{title}</h2>
            <p className="mt-1 whitespace-pre-line text-sm leading-relaxed text-stone-600">{message}</p>
          </div>
        </div>
        <div className="mt-6 flex justify-end gap-2">
          <button ref={cancelButton} onClick={() => onAnswer(false)} className="rounded-lg border border-stone-300 px-4 py-2 text-sm hover:bg-stone-100">Cancel</button>
          <button onClick={() => onAnswer(true)}
                  className={`rounded-lg px-4 py-2 text-sm font-semibold text-white ${danger ? "bg-red-600 hover:bg-red-700" : "bg-stone-900 hover:bg-stone-700"}`}>{confirmLabel}</button>
        </div>
      </div>
    </div>
  );
}
