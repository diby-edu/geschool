"""Service solveur — FastAPI (docs/SOLVER_API.md).

Jamais expose a Internet : ecoute sur 127.0.0.1 (ou reseau interne Docker),
protege par un secret partage. Ne recoit aucune variable Supabase.
"""

from __future__ import annotations

import hmac
import os

from fastapi import FastAPI, Header, HTTPException
from fastapi.responses import JSONResponse

from .models import ScheduleInput, ScheduleSolution
from .solver import diagnose, solve

CONTRACT_VERSION = "1.0.0"
SHARED_SECRET = os.environ.get("SOLVER_SHARED_SECRET", "")

app = FastAPI(title="geschool solver", version=CONTRACT_VERSION)


def _check_secret(provided: str | None) -> None:
    # Si aucun secret n'est configure (dev local), on n'exige rien.
    if not SHARED_SECRET:
        return
    if not provided or not hmac.compare_digest(provided, SHARED_SECRET):
        raise HTTPException(status_code=401, detail="unauthorized")


def _guard_size(payload: ScheduleInput) -> None:
    # Plafonds defensifs (docs/SOLVER_API.md §2, §10) : borne le cout sur 1 vCPU.
    if len(payload.tasks) > 5000:
        raise HTTPException(status_code=413, detail="too many tasks")


@app.get("/health")
def health() -> dict:
    import platform
    import sys

    import ortools

    return {
        "status": "ok",
        "contractVersion": CONTRACT_VERSION,
        "ortoolsVersion": ortools.__version__,
        "pythonVersion": platform.python_version(),
        "maxWorkers": os.cpu_count() or 1,
    }


@app.post("/solve", response_model=ScheduleSolution)
def solve_endpoint(
    payload: ScheduleInput,
    x_solver_secret: str | None = Header(default=None),
) -> ScheduleSolution:
    _check_secret(x_solver_secret)
    _guard_size(payload)
    return solve(payload)


@app.post("/diagnose", response_model=ScheduleSolution)
def diagnose_endpoint(
    payload: ScheduleInput,
    x_solver_secret: str | None = Header(default=None),
) -> ScheduleSolution:
    _check_secret(x_solver_secret)
    _guard_size(payload)
    return diagnose(payload)


@app.exception_handler(Exception)
async def unhandled(_request, exc: Exception):  # noqa: ANN001
    # Ne jamais renvoyer de trace au client (docs/SOLVER_API.md §7).
    return JSONResponse(status_code=500, content={"error": {"code": "SOLVER_INTERNAL", "message": "erreur interne"}})
