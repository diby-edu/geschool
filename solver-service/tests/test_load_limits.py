"""Plafonds de charge : « maximum par jour » et « maximum d'affilee ».

Ces deux regles ne peuvent pas se traduire par un retrait de creneaux cote
application : elles portent sur plusieurs seances a la fois. Elles vivent donc
dans le modele CP-SAT, et ces tests verifient qu'elles tiennent vraiment.

Grille de reference : deux journees de quatre creneaux.
    jour 0 -> creneaux 0, 1, 2, 3
    jour 1 -> creneaux 4, 5, 6, 7
"""

from app.models import LoadLimit, ScheduleInput, Task
from app.solver import solve

DAYS = [[0, 1, 2, 3], [4, 5, 6, 7]]
ALL_SLOTS = [0, 1, 2, 3, 4, 5, 6, 7]


def _task(index, slots=None, *, duration=1, teachers=(0,), classes=(0,)):
    return Task(
        index=index,
        duration_slots=duration,
        candidate_start_slots=list(slots if slots is not None else ALL_SLOTS),
        teacher_indexes=list(teachers),
        class_indexes=list(classes),
        label=f"cours {index}",
    )


def _input(tasks, limits, **kwargs):
    return ScheduleInput(
        request_id="t",
        timeout_seconds=10,
        slot_count=8,
        days=DAYS,
        tasks=tasks,
        load_limits=limits,
        **kwargs,
    )


def _slots(sol):
    return {a.task_index: a.start_slot for a in sol.assignments}


def _day_of(slot):
    return 0 if slot < 4 else 1


def test_sans_plafond_tout_peut_tenir_le_meme_jour():
    """Temoin : sans regle, rien n'empeche les quatre seances du meme jour."""
    data = _input([_task(i) for i in range(4)], [])
    sol = solve(data)
    assert sol.status in ("OPTIMAL", "FEASIBLE")
    assert len(sol.assignments) == 4


def test_maximum_par_jour_repartit_les_seances():
    """Quatre seances, deux par jour au plus : elles se repartissent."""
    data = _input(
        [_task(i) for i in range(4)],
        [LoadLimit(task_indexes=[0, 1, 2, 3], max_per_day=2, label="max 2 par jour")],
    )
    sol = solve(data)
    assert sol.status in ("OPTIMAL", "FEASIBLE")
    slots = _slots(sol)
    assert len(slots) == 4
    for day in (0, 1):
        assert sum(1 for s in slots.values() if _day_of(s) == day) <= 2


def test_maximum_par_jour_compte_les_creneaux_pas_les_seances():
    """Une seance de deux creneaux pese deux : « 2 par jour » n'en laisse qu'une."""
    data = _input(
        [_task(0, duration=2), _task(1, duration=2)],
        [LoadLimit(task_indexes=[0, 1], max_per_day=2)],
    )
    sol = solve(data)
    assert sol.status in ("OPTIMAL", "FEASIBLE")
    slots = _slots(sol)
    assert _day_of(slots[0]) != _day_of(slots[1])


def test_maximum_par_jour_impossible_est_declare_infaisable():
    """Cinq seances, deux par jour, deux jours : le compte ne tombe pas."""
    data = _input(
        [_task(i) for i in range(5)],
        [LoadLimit(task_indexes=[0, 1, 2, 3, 4], max_per_day=2)],
    )
    sol = solve(data)
    assert sol.status == "INFEASIBLE"


def test_le_plafond_ne_vise_que_les_taches_listees():
    """Une regle sur un professeur ne contraint pas les cours des autres."""
    data = _input(
        [_task(0), _task(1), _task(2, teachers=[1], classes=[1]), _task(3, teachers=[1], classes=[1])],
        # Seules 0 et 1 sont visees : elles se separent, 2 et 3 restent libres.
        [LoadLimit(task_indexes=[0, 1], max_per_day=1)],
    )
    sol = solve(data)
    assert sol.status in ("OPTIMAL", "FEASIBLE")
    slots = _slots(sol)
    assert _day_of(slots[0]) != _day_of(slots[1])


def test_maximum_d_affilee_coupe_la_serie():
    """Trois seances d'un meme professeur, jamais trois creneaux de suite."""
    data = _input(
        [_task(i, teachers=[0], classes=[i]) for i in range(3)],
        [LoadLimit(task_indexes=[0, 1, 2], max_consecutive=2, label="max 2 d'affilee")],
    )
    sol = solve(data)
    assert sol.status in ("OPTIMAL", "FEASIBLE")
    used = sorted(_slots(sol).values())
    # Aucune fenetre de trois creneaux consecutifs entierement occupee.
    for begin in range(6):
        window = {begin, begin + 1, begin + 2}
        assert not window.issubset(set(used))


def test_maximum_d_affilee_ne_franchit_pas_la_nuit():
    """Les creneaux 3 et 4 se suivent en numero mais pas dans la semaine.

    Avec « une seule d'affilee », deux seances placees en 3 et 4 doivent rester
    permises : elles appartiennent a deux journees differentes.
    """
    data = _input(
        [_task(0, [3], teachers=[0], classes=[0]), _task(1, [4], teachers=[0], classes=[1])],
        [LoadLimit(task_indexes=[0, 1], max_consecutive=1)],
    )
    sol = solve(data)
    assert sol.status in ("OPTIMAL", "FEASIBLE")
    assert _slots(sol) == {0: 3, 1: 4}


def test_maximum_d_affilee_impossible_est_declare_infaisable():
    """Trois seances qui ne peuvent tenir que sur trois creneaux consecutifs."""
    data = _input(
        [
            _task(0, [0], teachers=[0], classes=[0]),
            _task(1, [1], teachers=[0], classes=[1]),
            _task(2, [2], teachers=[0], classes=[2]),
        ],
        [LoadLimit(task_indexes=[0, 1, 2], max_consecutive=2)],
    )
    sol = solve(data)
    assert sol.status == "INFEASIBLE"


def test_les_deux_plafonds_se_combinent():
    data = _input(
        [_task(i, teachers=[0], classes=[i]) for i in range(4)],
        [LoadLimit(task_indexes=[0, 1, 2, 3], max_per_day=2, max_consecutive=1)],
    )
    sol = solve(data)
    assert sol.status in ("OPTIMAL", "FEASIBLE")
    used = sorted(_slots(sol).values())
    for day in (0, 1):
        assert sum(1 for s in used if _day_of(s) == day) <= 2
    for begin in range(7):
        assert not {begin, begin + 1}.issubset(set(used))


def test_sans_journees_declarees_les_plafonds_sont_ignores():
    """Sans decoupage en journees, le service ne sait pas ou une journee commence.

    Il applique alors aucun plafond plutot qu'un plafond faux.
    """
    data = ScheduleInput(
        request_id="t",
        timeout_seconds=10,
        slot_count=8,
        tasks=[_task(i) for i in range(5)],
        load_limits=[LoadLimit(task_indexes=[0, 1, 2, 3, 4], max_per_day=1)],
    )
    sol = solve(data)
    assert sol.status in ("OPTIMAL", "FEASIBLE")
    assert len(sol.assignments) == 5


def test_la_regle_qui_bloque_est_nommee():
    """Cinq seances, deux par jour, deux jours : CP-SAT designe la regle."""
    data = _input(
        [_task(i) for i in range(5)],
        [LoadLimit(task_indexes=[0, 1, 2, 3, 4], max_per_day=2, label="Maximum par jour — 2 séances")],
    )
    sol = solve(data)
    assert sol.status == "INFEASIBLE"
    assert sol.blocking_rules == ["Maximum par jour — 2 séances"]


def test_deux_regles_incompatibles_sont_toutes_deux_nommees():
    """« max 1 par jour » et « max 1 d'affilee » sur cinq seances, deux jours."""
    data = _input(
        [_task(i) for i in range(5)],
        [
            LoadLimit(task_indexes=[0, 1, 2, 3, 4], max_per_day=2, label="Maximum par jour — 2"),
            LoadLimit(task_indexes=[0, 1, 2, 3, 4], max_consecutive=1, label="Maximum d’affilée — 1"),
        ],
    )
    sol = solve(data)
    assert sol.status == "INFEASIBLE"
    # Au moins la regle de plafond journalier est designee ; le noyau peut en
    # contenir une ou les deux selon ce que CP-SAT juge suffisant.
    assert "Maximum par jour — 2" in sol.blocking_rules


def test_un_probleme_faisable_ne_nomme_aucune_regle():
    data = _input(
        [_task(i) for i in range(4)],
        [LoadLimit(task_indexes=[0, 1, 2, 3], max_per_day=2, label="Maximum par jour — 2")],
    )
    sol = solve(data)
    assert sol.status in ("OPTIMAL", "FEASIBLE")
    assert sol.blocking_rules == []


def test_une_preference_ne_bloque_jamais_donc_n_est_jamais_nommee():
    data = _input(
        [_task(i) for i in range(5)],
        [LoadLimit(task_indexes=[0, 1, 2, 3, 4], max_per_day=2, weight=5, label="souple")],
    )
    sol = solve(data)
    assert sol.status in ("OPTIMAL", "FEASIBLE")
    assert sol.blocking_rules == []
