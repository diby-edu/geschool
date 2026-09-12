"""Contrat d'echange avec l'application (voir docs/SOLVER_API.md).

Le service Python ne connait ni Supabase, ni le metier, ni les identifiants
reels : il recoit des INDICES compacts et rend une solution en indices.
L'application fait la correspondance indice <-> uuid de son cote.

Le transport est en camelCase (aligne sur le TypeScript). Les modeles acceptent
aussi le snake_case en entree (populate_by_name) et serialisent en camelCase.
"""

from __future__ import annotations

from pydantic import BaseModel, ConfigDict, Field


def _camel(s: str) -> str:
    head, *rest = s.split("_")
    return head + "".join(w.capitalize() for w in rest)


class _Model(BaseModel):
    model_config = ConfigDict(alias_generator=_camel, populate_by_name=True)


class Task(_Model):
    """Une seance a placer.

    Une exigence de N seances produit N taches. La duree est exprimee en
    nombre de creneaux consecutifs (grille uniforme, cf. SCHEDULE_ENGINE §3).
    """

    index: int
    duration_slots: int = 1
    # Creneaux de depart autorises (deja pre-filtres cote application :
    # disponibilites enseignant/classe, jours permis, tenue dans la journee).
    # Un domaine vide = tache impossible d'entree de jeu.
    candidate_start_slots: list[int] = Field(default_factory=list)
    # Salles compatibles. Vide = aucune salle a affecter.
    candidate_rooms: list[int] = Field(default_factory=list)
    teacher_indexes: list[int] = Field(default_factory=list)
    # Cibles « classe entiere » (espace d'index des classes).
    class_indexes: list[int] = Field(default_factory=list)
    # Cibles « groupe » (espace d'index des groupes). Deux groupes d'une meme
    # classe peuvent etre simultanes ; un groupe et sa classe entiere non (§30).
    group_indexes: list[int] = Field(default_factory=list)
    # Seance verrouillee : ni le creneau ni la salle ne bougent (§35).
    locked: bool = False
    fixed_start_slot: int | None = None
    fixed_room: int | None = None
    priority: int = 100
    label: str = ""


class FixedOccupation(_Model):
    """Occupation hors perimetre d'une generation partielle : bloque des
    ressources sans etre une tache a placer (une version publiee voisine, un
    cours verrouille d'un autre niveau...)."""

    start_slot: int
    duration_slots: int = 1
    teacher_indexes: list[int] = Field(default_factory=list)
    class_indexes: list[int] = Field(default_factory=list)
    group_indexes: list[int] = Field(default_factory=list)
    room_index: int | None = None


class ScheduleInput(_Model):
    contract_version: str = "1.0.0"
    request_id: str
    slot_count: int
    room_count: int = 0
    # groupe -> classes parentes (un groupe peut regrouper plusieurs classes,
    # §16). Les cles JSON sont des chaines.
    group_parent_classes: dict[str, list[int]] = Field(default_factory=dict)
    timeout_seconds: int = 30
    workers: int = 1
    random_seed: int = 42
    tasks: list[Task] = Field(default_factory=list)
    fixed_occupations: list[FixedOccupation] = Field(default_factory=list)


class Assignment(_Model):
    task_index: int
    start_slot: int
    end_slot: int  # exclusif : start_slot + duration_slots
    room: int  # -1 si aucune salle


class SolveStatistics(_Model):
    variables: int = 0
    constraints: int = 0
    branches: int = 0
    conflicts: int = 0
    wall_time_ms: int = 0
    solutions_found: int = 0


class ScheduleSolution(_Model):
    contract_version: str = "1.0.0"
    request_id: str
    status: str  # OPTIMAL | FEASIBLE | INFEASIBLE | TIME_LIMIT | UNKNOWN
    assignments: list[Assignment] = Field(default_factory=list)
    # Taches au domaine de creneaux vide (impossibles avant meme de resoudre).
    empty_domain_tasks: list[int] = Field(default_factory=list)
    # Sous-ensemble suffisant de taches qui, ensemble, rendent le probleme
    # insoluble (noyau d'infaisabilite, via les hypotheses CP-SAT). Vide si le
    # probleme est faisable ou si seul un domaine vide est en cause.
    infeasible_core: list[int] = Field(default_factory=list)
    statistics: SolveStatistics = Field(default_factory=SolveStatistics)


class ErrorResponse(_Model):
    error: dict
