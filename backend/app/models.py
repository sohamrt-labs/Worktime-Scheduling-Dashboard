# Copyright 2026 Soham Raut
# SPDX-License-Identifier: Apache-2.0

from sqlalchemy import Boolean, Column, Date, DateTime, Float, ForeignKey, Integer, String, Text
from sqlalchemy.orm import relationship

from .database import Base


class User(Base):
    __tablename__ = "users"
    id = Column(Integer, primary_key=True)
    username = Column(String(50), unique=True, nullable=False)
    password_hash = Column(String(200), nullable=False)
    email = Column(String(254), nullable=False, unique=True, index=True)  # stored lowercase
    email_verified = Column(Boolean, nullable=False, default=False)
    terms_accepted_at = Column(DateTime, nullable=True)
    businesses = relationship("Business", cascade="all, delete-orphan")  # deleting a user deletes everything they own


class Business(Base):
    """A workspace. One user can own several; every record below belongs to exactly one business."""
    __tablename__ = "businesses"
    id = Column(Integer, primary_key=True)
    owner_id = Column(Integer, ForeignKey("users.id"), nullable=False, index=True)
    name = Column(String(120), nullable=False)
    industry = Column(String(80), nullable=False, default="")
    sites = relationship("Site", cascade="all, delete-orphan")  # sites cascade to projects, items, meetings, machines


class Site(Base):
    __tablename__ = "sites"
    id = Column(Integer, primary_key=True)
    business_id = Column(Integer, ForeignKey("businesses.id"), nullable=False, index=True)
    name = Column(String(100), nullable=False)
    location = Column(String(150), nullable=False)
    status = Column(String(20), nullable=False, default="active")
    site_manager = Column(String(100), nullable=False, default="")
    contact_phone = Column(String(30), nullable=False, default="")
    projects = relationship("Project", cascade="all, delete-orphan")
    machines = relationship("Machine", cascade="all, delete-orphan")


class Project(Base):
    __tablename__ = "projects"
    id = Column(Integer, primary_key=True)
    business_id = Column(Integer, ForeignKey("businesses.id"), nullable=False, index=True)
    site_id = Column(Integer, ForeignKey("sites.id"), nullable=False)
    name = Column(String(120), nullable=False)
    start_date = Column(Date, nullable=False)
    end_date = Column(Date, nullable=False)
    budget = Column(Float, nullable=False)
    status = Column(String(20), nullable=False, default="active")
    client_name = Column(String(120), nullable=False, default="")
    project_type = Column(String(30), nullable=False, default="commercial")
    priority = Column(String(10), nullable=False, default="medium")
    description = Column(Text, nullable=False, default="")
    workers_male = Column(Integer, nullable=False, default=0)
    workers_female = Column(Integer, nullable=False, default=0)
    risk_override = Column(String(10), nullable=True)  # manager's own rating; None = use the model
    risk_note = Column(Text, nullable=False, default="")
    work_items = relationship("WorkItem", cascade="all, delete-orphan")
    meetings = relationship("Meeting", cascade="all, delete-orphan")


class WorkItem(Base):
    __tablename__ = "work_items"
    id = Column(Integer, primary_key=True)
    business_id = Column(Integer, ForeignKey("businesses.id"), nullable=False, index=True)
    project_id = Column(Integer, ForeignKey("projects.id"), nullable=False)
    title = Column(String(150), nullable=False)
    due_date = Column(Date, nullable=False)
    status = Column(String(20), nullable=False, default="todo")
    priority = Column(String(10), nullable=False, default="medium")
    assigned_to = Column(String(80), nullable=False)
    estimated_cost = Column(Float, nullable=False, default=0)
    actual_cost = Column(Float, nullable=False, default=0)


class Meeting(Base):
    __tablename__ = "meetings"
    id = Column(Integer, primary_key=True)
    business_id = Column(Integer, ForeignKey("businesses.id"), nullable=False, index=True)
    project_id = Column(Integer, ForeignKey("projects.id"), nullable=False)
    title = Column(String(150), nullable=False)
    datetime = Column(DateTime, nullable=False)
    attendees = Column(String(300), nullable=False, default="")
    notes = Column(Text, nullable=False, default="")
    location = Column(String(150), nullable=False, default="")


class Machine(Base):
    __tablename__ = "machines"
    id = Column(Integer, primary_key=True)
    business_id = Column(Integer, ForeignKey("businesses.id"), nullable=False, index=True)
    name = Column(String(100), nullable=False)
    type = Column(String(60), nullable=False)
    site_id = Column(Integer, ForeignKey("sites.id"), nullable=False)
    status = Column(String(20), nullable=False, default="idle")
    hours_used = Column(Float, nullable=False, default=0)
    operator = Column(String(100), nullable=False, default="")
    last_service_date = Column(Date, nullable=True)
