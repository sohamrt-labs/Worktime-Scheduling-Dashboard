# Copyright 2026 Soham Raut
# SPDX-License-Identifier: Apache-2.0

from contextlib import asynccontextmanager

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import RedirectResponse

from . import models  # noqa: F401  (registers tables on Base.metadata)
from .config import CORS_ORIGINS, PRODUCTION, get_secret_key, validate_production_config
from .database import Base, engine
from .routers import auth, businesses, crud, dashboard


@asynccontextmanager
async def lifespan(app: FastAPI):
    validate_production_config()
    get_secret_key()  # fail at startup, not at the first login, if the key is missing
    if not PRODUCTION:  # in production the schema is managed by Alembic migrations, never create_all
        Base.metadata.create_all(engine)
    yield


app = FastAPI(title="Work-Time Scheduling Dashboard API", version="1.0.0", lifespan=lifespan,
              docs_url=None if PRODUCTION else "/docs", redoc_url=None, openapi_url=None if PRODUCTION else "/openapi.json")
app.add_middleware(CORSMiddleware, allow_origins=CORS_ORIGINS, allow_methods=["*"], allow_headers=["*"])

@app.middleware("http")
async def security_headers(request, call_next):
    response = await call_next(request)
    response.headers["X-Content-Type-Options"] = "nosniff"
    if request.url.path.startswith("/api/"):
        response.headers["Cache-Control"] = "no-store"  # never let a browser or proxy cache API data
    return response


app.include_router(auth.router)
app.include_router(businesses.router)
app.include_router(dashboard.router)
for r in crud.routers:
    app.include_router(r)


@app.get("/", include_in_schema=False)
def root():
    return RedirectResponse("/docs") if not PRODUCTION else {"status": "ok"}


@app.get("/api/health", tags=["meta"])
def health():
    return {"status": "ok"}
