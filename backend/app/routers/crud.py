# Copyright 2026 Soham Raut
# SPDX-License-Identifier: Apache-2.0

"""One generic CRUD router factory reused for all five resources (DRY, easy to explain)."""
from datetime import date, datetime, time

from fastapi import APIRouter, Depends, HTTPException, Response, status
from sqlalchemy.orm import Session

from .. import config, models, schemas
from ..database import get_db
from ..deps import get_business

PARENTS = {"site_id": models.Site, "project_id": models.Project}  # FK column -> parent table


class Filters:
    """Query-string filters shown in the OpenAPI docs; each applies only if the model supports it."""
    def __init__(self, site_id: int | None = None, project_id: int | None = None,
                 status: str | None = None, date_from: date | None = None, date_to: date | None = None):
        self.site_id, self.project_id, self.status = site_id, project_id, status
        self.date_from, self.date_to = date_from, date_to


def apply_filters(q, model, date_attr: str | None, f: Filters):
    if f.site_id is not None:
        if hasattr(model, "site_id"):
            q = q.filter(model.site_id == f.site_id)
        elif hasattr(model, "project_id"):  # work items / meetings belong to a site via their project
            q = q.join(models.Project, models.Project.id == model.project_id).filter(models.Project.site_id == f.site_id)
    if f.project_id is not None and hasattr(model, "project_id"):
        q = q.filter(model.project_id == f.project_id)
    if f.status and hasattr(model, "status"):
        q = q.filter(model.status == f.status)
    if date_attr:
        col = getattr(model, date_attr)
        is_dt = date_attr == "datetime"
        if f.date_from:
            q = q.filter(col >= (datetime.combine(f.date_from, time.min) if is_dt else f.date_from))
        if f.date_to:
            q = q.filter(col <= (datetime.combine(f.date_to, time.max) if is_dt else f.date_to))
    return q


def owned(obj, business) -> bool:
    return obj is not None and obj.business_id == business.id


def make_router(path: str, model, schema_in, schema_out, date_attr: str | None = None) -> APIRouter:
    router = APIRouter(prefix=f"/api/{path}", tags=[path])

    def check_parents(db: Session, data: dict, business):
        for column, parent in PARENTS.items():
            if column in data and not owned(db.get(parent, data[column]), business):
                raise HTTPException(status.HTTP_404_NOT_FOUND, f"{column}={data[column]} does not exist")

    def get_or_404(db: Session, item_id: int, business):
        obj = db.get(model, item_id)
        if not owned(obj, business):  # another business's record looks exactly like a missing one
            raise HTTPException(status.HTTP_404_NOT_FOUND, f"{path} {item_id} not found")
        return obj

    @router.get("", response_model=list[schema_out])
    def list_items(f: Filters = Depends(), db: Session = Depends(get_db), business=Depends(get_business)):
        q = db.query(model).filter(model.business_id == business.id)
        return apply_filters(q, model, date_attr, f).order_by(model.id).all()

    @router.post("", response_model=schema_out, status_code=status.HTTP_201_CREATED)
    def create(body: schema_in, db: Session = Depends(get_db), business=Depends(get_business)):
        data = body.model_dump()
        check_parents(db, data, business)
        if db.query(model).filter(model.business_id == business.id).count() >= config.MAX_ROWS_PER_TABLE:
            raise HTTPException(status.HTTP_409_CONFLICT, f"Limit of {config.MAX_ROWS_PER_TABLE} {path} per business reached")
        obj = model(**data, business_id=business.id)
        db.add(obj)
        db.commit()
        db.refresh(obj)
        return obj

    @router.get("/{item_id}", response_model=schema_out)
    def read(item_id: int, db: Session = Depends(get_db), business=Depends(get_business)):
        return get_or_404(db, item_id, business)

    @router.put("/{item_id}", response_model=schema_out)
    def update(item_id: int, body: schema_in, db: Session = Depends(get_db), business=Depends(get_business)):
        obj = get_or_404(db, item_id, business)
        data = body.model_dump()
        check_parents(db, data, business)
        for key, value in data.items():
            setattr(obj, key, value)
        db.commit()
        db.refresh(obj)
        return obj

    @router.delete("/{item_id}", status_code=status.HTTP_204_NO_CONTENT)
    def delete(item_id: int, db: Session = Depends(get_db), business=Depends(get_business)):
        db.delete(get_or_404(db, item_id, business))
        db.commit()
        return Response(status_code=status.HTTP_204_NO_CONTENT)

    return router


routers = [
    make_router("sites", models.Site, schemas.SiteIn, schemas.SiteOut),
    make_router("projects", models.Project, schemas.ProjectIn, schemas.ProjectOut, "start_date"),
    make_router("work-items", models.WorkItem, schemas.WorkItemIn, schemas.WorkItemOut, "due_date"),
    make_router("meetings", models.Meeting, schemas.MeetingIn, schemas.MeetingOut, "datetime"),
    make_router("machines", models.Machine, schemas.MachineIn, schemas.MachineOut),
]
