"""Moteur CP-SAT (docs/SCHEDULE_ENGINE.md §6, docs/SOLVER_API.md).

Modelisation par intervalles + NoOverlap par ressource, l'idiome CP-SAT :

- une tache occupe `duration_slots` creneaux consecutifs sur l'axe aplati ;
  les creneaux de depart candidats garantissent la tenue dans une journee, et
  deux journees ont des indices disjoints — donc jamais de recouvrement
  inter-jours involontaire ;
- l'enseignant/la classe ne decident que du creneau de depart et de la salle ;
- NoOverlap par enseignant, par classe entiere, par groupe, par salle ;
- regle groupes/classe (§30) : deux groupes d'une meme classe peuvent etre
  simultanes, mais un groupe et la classe entiere non — encode par un NoOverlap
  supplementaire sur (classe entiere ∪ groupe) pour chaque groupe.

Chaque tache est rendue « optionnelle » via un litteral `present[t]` : en
resolution normale on suppose tous les `present[t]` vrais (toutes les seances
doivent etre placees). En cas d'infaisabilite, CP-SAT rend le sous-ensemble
suffisant d'hypotheses — c'est le noyau d'infaisabilite renvoye a l'application.
"""

from __future__ import annotations

import time

from ortools.sat.python import cp_model

from .models import Assignment, ScheduleInput, ScheduleSolution, SolveStatistics

_STATUS = {
    cp_model.OPTIMAL: "OPTIMAL",
    cp_model.FEASIBLE: "FEASIBLE",
    cp_model.INFEASIBLE: "INFEASIBLE",
    cp_model.MODEL_INVALID: "UNKNOWN",
    cp_model.UNKNOWN: "UNKNOWN",
}


class _Built:
    """Modele construit + tables de correspondance pour relire la solution."""

    def __init__(self) -> None:
        self.model = cp_model.CpModel()
        self.start: dict[int, cp_model.IntVar] = {}
        self.present: dict[int, cp_model.IntVar] = {}
        self.room_lit: dict[tuple[int, int], cp_model.IntVar] = {}
        self.n_constraints = 0


def _build(data: ScheduleInput, tasks) -> _Built:
    b = _Built()
    model = b.model
    horizon = max(1, data.slot_count)

    # --- variables par tache : creneau de depart, presence, intervalle ---
    interval: dict[int, cp_model.IntervalVar] = {}
    for t in tasks:
        dur = max(1, t.duration_slots)
        present = model.NewBoolVar(f"present_{t.index}")
        b.present[t.index] = present

        if t.locked and t.fixed_start_slot is not None:
            s = model.NewConstant(t.fixed_start_slot)
        else:
            domain = cp_model.Domain.FromValues(sorted(set(t.candidate_start_slots)))
            s = model.NewIntVarFromDomain(domain, f"start_{t.index}")
        b.start[t.index] = s

        end = model.NewIntVar(0, horizon, f"end_{t.index}")
        model.Add(end == s + dur)
        interval[t.index] = model.NewOptionalIntervalVar(s, dur, end, present, f"itv_{t.index}")

    # --- occupations fixes : intervalles toujours presents, non deplacables ---
    fixed_by_teacher: dict[int, list] = {}
    fixed_by_class: dict[int, list] = {}
    fixed_by_group: dict[int, list] = {}
    fixed_by_room: dict[int, list] = {}
    for i, occ in enumerate(data.fixed_occupations):
        dur = max(1, occ.duration_slots)
        s = model.NewConstant(occ.start_slot)
        end = model.NewConstant(occ.start_slot + dur)
        itv = model.NewIntervalVar(s, dur, end, f"fixed_{i}")
        for te in occ.teacher_indexes:
            fixed_by_teacher.setdefault(te, []).append(itv)
        for cl in occ.class_indexes:
            fixed_by_class.setdefault(cl, []).append(itv)
        for gr in occ.group_indexes:
            fixed_by_group.setdefault(gr, []).append(itv)
        if occ.room_index is not None:
            fixed_by_room.setdefault(occ.room_index, []).append(itv)

    # --- regroupement des intervalles de taches par ressource ---
    by_teacher: dict[int, list] = {}
    by_class: dict[int, list] = {}
    by_group: dict[int, list] = {}
    for t in tasks:
        itv = interval[t.index]
        for te in t.teacher_indexes:
            by_teacher.setdefault(te, []).append(itv)
        for cl in t.class_indexes:
            by_class.setdefault(cl, []).append(itv)
        for gr in t.group_indexes:
            by_group.setdefault(gr, []).append(itv)

    def _no_overlap(intervals: list) -> None:
        if len(intervals) > 1:
            model.AddNoOverlap(intervals)
            b.n_constraints += 1

    for te, ivs in by_teacher.items():
        _no_overlap(ivs + fixed_by_teacher.get(te, []))
    for cl, ivs in by_class.items():
        _no_overlap(ivs + fixed_by_class.get(cl, []))
    for gr, ivs in by_group.items():
        _no_overlap(ivs + fixed_by_group.get(gr, []))

    # regle §30 : classe entiere vs chacun de ses groupes. Un groupe peut
    # appartenir a plusieurs classes (§16) : un NoOverlap par (groupe, classe).
    parents = {int(g): list(cs) for g, cs in data.group_parent_classes.items()}
    for gr, ivs in by_group.items():
        for cls in parents.get(gr, []):
            combined = ivs + by_class.get(cls, []) + fixed_by_class.get(cls, [])
            _no_overlap(combined)

    # --- salles : au plus une salle par tache, NoOverlap par salle ---
    room_intervals: dict[int, list] = {r: list(v) for r, v in fixed_by_room.items()}
    for t in tasks:
        if t.locked and t.fixed_room is not None:
            r = t.fixed_room
            lit = model.NewBoolVar(f"room_{t.index}_{r}")
            model.Add(lit == b.present[t.index])
            b.room_lit[(t.index, r)] = lit
            dur = max(1, t.duration_slots)
            opt = model.NewOptionalIntervalVar(
                b.start[t.index], dur, model.NewIntVar(0, horizon, f"rend_{t.index}_{r}"), lit, f"ritv_{t.index}_{r}"
            )
            room_intervals.setdefault(r, []).append(opt)
            continue
        if not t.candidate_rooms:
            continue
        lits = []
        dur = max(1, t.duration_slots)
        for r in t.candidate_rooms:
            lit = model.NewBoolVar(f"room_{t.index}_{r}")
            b.room_lit[(t.index, r)] = lit
            lits.append(lit)
            opt = model.NewOptionalIntervalVar(
                b.start[t.index], dur, model.NewIntVar(0, horizon, f"rend_{t.index}_{r}"), lit, f"ritv_{t.index}_{r}"
            )
            room_intervals.setdefault(r, []).append(opt)
        # exactement une salle si la tache est presente, aucune sinon
        model.Add(sum(lits) == b.present[t.index])

    for ivs in room_intervals.values():
        _no_overlap(ivs)

    return b


def _configure(solver: cp_model.CpSolver, data: ScheduleInput) -> None:
    solver.parameters.max_time_in_seconds = float(max(1, data.timeout_seconds))
    solver.parameters.num_search_workers = max(1, data.workers)
    solver.parameters.random_seed = int(data.random_seed)


def _status_name(solver: cp_model.CpSolver, status: int, timeout: int) -> str:
    name = _STATUS.get(status, "UNKNOWN")
    if name == "UNKNOWN" and solver.WallTime() >= timeout * 0.95:
        return "TIME_LIMIT"
    return name


def _empty_domains(data: ScheduleInput) -> list[int]:
    return [
        t.index
        for t in data.tasks
        if not (t.locked and t.fixed_start_slot is not None) and not t.candidate_start_slots
    ]


def solve(data: ScheduleInput) -> ScheduleSolution:
    started = time.monotonic()

    empty = _empty_domains(data)
    solvable = [t for t in data.tasks if t.index not in set(empty)]

    # Un domaine vide rend l'ensemble infaisable : on n'engage pas le solveur
    # sur les taches restantes, mais on renvoie un diagnostic exploitable.
    if empty:
        core = _diagnose_core(data, solvable) if solvable else []
        return ScheduleSolution(
            request_id=data.request_id,
            status="INFEASIBLE",
            empty_domain_tasks=empty,
            infeasible_core=core,
            statistics=SolveStatistics(wall_time_ms=int((time.monotonic() - started) * 1000)),
        )

    b = _build(data, data.tasks)
    b.model.AddAssumptions(list(b.present.values()))

    solver = cp_model.CpSolver()
    _configure(solver, data)
    status = solver.Solve(b.model)
    status_name = _status_name(solver, status, data.timeout_seconds)

    assignments: list[Assignment] = []
    core: list[int] = []
    if status in (cp_model.OPTIMAL, cp_model.FEASIBLE):
        for t in data.tasks:
            dur = max(1, t.duration_slots)
            s = int(solver.Value(b.start[t.index]))
            room = -1
            for r in list(t.candidate_rooms) + ([t.fixed_room] if t.fixed_room is not None else []):
                lit = b.room_lit.get((t.index, r))
                if lit is not None and solver.Value(lit) == 1:
                    room = r
                    break
            assignments.append(Assignment(task_index=t.index, start_slot=s, end_slot=s + dur, room=room))
    elif status == cp_model.INFEASIBLE:
        suff = set(solver.SufficientAssumptionsForInfeasibility())
        core = sorted(idx for idx, lit in b.present.items() if lit.Index() in suff)

    return ScheduleSolution(
        request_id=data.request_id,
        status=status_name,
        assignments=assignments,
        infeasible_core=core,
        statistics=SolveStatistics(
            variables=len(b.start) + len(b.room_lit),
            constraints=b.n_constraints,
            branches=int(solver.NumBranches()),
            conflicts=int(solver.NumConflicts()),
            wall_time_ms=int((time.monotonic() - started) * 1000),
            solutions_found=1 if assignments else 0,
        ),
    )


def _diagnose_core(data: ScheduleInput, tasks) -> list[int]:
    """Extrait un noyau d'infaisabilite (sous-ensemble de taches suffisant)."""
    if not tasks:
        return []
    b = _build(data, tasks)
    b.model.AddAssumptions(list(b.present.values()))
    solver = cp_model.CpSolver()
    _configure(solver, data)
    status = solver.Solve(b.model)
    if status != cp_model.INFEASIBLE:
        return []
    suff = set(solver.SufficientAssumptionsForInfeasibility())
    return sorted(idx for idx, lit in b.present.items() if lit.Index() in suff)


def diagnose(data: ScheduleInput) -> ScheduleSolution:
    """Rapport d'infaisabilite sans optimisation (endpoint /diagnose)."""
    started = time.monotonic()
    empty = _empty_domains(data)
    solvable = [t for t in data.tasks if t.index not in set(empty)]
    core = _diagnose_core(data, solvable)
    status = "INFEASIBLE" if (empty or core) else "FEASIBLE"
    return ScheduleSolution(
        request_id=data.request_id,
        status=status,
        empty_domain_tasks=empty,
        infeasible_core=core,
        statistics=SolveStatistics(wall_time_ms=int((time.monotonic() - started) * 1000)),
    )
