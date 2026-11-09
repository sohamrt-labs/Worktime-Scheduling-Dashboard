# Copyright 2026 Soham Raut
# SPDX-License-Identifier: Apache-2.0

import joblib
import numpy as np

from .train import FEATURES, MODEL_PATH, train

_model = None


def _load():
    global _model
    if _model is None:
        if not MODEL_PATH.exists():  # first run: build the model so the API never crashes
            train()
        _model = joblib.load(MODEL_PATH)
    return _model


def risk_level(probability: float) -> str:
    return "Low" if probability < 0.33 else "Medium" if probability < 0.66 else "High"


def _reason(name: str, v: float) -> str:
    """Human-readable description of one input, e.g. 'Overdue: 3 work item(s) past due'."""
    if name == "completion":
        return f"Completion: {v * 100:.0f}% of work items done"
    if name == "days_remaining":
        return f"Time left: {int(v)} days" if v >= 0 else f"Time left: deadline passed {int(-v)} days ago"
    if name == "cost_overrun":
        return f"Cost: finished work cost {v:.2f}x its estimate"
    return f"Overdue: {int(v)} work item(s) past due"


def predict_risk(completion: float, days_remaining: float, cost_overrun: float, overdue_count: int) -> dict:
    model = _load()
    x = [completion, days_remaining, cost_overrun, overdue_count]
    p = float(model.predict_proba([x])[0, 1])
    # Explanation: for a linear model, coefficient * standardized value is that factor's push on the
    # log-odds relative to an average (synthetic) project. Positive = raises risk, negative = lowers it.
    scaler, clf = model.named_steps["standardscaler"], model.named_steps["logisticregression"]
    impacts = clf.coef_[0] * (np.array(x, dtype=float) - scaler.mean_) / scaler.scale_
    causes = sorted(({"factor": n, "text": _reason(n, v), "impact": round(float(i), 2)}
                     for n, v, i in zip(FEATURES, x, impacts)), key=lambda c: -c["impact"])
    return {"probability": round(p, 3), "level": risk_level(p), "causes": causes}
