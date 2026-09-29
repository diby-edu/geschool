"""Fonction d'objectif : le solveur ne se contente plus d'une solution valide.

Sans objectif, CP-SAT s'arrete a la premiere solution faisable. Avec, il
cherche celle qui coute le moins en preferences non satisfaites. Ces tests
verifient que le cout est reel : une solution sans penalite existe et c'est
elle qui est choisie, et quand aucune ne l'evite, le cout est annonce.

Grille : deux journees de quatre creneaux (0-3 et 4-7).
"""

from app.models import GapPenalty, LoadLimit, ScheduleInput, SlotPenalty, Task
from app.solver import solve

DAYS = [[0, 1, 2, 3], [4, 5, 6, 7]]


def _task(index, slots, *, duration=1, teachers=(0,), classes=(0,)):
    return Task(
        index=index,
        duration_slots=duration,
        candidate_start_slots=list(slots),
        teacher_indexes=list(teachers),
        class_indexes=list(classes),
        label=f"cours {index}",
    )


def _input(tasks, **kwargs):
    return ScheduleInput(request_id="t", timeout_seconds=10, slot_count=8, days=DAYS, tasks=tasks, **kwargs)


def _slots(sol):
    return {a.task_index: a.start_slot for a in sol.assignments}


def test_sans_preference_le_score_est_nul():
    sol = solve(_input([_task(0, [0, 1, 2])]))
    assert sol.status in ("OPTIMAL", "FEASIBLE")
    assert sol.penalty == 0
    assert sol.penalty_details == []


def test_un_creneau_deconseille_est_evite_quand_c_est_possible():
    """Le cours peut tenir en 0 ou en 2 ; 0 est deconseille, il ira en 2."""
    sol = solve(
        _input(
            [_task(0, [0, 2])],
            slot_penalties=[SlotPenalty(task_indexes=[0], slots=[0], weight=5, label="plutôt le matin")],
        )
    )
    assert sol.status == "OPTIMAL"
    assert _slots(sol) == {0: 2}
    assert sol.penalty == 0


def test_un_creneau_deconseille_est_paye_quand_il_n_y_a_pas_le_choix():
    sol = solve(
        _input(
            [_task(0, [0])],
            slot_penalties=[SlotPenalty(task_indexes=[0], slots=[0], weight=5, label="plutôt le matin")],
        )
    )
    assert sol.status == "OPTIMAL"
    assert sol.penalty == 5
    assert sol.penalty_details == [{"label": "plutôt le matin", "penalty": 5}] or sol.penalty_details[0].penalty == 5


def test_le_poids_arbitre_entre_deux_preferences():
    """Deux cours, un seul creneau libre de penalite : le plus lourd le prend."""
    sol = solve(
        _input(
            [_task(0, [0, 1], classes=[0]), _task(1, [0, 1], classes=[1])],
            slot_penalties=[
                SlotPenalty(task_indexes=[0], slots=[1], weight=20, label="lourde"),
                SlotPenalty(task_indexes=[1], slots=[1], weight=1, label="légère"),
            ],
        )
    )
    assert sol.status == "OPTIMAL"
    # La preference lourde est respectee : le cours 0 evite le creneau 1.
    assert _slots(sol)[0] == 0
    assert sol.penalty == 1


def test_les_trous_sont_evites():
    """Trois cours d'une meme classe, quatre creneaux : ils se collent."""
    sol = solve(
        _input(
            [_task(i, [0, 1, 2, 3], classes=[0], teachers=[i]) for i in range(3)],
            gap_penalties=[GapPenalty(task_indexes=[0, 1, 2], weight=10, label="trous de la 6ème 1")],
        )
    )
    assert sol.status == "OPTIMAL"
    used = sorted(_slots(sol).values())
    # Trois creneaux consecutifs, donc aucun trou.
    assert used[2] - used[0] == 2
    assert sol.penalty == 0


def test_un_trou_inevitable_est_compte():
    """Deux cours qui ne peuvent tenir qu'aux extremites : un trou de deux."""
    sol = solve(
        _input(
            [_task(0, [0], classes=[0], teachers=[0]), _task(1, [3], classes=[0], teachers=[1])],
            gap_penalties=[GapPenalty(task_indexes=[0, 1], weight=10, label="trous")],
        )
    )
    assert sol.status == "OPTIMAL"
    # Etendue 0 -> 4 (quatre rangs), deux creneaux occupes : deux trous.
    assert sol.penalty == 20


def test_une_journee_sans_cours_ne_compte_aucun_trou():
    sol = solve(
        _input(
            [_task(0, [0], classes=[0], teachers=[0]), _task(1, [1], classes=[0], teachers=[1])],
            gap_penalties=[GapPenalty(task_indexes=[0, 1], weight=10, label="trous")],
        )
    )
    assert sol.status == "OPTIMAL"
    assert sol.penalty == 0


def test_un_plafond_souple_se_depasse_en_le_payant():
    """Trois cours, deux par jour au plus, mais un seul jour disponible."""
    sol = solve(
        _input(
            [_task(i, [0, 1, 2], classes=[i], teachers=[i]) for i in range(3)],
            load_limits=[
                LoadLimit(task_indexes=[0, 1, 2], max_per_day=2, weight=7, label="max 2 par jour")
            ],
        )
    )
    assert sol.status == "OPTIMAL"
    assert len(sol.assignments) == 3
    assert sol.penalty == 7  # un creneau au-dela du plafond


def test_un_plafond_dur_reste_dur_meme_avec_un_objectif():
    """Sans poids, le plafond ne se negocie pas : le probleme est infaisable."""
    sol = solve(
        _input(
            [_task(i, [0, 1, 2], classes=[i], teachers=[i]) for i in range(3)],
            load_limits=[LoadLimit(task_indexes=[0, 1, 2], max_per_day=2, label="max 2 par jour")],
            slot_penalties=[SlotPenalty(task_indexes=[0], slots=[0], weight=1, label="bruit")],
        )
    )
    assert sol.status == "INFEASIBLE"


def test_le_detail_nomme_chaque_preference():
    sol = solve(
        _input(
            [_task(0, [0], classes=[0], teachers=[0]), _task(1, [3], classes=[0], teachers=[1])],
            slot_penalties=[SlotPenalty(task_indexes=[0], slots=[0], weight=3, label="matin")],
            gap_penalties=[GapPenalty(task_indexes=[0, 1], weight=5, label="trous")],
        )
    )
    assert sol.status == "OPTIMAL"
    labels = {d.label: d.penalty for d in sol.penalty_details}
    assert labels["matin"] == 3
    assert labels["trous"] == 10  # deux trous a 5
    assert sol.penalty == 13
