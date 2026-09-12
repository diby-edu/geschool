"""Tests du moteur CP-SAT (docs/SCHEDULE_ENGINE.md §6, SOLVER_API.md)."""

from app.models import ScheduleInput, Task
from app.solver import diagnose, solve


def _task(index, slots, *, duration=1, rooms=None, teachers=(0,), classes=(0,), groups=(), label=""):
    return Task(
        index=index,
        duration_slots=duration,
        candidate_start_slots=list(slots),
        candidate_rooms=list(rooms or []),
        teacher_indexes=list(teachers),
        class_indexes=list(classes),
        group_indexes=list(groups),
        label=label,
    )


def test_feasible_respects_teacher_and_class():
    data = ScheduleInput(
        request_id="t",
        timeout_seconds=5,
        slot_count=6,
        room_count=2,
        tasks=[
            _task(0, [0, 1, 2], rooms=[0, 1], teachers=[0], classes=[0], label="Maths 6A"),
            _task(1, [0, 1, 2], rooms=[0, 1], teachers=[0], classes=[1], label="Maths 6B"),
            _task(2, [0, 1, 2], rooms=[0], teachers=[1], classes=[0], label="Fr 6A"),
        ],
    )
    sol = solve(data)
    assert sol.status in ("OPTIMAL", "FEASIBLE")
    slot = {a.task_index: a.start_slot for a in sol.assignments}
    assert slot[0] != slot[1]  # meme enseignant
    assert slot[0] != slot[2]  # meme classe
    for a in sol.assignments:
        assert a.start_slot in data.tasks[a.task_index].candidate_start_slots
        assert a.end_slot == a.start_slot + 1


def test_duration_two_slots_blocks_overlap():
    # Deux cours de 2 creneaux, meme enseignant, 4 creneaux -> doivent s'enchainer.
    data = ScheduleInput(
        request_id="t",
        slot_count=4,
        tasks=[
            _task(0, [0, 1, 2], duration=2, teachers=[0], classes=[0]),
            _task(1, [0, 1, 2], duration=2, teachers=[0], classes=[1]),
        ],
    )
    sol = solve(data)
    assert sol.status in ("OPTIMAL", "FEASIBLE")
    a = {x.task_index: x for x in sol.assignments}
    # intervalles [s, s+2) disjoints
    assert a[0].end_slot <= a[1].start_slot or a[1].end_slot <= a[0].start_slot


def test_two_groups_same_class_may_be_simultaneous():
    # Regle §30 : groupe 0 et groupe 1 de la classe 0 -> autorises au meme creneau.
    data = ScheduleInput(
        request_id="t",
        slot_count=1,
        group_parent_classes={"0": [0], "1": [0]},
        tasks=[
            _task(0, [0], teachers=[0], classes=[], groups=[0]),
            _task(1, [0], teachers=[1], classes=[], groups=[1]),
        ],
    )
    sol = solve(data)
    assert sol.status in ("OPTIMAL", "FEASIBLE")
    slot = {a.task_index: a.start_slot for a in sol.assignments}
    assert slot[0] == 0 and slot[1] == 0  # simultanes, aucun creneau libre ailleurs


def test_group_and_whole_class_conflict():
    # Regle §30 : un groupe de la classe 0 et la classe 0 entiere -> exclusifs.
    data = ScheduleInput(
        request_id="t",
        slot_count=1,
        group_parent_classes={"0": [0]},
        tasks=[
            _task(0, [0], teachers=[0], classes=[0], groups=[]),
            _task(1, [0], teachers=[1], classes=[], groups=[0]),
        ],
    )
    sol = solve(data)
    assert sol.status == "INFEASIBLE"


def test_room_within_candidates_and_no_overlap():
    data = ScheduleInput(
        request_id="t",
        slot_count=2,
        room_count=1,
        tasks=[
            _task(0, [0, 1], rooms=[0], teachers=[0], classes=[0]),
            _task(1, [0, 1], rooms=[0], teachers=[1], classes=[1]),
        ],
    )
    sol = solve(data)
    assert sol.status in ("OPTIMAL", "FEASIBLE")
    by = {a.task_index: a for a in sol.assignments}
    assert by[0].start_slot != by[1].start_slot  # salle unique partagee
    assert by[0].room == 0 and by[1].room == 0


def test_locked_task_keeps_fixed_slot_and_room():
    data = ScheduleInput(
        request_id="t",
        slot_count=4,
        room_count=1,
        tasks=[
            Task(index=0, candidate_start_slots=[], locked=True, fixed_start_slot=2, fixed_room=0,
                 teacher_indexes=[0], class_indexes=[0]),
            _task(1, [0, 1, 2, 3], rooms=[0], teachers=[0], classes=[1]),
        ],
    )
    sol = solve(data)
    assert sol.status in ("OPTIMAL", "FEASIBLE")
    by = {a.task_index: a for a in sol.assignments}
    assert by[0].start_slot == 2 and by[0].room == 0
    assert by[1].start_slot != 2  # meme enseignant, ne peut pas etre sur le creneau verrouille


def test_fixed_occupation_blocks_slot():
    from app.models import FixedOccupation

    data = ScheduleInput(
        request_id="t",
        slot_count=2,
        tasks=[_task(0, [0, 1], teachers=[0], classes=[0])],
        fixed_occupations=[FixedOccupation(start_slot=0, duration_slots=1, teacher_indexes=[0])],
    )
    sol = solve(data)
    assert sol.status in ("OPTIMAL", "FEASIBLE")
    assert sol.assignments[0].start_slot == 1  # 0 est occupe


def test_empty_domain_is_infeasible_without_solving():
    data = ScheduleInput(request_id="t", slot_count=4, tasks=[_task(0, [], teachers=[0], classes=[0])])
    sol = solve(data)
    assert sol.status == "INFEASIBLE"
    assert sol.empty_domain_tasks == [0]
    assert sol.assignments == []


def test_overconstrained_returns_infeasible_core():
    # 3 taches, meme enseignant, 1 seul creneau -> noyau = les 3 taches.
    data = ScheduleInput(
        request_id="t",
        slot_count=1,
        tasks=[
            _task(0, [0], teachers=[0], classes=[0]),
            _task(1, [0], teachers=[0], classes=[1]),
            _task(2, [0], teachers=[0], classes=[2]),
        ],
    )
    sol = solve(data)
    assert sol.status == "INFEASIBLE"
    assert len(sol.infeasible_core) >= 2
    assert set(sol.infeasible_core).issubset({0, 1, 2})


def test_diagnose_reports_feasible_and_infeasible():
    ok = ScheduleInput(
        request_id="t", slot_count=3, tasks=[_task(0, [0, 1, 2], teachers=[0], classes=[0])]
    )
    assert diagnose(ok).status == "FEASIBLE"

    ko = ScheduleInput(
        request_id="t",
        slot_count=1,
        tasks=[_task(0, [0], teachers=[0], classes=[0]), _task(1, [0], teachers=[0], classes=[1])],
    )
    rep = diagnose(ko)
    assert rep.status == "INFEASIBLE"
    assert len(rep.infeasible_core) >= 2


def test_multi_teacher_task_blocks_both():
    data = ScheduleInput(
        request_id="t",
        slot_count=1,
        tasks=[
            _task(0, [0], teachers=[0, 1], classes=[0]),
            _task(1, [0], teachers=[1], classes=[1]),
        ],
    )
    sol = solve(data)
    assert sol.status == "INFEASIBLE"
