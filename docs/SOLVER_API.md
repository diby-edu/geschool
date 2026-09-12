# Contrat solveur — TypeScript ↔ Python

Frontière entre l'application et `solver-service`. Le service Python ne connaît ni Supabase, ni le
métier, ni les identifiants réels : il reçoit un problème d'ordonnancement **normalisé en indices**
et rend une solution en indices. L'application détient seule la table de correspondance
indice ↔ uuid.

```
Application  ->  generateSchedule()  ->  ScheduleSolver (interface)
                                              |
                                         OrToolsSolver
                                              |  HTTP, réseau privé
                                         solver-service (FastAPI + OR-Tools CP-SAT)
```

Le contrat est versionné (`contractVersion`). La version actuelle est **`1.0.0`**. Toute évolution
incompatible l'incrémente. Ce document décrit **ce qui est réellement implémenté** ; les extensions
prévues sont listées en fin de document (§10) et ne sont pas encore livrées.

---

## 1. Interface TypeScript

```ts
// src/features/schedule/solver/types.ts
export interface ScheduleSolver {
  health(): Promise<SolverHealth>;
  solve(input: ScheduleInput, signal?: AbortSignal): Promise<ScheduleSolution>;
  diagnose(input: ScheduleInput, signal?: AbortSignal): Promise<ScheduleSolution>;
}
```

Une seule implémentation existe : `OrToolsSolver` (client HTTP). La fabrique `getSolver()` est le
point d'injection unique ; aucun module métier n'importe une implémentation concrète (additif §57).

---

## 2. Transport

| Point | Valeur |
|---|---|
| Base | `SOLVER_SERVICE_URL`, ex. `http://127.0.0.1:8110` |
| Exposition | réseau privé / `127.0.0.1` uniquement, jamais Internet |
| Authentification | en-tête `X-Solver-Secret: <SOLVER_SHARED_SECRET>`, comparaison à temps constant (`hmac.compare_digest`) |
| Corrélation | en-tête `X-Request-Id` (= `requestId` du corps) |
| Délai HTTP | `timeoutSeconds + 30 s` côté client (le solveur atteint sa propre limite avant la coupure) |
| Taille maximale | 5000 tâches, refus en `413` au-delà |
| Encodage | JSON UTF-8, **camelCase** |

Le service accepte aussi le snake_case en entrée (Pydantic `populate_by_name`) mais répond toujours
en camelCase.

### Points d'entrée

| Méthode | Chemin | Rôle |
|---|---|---|
| `GET`  | `/health`   | Vivacité, versions (OR-Tools, Python, contrat), nb de workers |
| `POST` | `/solve`    | Résolution ; renvoie une solution, ou un diagnostic si infaisable |
| `POST` | `/diagnose` | Diagnostic d'infaisabilité seul (domaines vides + noyau), sans placement |

---

## 3. Identifiants

Le service ne manipule **jamais** d'UUID. L'application convertit en index compacts avant l'appel :

```
teacherIndex  0..T-1     classIndex  0..C-1     groupIndex  0..G-1
roomIndex     0..R-1     slotIndex   0..N-1     taskIndex   0..K-1
```

`slotIndex` est l'indice sur la **grille aplatie** : les créneaux d'enseignement sont ordonnés par
`(jour, position)`. Comme la grille est uniforme (chaque créneau dure `default_session_minutes`),
une tâche de durée *d* occupe *d* créneaux consécutifs. Les jours ont des plages d'indices
disjointes, et l'application ne propose comme départ que des créneaux où la tâche tient dans la
journée — donc aucun recouvrement inter-jours involontaire.

---

## 4. `ScheduleInput`

```jsonc
{
  "contractVersion": "1.0.0",
  "requestId": "b3f1…",
  "slotCount": 20,                 // total de la grille aplatie
  "roomCount": 3,                  // nombre d'index de salle distincts
  "timeoutSeconds": 60,            // borne le temps solveur (ADR-014)
  "workers": 1,                    // 1 sur le VPS mono-vCPU
  "randomSeed": 42,                // reproductibilité

  // groupe -> classes parentes (un groupe peut couvrir plusieurs classes, §16).
  // Sert la règle §30 : un groupe et sa classe entière ne peuvent coexister,
  // mais deux groupes d'une même classe le peuvent.
  "groupParentClasses": { "0": [0], "1": [0] },

  "tasks": [
    {
      "index": 0,
      "durationSlots": 1,
      "candidateStartSlots": [0, 1, 2, 6, 7],  // domaine pré-filtré (dispos, jours, tenue dans la journée)
      "candidateRooms": [0, 2],                // vide = aucune salle à affecter
      "teacherIndexes": [3],                   // plusieurs = co-enseignement (même séance)
      "classIndexes": [0],                     // cibles « classe entière »
      "groupIndexes": [],                      // cibles « groupe »
      "locked": false,
      "fixedStartSlot": null,                  // renseigné si locked
      "fixedRoom": null,                       // renseigné si locked
      "priority": 100,
      "label": "Maths 4e1"                     // pour le diagnostic uniquement
    }
  ],

  "fixedOccupations": [                        // ressources déjà occupées (hors périmètre)
    { "startSlot": 4, "durationSlots": 2, "teacherIndexes": [1],
      "classIndexes": [3], "groupIndexes": [], "roomIndex": 7 }
  ]
}
```

Validé par **Zod** côté TypeScript avant l'envoi, et par **Pydantic v2** côté Python à la réception.
Aucune des deux ne fait confiance à l'autre (additif §5).

---

## 5. `ScheduleSolution`

```jsonc
{
  "contractVersion": "1.0.0",
  "requestId": "b3f1…",
  "status": "OPTIMAL",              // OPTIMAL | FEASIBLE | INFEASIBLE | TIME_LIMIT | UNKNOWN

  "assignments": [
    { "taskIndex": 0, "startSlot": 6, "endSlot": 8, "room": 2 }  // endSlot exclusif ; room = -1 si aucune
  ],

  // Diagnostic (rempli quand le statut n'est pas OPTIMAL/FEASIBLE) :
  "emptyDomainTasks": [22],         // tâches sans aucun créneau candidat (impossibles d'entrée)
  "infeasibleCore": [12, 13, 14],   // sous-ensemble suffisant de tâches qui, ensemble, rendent le problème insoluble

  "statistics": {
    "variables": 4821, "constraints": 913, "branches": 18204,
    "conflicts": 312, "wallTimeMs": 384, "solutionsFound": 1
  }
}
```

Le **noyau d'infaisabilité** est obtenu par les hypothèses CP-SAT
(`SufficientAssumptionsForInfeasibility`) : chaque tâche porte un littéral de présence supposé vrai ;
si le problème est insoluble, le solveur rend le sous-ensemble de tâches responsable. Le service rend
des **faits structurés en indices**, jamais de phrase : la traduction en français lisible (noms réels
des enseignants et des classes) est faite côté TypeScript par `generateSchedule`, seul détenteur de
ces noms (§6 ci-dessous).

---

## 6. Diagnostic lisible (côté application)

`generateSchedule` traduit le diagnostic avant affichage, et le stocke **déjà traduit** dans
`schedule_generation_jobs.diagnostics` (le service Python n'a jamais reçu les noms). Deux niveaux :

1. **Vérification arithmétique**, côté TypeScript, **avant** tout appel solveur (ADR-014 : ne pas
   gaspiller de temps CPU sur une impossibilité évidente) :
   - un enseignant dont le besoin dépasse ses créneaux disponibles ;
   - une classe dont le besoin dépasse la grille ;
   - une exigence sans aucun créneau compatible.
   Exemple rendu : « Enseignant KOFFI Awa : 40 créneaux nécessaires, 20 disponibles. »

2. **Noyau d'infaisabilité** du solveur, traduit en liste d'enseignements incompatibles, quand
   l'arithmétique ne suffit pas à expliquer.

---

## 7. Erreurs

| Code HTTP | Sens |
|---|---|
| `401` | Secret partagé absent ou invalide |
| `413` | Trop de tâches (> 5000) |
| `422` | Le corps ne respecte pas le contrat (Pydantic) |
| `500` | Défaillance interne — trace côté serveur uniquement, jamais dans la réponse |

Côté application, l'erreur est traduite en `SolverError` typée (`UNAVAILABLE`, `UNAUTHORIZED`,
`INVALID_INPUT`, `CONTRACT_MISMATCH`, `TIMEOUT`, `INTERNAL`) et le job passe en `FAILED` avec un
message compréhensible. **La version publiée n'est jamais affectée** (additif §61) : une génération
produit toujours une nouvelle version `DRAFT`.

---

## 8. `/health`

```jsonc
{ "status": "ok", "contractVersion": "1.0.0", "ortoolsVersion": "9.11.4210",
  "pythonVersion": "3.12.10", "maxWorkers": 8 }
```

Sondé avant chaque génération et par la supervision.

---

## 9. Contraintes dures modélisées (v1.0.0)

- **NoOverlap par enseignant** : un enseignant ne fait qu'un cours à la fois (co-enseignement =
  plusieurs `teacherIndexes` sur une même tâche → bloque tous ces enseignants).
- **NoOverlap par classe entière** et **par groupe**, plus la règle §30 (classe entière ⟂ chacun de
  ses groupes ; deux groupes d'une même classe autorisés simultanément).
- **NoOverlap par salle**, avec choix d'**au plus une salle** parmi les candidates par tâche.
- **Durées multi-créneaux** (intervalles de taille `durationSlots`).
- **Séances verrouillées** (`locked`) : créneau et salle fixes, jamais déplacés (§35).
- **Occupations fixes** : ressources bloquées hors périmètre de la génération.
- **Disponibilités enseignant** (pré-filtrées en `candidateStartSlots` par l'application) :
  `UNAVAILABLE` soustrait ; si un enseignant déclare des plages `AVAILABLE`, il n'est disponible que
  dans celles-ci ; `PREFERRED`/`AVOID` sont douces et ignorées en v1.0.0.

Le solveur cherche la **faisabilité** (toute solution qui respecte les contraintes dures). Il n'y a
pas encore d'objectif d'optimisation des préférences — voir §10.

---

## 10. Feuille de route du contrat (non encore livré)

Ces éléments sont **volontairement absents** de la v1.0.0 pour tenir la promesse « ce qui est
déclaré est réellement fonctionnel ». Ils feront l'objet d'une v1.1 incrémentant `contractVersion` :

- **Optimisation des contraintes souples** : registre `schedule_constraints` (poids, sévérité SOFT),
  objectif pondéré CP-SAT, `score` et `softViolations` dans la solution ; préférence de salle
  (`PREFERRED`) réellement optimisée ; `AVOID_LAST_PERIOD`, `MIN_GAP_BETWEEN_SESSIONS`,
  `MAX_DAILY_HOURS_TEACHER`, etc.
- **`allowedDurations`** : séances de longueurs mixtes au sein d'une même exigence.
- **Endpoint `/validate`** : vérification d'un modèle sans résolution.
- **Noyau d'infaisabilité enrichi** : codes de contraintes et détails chiffrés par cœur.
- **Garde-fou de cohérence des schémas en CI** : export du schéma Zod en JSON Schema et validation
  croisée par un jeu de payloads de référence des deux côtés.

En attendant, la cohérence des deux schémas (Zod / Pydantic) est couverte par des tests unitaires de
part et d'autre (`src/features/schedule/solver/contract.test.ts`, `solver-service/tests/`).

---

## 11. Sécurité du service Python

- Écoute sur `127.0.0.1` (ou réseau interne Docker) ; jamais de port publié — le préfixe `127.0.0.1:`
  est obligatoire pour ne pas contourner UFW (ADR-014, DEPLOYMENT).
- Secret partagé obligatoire en production, comparé à temps constant.
- **Aucune variable Supabase** n'est fournie au conteneur : le solveur n'a structurellement aucun
  moyen d'atteindre la base.
- Validation stricte des entrées, plafond de taille et de temps.
- Journaux sans donnée personnelle : le service n'en reçoit aucune (indices seulement).
