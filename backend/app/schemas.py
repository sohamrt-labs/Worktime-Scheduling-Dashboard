# Copyright 2026 Soham Raut
# SPDX-License-Identifier: Apache-2.0

"""Pydantic schemas: validation rules for every write endpoint."""
import datetime as dt
from typing import Literal

from pydantic import BaseModel, ConfigDict, Field, model_validator

Name = Field(min_length=1, max_length=120)
Priority = Literal["low", "medium", "high"]


class ORM(BaseModel):
    model_config = ConfigDict(from_attributes=True)


class SiteIn(BaseModel):
    name: str = Name
    location: str = Field(min_length=1, max_length=150)
    status: Literal["active", "inactive"] = "active"
    site_manager: str = Field(default="", max_length=100)
    contact_phone: str = Field(default="", max_length=30)


class ProjectIn(BaseModel):
    site_id: int
    name: str = Name
    start_date: dt.date
    end_date: dt.date
    budget: float = Field(gt=0)
    status: Literal["planned", "active", "completed"] = "active"
    client_name: str = Field(default="", max_length=120)
    project_type: Literal["operations", "technology", "marketing", "expansion", "other"] = "operations"
    priority: Priority = "medium"
    description: str = ""
    workers_male: int = Field(default=0, ge=0)
    workers_female: int = Field(default=0, ge=0)
    risk_override: Literal["Low", "Medium", "High"] | None = None
    risk_note: str = Field(default="", max_length=300)

    @model_validator(mode="after")
    def dates_in_order(self):
        if self.end_date < self.start_date:
            raise ValueError("end_date must be on or after start_date")
        return self


class WorkItemIn(BaseModel):
    project_id: int
    title: str = Field(min_length=1, max_length=150)
    due_date: dt.date
    status: Literal["todo", "in_progress", "done"] = "todo"
    priority: Priority = "medium"
    assigned_to: str = Field(min_length=1, max_length=80)
    estimated_cost: float = Field(ge=0, default=0)
    actual_cost: float = Field(ge=0, default=0)


class MeetingIn(BaseModel):
    project_id: int
    title: str = Field(min_length=1, max_length=150)
    datetime: dt.datetime
    attendees: str = Field(default="", max_length=300)
    notes: str = ""
    location: str = Field(default="", max_length=150)


class MachineIn(BaseModel):
    name: str = Field(min_length=1, max_length=100)
    type: str = Field(min_length=1, max_length=60)
    site_id: int
    status: Literal["in_use", "idle", "maintenance"] = "idle"
    hours_used: float = Field(ge=0, default=0)
    operator: str = Field(default="", max_length=100)
    last_service_date: dt.date | None = None


def with_id(schema: type[BaseModel]) -> type[BaseModel]:
    """Build the response schema: same fields plus `id`, readable from ORM objects."""
    class Out(schema, ORM):
        id: int
    Out.__name__ = schema.__name__.replace("In", "Out")
    return Out


SiteOut, ProjectOut, WorkItemOut, MeetingOut, MachineOut = map(
    with_id, (SiteIn, ProjectIn, WorkItemIn, MeetingIn, MachineIn)
)


class BusinessIn(BaseModel):
    name: str = Name
    industry: str = Field(default="", max_length=80)


BusinessOut = with_id(BusinessIn)


class RegisterIn(BaseModel):
    username: str = Field(pattern=r"^[A-Za-z0-9_.-]{3,50}$")
    password: str = Field(min_length=8, max_length=128)
    email: str = Field(pattern=r"^[^@\s]+@[^@\s]+\.[^@\s]+$", max_length=254)
    accepted_terms: bool = False
    business_name: str = Field(default="My Business", min_length=1, max_length=120)
    invite_code: str = Field(default="", max_length=100)
    industry: str = Field(default="", max_length=80)


class Token(BaseModel):
    access_token: str
    token_type: str = "bearer"


class RiskOverride(BaseModel):
    risk_override: Literal["Low", "Medium", "High"] | None = None
    risk_note: str = Field(default="", max_length=300)


class VerifyIn(BaseModel):
    token: str


class ForgotIn(BaseModel):
    email: str = Field(pattern=r"^[^@\s]+@[^@\s]+\.[^@\s]+$", max_length=254)


class ResetIn(BaseModel):
    token: str
    new_password: str = Field(min_length=8, max_length=128)


class ChangePasswordIn(BaseModel):
    current_password: str
    new_password: str = Field(min_length=8, max_length=128)


class DeleteAccountIn(BaseModel):
    password: str
