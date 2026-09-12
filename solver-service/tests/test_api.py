"""Tests HTTP du service (auth par secret partage, contrat camelCase)."""

import importlib

import pytest
from fastapi.testclient import TestClient


@pytest.fixture()
def client(monkeypatch):
    monkeypatch.setenv("SOLVER_SHARED_SECRET", "s3cret")
    from app import main

    importlib.reload(main)  # relire SHARED_SECRET depuis l'environnement
    return TestClient(main.app, raise_server_exceptions=False)


def test_health_ok(client):
    r = client.get("/health")
    assert r.status_code == 200
    body = r.json()
    assert body["status"] == "ok"
    assert body["contractVersion"] == "1.0.0"
    assert body["ortoolsVersion"]
    assert body["pythonVersion"]


def test_solve_requires_secret(client):
    r = client.post("/solve", json={"requestId": "x", "slotCount": 4, "tasks": []})
    assert r.status_code == 401


def test_solve_rejects_wrong_secret(client):
    r = client.post(
        "/solve",
        headers={"X-Solver-Secret": "nope"},
        json={"requestId": "x", "slotCount": 4, "tasks": []},
    )
    assert r.status_code == 401


def test_solve_returns_camelcase_solution(client):
    payload = {
        "requestId": "api-1",
        "timeoutSeconds": 5,
        "slotCount": 6,
        "roomCount": 2,
        "tasks": [
            {"index": 0, "candidateStartSlots": [0, 1, 2], "candidateRooms": [0, 1], "teacherIndexes": [0], "classIndexes": [0]},
            {"index": 1, "candidateStartSlots": [0, 1, 2], "candidateRooms": [0, 1], "teacherIndexes": [0], "classIndexes": [1]},
        ],
    }
    r = client.post("/solve", headers={"X-Solver-Secret": "s3cret"}, json=payload)
    assert r.status_code == 200
    body = r.json()
    assert body["requestId"] == "api-1"
    assert body["contractVersion"] == "1.0.0"
    assert body["status"] in ("OPTIMAL", "FEASIBLE")
    assert len(body["assignments"]) == 2
    a0 = body["assignments"][0]
    assert {"taskIndex", "startSlot", "endSlot", "room"} <= set(a0.keys())
    slots = {a["taskIndex"]: a["startSlot"] for a in body["assignments"]}
    assert slots[0] != slots[1]  # meme enseignant


def test_solve_accepts_snake_case_input_too(client):
    # populate_by_name : l'entree snake_case reste acceptee.
    payload = {
        "request_id": "snake",
        "slot_count": 3,
        "tasks": [{"index": 0, "candidate_start_slots": [0, 1, 2], "teacher_indexes": [0], "class_indexes": [0]}],
    }
    r = client.post("/solve", headers={"X-Solver-Secret": "s3cret"}, json=payload)
    assert r.status_code == 200
    assert r.json()["status"] in ("OPTIMAL", "FEASIBLE")


def test_diagnose_infeasible_core(client):
    payload = {
        "requestId": "diag",
        "slotCount": 1,
        "tasks": [
            {"index": 0, "candidateStartSlots": [0], "teacherIndexes": [0], "classIndexes": [0]},
            {"index": 1, "candidateStartSlots": [0], "teacherIndexes": [0], "classIndexes": [1]},
        ],
    }
    r = client.post("/diagnose", headers={"X-Solver-Secret": "s3cret"}, json=payload)
    assert r.status_code == 200
    body = r.json()
    assert body["status"] == "INFEASIBLE"
    assert len(body["infeasibleCore"]) >= 2


def test_solve_rejects_too_many_tasks(client):
    payload = {
        "requestId": "big",
        "slotCount": 10,
        "tasks": [{"index": i, "candidateStartSlots": [0], "teacherIndexes": [0], "classIndexes": [0]} for i in range(5001)],
    }
    r = client.post("/solve", headers={"X-Solver-Secret": "s3cret"}, json=payload)
    assert r.status_code == 413
