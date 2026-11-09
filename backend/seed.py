# Copyright 2026 Soham Raut
# SPDX-License-Identifier: Apache-2.0

"""Fill the database with demo data for the admin user, who gets TWO businesses so the switcher has something to switch:
  - Northwind Retail (3 locations, 5 projects, 40 work items, 10 meetings, 12 equipment items)
  - BrightPath Consulting (a small second business)

Usage:  python seed.py          (add data; skips if the admin already has businesses)
        python seed.py --reset  (drop every table first)
Admin credentials come from ADMIN_USERNAME / ADMIN_PASSWORD in the environment.
"""
import os
import random
import sys
from datetime import datetime, time, timedelta, timezone

from app import models
from app.config import PRODUCTION
from app.database import Base, SessionLocal, engine
from app.security import hash_password
from app.services.stats import local_today

PEOPLE = ["Rahul Patil", "Anita Deshmukh", "Vikram Joshi", "Sneha Kulkarni", "Imran Shaikh", "Priya Nair"]
TASKS = ["Requirements review", "Vendor shortlisting", "Budget approval", "Procurement", "Setup and installation",
         "Staff training", "Pilot run", "Quality check", "Stakeholder demo", "Compliance review", "Launch preparation",
         "Customer communication", "Process documentation", "Performance review", "Go-live", "Post-launch audit"]
LOCATIONS = [("Mumbai Flagship Store", "Bandra, Mumbai", "Rahul Patil", "+91 98220 11001"),
             ("Pune Distribution Centre", "Chakan, Pune", "Anita Deshmukh", "+91 98220 11002"),
             ("Delhi Regional Office", "Nehru Place, New Delhi", "Vikram Joshi", "+91 98220 11003")]
# (location index, name, start offset days, end offset days, budget INR, status)
PROJECTS = [
    (0, "Festive Season Campaign", -120, 45, 48_000_000, "active"),
    (0, "Store Refit and Layout", -60, 120, 21_000_000, "active"),
    (1, "Warehouse Automation", -200, -10, 35_000_000, "active"),   # past deadline on purpose
    (1, "Inventory System Upgrade", -30, 200, 27_000_000, "active"),
    (2, "New Regional Launch", 10, 300, 60_000_000, "planned"),
]
OWNERS = [("Marketing Team", "marketing", "high"), ("Store Operations", "operations", "medium"), ("Supply Chain", "technology", "high"),
          ("IT Department", "technology", "medium"), ("Regional Sales", "expansion", "low")]
WORKERS = [(42, 8), (28, 5), (55, 12), (34, 9), (0, 0)]  # (male, female) team members per project
EQUIPMENT = [("Forklift", "Electric Forklift"), ("Delivery Van", "Tata Ace Van"), ("POS Terminal", "POS Terminal"),
             ("Laptop", "Dell Latitude"), ("Label Printer", "Thermal Label Printer"), ("Scanner", "Barcode Scanner"),
             ("Generator", "Backup Generator"), ("Server", "Rack Server")]


def seed(db, owner, rnd: random.Random | None = None):
    rnd = rnd or random.Random(42)
    today = local_today()
    biz = models.Business(owner_id=owner.id, name="Northwind Retail", industry="Retail")
    db.add(biz)
    db.flush()
    bid = biz.id
    sites = [models.Site(business_id=bid, name=n, location=address, status="active", site_manager=m, contact_phone=ph)
             for n, address, m, ph in LOCATIONS]
    db.add_all(sites)
    db.flush()

    projects = []
    for k, (s_idx, name, a, b, budget, status) in enumerate(PROJECTS):
        p = models.Project(business_id=bid, site_id=sites[s_idx].id, name=name, start_date=today + timedelta(a),
                           end_date=today + timedelta(b), budget=budget, status=status,
                           client_name=OWNERS[k][0], project_type=OWNERS[k][1], priority=OWNERS[k][2],
                           description=f"{name}, led by {OWNERS[k][0]}.",
                           workers_male=WORKERS[k][0], workers_female=WORKERS[k][1])
        db.add(p)
        db.flush()
        projects.append(p)
        span = (p.end_date - p.start_date).days
        for i in range(8):
            due = p.start_date + timedelta(days=int(span * (i + 1) / 9))
            if status == "active" and i == 5:
                due = today + timedelta(days=rnd.randint(0, 6))  # guarantees "due this week" demo data
            est = budget * rnd.uniform(0.04, 0.10)
            if status == "planned" or due >= today:
                state = "todo" if rnd.random() < 0.7 or status == "planned" else "in_progress"
            else:
                state = "done" if rnd.random() < 0.75 else "in_progress"
            actual = est * rnd.uniform(0.9, 1.3) if state == "done" else est * rnd.uniform(0.2, 0.5) if state == "in_progress" else 0
            db.add(models.WorkItem(business_id=bid, project_id=p.id, title=f"{TASKS[(i * 2 + s_idx) % len(TASKS)]} - {name}",
                                   due_date=due, status=state, assigned_to=rnd.choice(PEOPLE),
                                   estimated_cost=round(est), actual_cost=round(actual)))

    # 2 meetings today, 5 in the next week, 3 in the past
    offsets = [(0, 10), (0, 15), (1, 11), (2, 9), (3, 14), (5, 10), (6, 16), (-3, 10), (-7, 11), (-14, 15)]
    titles = ["Weekly progress review", "Budget review", "Vendor sync", "Stakeholder update", "Planning workshop"]
    for k, (d, hour) in enumerate(offsets):
        db.add(models.Meeting(business_id=bid, project_id=projects[k % 4].id, title=titles[k % 5],
                              datetime=datetime.combine(today + timedelta(d), time(hour)),
                              attendees=", ".join(rnd.sample(PEOPLE, 3)), notes="Agenda shared by the project lead.",
                              location="Conference room"))
    for k in range(12):
        kind, model = EQUIPMENT[k % len(EQUIPMENT)]
        db.add(models.Machine(business_id=bid, name=f"{model} #{k + 1}", type=kind, site_id=sites[k % 3].id,
                              status=rnd.choices(["in_use", "idle", "maintenance"], [5, 3, 1])[0],
                              hours_used=round(rnd.uniform(100, 4500), 1), operator=rnd.choice(PEOPLE),
                              last_service_date=today - timedelta(days=rnd.randint(10, 120))))

    # a second, much smaller business
    biz2 = models.Business(owner_id=owner.id, name="BrightPath Consulting", industry="Professional services")
    db.add(biz2)
    db.flush()
    office = models.Site(business_id=biz2.id, name="Head Office", location="Koregaon Park, Pune", status="active",
                         site_manager="Priya Nair", contact_phone="+91 98220 22001")
    db.add(office)
    db.flush()
    proj = models.Project(business_id=biz2.id, site_id=office.id, name="Client Onboarding Portal", start_date=today - timedelta(20),
                          end_date=today + timedelta(60), budget=4_500_000, status="active", client_name="Orion Finance",
                          project_type="technology", priority="high", workers_male=4, workers_female=6)
    db.add(proj)
    db.flush()
    for i, (title, d, state) in enumerate([("Discovery workshops", -10, "done"), ("UX prototypes", 5, "in_progress"), ("Security review", 20, "todo")]):
        db.add(models.WorkItem(business_id=biz2.id, project_id=proj.id, title=title, due_date=today + timedelta(d), status=state,
                               assigned_to=PEOPLE[i], estimated_cost=500_000, actual_cost=520_000 if state == "done" else 0))
    db.add(models.Meeting(business_id=biz2.id, project_id=proj.id, title="Client check-in",
                          datetime=datetime.combine(today + timedelta(2), time(11)), attendees="Priya Nair, Orion Finance team",
                          location="Video call"))
    db.add(models.Machine(business_id=biz2.id, name="Design Workstation #1", type="Workstation", site_id=office.id,
                          status="in_use", hours_used=820, operator="Priya Nair"))
    db.commit()


def main():
    if "--reset" in sys.argv:
        if PRODUCTION:
            sys.exit("Refusing to --reset a production database.")
        Base.metadata.drop_all(engine)
    Base.metadata.create_all(engine)
    username = os.getenv("ADMIN_USERNAME", "admin")
    password = os.environ.get("ADMIN_PASSWORD")
    if not password or password.startswith("change-me"):
        sys.exit("Set a real ADMIN_PASSWORD in .env (not empty, not the placeholder).")
    with SessionLocal() as db:
        admin = db.query(models.User).filter_by(username=username).first()
        if admin is None:
            admin = models.User(username=username, password_hash=hash_password(password), email=os.getenv("ADMIN_EMAIL", "admin@example.com").lower(),
                               email_verified=True, terms_accepted_at=datetime.now(timezone.utc).replace(tzinfo=None))
            db.add(admin)
            db.commit()
        if db.query(models.Business).filter_by(owner_id=admin.id).count():
            print("Demo data already exists; use --reset to re-seed.")
            return
        seed(db, admin)
    print(f"Seeded demo data. Login as '{username}'.")


if __name__ == "__main__":
    main()
