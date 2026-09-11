# Contrat solveur — TypeScript ↔ Python

Frontière entre l'application et `solver-service`. Ce contrat est **figé** : le service Python
ne connaît ni Supabase, ni le métier, ni les identifiants réels. Il reçoit un problème
d'ordonnancement normalisé et rend une solution.

Toute évolution incompatible incrémente `contract_version`.

```
Application  ->  ScheduleService  ->  ScheduleSolver (interface)
                                          |
                                     OrToolsSolver
                                          |  HTTP, réseau privé
                                     solver-service (FastAPI)
```

---

## 1. Interface TypeScript

```ts
// src/features/schedule/solver/types.ts
export interface ScheduleSolver {
  health(): Promise<SolverHealth>;
  solve(input: ScheduleInput, signal?: AbortSignal): Promise<ScheduleSolution>;
  diagnose(input: ScheduleInput): Promise<InfeasibilityReport>;
}
```

Trois implémentations possibles à terme (additif §57). Une seule existe :
`OrToolsSolver`. Aucun module métier n'importe autre chose que l'interface.

---

## 2. Transport

| Point | Valeur |
|---|---|
| Base | `SOLVER_SERVICE_URL`, ex. `http://solver:8000` |
| Exposition | réseau privé uniquement, jamais Internet |
| Authentification | en-tête `X-Solver-Secret: <SOLVER_SHARED_SECRET>`, comparaison à temps constant |
| Corrélation | en-tête `X-Request-Id`, repris dans tous les journaux |
| Taille maximale | 8 Mo de corps de requête, refus en `413` au-delà |
| Délai HTTP | `solver_timeout_seconds + 30 s` |
| Encodage | JSON UTF-8 |

### Points d'entrée

| Méthode | Chemin | Rôle |
|---|---|---|
| `GET` | `/health` | Vivacité, version d'OR-Tools, version de contrat |
| `POST` | `/solve` | Résolution complète avec optimisation |
| `POST` | `/diagnose` | Noyau d'infaisabilité, sans objectif |
| `POST` | `/validate` | Vérification d'un modèle sans résolution |

---

## 3. Identifiants

Le service Python ne manipule **jamais** d'UUID. L'application convertit en index compacts avant
l'appel et conserve la table de correspondance (additif §38).

```
teacherIndex  0..T-1        classIndex  0..C-1
groupIndex    0..G-1        roomIndex   0..R-1
subjectIndex  0..S-1        slotIndex   0..N-1   (grille aplatie, section 3 de SCHEDULE_ENGINE)
taskIndex     0..K-1
```

Deux bénéfices : modèle CP-SAT plus compact, et aucune donnée identifiante ne franchit la
frontière — le solveur ne voit ni nom d'élève, ni nom d'enseignant, ni `school_id`.

---

## 4. `ScheduleInput`

```jsonc
{
  "contractVersion": "1.0.0",
  "requestId": "b3f1…",
  "scope": "SCHOOL",                     // SCHOOL | LEVEL | CLASS | SUBJECT

  "grid": {
    "days": [1, 2, 3, 4, 5],             // ISO 1=lundi ; aucun jour codé en dur
    "slotCount": 32,                     // total de la grille aplatie
    "dayOfSlot":     [0,0,0,0,0,0, 1,1,1,1,1,1, ...],
    "minutesOfSlot": [50,50,50,55,50,50, ...],
    "positionOfSlot":[0,1,2,3,4,5, 0,1,2,3,4,5, ...],
    "lastSlotOfDay": [5, 11, 14, ...]
  },

  "resources": {
    "teachers": [
      { "index": 0, "availableSlots": [0,1,2,6,7,8], "maxDailyMinutes": 360,
        "maxConsecutiveSlots": 4, "maxWeeklyMinutes": 1200 }
    ],
    "classes": [
      { "index": 0, "size": 62, "availableSlots": [0,1,...], "maxDailyMinutes": 420,
        "maxDailySessions": 7 }
    ],
    "groups": [
      { "index": 0, "size": 18, "classIndexes": [0], "availableSlots": [0,1,...] }
    ],
    "rooms": [
      { "index": 0, "capacity": 45, "typeIndex": 2, "featureIndexes": [1,3],
        "availableSlots": [0,1,...] }
    ]
  },

  "tasks": [
    {
      "index": 0,
      "requirementId": 12,               // index d'exigence, pas un UUID
      "subjectIndex": 4,
      "durationSlots": 2,
      "teacherIndexes": [3],             // plusieurs = co-enseignement, même séance
      "classIndexes": [0],               // cibles effectives
      "groupIndexes": [],                // plusieurs = cours commun
      "candidateStartSlots": [0, 3, 6, 9, 12],   // domaine pré-filtré, contraintes unaires
      "candidateRooms": [0, 2, 5],
      "preferredRoom": 2,
      "requiredRoom": null,
      "locked": false,
      "fixedStartSlot": null,            // renseigné si locked
      "fixedRoom": null,
      "priority": 100
    }
  ],

  "fixedOccupations": [                  // hors périmètre d'une génération partielle
    { "startSlot": 4, "durationSlots": 2, "teacherIndexes": [1],
      "classIndexes": [3], "groupIndexes": [], "roomIndex": 7 }
  ],

  "constraints": [
    { "code": "MAX_DAILY_HOURS_TEACHER", "severity": "HARD", "weight": 0,
      "scope": { "type": "TEACHER", "index": 3 }, "parameters": { "maxMinutes": 300 } },

    { "code": "SESSIONS_SIMULTANEOUS", "severity": "HARD", "weight": 0,
      "scope": { "type": "TASKS", "indexes": [7, 8] }, "parameters": {} },

    { "code": "MIN_GAP_BETWEEN_SESSIONS", "severity": "SOFT", "weight": 30,
      "scope": { "type": "TASKS", "indexes": [2, 3] }, "parameters": { "minDays": 2 } },

    { "code": "AVOID_LAST_PERIOD", "severity": "SOFT", "weight": 10,
      "scope": { "type": "SUBJECT", "index": 4 }, "parameters": {} }
  ],

  "overlapPairs": [                      // recouvrement groupe/classe précalculé
    { "a": { "type": "GROUP", "index": 0 }, "b": { "type": "CLASS", "index": 0 } }
  ],

  "options": {
    "timeoutSeconds": 120,
    "workers": 4,
    "randomSeed": 42,                    // reproductibilité en test
    "optimizationProfile": "BALANCED",   // FAST | BALANCED | THOROUGH
    "preferencesEnabled": true,
    "keepLockedSessions": true
  }
}
```

Validé par **Zod** côté TypeScript avant l'envoi, et par **Pydantic v2** côté Python à la
réception. Aucune des deux ne fait confiance à l'autre (additif §5).

---

## 5. `ScheduleSolution`

```jsonc
{
  "contractVersion": "1.0.0",
  "requestId": "b3f1…",
  "status": "FEASIBLE",                  // OPTIMAL | FEASIBLE | INFEASIBLE | TIME_LIMIT | UNKNOWN

  "assignments": [
    { "taskIndex": 0, "startSlot": 6, "endSlot": 8, "dayIndex": 1, "roomIndex": 2 }
  ],

  "score": {
    "hardSatisfied": true,
    "softRatio": 0.94,
    "globalScore": 94.2,
    "penaltyObtained": 320,
    "penaltyMaximum": 5300
  },

  "softViolations": [
    { "code": "PREFERRED_ROOM", "taskIndexes": [4, 9, 17], "weight": 20, "penalty": 60,
      "detail": { "expectedRoom": 2, "actualRooms": [5, 5, 8] } },
    { "code": "MAX_DAILY_HOURS_TEACHER", "teacherIndexes": [3, 11], "weight": 15,
      "penalty": 90, "detail": { "overByMinutes": [50, 40] } }
  ],

  "hardViolations": [],                  // toujours vide si status OPTIMAL ou FEASIBLE

  "statistics": {
    "variables": 4821,
    "constraints": 9134,
    "branches": 182043,
    "conflicts": 3120,
    "wallTimeMs": 38412,
    "solutionsFound": 7
  }
}
```

`hardViolations` non vide avec un statut `OPTIMAL` ou `FEASIBLE` est une **incohérence
bloquante** : l'application marque le job `FAILED` et ne propose aucune version.

---

## 6. `InfeasibilityReport`

Réponse de `/diagnose`, et de `/solve` quand le statut est `INFEASIBLE`.

```jsonc
{
  "status": "INFEASIBLE",
  "cores": [
    {
      "constraintCodes": ["TEACHER_UNAVAILABILITY", "MAX_DAILY_HOURS_TEACHER"],
      "scope": { "type": "TEACHER", "index": 3 },
      "taskIndexes": [12, 13, 14],
      "detail": { "requiredMinutes": 1320, "availableMinutes": 1080 }
    }
  ],
  "emptyDomains": [
    { "taskIndex": 22, "reason": "NO_CANDIDATE_SLOT",
      "detail": { "afterTeacherAvailability": 0, "afterAllowedDays": 4 } }
  ],
  "statistics": { "wallTimeMs": 5120 }
}
```

Le service Python renvoie des **faits structurés**, jamais de phrase. La traduction en français
lisible par un directeur est faite côté TypeScript par les `explain()` du registre de
contraintes : c'est là que vivent les noms réels des enseignants, des salles et des classes,
que Python n'a jamais reçus.

---

## 7. Erreurs

```jsonc
{
  "error": {
    "code": "SOLVER_INVALID_INPUT",
    "message": "tasks[3].candidateStartSlots est vide",
    "details": [{ "path": "tasks.3.candidateStartSlots", "issue": "empty" }]
  }
}
```

| Code | HTTP | Sens |
|---|---|---|
| `SOLVER_INVALID_INPUT` | 422 | Le payload ne respecte pas le contrat |
| `SOLVER_CONTRACT_MISMATCH` | 409 | `contractVersion` incompatible |
| `SOLVER_PAYLOAD_TOO_LARGE` | 413 | Au-delà de 8 Mo |
| `SOLVER_UNAUTHORIZED` | 401 | Secret partagé absent ou invalide |
| `SOLVER_TIMEOUT` | 504 | Dépassement du délai HTTP |
| `SOLVER_INTERNAL` | 500 | Défaillance interne, trace côté serveur uniquement |

Jamais de trace d'exception dans une réponse (additif §53).

Côté application, l'erreur est traduite en `ScheduleGenerationError` typée et le job passe en
`FAILED` avec un message compréhensible. La version publiée n'est jamais affectée.

---

## 8. `/health`

```jsonc
{
  "status": "ok",
  "contractVersion": "1.0.0",
  "ortoolsVersion": "9.x",
  "pythonVersion": "3.12.10",
  "maxWorkers": 4
}
```

Sondé par le worker avant chaque génération, et par la supervision du VPS.

---

## 9. Cohérence des deux schémas

Le contrat existe en deux exemplaires : Zod côté TypeScript, Pydantic côté Python. Ils peuvent
diverger, et cette divergence serait silencieuse.

Garde-fou en CI :

1. `scripts/gen-solver-schema.mjs` exporte le schéma Zod en JSON Schema
   (`solver-service/contract/schedule_input.schema.json`) ;
2. `pytest` charge ce fichier et vérifie que les modèles Pydantic l'acceptent intégralement ;
3. un jeu de payloads de référence (`tests/fixtures/solver/*.json`) est validé par **les deux**
   côtés ;
4. toute différence fait échouer la CI.

---

## 10. Sécurité du service Python

- Écoute sur `127.0.0.1` ou sur le réseau interne Docker ; jamais de port publié.
- Secret partagé obligatoire, comparé en temps constant.
- Aucune variable d'environnement Supabase n'est fournie au conteneur : le solveur n'a
  structurellement aucun moyen d'atteindre la base.
- Validation stricte des entrées, plafond de taille, plafond de temps, plafond de mémoire.
- Journaux structurés sans donnée personnelle : le service n'en reçoit aucune.
- Utilisateur non privilégié dans l'image, système de fichiers en lecture seule.
