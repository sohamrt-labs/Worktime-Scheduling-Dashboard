# Copyright 2026 Soham Raut
# SPDX-License-Identifier: Apache-2.0

from datetime import timedelta

import random
import re

import pytest
from fastapi.testclient import TestClient

from app import mailer, models
from app.config import get_secret_key
from app.services.stats import local_today
from app.main import app
from app.ml.predict import predict_risk
from seed import seed

TODAY = local_today()


def make_site(client, auth, name="Site A"):
    return client.post("/api/sites", json={"name": name, "location": "Pune"}, headers=auth).json()["id"]


def make_project(client, auth, site_id, **over):
    body = {"site_id": site_id, "name": "P1", "start_date": str(TODAY - timedelta(30)),
            "end_date": str(TODAY + timedelta(60)), "budget": 1000}
    return client.post("/api/projects", json={**body, **over}, headers=auth).json()["id"]


def make_item(client, auth, project_id, status="todo", due=TODAY, est=100, actual=0):
    return client.post("/api/work-items", headers=auth, json={
        "project_id": project_id, "title": "Task", "due_date": str(due), "status": status,
        "assigned_to": "Ravi", "estimated_cost": est, "actual_cost": actual}).json()["id"]


def test_login_success_returns_token(client):
    r = client.post("/api/auth/login", data={"username": "admin", "password": "secret123"})
    assert r.status_code == 200 and r.json()["token_type"] == "bearer"


def test_login_wrong_password_is_401(client):
    r = client.post("/api/auth/login", data={"username": "admin", "password": "nope"})
    assert r.status_code == 401


def test_protected_routes_reject_missing_or_bad_token(client):
    assert client.get("/api/sites").status_code == 401
    assert client.get("/api/dashboard", headers={"Authorization": "Bearer garbage"}).status_code == 401


def test_site_crud_lifecycle(client, auth):
    sid = make_site(client, auth)
    assert client.get(f"/api/sites/{sid}", headers=auth).json()["name"] == "Site A"
    r = client.put(f"/api/sites/{sid}", json={"name": "Renamed", "location": "Nashik", "status": "inactive"}, headers=auth)
    assert r.status_code == 200 and r.json()["status"] == "inactive"
    assert client.delete(f"/api/sites/{sid}", headers=auth).status_code == 204
    assert client.get(f"/api/sites/{sid}", headers=auth).status_code == 404


def test_validation_rejects_end_before_start_and_bad_status(client, auth):
    sid = make_site(client, auth)
    bad_dates = {"site_id": sid, "name": "X", "start_date": "2026-05-01", "end_date": "2026-04-01", "budget": 10}
    assert client.post("/api/projects", json=bad_dates, headers=auth).status_code == 422
    pid = make_project(client, auth, sid)
    bad_status = {"project_id": pid, "title": "t", "due_date": str(TODAY), "status": "finished", "assigned_to": "a"}
    assert client.post("/api/work-items", json=bad_status, headers=auth).status_code == 422


def test_unknown_parent_returns_404(client, auth):
    body = {"site_id": 999, "name": "X", "start_date": str(TODAY), "end_date": str(TODAY), "budget": 10}
    assert client.post("/api/projects", json=body, headers=auth).status_code == 404


def test_deleting_project_cascades_to_work_items(client, auth):
    pid = make_project(client, auth, make_site(client, auth))
    make_item(client, auth, pid)
    client.delete(f"/api/projects/{pid}", headers=auth)
    assert client.get("/api/work-items", headers=auth).json() == []


def test_filters_by_project_status_and_date_range(client, auth):
    sid = make_site(client, auth)
    p1, p2 = make_project(client, auth, sid), make_project(client, auth, sid, name="P2")
    make_item(client, auth, p1, "done", TODAY - timedelta(5))
    make_item(client, auth, p1, "todo", TODAY + timedelta(3))
    make_item(client, auth, p2, "todo", TODAY + timedelta(20))
    def get(q):
        return client.get(f"/api/work-items?{q}", headers=auth).json()

    assert len(get(f"project_id={p1}")) == 2
    assert len(get("status=todo")) == 2
    assert len(get(f"date_from={TODAY}&date_to={TODAY + timedelta(10)}")) == 1
    assert len(get(f"site_id={sid}")) == 3


def test_dashboard_numbers_are_computed_correctly(client, auth):
    pid = make_project(client, auth, make_site(client, auth), budget=5000)
    make_item(client, auth, pid, "done", TODAY - timedelta(2), est=100, actual=120)
    make_item(client, auth, pid, "todo", TODAY + timedelta(2))
    client.post("/api/meetings", headers=auth, json={"project_id": pid, "title": "Kickoff",
                "datetime": f"{TODAY}T10:00:00"})
    d = client.get("/api/dashboard", headers=auth).json()
    assert d["summary"] == {"active_projects": 1, "items_due_this_week": 1, "meetings_today": 1, "overdue_items": 0,
                            "workers_male": 0, "workers_female": 0, "total_workers": 0,
                            "total_actual_cost": 120, "total_budget": 5000}
    assert d["projects"][0]["completion_pct"] == 50.0 and d["projects"][0]["work_item_count"] == 2
    assert d["projects"][0]["risk"]["level"] in {"Low", "Medium", "High"}


def test_risk_endpoint_and_404(client, auth):
    pid = make_project(client, auth, make_site(client, auth))
    make_item(client, auth, pid, "todo", TODAY - timedelta(10))
    r = client.get(f"/api/projects/{pid}/risk", headers=auth).json()
    assert 0 <= r["probability"] <= 1 and r["features"]["overdue_count"] == 1
    assert client.get("/api/projects/999/risk", headers=auth).status_code == 404


def test_model_ranks_troubled_project_above_healthy_one():
    healthy = predict_risk(completion=0.9, days_remaining=120, cost_overrun=1.0, overdue_count=0)
    troubled = predict_risk(completion=0.2, days_remaining=-5, cost_overrun=1.5, overdue_count=6)
    assert troubled["probability"] > healthy["probability"]
    assert healthy["level"] == "Low" and troubled["level"] == "High"


def test_meeting_date_filter(client, auth):
    pid = make_project(client, auth, make_site(client, auth))
    for days in (-1, 1):
        body = {"project_id": pid, "title": "M", "datetime": f"{TODAY + timedelta(days)}T09:00:00"}
        client.post("/api/meetings", json=body, headers=auth)
    assert len(client.get(f"/api/meetings?date_from={TODAY}", headers=auth).json()) == 1


def test_update_missing_record_returns_404(client, auth):
    body = {"name": "X", "location": "Y", "status": "active"}
    assert client.put("/api/sites/999", json=body, headers=auth).status_code == 404


def test_seed_creates_two_businesses_with_demo_data(db):
    seed(db, db.query(models.User).first(), random.Random(1))
    main = db.query(models.Business).filter_by(name="Northwind Retail").one()
    tables = (models.Site, models.Project, models.WorkItem, models.Meeting, models.Machine)
    assert [db.query(t).filter_by(business_id=main.id).count() for t in tables] == [3, 5, 40, 10, 12]
    assert db.query(models.Business).filter_by(name="BrightPath Consulting").count() == 1


def test_startup_fails_fast_without_secret_key(monkeypatch):
    monkeypatch.delenv("SECRET_KEY")
    with pytest.raises(RuntimeError):
        with TestClient(app):
            pass


def test_dashboard_counts_overdue_items(client, auth):
    pid = make_project(client, auth, make_site(client, auth))
    make_item(client, auth, pid, "todo", TODAY - timedelta(3))
    make_item(client, auth, pid, "done", TODAY - timedelta(3))
    assert client.get("/api/dashboard", headers=auth).json()["summary"]["overdue_items"] == 1


def test_placeholder_secret_is_rejected(monkeypatch):
    monkeypatch.setenv("SECRET_KEY", "change-me-use-a-long-random-string")
    with pytest.raises(RuntimeError):
        get_secret_key()


def test_business_fields_round_trip_and_validation(client, auth):
    body = {"name": "S", "location": "L", "site_manager": "Anita", "contact_phone": "98765"}
    sid = client.post("/api/sites", headers=auth, json=body).json()["id"]
    pid = make_project(client, auth, sid, client_name="ACME Ltd", project_type="technology", priority="high")
    got = client.get(f"/api/projects/{pid}", headers=auth).json()
    assert (got["client_name"], got["project_type"], got["priority"]) == ("ACME Ltd", "technology", "high")
    assert client.get(f"/api/sites/{sid}", headers=auth).json()["site_manager"] == "Anita"
    bad = {"site_id": sid, "name": "X", "start_date": str(TODAY), "end_date": str(TODAY), "budget": 5, "priority": "urgent"}
    assert client.post("/api/projects", json=bad, headers=auth).status_code == 422


def test_machine_service_date_is_optional(client, auth):
    sid = make_site(client, auth)
    r = client.post("/api/machines", headers=auth, json={"name": "M", "type": "Laptop", "site_id": sid})
    assert r.status_code == 201 and r.json()["last_service_date"] is None


def test_risk_explanation_ranks_causes():
    healthy = predict_risk(completion=0.9, days_remaining=120, cost_overrun=1.0, overdue_count=0)
    troubled = predict_risk(completion=0.2, days_remaining=-5, cost_overrun=1.5, overdue_count=6)
    assert max(c["impact"] for c in healthy["causes"]) < 0          # nothing pushes risk up
    assert troubled["causes"][0]["impact"] > 0                      # main cause raises risk
    impacts = [c["impact"] for c in troubled["causes"]]
    assert impacts == sorted(impacts, reverse=True) and len(impacts) == 4


def test_manual_risk_override_and_clear(client, auth):
    pid = make_project(client, auth, make_site(client, auth))
    url = f"/api/projects/{pid}/risk-override"
    assert client.put(url, json={"risk_override": "High", "risk_note": "Monsoon delays"}, headers=auth).status_code == 200
    row = client.get("/api/dashboard", headers=auth).json()["projects"][0]
    assert (row["manual_risk"], row["risk_note"]) == ("High", "Monsoon delays")
    assert client.get(f"/api/projects/{pid}/risk", headers=auth).json()["effective_level"] == "High"
    client.put(url, json={"risk_override": None}, headers=auth)
    assert client.get("/api/dashboard", headers=auth).json()["projects"][0]["manual_risk"] is None
    assert client.put(url, json={"risk_override": "Extreme"}, headers=auth).status_code == 422
    assert client.put("/api/projects/999/risk-override", json={}, headers=auth).status_code == 404


def test_workforce_totals_by_site(client, auth):
    sid = make_site(client, auth)
    make_project(client, auth, sid, workers_male=10, workers_female=5)
    make_project(client, auth, sid, name="P2", workers_male=7, workers_female=3, status="completed")  # not deployed
    d = client.get("/api/dashboard", headers=auth).json()
    assert d["workforce"] == [{"site": "Site A", "male": 10, "female": 5}]
    assert d["summary"]["total_workers"] == 15
    bad = {"site_id": sid, "name": "X", "start_date": str(TODAY), "end_date": str(TODAY), "budget": 5, "workers_male": -1}
    assert client.post("/api/projects", json=bad, headers=auth).status_code == 422


def test_login_is_throttled_after_repeated_failures(client):
    def attempt():
        return client.post("/api/auth/login", data={"username": "ghost", "password": "x"}).status_code

    assert [attempt() for _ in range(5)] == [401] * 5
    assert attempt() == 429


def signup(client, username, **over):
    body = {"username": username, "password": "password123", "email": f"{username.lower()}@example.com",
            "business_name": f"{username} Ltd", "accepted_terms": True, **over}
    return client.post("/api/auth/register", json=body)


def new_user(client, name):
    headers = {"Authorization": f"Bearer {signup(client, name).json()['access_token']}"}
    business_id = client.get("/api/businesses", headers=headers).json()[0]["id"]
    return {**headers, "X-Business-Id": str(business_id)}


def emailed_token(param):
    return re.search(rf"[?&]{param}=([\w.\-]+)", mailer.sent[-1]["body"]).group(1)


def test_register_creates_account_with_first_business(client):
    r = signup(client, "maya", business_name="Maya Bakery")
    assert r.status_code == 201
    token = {"Authorization": f"Bearer {r.json()['access_token']}"}
    assert [b["name"] for b in client.get("/api/businesses", headers=token).json()] == ["Maya Bakery"]
    assert signup(client, "MAYA", email="other@example.com").status_code == 409    # username taken, any case
    assert signup(client, "maya2", email="MAYA@example.com").status_code == 409    # email taken, any case
    assert signup(client, "short", password="123").status_code == 422
    assert signup(client, "noterms", accepted_terms=False).status_code == 400


def test_signup_can_be_disabled(client, monkeypatch):
    monkeypatch.setattr("app.config.ALLOW_SIGNUP", False)
    assert signup(client, "zed").status_code == 403


def test_users_cannot_see_or_touch_each_others_data(client, auth):
    site_id = make_site(client, auth)
    other = new_user(client, "mallory")
    url = f"/api/sites/{site_id}"
    assert client.get("/api/sites", headers=other).json() == []
    assert client.get(url, headers=other).status_code == 404
    assert client.put(url, json={"name": "Hacked", "location": "x"}, headers=other).status_code == 404
    assert client.delete(url, headers=other).status_code == 404
    body = {"site_id": site_id, "name": "P", "start_date": str(TODAY), "end_date": str(TODAY), "budget": 5}
    assert client.post("/api/projects", json=body, headers=other).status_code == 404   # cannot attach to someone else's site
    stolen = {**other, "X-Business-Id": auth["X-Business-Id"]}
    assert client.get("/api/sites", headers=stolen).status_code == 404                 # cannot claim someone else's business
    assert client.get(url, headers=auth).json()["name"] == "Site A"                    # owner's data is untouched
    assert client.get("/api/dashboard", headers=other).json()["summary"]["active_projects"] == 0


def test_one_user_can_switch_between_businesses(client, auth):
    make_site(client, auth)
    second = client.post("/api/businesses", json={"name": "Second Co", "industry": "Cafe"}, headers=auth)
    assert second.status_code == 201
    other = {**auth, "X-Business-Id": str(second.json()["id"])}
    assert client.get("/api/sites", headers=other).json() == []        # a new business starts empty
    assert len(client.get("/api/sites", headers=auth).json()) == 1     # the first keeps its data
    assert client.delete(f"/api/businesses/{second.json()['id']}", headers=auth).status_code == 204
    only = client.get("/api/businesses", headers=auth).json()[0]["id"]
    assert client.delete(f"/api/businesses/{only}", headers=auth).status_code == 400   # cannot delete the last one


def test_business_header_is_required(client, auth):
    assert client.get("/api/sites", headers={"Authorization": auth["Authorization"]}).status_code == 400


def test_invite_code_gates_registration(client, monkeypatch):
    monkeypatch.setattr("app.config.INVITE_CODE", "letmein")
    cfg = client.get("/api/auth/config").json()
    assert cfg["signup_enabled"] is True and cfg["invite_required"] is True
    assert signup(client, "newbie").status_code == 403
    assert signup(client, "newbie", invite_code="wrong").status_code == 403
    assert signup(client, "newbie", invite_code="letmein").status_code == 201


def test_registration_is_rate_limited_per_ip(client):
    assert [signup(client, f"bot{i}").status_code for i in range(6)] == [201] * 5 + [429]


def test_per_business_and_per_user_caps(client, auth, monkeypatch):
    monkeypatch.setattr("app.config.MAX_ROWS_PER_TABLE", 2)
    site = {"name": "S", "location": "L"}
    assert [client.post("/api/sites", json=site, headers=auth).status_code for _ in range(3)] == [201, 201, 409]
    monkeypatch.setattr("app.config.MAX_BUSINESSES_PER_USER", 1)
    assert client.post("/api/businesses", json={"name": "Another"}, headers=auth).status_code == 409


def test_production_config_is_validated(monkeypatch):
    from app import config
    monkeypatch.setattr(config, "PRODUCTION", True)
    monkeypatch.setenv("SECRET_KEY", "short")
    monkeypatch.setattr(config, "SMTP_HOST", "")
    monkeypatch.setattr(config, "APP_URL", "http://localhost:5173")
    monkeypatch.setattr(config, "CONTACT_EMAIL", "")
    with pytest.raises(RuntimeError) as err:
        config.validate_production_config()
    for word in ("SECRET_KEY", "PostgreSQL", "CORS_ORIGINS", "SMTP_HOST", "APP_URL", "CONTACT_EMAIL"):
        assert word in str(err.value)
    monkeypatch.setenv("SECRET_KEY", "x" * 40)
    monkeypatch.setattr(config, "DATABASE_URL", "postgresql+psycopg2://u:p@db:5432/app")
    monkeypatch.setattr(config, "CORS_ORIGINS", ["https://app.example.com"])
    monkeypatch.setattr(config, "SMTP_HOST", "smtp.example.com")
    monkeypatch.setattr(config, "APP_URL", "https://app.example.com")
    monkeypatch.setattr(config, "CONTACT_EMAIL", "help@example.com")
    config.validate_production_config()  # safe settings: no error


def test_api_responses_are_not_cacheable_and_sniff_protected(client):
    r = client.get("/api/health")
    assert r.headers["x-content-type-options"] == "nosniff" and r.headers["cache-control"] == "no-store"


def test_migrations_build_exactly_the_schema_the_models_describe(tmp_path):
    """Guards production: if a model changes without a new Alembic migration, this fails."""
    from pathlib import Path
    from alembic import command
    from alembic.autogenerate import compare_metadata
    from alembic.config import Config
    from alembic.migration import MigrationContext
    from sqlalchemy import create_engine
    from app.database import Base
    url = f"sqlite:///{tmp_path}/migrated.db"
    cfg = Config(str(Path(__file__).resolve().parent.parent / "alembic.ini"))
    cfg.set_main_option("sqlalchemy.url", url)
    command.upgrade(cfg, "head")
    with create_engine(url).connect() as conn:
        assert compare_metadata(MigrationContext.configure(conn), Base.metadata) == []


def test_email_verification_flow(client):
    h = {"Authorization": f"Bearer {signup(client, 'vera').json()['access_token']}"}
    assert mailer.sent[-1]["to"] == "vera@example.com"
    assert client.get("/api/auth/me", headers=h).json()["email_verified"] is False
    assert client.post("/api/auth/verify-email", json={"token": "garbage"}).status_code == 400
    assert client.post("/api/auth/verify-email", json={"token": emailed_token("verify")}).status_code == 200
    assert client.get("/api/auth/me", headers=h).json()["email_verified"] is True


def test_unverified_users_are_blocked_when_verification_is_required(client, monkeypatch):
    monkeypatch.setattr("app.config.REQUIRE_VERIFIED_EMAIL", True)
    h = {"Authorization": f"Bearer {signup(client, 'sam').json()['access_token']}"}
    assert client.get("/api/auth/me", headers=h).json()["verification_required"] is True
    assert client.get("/api/businesses", headers=h).status_code == 403
    client.post("/api/auth/verify-email", json={"token": emailed_token("verify")})
    assert client.get("/api/businesses", headers=h).status_code == 200


def test_password_reset_flow(client):
    old = signup(client, "rita").json()["access_token"]
    sent_before = len(mailer.sent)
    unknown = client.post("/api/auth/forgot-password", json={"email": "nobody@example.com"})
    known = client.post("/api/auth/forgot-password", json={"email": "RITA@example.com"})
    assert unknown.status_code == known.status_code == 200 and unknown.json() == known.json()  # cannot discover emails
    assert len(mailer.sent) == sent_before + 1 and mailer.sent[-1]["to"] == "rita@example.com"
    token = emailed_token("reset")
    assert client.post("/api/auth/reset-password", json={"token": token, "new_password": "brandnew123"}).status_code == 200
    assert client.post("/api/auth/login", data={"username": "rita", "password": "brandnew123"}).status_code == 200
    assert client.post("/api/auth/login", data={"username": "rita", "password": "password123"}).status_code == 401
    assert client.post("/api/auth/reset-password", json={"token": token, "new_password": "another12345"}).status_code == 400  # single use
    assert client.post("/api/auth/reset-password", json={"token": "garbage", "new_password": "another12345"}).status_code == 400
    assert client.get("/api/auth/me", headers={"Authorization": f"Bearer {old}"}).status_code == 401  # old sessions end


def test_change_password_ends_other_sessions(client):
    h = {"Authorization": f"Bearer {signup(client, 'chad').json()['access_token']}"}
    wrong = {"current_password": "wrong", "new_password": "newpassword1"}
    assert client.post("/api/auth/change-password", json=wrong, headers=h).status_code == 400
    r = client.post("/api/auth/change-password", json={"current_password": "password123", "new_password": "newpassword1"}, headers=h)
    assert r.status_code == 200
    assert client.get("/api/auth/me", headers=h).status_code == 401
    assert client.get("/api/auth/me", headers={"Authorization": f"Bearer {r.json()['access_token']}"}).status_code == 200


def test_users_can_delete_their_account_and_all_their_data(client, db):
    h = new_user(client, "dora")
    make_site(client, h)
    assert client.request("DELETE", "/api/auth/me", json={"password": "wrong"}, headers=h).status_code == 400
    assert client.request("DELETE", "/api/auth/me", json={"password": "password123"}, headers=h).status_code == 204
    assert client.post("/api/auth/login", data={"username": "dora", "password": "password123"}).status_code == 401
    assert db.query(models.User).filter_by(username="dora").count() == 0
    assert db.query(models.Business).filter_by(name="dora Ltd").count() == 0
    assert db.query(models.Site).filter_by(name="Site A").count() == 0


def test_export_contains_only_my_data(client, auth):
    make_site(client, auth)
    make_site(client, new_user(client, "eve"))
    data = client.get("/api/auth/export", headers=auth).json()
    assert data["user"]["email"] == "admin@example.com"
    assert len([loc for b in data["businesses"] for loc in b["locations"]]) == 1


def test_browser_session_uses_httponly_cookie_with_csrf_protection(client):
    r = client.post("/api/auth/login", data={"username": "admin", "password": "secret123"})
    cookie = r.headers["set-cookie"].lower()
    assert "httponly" in cookie and "samesite=lax" in cookie and "path=/api" in cookie
    assert client.get("/api/auth/me").json()["username"] == "admin"            # the cookie alone is enough to read
    body = {"name": "Via cookie"}
    assert client.post("/api/businesses", json=body).status_code == 403        # changing data without the CSRF header: refused
    assert client.post("/api/businesses", json=body, headers={"X-Requested-With": "XMLHttpRequest"}).status_code == 201
    client.post("/api/auth/logout")
    assert client.get("/api/auth/me").status_code == 401


def test_risk_endpoint_carries_the_synthetic_data_disclaimer(client, auth):
    pid = make_project(client, auth, make_site(client, auth))
    assert "synthetic" in client.get(f"/api/projects/{pid}/risk", headers=auth).json()["disclaimer"].lower()


def test_auth_config_reports_whether_email_can_be_sent(client, monkeypatch):
    assert client.get("/api/auth/config").json()["email_enabled"] is False
    monkeypatch.setattr("app.config.SMTP_HOST", "smtp.example.com")
    assert client.get("/api/auth/config").json()["email_enabled"] is True


def test_operator_can_reset_a_password_from_the_command_line(client, db, monkeypatch):
    import contextlib
    import sys
    import reset_password
    monkeypatch.setattr(reset_password, "SessionLocal", lambda: contextlib.nullcontext(db))
    monkeypatch.setattr(sys, "argv", ["reset_password.py", "admin"])
    monkeypatch.setattr("getpass.getpass", lambda prompt="": "brandnew123")
    reset_password.main()
    assert client.post("/api/auth/login", data={"username": "admin", "password": "brandnew123"}).status_code == 200
    assert client.post("/api/auth/login", data={"username": "admin", "password": "secret123"}).status_code == 401
