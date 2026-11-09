# Copyright 2026 Soham Raut
# SPDX-License-Identifier: Apache-2.0

"""Train the delay-risk model on SYNTHETIC data.

Run:  python -m app.ml.train

Honest caveat: no real project history was used. Labels are generated from a hand-written
formula (see `synthetic_dataset`) plus noise, so the model learns *my assumptions* about what
causes delays, not real-world patterns. It demonstrates the ML pipeline, not predictive truth.

Features (order matters, shared with predict.py):
  completion        done items / total items            (0..1)
  days_remaining    days until project end_date          (negative = past deadline)
  cost_overrun      actual cost / estimated cost of the items already done (1.0 = on budget)
  overdue_count     not-done items whose due date has passed
"""
from pathlib import Path

import joblib
import numpy as np
from sklearn.linear_model import LogisticRegression
from sklearn.metrics import roc_auc_score
from sklearn.model_selection import train_test_split
from sklearn.pipeline import make_pipeline
from sklearn.preprocessing import StandardScaler

MODEL_PATH = Path(__file__).parent / "risk_model.joblib"
FEATURES = ["completion", "days_remaining", "cost_overrun", "overdue_count"]


def synthetic_dataset(n: int = 5000, seed: int = 42):
    rng = np.random.default_rng(seed)
    completion = rng.uniform(0, 1, n)
    days_remaining = rng.uniform(-15, 200, n)
    cost_overrun = rng.uniform(0.85, 1.7, n)
    overdue = rng.poisson(2.0 * (1 - completion) + 0.3, n)
    # Assumed "ground truth": less done, less time, overspending and overdue work all raise delay odds.
    logit = (4.0 * (1 - completion) - 0.03 * days_remaining + 2.5 * (cost_overrun - 1)
             + 0.4 * overdue - 1.0 + rng.normal(0, 0.7, n))
    delayed = (rng.uniform(0, 1, n) < 1 / (1 + np.exp(-logit))).astype(int)
    return np.column_stack([completion, days_remaining, cost_overrun, overdue]), delayed


def train(path: Path = MODEL_PATH) -> dict:
    X, y = synthetic_dataset()
    X_tr, X_te, y_tr, y_te = train_test_split(X, y, test_size=0.2, random_state=0, stratify=y)
    model = make_pipeline(StandardScaler(), LogisticRegression())
    model.fit(X_tr, y_tr)
    metrics = {"accuracy": round(model.score(X_te, y_te), 3),
               "roc_auc": round(roc_auc_score(y_te, model.predict_proba(X_te)[:, 1]), 3)}
    joblib.dump(model, path)
    return metrics


if __name__ == "__main__":
    print("Saved", MODEL_PATH, "| holdout metrics on synthetic data:", train())
