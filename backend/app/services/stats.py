# Copyright 2026 Soham Raut
# SPDX-License-Identifier: Apache-2.0

"""Business logic for the dashboard, kept out of the routers so it is easy to test."""
from datetime import date, datetime, time, timedelta
from zoneinfo import ZoneInfo

from sqlalchemy.orm import Session, selectinload

from .. import models
from ..config import APP_TIMEZONE
from ..ml.predict import predict_risk


DISCLAIMER = "Estimated by a demo model trained on synthetic data. It illustrates the approach and is not a reliable forecast."


def local_today() -> date:
    """Today in the configured timezone (containers run in UTC, users do not)."""
    return datetime.now(ZoneInfo(APP_TIMEZONE)).date()


def project_features(project: models.Project, today: date) -> dict:
    items = project.work_items
    done = [i for i in items if i.status == "done"]
    est_done = sum(i.estimated_cost for i in done)
    return {
        "completion": len(done) / len(items) if items else 0.0,
        "days_remaining": (project.end_date - today).days,
        # Overrun compares like with like: actual vs estimate on finished work only.
        "cost_overrun": sum(i.actual_cost for i in done) / est_done if est_done else 1.0,
        "overdue_count": sum(1 for i in items if i.status != "done" and i.due_date < today),
    }


def project_risk(project: models.Project, today: date) -> dict:
    f = project_features(project, today)
    model = predict_risk(**f)
    return {**model, "features": f, "manual_level": project.risk_override, "manual_note": project.risk_note,
            "effective_level": project.risk_override or model["level"], "disclaimer": DISCLAIMER}


def dashboard(db: Session, business_id: int, today: date | None = None) -> dict:
    today = today or local_today()
    week_end = today + timedelta(days=7)
    projects = db.query(models.Project).filter(models.Project.business_id == business_id).options(selectinload(models.Project.work_items)).all()
    items = db.query(models.WorkItem).filter(models.WorkItem.business_id == business_id).all()
    start, end = datetime.combine(today, time.min), datetime.combine(today, time.max)
    meetings = db.query(models.Meeting).filter(models.Meeting.business_id == business_id).order_by(models.Meeting.datetime).all()

    names = {p.id: p.name for p in projects}
    active = [p for p in projects if p.status == "active"]
    workforce = {s.id: {"site": s.name, "male": 0, "female": 0} for s in db.query(models.Site).filter(models.Site.business_id == business_id).all()}
    for p in active:
        workforce[p.site_id]["male"] += p.workers_male
        workforce[p.site_id]["female"] += p.workers_female
    due_this_week = [i for i in items if i.status != "done" and today <= i.due_date <= week_end]
    upcoming = [{"type": "work_item", "title": i.title, "when": i.due_date.isoformat(), "project_id": i.project_id,
                 "project": names.get(i.project_id)}
                for i in due_this_week]
    upcoming += [{"type": "meeting", "title": m.title, "when": m.datetime.isoformat(), "project_id": m.project_id,
                  "project": names.get(m.project_id)}
                 for m in meetings if start <= m.datetime <= datetime.combine(week_end, time.max)]
    upcoming.sort(key=lambda u: u["when"])

    project_rows = []
    for p in projects:
        f = project_features(p, today)
        row = {"id": p.id, "name": p.name, "status": p.status, "budget": p.budget,
               "actual_cost": sum(i.actual_cost for i in p.work_items),
               "completion_pct": round(f["completion"] * 100, 1), "risk": None, "features": f,
               "manual_risk": p.risk_override, "risk_note": p.risk_note,
               "workers_male": p.workers_male, "workers_female": p.workers_female,
               "work_item_count": len(p.work_items)}
        if p.status == "active":
            row["risk"] = predict_risk(**f)
        project_rows.append(row)

    equipment = {}
    for site in db.query(models.Site).filter(models.Site.business_id == business_id).options(selectinload(models.Site.machines)).all():
        counts = {"in_use": 0, "idle": 0, "maintenance": 0}
        for m in site.machines:
            counts[m.status] += 1
        equipment[site.id] = {"site": site.name, **counts}

    return {
        "summary": {
            "active_projects": sum(p.status == "active" for p in projects),
            "items_due_this_week": len(due_this_week),
            "meetings_today": sum(start <= m.datetime <= end for m in meetings),
            "overdue_items": sum(1 for i in items if i.status != "done" and i.due_date < today),
            "workers_male": sum(p.workers_male for p in active),
            "workers_female": sum(p.workers_female for p in active),
            "total_workers": sum(p.workers_male + p.workers_female for p in active),
            "total_actual_cost": sum(i.actual_cost for i in items),
            "total_budget": sum(p.budget for p in projects),
        },
        "projects": project_rows,
        "workforce": list(workforce.values()),
        "upcoming": upcoming,
        "equipment": list(equipment.values()),
    }
