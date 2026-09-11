# Moteur d'emploi du temps

Conception détaillée. Le contrat d'échange TypeScript ↔ Python est figé dans
[`SOLVER_API.md`](./SOLVER_API.md).

---

## 1. Principe

Deux notions **strictement séparées** (§22, additif §6) :

```
TEACHING REQUIREMENT   le besoin pédagogique
                       « 4e3 · Espagnol · 3 h/semaine · 2 séances · groupe Espagnol · Prof X »

SCHEDULE SESSION       la séance placée
                       « Mardi, créneaux 3-4, 08:00-09:50, Salle 12 »
```

Le moteur transforme des exigences en séances. Le reste de l'application ne lit que
`schedule_sessions`, source de vérité unique (additif §24) ; les vues classe, enseignant,
groupe et salle en sont dérivées par des vues SQL.

À la publication, la trame est projetée en `session_occurrences` datées (ADR-002).

---

## 2. Chaîne de traitement

```
UI « Nouvelle génération »
      |
Server Action  schedule.generate
      |  vérifie RBAC, tenant, année, cohérence
      v
pg-boss : job schedule.generate                        ASYNCHRONE dès la V1
      |
 [1] Chargement            une requête par entité, aucune boucle
 [2] Cohérence tenant      tout appartient au même school_id, sinon échec net
 [3] Pré-contrôle          faisabilité arithmétique en TypeScript
      |                    échec ici = diagnostic parfait, sans appeler le solveur
 [4] Candidats             domaines de démarrage, contraintes dures unaires seulement
 [5] ScheduleInput         DTO normalisé, validé par Zod
      v
 solver-service (HTTP, réseau privé, secret partagé)
      |
 [6] Modèle CP-SAT         IntervalVar + NoOverlap par ressource
 [7] Contraintes dures
 [8] Pénalités souples + objectif
 [9] Résolution            plafond de temps configurable
[10] Si INFEASIBLE         second solve sans objectif, hypothèses, noyau minimal
      v
 ScheduleSolution
      |
[11] Validation indépendante en TypeScript   on ne fait pas confiance au solveur
[12] Score et explications en français
[13] Version DRAFT + schedule_conflicts
      v
Écran de résultat -> édition manuelle -> VALIDATED -> PUBLISHED -> occurrences
```

---

## 3. Grille horaire

Aucun jour, aucune heure, aucune durée n'est codée en dur (§23, §24).

`schedule_configurations.working_days` donne les jours ouvrés. `time_slots` donne, **par jour**,
la suite des créneaux d'enseignement. Un mercredi à trois créneaux matinaux et un lundi à six
cohabitent sans traitement particulier.

Les créneaux d'un jour sont numérotés puis **aplatis en un index global** :

```
Lundi     positions 0..5    ->  index 0..5
Mardi     positions 0..5    ->  index 6..11
Mercredi  positions 0..2    ->  index 12..14
...

day_of_index    = [0,0,0,0,0,0, 1,1,1,1,1,1, 2,2,2, ...]
minutes_of_index= [50,50,50,55,50,50, ...]
```

Une séance de 1 h 40 occupe deux créneaux contigus **du même jour**. La contrainte
« ne pas déborder sur le lendemain » n'a pas besoin d'être posée : elle est déjà absente des
domaines de démarrage calculés à l'étape [4].

---

## 4. Pré-contrôle de faisabilité (TypeScript)

C'est la réponse la plus importante à l'additif §29. Il s'exécute **avant** tout appel au
solveur, coûte quelques millisecondes, et produit des explications que CP-SAT ne saura jamais
formuler.

| Contrôle | Message produit |
|---|---|
| Charge enseignant | « M. Kouamé doit assurer 22 h. Ses disponibilités n'en couvrent que 18 h. Il manque 4 h. » |
| Charge classe | « La 4e3 demande 34 h de cours. La grille n'offre que 30 créneaux d'enseignement. » |
| Salle obligatoire | « 5 séances exigent le Laboratoire 1. Il n'est libre que sur 3 créneaux. » |
| Type de salle | « 12 séances exigent une salle informatique. L'établissement en compte 1, soit 30 créneaux pour 12 séances de 2 h. » |
| Capacité | « La 6e1 compte 62 élèves. Aucune salle compatible ne dépasse 45 places. » |
| Jours autorisés | « L'EPS est limitée à 4 jours et à 2 plages, soit 8 créneaux, pour 11 séances demandées. » |
| Domaine vide | « Aucun créneau ne satisfait simultanément la disponibilité de M. Diallo et les jours autorisés pour la Physique. » |
| Verrouillage | « Deux séances verrouillées se chevauchent pour la Salle 12, mardi à 10:00. » |

Un échec au pré-contrôle interrompt la génération et alimente `schedule_conflicts` en
`severity = HARD`. Aucun appel réseau, aucune attente.

---

## 5. Génération des candidats

Uniquement sur les contraintes dures **unaires** (ADR-008, amendement 2). Pré-filtrer sur des
interactions entre séances retirerait des solutions valides.

Pour chaque tâche (une séance à placer), le domaine de démarrage retient les index globaux tels
que :

1. la séance tient entièrement dans la journée ;
2. le jour est ouvré et autorisé pour la matière ;
3. la plage horaire est autorisée pour la matière et pour les cibles ;
4. **tous** les créneaux couverts sont dans la disponibilité de chaque enseignant assigné ;
5. tous les créneaux couverts sont dans la disponibilité de chaque classe et groupe visés ;
6. il existe au moins une salle compatible libre sur toute la durée.

Les salles compatibles sont calculées une fois par tâche : type requis, capacité suffisante,
équipements présents, salle imposée le cas échéant.

**Un domaine vide à ce stade est déjà une infaisabilité**, avec une cause connue et nommée.

---

## 6. Modèle CP-SAT

### Variables

Pour chaque tâche `t` (une séance à placer, issue d'une exigence) :

```python
start[t]  = model.NewIntVarFromDomain(Domain.FromValues(candidates[t]), f"start_{t}")
dur[t]    = constante, en nombre de créneaux
end[t]    = model.NewIntVar(...)
interval[t] = model.NewIntervalVar(start[t], dur[t], end[t], f"itv_{t}")

day[t]    = model.NewIntVar(0, n_days - 1, f"day_{t}")
model.AddElement(start[t], day_of_index, day[t])
```

**L'enseignant et la durée ne sont pas des variables** (ADR-008, amendement 3) : ils viennent de
`teaching_assignments` et de `teaching_requirements`. Le solveur ne décide que du **créneau de
départ** et de la **salle**. Le modèle en est réduit d'un ordre de grandeur.

La salle, quand elle n'est pas imposée :

```python
room_lit[t][r] = model.NewBoolVar(...)                       # r parmi les salles compatibles
model.AddExactlyOne(room_lit[t][r] for r in compatible[t])
room_itv[t][r] = model.NewOptionalIntervalVar(
    start[t], dur[t], end[t], room_lit[t][r], f"itv_{t}_{r}")
```

### Contraintes dures

| Règle | Modélisation |
|---|---|
| Enseignant sans chevauchement (9.1) | `AddNoOverlap` sur les intervalles de chaque enseignant |
| Classe sans chevauchement (9.2) | `AddNoOverlap` par classe, via `schedule_session_targets` |
| Groupe sans chevauchement (9.3) | `AddNoOverlap` par groupe |
| Salle sans chevauchement (9.4) | `AddNoOverlap` sur les intervalles optionnels de chaque salle |
| Disponibilités (9.5, 9.6) | déjà dans les domaines |
| Capacité, type, équipements (9.7-9.9) | déjà dans `compatible[t]` |
| Volume et nombre de séances (9.10, 9.11) | une tâche par séance, créées en amont |
| Durées (9.12) | `dur[t]` constant, éventuellement choisi parmi `allowed_durations` |
| Jours et horaires autorisés (9.13, 9.14) | déjà dans les domaines |
| Séances verrouillées (9.15) | `start` et salle fixés ; l'intervalle occupe quand même ses ressources |
| Simultanéité obligatoire (9.16) | `model.Add(start[a] == start[b])` |
| Cours commun (9.17) | **une seule tâche** ciblant plusieurs groupes, jamais des tâches jumelles |
| Charge quotidienne | `on_day[t][d]` réifié, puis somme des durées par (ressource, jour) ≤ limite |
| Séances consécutives | pour chaque fenêtre de K+1 créneaux d'un jour, somme des occupations ≤ K |
| Espacement de deux séances d'une matière | `AddAbsEquality` sur l'écart de `day[]`, puis borne inférieure |
| Antériorité A avant B | `day[a] < day[b]`, ou `end[a] <= start[b]` à jour égal |

### Le point clé sur les groupes (§16, §29)

Le conflit de classe n'est **pas** posé sur la classe, mais sur l'**ensemble d'élèves réellement
concerné**. Pour chaque tâche, on calcule sa cible effective :

- séance visant une classe entière -> ressource « classe C » ;
- séance visant un ou plusieurs groupes -> ressources « groupe G1 », « groupe G2 »… **et** la
  classe C uniquement si le groupe couvre toute la classe.

Conséquence directe, et c'est exactement le comportement attendu :

```
4e3 – Espagnol  (groupe ESP, Prof A, Salle 10)   mardi 08:00
4e3 – Allemand  (groupe ALL, Prof B, Salle 12)   mardi 08:00     AUTORISÉ

4e3 – Maths     (classe entière)                 mardi 08:00
4e3 – Espagnol  (groupe ESP)                     mardi 08:00     REFUSÉ
                les élèves du groupe ESP appartiennent à la 4e3
```

Ce second refus est posé par une contrainte de recouvrement : si un groupe est inclus dans une
classe, toute séance de la classe entière et toute séance du groupe partagent une ressource
implicite. Elle est calculée à la préparation, à partir de `group_classes`.

### Contraintes souples et objectif

Chaque contrainte souple produit une variable de pénalité pondérée :

```python
penalties = []
# salle préférée non obtenue
penalties.append(weight_preferred_room * (1 - room_lit[t][preferred]))
# dernier créneau de la journée évité
penalties.append(weight_avoid_last * is_last_slot[t])
# séances d'une même matière trop rapprochées
penalties.append(weight_spacing * spacing_shortfall[t1][t2])
# écart de charge quotidienne d'un enseignant
penalties.append(weight_balance * load_deviation[teacher][day])
# trous dans la journée d'une classe
penalties.append(weight_gaps * gap_count[class][day])

model.Minimize(sum(penalties))
```

Les poids viennent de `schedule_constraints.weight`, jamais du code.

---

## 7. Registre de contraintes

Une contrainte se déclare à un seul endroit (additif §47). En ajouter une ne touche ni le
schéma, ni les autres contraintes.

```ts
// src/features/schedule/constraints/registry.ts
export type ConstraintDefinition = {
  code: ConstraintCode;
  label: string;                       // « Éviter le dernier créneau de la journée »
  defaultSeverity: 'HARD' | 'SOFT';
  defaultWeight: number;
  scopeTypes: ScopeType[];             // où elle peut s'appliquer
  parameters: z.ZodType;               // forme validée du jsonb
  validate: (ctx, sessions) => Violation[];   // validation indépendante, étape [11]
  explain: (violation) => string;             // phrase française pour un directeur
};
```

Codes prévus au seed :

```
Dures
TEACHER_NO_OVERLAP        CLASS_NO_OVERLAP          GROUP_NO_OVERLAP
ROOM_NO_OVERLAP           TEACHER_UNAVAILABILITY    ROOM_UNAVAILABILITY
ROOM_TYPE_REQUIRED        ROOM_CAPACITY             ROOM_FEATURES_REQUIRED
SUBJECT_ALLOWED_DAYS      SUBJECT_FORBIDDEN_DAYS
SUBJECT_ALLOWED_TIME_RANGE SUBJECT_FORBIDDEN_TIME_RANGE
MAX_DAILY_HOURS_TEACHER   MAX_DAILY_HOURS_CLASS
MAX_CONSECUTIVE_TEACHER   MAX_CONSECUTIVE_CLASS
MAX_DAILY_SESSIONS_CLASS  SESSIONS_SIMULTANEOUS     SESSIONS_NOT_SIMULTANEOUS
SESSION_BEFORE            SESSION_AFTER             MIN_GAP_BETWEEN_SESSIONS
LOCKED_SESSION

Souples
PREFERRED_ROOM            PREFERRED_DAY             PREFERRED_TIME_RANGE
AVOID_LAST_PERIOD         AVOID_FIRST_PERIOD        BALANCE_TEACHER_LOAD
BALANCE_CLASS_LOAD        MINIMIZE_CLASS_GAPS       MINIMIZE_TEACHER_GAPS
SPREAD_SUBJECT_SESSIONS   TEACHER_PREFERRED_SLOTS   TEACHER_AVOID_SLOTS
```

### L'exemple EPS du §28 n'est pas du code

Il se compose de deux lignes dans `schedule_constraints` :

```json
{ "constraint_code": "SUBJECT_ALLOWED_DAYS",
  "scope_type": "SUBJECT", "scope_id": "<EPS>", "severity": "HARD",
  "parameters": { "days": [1, 2, 4, 5] } }

{ "constraint_code": "SUBJECT_FORBIDDEN_TIME_RANGE",
  "scope_type": "SUBJECT", "scope_id": "<EPS>", "severity": "HARD",
  "parameters": { "ranges": [{ "from": "09:20", "to": "11:10" }] } }
```

La même mécanique s'applique à n'importe quelle matière de n'importe quel établissement.

---

## 8. Diagnostic d'infaisabilité

Trois niveaux, du moins cher au plus coûteux.

**Niveau 1 — pré-contrôle arithmétique.** Section 4. Capte la majorité des cas réels.

**Niveau 2 — domaines vides.** Détecté à la génération des candidats, avec la cause exacte.

**Niveau 3 — noyau d'infaisabilité CP-SAT.** Quand le modèle est globalement infaisable sans
qu'aucun contrôle local ne l'explique.

```python
# Solve dédié, SANS objectif, pour éviter toute interaction hypothèses / optimisation
diag = model.Clone()
diag.ClearObjective()

assumptions = {}
for group in relaxable_hard_groups:          # une par famille de contrainte et par ressource
    lit = diag.NewBoolVar(f"assume_{group.key}")
    group.apply(diag, enforce_if=lit)
    assumptions[lit.Index()] = group
diag.AddAssumptions(list(assumptions))

solver.Solve(diag)
if solver.StatusName() == "INFEASIBLE":
    core = solver.SufficientAssumptionsForInfeasibility()
    causes = [assumptions[i] for i in core]   # sous-ensemble suffisant
```

Le noyau est ensuite traduit par les `explain()` du registre :

```
Aucune solution ne respecte les contraintes obligatoires.

Causes identifiées :
1. M. Kouamé est requis 22 h et n'est disponible que 18 h.
2. Le Laboratoire 1 est obligatoire pour 5 séances mais n'est libre que 3 créneaux.
3. La 4e3 a besoin de 6 séances sur les créneaux restants, il n'en reste que 5.

Pistes :
• élargir la disponibilité de M. Kouamé le jeudi après-midi ;
• autoriser une salle alternative pour la Physique de la 3e2 ;
• passer « éviter le dernier créneau » en préférence plutôt qu'en obligation.
```

Jamais de `BoolVar conflict at index 1432` côté utilisateur (additif §30). Les identifiants
techniques restent dans `schedule_generation_jobs.diagnostics`, consultables par le Super Admin.

---

## 9. Validation indépendante (étape 11)

Le résultat du solveur est **revérifié en TypeScript**, sans réutiliser la moindre ligne du
modèle Python (additif §31). Un désaccord entre les deux est un bug bloquant, pas un
avertissement.

Vérifié : chevauchements enseignant, classe, groupe, salle ; recouvrement groupe/classe ;
volumes hebdomadaires ; nombre de séances ; durées ; disponibilités ; type, capacité et
équipements des salles ; jours et plages autorisés ; séances verrouillées inchangées ;
appartenance de **toutes** les entités au même `school_id`.

Une violation dure détectée ici marque le job `FAILED` : la version `DRAFT` n'est pas proposée.

---

## 10. Score

```
Contraintes obligatoires : 100 %      binaire, jamais partiel
Préférences              :  94 %      1 - (pénalité obtenue / pénalité maximale)
Score global             :  94.2
```

Toujours accompagné du détail :

```
Préférences non satisfaites
• 2 enseignants dépassent leur préférence de charge quotidienne
• 1 matière n'a pas obtenu son jour préféré
• 3 séances utilisent une salle alternative
```

---

## 11. Statuts du solveur

| Statut | Signification | Comportement |
|---|---|---|
| `OPTIMAL` | Optimum prouvé | Version DRAFT créée |
| `FEASIBLE` | Solution valide, optimalité non prouvée | Version DRAFT créée |
| `TIME_LIMIT` | Plafond atteint | Meilleure solution connue si elle existe, sinon diagnostic |
| `INFEASIBLE` | Aucune solution respectant les contraintes dures | Diagnostic de niveau 3 |
| `UNKNOWN` | Indéterminé | Diagnostic, invitation à relever le plafond de temps |

`solver_timeout_seconds` est configurable par établissement (30 / 60 / 120 / 300).

---

## 12. Édition manuelle

Le moteur ne remplace pas la main de l'administrateur (additif §55). Les deux modes écrivent
dans `schedule_sessions` et passent par le **même validateur**.

Actions : déplacer par glisser-déposer, changer d'enseignant, de salle, de créneau, verrouiller,
déverrouiller, dupliquer, supprimer.

Après chaque geste, validation immédiate et affichage du conflit :

```
⚠ Conflit enseignant — M. Kouamé enseigne déjà en 3e2 sur ce créneau.
⚠ Conflit salle — la Salle 12 est occupée par la 5e1.
⚠ Capacité — la 6e1 (62 élèves) dépasse la Salle 8 (45 places).
```

Le déplacement est refusé s'il crée une violation dure, ou accepté avec avertissement s'il ne
dégrade qu'une préférence. Le choix relève de `school_settings.schedule.manual_edit_policy`.

---

## 13. Versions et publication

```
Version publiée (intacte)
        |
   Créer une version         DRAFT
        |
   Génération ou saisie manuelle
        |
   Conflits analysés, corrections
        |
   VALIDATED                 gelée, plus de génération dessus
        |
   PUBLISHED                 l'ancienne passe en ARCHIVED
        |
   job schedule.materialize  -> session_occurrences datées
```

Une génération ne touche **jamais** la version publiée (additif §61) : elle crée toujours un
`DRAFT`. La publication est transactionnelle : nouvelle version publiée, ancienne archivée,
occurrences futures régénérées, occurrences passées conservées à l'identique — un appel déjà
fait ne doit jamais être réécrit par une republication.

---

## 14. Génération partielle

L'architecture ne l'interdit pas (additif §34). Le `ScheduleInput` porte un champ `scope` :
`SCHOOL`, `LEVEL`, `CLASS`, `SUBJECT`. Hors périmètre, les séances existantes sont injectées
comme **intervalles fixes** occupant leurs ressources : elles contraignent sans être déplacées.
Seul `SCHOOL` est exposé dans l'interface de la V1 ; les autres sont prêts côté modèle.

---

## 15. Observabilité

Chaque génération porte un `generation_id` et enregistre dans `schedule_generation_jobs` :
établissement, année, demandeur, horodatages, durée, nombre de variables et de contraintes,
statut solveur, score, nombre de séances, diagnostics, erreurs.
Jamais de secret, jamais de donnée personnelle inutile (additif §39).

---

## 16. Tests

Les 14 cas de l'additif §48 sont implémentés en pytest côté solveur **et** en Vitest côté
validateur indépendant : les deux implémentations doivent conclure identiquement.

```
 1  Un enseignant, deux cours simultanés                    infaisable
 2  Deux classes, deux enseignants                          faisable
 3  Deux groupes de langues, même classe, même créneau,
    enseignants et salles différents                        faisable
 4  Même groupe, deux cours simultanés                      infaisable
 5  Salle obligatoire déjà occupée                          conflit dur
 6  Salle préférée occupée                                  repli sur une autre salle
 7  Enseignant indisponible                                 créneau exclu du domaine
 8  Volume horaire impossible                               INFEASIBLE + explication
 9  Séance verrouillée                                      position et salle inchangées
10  Deux établissements                                     aucune donnée croisée
11  Plusieurs enseignants pour une matière                  volumes individuels respectés
12  Cours commun à plusieurs groupes                        une seule séance, plusieurs cibles
13  Durée personnalisée (1 h 40)                            occupe deux créneaux contigus
14  Préférence souple                                       violable si nécessaire
```

Jeux de régression `SMALL` (5 classes), `MEDIUM` (20), `LARGE` (50+). Mesurés à chaque CI :
temps, variables, contraintes, score, mémoire. Une dérive de performance échoue la CI.

---

## 17. Résilience

Si `solver-service` est injoignable : le job passe en `FAILED` avec le code
`SOLVER_UNAVAILABLE`, l'interface affiche « Le moteur de génération est temporairement
indisponible », et **aucune donnée existante n'est touchée**. La version publiée reste intacte
(additif §54). L'édition manuelle demeure entièrement disponible : elle ne dépend pas de Python.
