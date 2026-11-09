# Copyright 2026 Soham Raut
# SPDX-License-Identifier: Apache-2.0

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session

from .. import models
from ..database import get_db
from ..deps import get_business
from ..schemas import RiskOverride
from ..services import stats

router = APIRouter(prefix="/api", tags=["dashboard"])


def _project(db: Session, business: models.Business, project_id: int) -> models.Project:
    project = db.get(models.Project, project_id)
    if project is None or project.business_id != business.id:
        raise HTTPException(404, f"project {project_id} not found")
    return project


@router.get("/dashboard")
def get_dashboard(db: Session = Depends(get_db), business: models.Business = Depends(get_business)):
    return stats.dashboard(db, business.id)


@router.get("/projects/{project_id}/risk")
def get_risk(project_id: int, db: Session = Depends(get_db), business: models.Business = Depends(get_business)):
    project = _project(db, business, project_id)
    return {"project_id": project_id, **stats.project_risk(project, stats.local_today())}


@router.put("/projects/{project_id}/risk-override")
def set_risk_override(project_id: int, body: RiskOverride, db: Session = Depends(get_db),
                      business: models.Business = Depends(get_business)):
    """Manager's own delay-risk rating (None = go back to the model) plus a reason."""
    project = _project(db, business, project_id)
    project.risk_override, project.risk_note = body.risk_override, body.risk_note
    db.commit()
    return {"project_id": project_id, "risk_override": project.risk_override, "risk_note": project.risk_note}
