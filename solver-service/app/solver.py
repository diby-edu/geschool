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

from .models import Assignment, PenaltyDetail, ScheduleInput, ScheduleSolution, SolveStatistics

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
        # « la tache i demarre exactement au creneau s ». Construits a la
        # demande et partages : plusieurs regles en ont besoin, les creer deux
        # fois doublerait la taille du modele pour rien.
        self.starts_at: dict[tuple[int, int], cp_model.IntVar] = {}
        # Termes de penalite, par libelle : c'est ce qui permet de dire apres
        # coup CE QUE chaque preference a coute.
        self.penalties: list[tuple[str, object]] = []
        # Un literal par regle DURE posee dans le modele. En le declarant comme
        # hypothese, CP-SAT peut designer lui-meme les regles qui rendent le
        # probleme insoluble — sans qu'on ait a relancer un calcul par regle.
        self.rule_lits: dict[str, cp_model.IntVar] = {}
        # Groupes de salles interchangeables : distribuees apres resolution.
        self.interchangeable: list = []

    def start_literals(self, task) -> dict[int, cp_model.IntVar]:
        """« demarre exactement en s », pour chaque creneau possible."""
        domain = sorted(set(task.candidate_start_slots)) or (
            [task.fixed_start_slot] if task.fixed_start_slot is not None else []
        )
        if not domain:
            return {}
        out: dict[int, cp_model.IntVar] = {}
        missing = [s for s in domain if (task.index, s) not in self.starts_at]
        for s in domain:
            key = (task.index, s)
            if key not in self.starts_at:
                lit = self.model.NewBoolVar(f"at_{task.index}_{s}")
                self.starts_at[key] = lit
                self.model.Add(self.start[task.index] == s).OnlyEnforceIf(lit)
                self.model.Add(self.start[task.index] != s).OnlyEnforceIf(lit.Not())
            out[s] = self.starts_at[key]
        if missing:
            # Une seance presente demarre a un creneau et un seul.
            self.model.Add(sum(out.values()) == self.present[task.index])
            self.n_constraints += 1
        return out


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

    # --- salles ---------------------------------------------------------
    # Quand un groupe de taches se partage EXACTEMENT le meme jeu de salles, et
    # que personne d'autre n'y touche, ces salles sont interchangeables. Leur
    # affecter un booleen par couple (tache, salle) cree des centaines de
    # milliers de variables et, surtout, autant de solutions equivalentes que
    # de permutations de salles : le solveur s'y perd.
    #
    # On remplace alors l'affectation par une simple contrainte de capacite —
    # « pas plus de N cours en meme temps » — et les salles sont distribuees
    # apres coup. Mesure sur un lycee de 5000 eleves : sans ceci, aucune
    # solution en trois minutes ; avec, quelques secondes.
    interchangeable = _interchangeable_groups(tasks, data, fixed_by_room)
    b.interchangeable = interchangeable
    handled: set[int] = set()
    for rooms, members in interchangeable:
        intervals = [interval[t.index] for t in members]
        if len(intervals) > 1:
            model.AddCumulative(intervals, [1] * len(intervals), len(rooms))
            b.n_constraints += 1
        handled.update(t.index for t in members)

    # --- salles nominatives : au plus une salle par tache, NoOverlap par salle ---
    room_intervals: dict[int, list] = {r: list(v) for r, v in fixed_by_room.items()}
    for t in tasks:
        if t.index in handled:
            continue
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

    _load_limits(data, tasks, b)
    _slot_penalties(data, tasks, b)
    _gap_penalties(data, tasks, b)

    return b


def _slot_penalties(data: ScheduleInput, tasks, b: _Built) -> None:
    """Creneaux deconseilles : « plutot le matin », « jamais en derniere heure ».

    Une preference ne se refuse pas, elle se paie. Le solveur place ailleurs si
    c'est possible, et accepte le cout quand le reste l'exige.
    """
    if not data.slot_penalties:
        return
    by_index = {t.index: t for t in tasks}
    for pen in data.slot_penalties:
        if pen.weight <= 0 or not pen.slots:
            continue
        discouraged = set(pen.slots)
        terms = []
        for i in pen.task_indexes:
            t = by_index.get(i)
            if t is None:
                continue
            for slot, lit in b.start_literals(t).items():
                if slot in discouraged:
                    terms.append(lit)
        if terms:
            b.penalties.append((pen.label, pen.weight * sum(terms)))


def _gap_penalties(data: ScheduleInput, tasks, b: _Built) -> None:
    """Trous dans la journee : etendue occupee moins creneaux reellement occupes.

    Deux cours a 8h et a 11h laissent deux trous. La preference la plus
    demandee par les etablissements, et la seule qui ne se ramene pas a un
    choix de creneau : elle depend de toutes les seances de la ressource.

    Une journee sans aucune seance ne compte pas : on ne penalise pas l'absence.
    """
    if not data.gap_penalties or not data.days:
        return
    model = b.model
    by_index = {t.index: t for t in tasks}
    position: dict[int, tuple[int, int]] = {}
    for d, slots in enumerate(data.days):
        for rank, slot in enumerate(slots):
            position[slot] = (d, rank)

    for pen in data.gap_penalties:
        if pen.weight <= 0:
            continue
        concerned = [by_index[i] for i in pen.task_indexes if i in by_index]
        if len(concerned) < 2:
            continue  # un seul cours ne peut pas laisser de trou

        for d, slots in enumerate(data.days):
            span = len(slots)
            occupied_terms = []
            first_terms = []
            last_terms = []
            present_here = []
            for t in concerned:
                dur = max(1, t.duration_slots)
                for slot, lit in b.start_literals(t).items():
                    pos = position.get(slot)
                    if pos is None or pos[0] != d:
                        continue
                    rank = pos[1]
                    occupied_terms.append(dur * lit)
                    first_terms.append((rank, lit))
                    last_terms.append((rank + dur, lit))
                    present_here.append(lit)
            if len(present_here) < 2:
                continue

            any_here = model.NewBoolVar(f"any_{d}_{id(pen)}")
            model.Add(sum(present_here) >= 1).OnlyEnforceIf(any_here)
            model.Add(sum(present_here) == 0).OnlyEnforceIf(any_here.Not())

            first = model.NewIntVar(0, span, f"first_{d}_{id(pen)}")
            last = model.NewIntVar(0, span, f"last_{d}_{id(pen)}")
            for rank, lit in first_terms:
                model.Add(first <= rank).OnlyEnforceIf(lit)
            for rank, lit in last_terms:
                model.Add(last >= rank).OnlyEnforceIf(lit)

            gaps = model.NewIntVar(0, span, f"gaps_{d}_{id(pen)}")
            model.Add(gaps >= last - first - sum(occupied_terms))
            model.Add(gaps == 0).OnlyEnforceIf(any_here.Not())
            b.penalties.append((pen.label, pen.weight * gaps))
            b.n_constraints += 1


def _interchangeable_groups(tasks, data: ScheduleInput, fixed_by_room: dict) -> list[tuple[tuple[int, ...], list]]:
    """Groupes de taches se partageant un jeu de salles equivalent et exclusif.

    Trois conditions, toutes necessaires :
      - les taches proposent EXACTEMENT le meme jeu de salles ;
      - aucune autre tache, ni occupation fixe, n'utilise ces salles ;
      - le jeu compte assez de salles pour que la symetrie fasse mal.

    En dessous du seuil, l'affectation nominative reste preferable : elle est
    exacte et le cout est negligeable.
    """
    SEUIL = 6
    by_signature: dict[tuple[int, ...], list] = {}
    for t in tasks:
        if t.locked and t.fixed_room is not None:
            continue
        if len(t.candidate_rooms) < SEUIL:
            continue
        by_signature.setdefault(tuple(sorted(set(t.candidate_rooms))), []).append(t)

    out = []
    for rooms, members in by_signature.items():
        room_set = set(rooms)
        # Exclusivite : personne d'autre ne touche a ces salles.
        used_elsewhere = any(
            set(t.candidate_rooms) & room_set
            for t in tasks
            if t not in members and not (t.locked and t.fixed_room is None)
        ) or any(
            (t.fixed_room in room_set)
            for t in tasks
            if t.locked and t.fixed_room is not None
        ) or any(r in room_set for r in fixed_by_room)
        if used_elsewhere:
            continue
        out.append((rooms, members))
    return out


def _load_limits(data: ScheduleInput, tasks, b: _Built) -> None:
    """Plafonds de charge : « pas plus de N par jour », « pas plus de N a la suite ».

    Ces deux regles ne peuvent pas se traduire par un retrait de creneaux :
    elles portent sur PLUSIEURS seances a la fois. Impossible de savoir, en
    regardant une seance isolee, si elle fera depasser la limite.

    On ne cree des variables que pour les taches reellement visees par un
    plafond. Une ecole qui pose une seule regle sur un professeur paie le prix
    de ses dix-huit seances, pas de celles de tout l'etablissement.
    """
    if not data.load_limits or not data.days:
        return

    model = b.model
    by_index = {t.index: t for t in tasks}
    # Journee de chaque creneau, pour situer un depart.
    day_of_slot: dict[int, int] = {}
    for d, slots in enumerate(data.days):
        for slot in slots:
            day_of_slot[slot] = d

    for limit in data.load_limits:
        concerned = [by_index[i] for i in limit.task_indexes if i in by_index]
        if not concerned:
            continue

        # Une regle dure devient une hypothese : le solveur saura dire si c'est
        # elle qui bloque. Une regle souple n'a pas besoin de ca : elle ne
        # rend jamais rien infaisable.
        rule_lit = None
        if limit.weight is None and limit.label:
            rule_lit = b.rule_lits.get(limit.label)
            if rule_lit is None:
                rule_lit = model.NewBoolVar(f"rule_{len(b.rule_lits)}")
                b.rule_lits[limit.label] = rule_lit

        # « t demarre le jour d » : un booleen par couple (tache, jour possible).
        starts_on_day: dict[tuple[int, int], cp_model.IntVar] = {}
        for t in concerned:
            domain = sorted(set(t.candidate_start_slots)) or (
                [t.fixed_start_slot] if t.fixed_start_slot is not None else []
            )
            days_possible = sorted({day_of_slot[s] for s in domain if s in day_of_slot})
            if not days_possible:
                continue
            lits = []
            for d in days_possible:
                lit = model.NewBoolVar(f"day_{t.index}_{d}")
                starts_on_day[(t.index, d)] = lit
                in_day = [s for s in domain if day_of_slot.get(s) == d]
                out_day = [s for s in domain if day_of_slot.get(s) != d]
                model.AddLinearExpressionInDomain(
                    b.start[t.index], cp_model.Domain.FromValues(in_day)
                ).OnlyEnforceIf(lit)
                if out_day:
                    model.AddLinearExpressionInDomain(
                        b.start[t.index], cp_model.Domain.FromValues(out_day)
                    ).OnlyEnforceIf(lit.Not())
                lits.append(lit)
            # Une seance presente demarre un jour et un seul.
            model.Add(sum(lits) == b.present[t.index])
            b.n_constraints += 1

        if limit.max_per_day is not None and limit.max_per_day >= 0:
            for d in range(len(data.days)):
                terms = [
                    max(1, by_index[i].duration_slots) * lit
                    for (i, day), lit in starts_on_day.items()
                    if day == d
                ]
                if not terms:
                    continue
                if limit.weight is None:
                    c = model.Add(sum(terms) <= limit.max_per_day)
                    if rule_lit is not None:
                        c.OnlyEnforceIf(rule_lit)
                else:
                    # Plafond souple : on mesure le depassement et on le paie.
                    over = model.NewIntVar(0, len(data.days[d]) if d < len(data.days) else 24, f"over_{d}_{id(limit)}")
                    model.Add(over >= sum(terms) - limit.max_per_day)
                    b.penalties.append((limit.label, limit.weight * over))
                b.n_constraints += 1

        if limit.max_consecutive is not None and limit.max_consecutive >= 1:
            _max_consecutive(model, data, concerned, b, limit.max_consecutive, limit.weight, limit.label, rule_lit)


def _max_consecutive(
    model,
    data: ScheduleInput,
    concerned,
    b: _Built,
    maximum: int,
    weight: int | None = None,
    label: str = "",
    rule_lit=None,
) -> None:
    """Pas plus de `maximum` creneaux occupes a la suite, dans une meme journee.

    On construit l'occupation creneau par creneau : « t demarre en s » implique
    qu'il occupe s, s+1, ... jusqu'a sa duree. Puis, sur chaque fenetre de
    maximum+1 creneaux consecutifs d'une journee, on borne la somme.

    La fenetre ne franchit jamais une frontiere de journee : deux seances de
    part et d'autre d'une nuit ne sont pas « a la suite ».
    """
    starts_at: dict[tuple[int, int], cp_model.IntVar] = {}
    for t in concerned:
        for slot, lit in b.start_literals(t).items():
            starts_at[(t.index, slot)] = lit

    by_index = {t.index: t for t in concerned}
    for slots in data.days:
        ordered = list(slots)
        for begin in range(0, max(0, len(ordered) - maximum)):
            window = ordered[begin : begin + maximum + 1]
            terms = []
            for (i, s), lit in starts_at.items():
                dur = max(1, by_index[i].duration_slots)
                covered = sum(1 for w in window if s <= w < s + dur)
                if covered:
                    terms.append(covered * lit)
            if not terms:
                continue
            if weight is None:
                c = model.Add(sum(terms) <= maximum)
                if rule_lit is not None:
                    c.OnlyEnforceIf(rule_lit)
            else:
                over = model.NewIntVar(0, maximum + 1, f"overc_{begin}_{id(terms)}")
                model.Add(over >= sum(terms) - maximum)
                b.penalties.append((label, weight * over))
            b.n_constraints += 1


def _distribute_rooms(b: _Built, assignments: list[Assignment]) -> None:
    """Attribue une salle a chaque cours des groupes interchangeables.

    La contrainte de capacite garantit qu'a tout instant le nombre de cours
    simultanes ne depasse pas le nombre de salles : une salle libre existe donc
    toujours. On balaie les cours par creneau de depart et on prend la premiere
    disponible.
    """
    if not b.interchangeable:
        return
    by_task = {a.task_index: a for a in assignments}

    for rooms, members in b.interchangeable:
        indexes = [t.index for t in members if t.index in by_task]
        if not indexes:
            continue
        # Occupation de chaque salle, creneau par creneau.
        busy: dict[int, set[int]] = {r: set() for r in rooms}
        for i in sorted(indexes, key=lambda x: by_task[x].start_slot):
            a = by_task[i]
            span = set(range(a.start_slot, a.end_slot))
            for r in rooms:
                if not (busy[r] & span):
                    busy[r] |= span
                    a.room = r
                    break


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
    b.model.AddAssumptions(list(b.present.values()) + list(b.rule_lits.values()))

    # La fonction d'objectif : minimiser ce que coutent les preferences non
    # satisfaites. Sans elle, le solveur s'arrete a la PREMIERE solution valide,
    # sans savoir qu'une autre serait meilleure.
    if b.penalties:
        b.model.Minimize(sum(expr for _, expr in b.penalties))

    solver = cp_model.CpSolver()
    _configure(solver, data)
    status = solver.Solve(b.model)
    status_name = _status_name(solver, status, data.timeout_seconds)

    assignments: list[Assignment] = []
    core: list[int] = []
    blocking_rules: list[str] = []
    penalty_total = 0
    details: list[PenaltyDetail] = []
    if status in (cp_model.OPTIMAL, cp_model.FEASIBLE):
        # Ce que chaque preference a reellement coute : c'est ce qui permet de
        # dire « 18 preferences non satisfaites » et lesquelles.
        by_label: dict[str, int] = {}
        for label, expr in b.penalties:
            value = int(solver.Value(expr))
            if value:
                by_label[label] = by_label.get(label, 0) + value
        penalty_total = sum(by_label.values())
        details = [PenaltyDetail(label=k, penalty=v) for k, v in sorted(by_label.items(), key=lambda kv: -kv[1])]

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

        # Salles interchangeables : le solveur a garanti qu'il n'y a jamais
        # plus de cours simultanes que de salles. Il reste a en donner une a
        # chacun — n'importe laquelle de libre fait l'affaire, par definition.
        _distribute_rooms(b, assignments)
    elif status == cp_model.INFEASIBLE:
        suff = set(solver.SufficientAssumptionsForInfeasibility())
        core = sorted(idx for idx, lit in b.present.items() if lit.Index() in suff)
        blocking_rules = sorted(label for label, lit in b.rule_lits.items() if lit.Index() in suff)

    return ScheduleSolution(
        request_id=data.request_id,
        status=status_name,
        assignments=assignments,
        infeasible_core=core,
        blocking_rules=blocking_rules,
        penalty=penalty_total,
        penalty_details=details,
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
    b.model.AddAssumptions(list(b.present.values()) + list(b.rule_lits.values()))
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
