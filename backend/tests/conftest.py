# Copyright 2026 Soham Raut
# SPDX-License-Identifier: Apache-2.0

import os

os.environ.setdefault("SECRET_KEY", "test-secret-key-not-for-production")

import pytest
from fastapi.testclient import TestClient
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker
from sqlalchemy.pool import StaticPool

from app import models
from app.database import Base, get_db
from app.main import app
from app.security import hash_password


@pytest.fixture()
def db():
    engine = create_engine("sqlite://", connect_args={"check_same_thread": False}, poolclass=StaticPool)
    Base.metadata.create_all(engine)
    session = sessionmaker(bind=engine)()
    user = models.User(username="admin", password_hash=hash_password("secret123"), email="admin@example.com", email_verified=True)
    session.add(user)
    session.flush()
    session.add(models.Business(owner_id=user.id, name="Test Co", industry="Testing"))
    session.commit()
    yield session
    session.close()


@pytest.fixture()
def client(db):
    app.dependency_overrides[get_db] = lambda: db
    yield TestClient(app)
    app.dependency_overrides.clear()


@pytest.fixture()
def auth(client, db):
    r = client.post("/api/auth/login", data={"username": "admin", "password": "secret123"})
    business_id = db.query(models.Business).first().id
    return {"Authorization": f"Bearer {r.json()['access_token']}", "X-Business-Id": str(business_id)}


@pytest.fixture(autouse=True)
def _reset_rate_limits():
    from app.ratelimit import reset_all
    from app import mailer
    reset_all()
    mailer.sent.clear()
    yield
    reset_all()
