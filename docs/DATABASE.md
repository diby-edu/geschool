# Modèle de données

PostgreSQL 15+ sur Supabase. Schéma `public` pour les données métier, schéma `app` pour les
fonctions de sécurité. RLS activée **et forcée** sur toute table portant un `school_id`.

Conventions appliquées partout :

- clés primaires `uuid` avec `default gen_random_uuid()` ;
- `school_id uuid not null references schools(id) on delete cascade` sur toute table tenant ;
- `created_at`, `updated_at` en `timestamptz not null default now()`, `updated_at` maintenu par
  trigger ; `created_by`, `updated_by` en `uuid references users(id)` sur les tables métier ;
- suppression logique (`deleted_at`) sur les entités porteuses d'historique : élèves, enseignants,
  classes, notes. Suppression physique ailleurs ;
- énumérations en types `enum` PostgreSQL quand la liste est fermée et stable, en table de
  référence quand l'établissement doit pouvoir l'étendre ;
- tout index tenant commence par `school_id`.

---

## 1. Plateforme et établissements

### `platform_admins`
Le Super Admin n'est pas un rôle d'établissement (ADR-007).

| Colonne | Type | Notes |
|---|---|---|
| `user_id` | uuid PK | `references users(id)` |
| `is_active` | bool | |
| `granted_by` | uuid | |
| `granted_at`, `revoked_at` | timestamptz | |

### `schools`

| Colonne | Type | Notes |
|---|---|---|
| `id` | uuid PK | |
| `slug` | citext **unique** | segment d'URL, `[a-z0-9-]{3,40}`, immuable après création |
| `name`, `short_name` | text | raison sociale, sigle |
| `school_type` | enum | `PRIMARY`, `SECONDARY`, `HIGH_SCHOOL`, `TECHNICAL`, `MIXED`, `OTHER` |
| `status` | enum | `PENDING`, `ACTIVE`, `SUSPENDED`, `ARCHIVED` |
| `logo_url`, `favicon_url` | text | |
| `primary_color`, `secondary_color` | text | hex validé par contrainte |
| `address`, `city`, `region` | text | |
| `country_code` | char(2) | `CI` par défaut |
| `phone_e164`, `email`, `website` | text | |
| `director_name` | text | affiché sur les documents officiels |
| `registration_number` | text | identifiant administratif national |
| `currency` | char(3) | `XOF` |
| `locale` | text | `fr-CI` |
| `timezone` | text | `Africa/Abidjan` |
| `created_at`, `updated_at` | timestamptz | |

`status = SUSPENDED` bloque toute écriture des membres, la lecture restant possible :
appliqué par `app.school_is_writable(school_id)` dans les policies d'écriture.

### `school_settings` (ADR-012)

| Colonne | Type |
|---|---|
| `school_id` | uuid, PK partielle |
| `namespace` | enum `academic`, `grading`, `attendance`, `schedule`, `reporting`, `notifications`, `access` |
| `settings` | jsonb not null default `'{}'` |
| `updated_at`, `updated_by` | |

`PRIMARY KEY (school_id, namespace)`. Les défauts sont dans le code, la base ne stocke que
les écarts.

### `school_branding_templates`
Modèles PDF par établissement : `school_id`, `kind` (`REPORT_CARD`, `CERTIFICATE`, `LIST`,
`SCHEDULE`, `TRANSCRIPT`), `name`, `layout jsonb`, `is_default`.

---

## 2. Identités, appartenances, RBAC

### `users`
Miroir applicatif de `auth.users`, alimenté par un trigger sur insertion.

| Colonne | Type | Notes |
|---|---|---|
| `id` | uuid PK | = `auth.users.id` |
| `auth_email` | citext unique | email réel **ou** synthétique (ADR-005) |
| `first_name`, `last_name`, `display_name` | text | |
| `contact_email` | citext | email réel affichable, peut être nul |
| `phone_e164` | text | |
| `avatar_url` | text | |
| `locale` | text | |
| `status` | enum | `ACTIVE`, `SUSPENDED`, `DISABLED` |
| `last_login_at` | timestamptz | |

Cette table n'est **pas** tenant : un utilisateur existe au niveau plateforme. Son rattachement
passe par `school_memberships`. La RLS n'y autorise que la lecture de soi, des membres de ses
propres établissements, et tout pour le Super Admin.

### `school_memberships`

| Colonne | Type | Notes |
|---|---|---|
| `id` | uuid PK | |
| `school_id`, `user_id` | uuid | **`UNIQUE (school_id, user_id)`** |
| `status` | enum | `INVITED`, `ACTIVE`, `SUSPENDED`, `DISABLED` |
| `job_title` | text | libellé libre pour le personnel administratif |
| `joined_at`, `disabled_at` | timestamptz | |

Index critique : `(user_id, school_id, status)` — il est sollicité par chaque policy RLS.

### `roles`

| Colonne | Type | Notes |
|---|---|---|
| `id` | uuid PK | |
| `school_id` | uuid **nullable** | `NULL` = modèle système partagé |
| `code` | text | `SCHOOL_ADMIN`, `DIRECTOR`, `CENSOR`, `SECRETARY`, `SUPERVISOR`, `TEACHER`, `PARENT`, `STUDENT`, `ACCOUNTANT` |
| `name`, `description` | text | |
| `is_system` | bool | un rôle système n'est ni renommable ni supprimable |
| `level` | enum | `PLATFORM`, `SCHOOL` |

`UNIQUE (coalesce(school_id, '0…0'::uuid), code)`. Un établissement peut cloner un rôle système
pour en ajuster les permissions sans toucher au modèle.

### `permissions`
Catalogue global, non tenant. `code` (`students.view`), `module`, `action`, `description`,
`is_platform_only`. Liste complète dans [`RBAC.md`](./RBAC.md).

### `role_permissions`
`role_id`, `permission_id`, `default_scope` (enum `scope_type`). `PRIMARY KEY (role_id, permission_id)`.

### `membership_roles`
`membership_id`, `role_id`. Un membre peut cumuler des rôles (un censeur qui enseigne).

### `membership_scope_grants`
Exceptions explicites de périmètre, en complément des scopes dérivés du métier.

| Colonne | Type | Notes |
|---|---|---|
| `membership_id` | uuid | |
| `permission_id` | uuid nullable | `NULL` = s'applique à toutes les permissions du membre |
| `scope_type` | enum | `SCHOOL`, `CYCLE`, `LEVEL`, `CLASS`, `GROUP`, `SUBJECT` |
| `scope_id` | uuid | |

Exemple : un censeur responsable uniquement des niveaux 6e et 5e.

---

## 3. Gestion des accès (additif comptes)

### `account_access`
Cycle de vie d'un compte **dans un établissement**. Les trois dimensions restent séparées
(additif §24).

| Colonne | Type | Notes |
|---|---|---|
| `id` | uuid PK | |
| `school_id`, `user_id` | uuid | **`UNIQUE (school_id, user_id)`** |
| `subject_kind` | enum | `STAFF`, `TEACHER`, `GUARDIAN`, `STUDENT` |
| `login_kind` | enum | `EMAIL`, `PHONE`, `MATRICULE` |
| `login_identifier` | citext | téléphone E.164, matricule, ou email |
| `account_status` | enum | `CREATED`, `ACTIVE`, `SUSPENDED`, `DISABLED` |
| `activation_status` | enum | `NOT_ACTIVATED`, `ACTIVATED` |
| `must_change_password` | bool | |
| `activated_at`, `last_password_change_at`, `last_reset_at` | timestamptz | |
| `reset_count`, `delivery_count` | int | |
| `created_by` | uuid | |

**`UNIQUE (school_id, login_identifier)`** — l'exigence exacte de l'additif §5, rendue possible
par l'email synthétique (ADR-005). Aucun secret n'est stocké ici.

### `credential_delivery_batches`
`id`, `school_id`, `requested_by`, `total`, `sent`, `failed`, `status`, `created_at`.

### `credential_deliveries`
File d'envoi des identifiants. **Ne contient jamais le mot de passe** (ADR-006).

| Colonne | Type | Notes |
|---|---|---|
| `id` | uuid PK | |
| `school_id`, `user_id` | uuid | |
| `batch_id` | uuid nullable | |
| `reason` | enum | `INITIAL`, `RESET`, `RESEND` |
| `channel` | enum | `SMS`, `WHATSAPP`, `EMAIL`, `PRINT` |
| `recipient` | text | téléphone E.164 figé au moment de la demande |
| `status` | enum | `PENDING`, `PROCESSING`, `SENT`, `DELIVERED`, `FAILED`, `CANCELLED` |
| `attempts`, `max_attempts` | int | |
| `last_attempt_at`, `next_attempt_at` | timestamptz | repli exponentiel |
| `error_code`, `error_message` | text | |
| `provider`, `provider_message_id` | text | |
| `sent_at`, `delivered_at` | timestamptz | |
| `idempotency_key` | text | **`UNIQUE (school_id, idempotency_key)`** |
| `requested_by` | uuid | |

Index : `(status, next_attempt_at)` pour le worker, `(school_id, status)` pour les compteurs.

### `access_events`
Historique par compte (additif §23). `school_id`, `user_id`, `event_type` (`ACCOUNT_CREATED`,
`CREDENTIALS_QUEUED`, `CREDENTIALS_SENT`, `CREDENTIALS_DELIVERED`, `CREDENTIALS_FAILED`,
`ACCOUNT_ACTIVATED`, `PASSWORD_CHANGED`, `PASSWORD_RESET`, `ACCOUNT_SUSPENDED`,
`ACCOUNT_REACTIVATED`, `PHONE_CHANGED`), `actor_id`, `metadata jsonb`, `created_at`.
**Aucun mot de passe, jamais.**

---

## 4. Année scolaire et calendrier

### `academic_years`
`school_id`, `name` (« 2026-2027 »), `starts_on`, `ends_on`, `status`
(`DRAFT`, `ACTIVE`, `CLOSED`, `ARCHIVED`), `is_current`, `settings jsonb`.

Index unique partiel : `UNIQUE (school_id) WHERE is_current` — une seule année courante.
Un trigger refuse toute écriture sur les données rattachées à une année `CLOSED` ou `ARCHIVED`
(§11), sauf action explicite d'un `SCHOOL_ADMIN` porteur de `academic_years.reopen`.

### `academic_periods` (absorbe `grading_periods`, ADR-011)
`school_id`, `academic_year_id`, `name` (« 1er trimestre »), `sequence`, `kind`
(`TERM`, `SEMESTER`, `QUARTER`), `starts_on`, `ends_on`, `is_grading_period`, `weight`,
`status` (`OPEN`, `GRADING`, `LOCKED`, `PUBLISHED`).

### `school_calendar_events`
`school_id`, `academic_year_id`, `kind` (`HOLIDAY`, `VACATION`, `PUBLIC_HOLIDAY`, `EXAM`,
`EVENT`, `CLOSURE`), `name`, `starts_on`, `ends_on`, `blocks_schedule bool`.

C'est cette table qui pilote la génération des `session_occurrences` (ADR-002).

---

## 5. Structure pédagogique

```
cycles  ->  levels  ->  classes
                            |
                        groups (transverses, via group_classes)
```

- **`cycles`** — `school_id`, `code`, `name`, `sequence`.
- **`levels`** — `school_id`, `cycle_id`, `code` (`6E`), `name`, `sequence`.
- **`classes`** — `school_id`, `academic_year_id`, `level_id`, `code` (`6E1`), `name`, `capacity`,
  `head_teacher_id` (professeur principal), `main_room_id`, `status`.
  `UNIQUE (school_id, academic_year_id, code)`.
- **`groups`** — `school_id`, `academic_year_id`, `code`, `name`, `kind`
  (`LANGUAGE`, `OPTION`, `ACTIVITY`, `PEDAGOGICAL`, `SUPPORT`, `OTHER`), `subject_id` nullable,
  `max_size`, `status`.
- **`group_classes`** — `group_id`, `class_id`. Un groupe peut couvrir plusieurs classes
  (« Espagnol 4e » sur 4e1, 4e2, 4e3) ou une seule (« 4e3 – Espagnol »). Ce niveau de généralité
  coûte une table et couvre les deux cas du §16 sans concept de dédoublement.
- **`student_groups`** — `school_id`, `student_id`, `group_id`, `academic_year_id`, `joined_at`,
  `left_at`. `UNIQUE (student_id, group_id, academic_year_id)`.

---

## 6. Élèves, responsables, personnel

### `students`

| Colonne | Notes |
|---|---|
| `school_id`, `user_id` nullable | le compte peut ne pas encore exister (inscription hors ligne) |
| `matricule` | **`UNIQUE (school_id, matricule)`**, format configurable `ELV-{YYYY}-{SEQ}` |
| `first_name`, `last_name`, `middle_names` | |
| `gender` | enum `M`, `F`, `OTHER` |
| `birth_date`, `birth_place`, `nationality` | |
| `photo_url`, `address`, `phone_e164`, `email` | |
| `status` | `ACTIVE`, `TRANSFERRED`, `GRADUATED`, `DROPPED`, `SUSPENDED`, `ARCHIVED` |
| `notes`, `medical_notes` | |
| `deleted_at` | |

### `student_enrollments`
La classe d'un élève est **par année** ; c'est ici, jamais sur `students`.

`school_id`, `student_id`, `academic_year_id`, `class_id`, `enrolled_on`, `is_repeating`,
`status` (`ENROLLED`, `TRANSFERRED_OUT`, `WITHDRAWN`, `COMPLETED`), `left_on`, `left_reason`.
`UNIQUE (student_id, academic_year_id)`.

### `guardians`
`school_id`, `user_id` nullable, `first_name`, `last_name`, `gender`,
`phone_e164` (**`UNIQUE (school_id, phone_e164)`**), `phone_display`, `secondary_phone_e164`,
`email`, `address`, `profession`, `status`.

L'unicité du téléphone est la clé du « rechercher ou créer » de l'additif §4 : un deuxième
enfant du même père réutilise la ligne existante, jamais un doublon.

### `student_guardians`
`school_id`, `student_id`, `guardian_id`, `relationship` (`FATHER`, `MOTHER`, `TUTOR`,
`LEGAL_GUARDIAN`, `SIBLING`, `OTHER`), `is_legal_guardian`, `is_primary_contact`,
`can_pick_up`, `receives_notifications`. `UNIQUE (student_id, guardian_id)`.

C'est cette table, et elle seule, qui définit le périmètre de lecture d'un parent. Un père lié à
Jean, Marie et Paul les voit tous trois ; une mère liée à Jean et Marie ne voit pas Paul.

### `teachers`
`school_id`, `user_id` nullable, `staff_number` (**`UNIQUE (school_id, staff_number)`**),
`first_name`, `last_name`, `gender`, `phone_e164`, `email`, `hire_date`, `employment_type`
(`PERMANENT`, `CONTRACT`, `HOURLY`, `INTERN`), `specialty`, `status`,
`weekly_hours_min`, `weekly_hours_max`, `deleted_at`.

Un enseignant appartient à **un seul** établissement (§73).

### `teacher_subjects`
`teacher_id`, `subject_id`, `is_primary` — qualifications, distinctes des affectations.

### `teacher_availability`
`school_id`, `teacher_id`, `academic_year_id`, `day_of_week` (1-7 ISO), `starts_at`, `ends_at`,
`kind` (`AVAILABLE`, `UNAVAILABLE`, `PREFERRED`, `AVOID`), `reason`, `valid_from`, `valid_to`.

`UNAVAILABLE` est une contrainte dure du solveur, `AVOID` une contrainte souple.

---

## 7. Matières et affectations

### `subjects`
`school_id`, `code`, `name`, `short_name`, `category`, `color`, `default_coefficient`,
`is_active`. `UNIQUE (school_id, code)`.

### `level_subjects` — le programme par niveau
`school_id`, `level_id`, `subject_id`, `coefficient`, `weekly_minutes`, `is_mandatory`.
C'est le gabarit à partir duquel les `teaching_requirements` d'une classe sont proposés.

### `teaching_assignments` — qui enseigne quoi, à qui
`school_id`, `academic_year_id`, `teacher_id`, `subject_id`, `class_id` nullable,
`group_id` nullable, `weekly_minutes`, `academic_period_id` nullable, `status`.

Contrainte : `class_id IS NOT NULL OR group_id IS NOT NULL`.

Le cas du §31 — Professeur A 3 h et Professeur B 2 h sur la même classe et la même matière —
donne **deux affectations distinctes**, donc deux exigences, et non un co-enseignement.

### `teaching_requirements` — le besoin à planifier
Séparé de la séance (§22, additif §6).

| Colonne | Notes |
|---|---|
| `school_id`, `academic_year_id` | |
| `subject_id` | |
| `teaching_assignment_id` | nullable, trace l'origine |
| `weekly_minutes` | volume total à placer |
| `sessions_count` | nombre de séances souhaité |
| `session_duration_minutes` | durée d'une séance ; `NULL` = déduite |
| `allowed_durations` | int[] pour les séances de durée variable |
| `room_requirement_mode` | `NONE`, `PREFERRED`, `REQUIRED_ROOM`, `REQUIRED_TYPE` |
| `required_room_id`, `required_room_type_id`, `preferred_room_id` | |
| `min_capacity` | |
| `required_features` | uuid[] vers `room_features` |
| `priority` | int, ordre de placement |
| `status` | `DRAFT`, `ACTIVE`, `SATISFIED`, `IGNORED` |

- **`teaching_requirement_targets`** — `requirement_id`, `target_type` (`CLASS`, `GROUP`),
  `class_id`, `group_id`. Plusieurs lignes = **cours commun** à plusieurs groupes (§30).
- **`teaching_requirement_teachers`** — `requirement_id`, `teacher_id`, `role`
  (`LEAD`, `ASSISTANT`). Plusieurs lignes = **co-enseignement** sur une même séance.

La distinction entre volumes séparés et co-enseignement est ainsi explicite et non ambiguë.

---

## 8. Salles

- **`room_types`** — `school_id`, `code` (`LAB`, `GYM`, `IT`, `STANDARD`), `name`.
- **`room_features`** — `school_id`, `code` (`PROJECTOR`, `WATER`, `LAB_BENCH`), `name`.
- **`rooms`** — `school_id`, `code`, `name`, `room_type_id`, `capacity`, `building`, `floor`,
  `is_accessible`, `is_active`, `notes`. `UNIQUE (school_id, code)`.
- **`room_room_features`** — `room_id`, `feature_id`.
- **`room_availability`** — `school_id`, `room_id`, `academic_year_id`, `day_of_week`,
  `starts_at`, `ends_at`, `kind` (`AVAILABLE`, `UNAVAILABLE`), `reason`.

Les quatre cas du §19 sont couverts par `room_requirement_mode` de l'exigence, pas par une
colonne sur la salle.

---

## 9. Emploi du temps

### `schedule_configurations`
`school_id`, `academic_year_id`, `name`, `working_days` int[] (ISO 1-7 ; aucun jour codé en dur,
§24), `day_starts_at`, `day_ends_at`, `default_session_minutes`, `slot_granularity_minutes`,
`allow_multi_slot_sessions`, `solver_options jsonb`, `is_default`, `status`.

### `time_slots` — la grille horaire configurable
`school_id`, `academic_year_id`, `schedule_configuration_id`, `day_of_week`, `position`,
`starts_at time`, `ends_at time`, `kind` (`TEACHING`, `BREAK`, `LUNCH`), `label`.

`UNIQUE (schedule_configuration_id, day_of_week, position)`.

Une séance longue occupe **plusieurs créneaux contigus** (§23). Les grilles peuvent différer
d'un jour à l'autre : le mercredi peut n'avoir que trois créneaux du matin.

### `schedule_versions`
`school_id`, `academic_year_id`, `number`, `name`, `status`
(`DRAFT`, `VALIDATED`, `PUBLISHED`, `ARCHIVED`), `source` (`MANUAL`, `GENERATED`),
`generation_job_id`, `effective_from`, `published_at`, `published_by`, `notes`.

**Index unique partiel** : `UNIQUE (school_id, academic_year_id) WHERE status = 'PUBLISHED'`.
Une génération ne remplace jamais la version publiée (additif §61) : elle crée un `DRAFT`.

### `schedule_sessions` — source de vérité unique (§21, additif §24)

| Colonne | Notes |
|---|---|
| `school_id`, `academic_year_id`, `schedule_version_id` | |
| `teaching_requirement_id` | nullable pour une séance créée à la main |
| `subject_id` | |
| `day_of_week` | |
| `start_slot_id`, `end_slot_id` | bornes dans la grille |
| `starts_at`, `ends_at` | `time`, dénormalisés pour l'affichage et les index |
| `duration_minutes` | |
| `is_locked` | une séance verrouillée n'est jamais déplacée par une génération (§35) |
| `status` | `PLANNED`, `CONFIRMED`, `SUSPENDED` |
| `notes` | |

Aucune colonne `teacher_id`, `class_id`, `group_id` ou `room_id` : le §21 les propose au
singulier, ce qui rend impossibles le co-enseignement (§31), les cours communs (§30) et les
salles multiples. Trois tables de liaison les remplacent.

- **`schedule_session_teachers`** — `session_id`, `teacher_id`, `role` (`LEAD`, `ASSISTANT`).
- **`schedule_session_targets`** — `session_id`, `target_type` (`CLASS`, `GROUP`), `class_id`,
  `group_id`. C'est ce qui permet à « 4e3 Espagnol » et « 4e3 Allemand » d'être simultanés sans
  conflit de classe, tout en interdisant deux cours au même groupe.
- **`schedule_session_rooms`** — `session_id`, `room_id`, `is_primary`.

Les vues « classe », « enseignant », « groupe », « salle » du §37 sont des **vues SQL** dérivées,
jamais des tables.

### `schedule_constraints`
Registre de contraintes configurables (additif §46 et §47).

`school_id`, `academic_year_id`, `constraint_code` (clé du registre applicatif), `severity`
(`HARD`, `SOFT`), `weight` int, `is_enabled`, `scope_type` (`SCHOOL`, `LEVEL`, `CLASS`, `GROUP`,
`SUBJECT`, `TEACHER`, `ROOM`), `scope_id`, `parameters jsonb`, `created_by`.

Ajouter une contrainte = ajouter une entrée au registre côté code + une ligne ici. Aucune
migration, aucune règle pédagogique en dur. L'exemple EPS du §28 est exactement cela : des
lignes `SUBJECT_ALLOWED_DAYS` et `SUBJECT_FORBIDDEN_TIME_RANGE` portées sur la matière EPS.

### `schedule_conflicts`
`school_id`, `schedule_version_id`, `session_id` nullable, `conflict_type`, `severity`
(`HARD`, `WARNING`, `INFO`), `title`, `description`, `involved jsonb`, `suggested_resolution`,
`status` (`OPEN`, `ACKNOWLEDGED`, `RESOLVED`, `IGNORED`), `detected_at`.

`description` est rédigée pour un directeur, pas pour un ingénieur (additif §30).

### `schedule_generation_jobs`
`school_id`, `academic_year_id`, `schedule_version_id` nullable, `requested_by`, `status`
(`QUEUED`, `RUNNING`, `SUCCEEDED`, `FAILED`, `CANCELLED`), `options jsonb`, `current_step`,
`solver_status` (`OPTIMAL`, `FEASIBLE`, `INFEASIBLE`, `TIME_LIMIT`, `UNKNOWN`), `score numeric`,
`hard_satisfied bool`, `soft_ratio numeric`, `sessions_count`, `variables_count`,
`constraints_count`, `duration_ms`, `diagnostics jsonb`, `error jsonb`, `idempotency_key`,
`started_at`, `finished_at`.

### `session_occurrences` — le réel daté (ADR-002)

| Colonne | Notes |
|---|---|
| `school_id`, `academic_year_id`, `schedule_session_id` | |
| `occurs_on` | date |
| `starts_at`, `ends_at` | `timestamptz`, calculés dans le fuseau de l'établissement |
| `status` | `SCHEDULED`, `CANCELLED`, `MOVED`, `REPLACED`, `DONE` |
| `override_room_id`, `override_teacher_id` | remplacement ponctuel |
| `override_starts_at`, `override_ends_at` | déplacement d'une seule séance |
| `cancellation_reason` | |
| `generated_at` | |

`UNIQUE (schedule_session_id, occurs_on)`. Généré par le job `schedule.materialize` à la
publication, en excluant les `school_calendar_events` avec `blocks_schedule`.
Index : `(school_id, occurs_on)` et `(school_id, occurs_on, status)`.

---

## 10. Présence

### `attendance_registers` — un appel, une occurrence
`school_id`, `session_occurrence_id` (**unique**), `taken_by`, `taken_at`, `status`
(`OPEN`, `SUBMITTED`, `VALIDATED`), `validated_by`, `validated_at`,
`client_operation_id` (idempotence hors ligne), `source` (`ONLINE`, `OFFLINE_SYNC`).

### `attendance_records`
`school_id`, `register_id`, `student_id`, `status` (`PRESENT`, `ABSENT`, `LATE`, `EXCUSED`),
`minutes_late` int, `comment`, `recorded_by`, `recorded_at`.
`UNIQUE (register_id, student_id)`.

Le retard vit ici (ADR-011). La vue `v_lateness_records` restitue la lecture attendue par le §40.

### `absence_justifications`
`school_id`, `student_id`, `covers_from`, `covers_to`, `reason`, `document_id`, `submitted_by`,
`status` (`PENDING`, `APPROVED`, `REJECTED`), `decided_by`, `decided_at`, `decision_comment`.

Une justification approuvée bascule les `attendance_records` couverts de `ABSENT` à `EXCUSED`,
par une fonction dédiée qui journalise le changement.

---

## 11. Évaluations et notes

### `grading_scales`
`school_id`, `code`, `name`, `kind` (`NUMERIC`, `LETTER`), `min_score`, `max_score`, `decimals`,
`rounding` (`NONE`, `HALF_UP`, `NEAREST_HALF`, `NEAREST_QUARTER`), `passing_score`, `is_default`.

`/20` est un défaut de seed, pas une hypothèse du code (§39).

### `grading_scale_bands`
`scale_id`, `label` (`A`, `Très bien`), `min_value`, `max_value`, `numeric_equivalent`, `sequence`.

### `assessment_types`
Configurable par établissement : `school_id`, `code` (`HOMEWORK`, `QUIZ`, `COMPOSITION`, `EXAM`,
`ORAL`, `PROJECT`, `CONTINUOUS`), `name`, `default_coefficient`, `counts_in_average`, `sequence`.

### `assessments`
`school_id`, `academic_year_id`, `academic_period_id`, `subject_id`, `class_id` nullable,
`group_id` nullable, `teacher_id`, `assessment_type_id`, `title`, `assessment_date`,
`grading_scale_id`, `max_score`, `coefficient`, `is_eliminatory`, `eliminatory_threshold`,
`status` (`DRAFT`, `OPEN`, `CLOSED`, `PUBLISHED`), `published_at`.

### `grades`
`school_id`, `assessment_id`, `student_id`, `score numeric`, `letter`, `is_absent`,
`is_excused`, `is_excluded_from_average`, `comment`, `entered_by`, `entered_at`, `updated_by`,
`updated_at`. `UNIQUE (assessment_id, student_id)`.

Toute modification d'une note après publication est tracée dans `audit_logs` avec l'état avant
et après (§52). Pas de table dédiée : une seule vérité (§3).

**Moyennes.** Calculées par des fonctions SQL (`app.student_subject_average`,
`app.student_period_average`, `app.class_rank`) qui lisent les règles depuis
`school_settings.grading` : coefficients, arrondi, note éliminatoire, compensation, traitement
des absences. Aucune moyenne n'est stockée, sauf gelée dans un bulletin publié.

---

## 12. Bulletins et conseils de classe

### `report_card_templates`
`school_id`, `name`, `kind`, `layout jsonb`, `includes` jsonb (sections activées), `is_default`.

### `report_cards`
`school_id`, `academic_year_id`, `academic_period_id`, `student_id`, `class_id`, `template_id`,
`status` (`DRAFT`, `GENERATED`, `VALIDATED`, `PUBLISHED`), `general_average`, `rank`,
`class_size`, `class_average`, `decision`, `distinction`, `head_teacher_comment`,
`council_comment`, `absences_count`, `lateness_count`, `pdf_document_id`, `generated_at`,
`published_at`. `UNIQUE (student_id, academic_period_id)`.

### `report_card_items`
`report_card_id`, `subject_id`, `subject_name_snapshot`, `teacher_name_snapshot`, `coefficient`,
`average`, `weighted_points`, `class_average`, `class_min`, `class_max`, `rank`, `appreciation`,
`sequence`.

Les instantanés sont volontaires : un bulletin publié doit rester lisible à l'identique même si
la matière est renommée ou l'enseignant remplacé.

### `class_councils` / `class_council_decisions`
`class_councils` : `school_id`, `academic_year_id`, `academic_period_id`, `class_id`,
`scheduled_at`, `held_at`, `chaired_by`, `status`, `minutes`.
`class_council_decisions` : `council_id`, `student_id`, `decision` (`PROMOTED`, `REPEAT`,
`CONDITIONAL`, `EXCLUDED`, `PENDING`), `distinction` (`CONGRATULATIONS`, `ENCOURAGEMENTS`,
`HONOUR_ROLL`, `WARNING_WORK`, `WARNING_CONDUCT`, `NONE`), `comment`, `decided_by`.

---

## 13. Inscriptions

### `applications`
`school_id`, `academic_year_id`, `reference`, `applicant jsonb`, `requested_level_id`,
`status` (`SUBMITTED`, `UNDER_REVIEW`, `ACCEPTED`, `REJECTED`, `ENROLLED`, `CANCELLED`),
`reviewed_by`, `decision_comment`, `client_operation_id`.

Le passage `ACCEPTED -> ENROLLED` déclenche l'orchestration décrite dans
[`ACCESS_MANAGEMENT.md`](./ACCESS_MANAGEMENT.md) : élève, responsables, comptes, envois.

### `student_transfers`
`school_id`, `student_id`, `from_class_id`, `to_class_id`, `academic_year_id`, `effective_on`,
`reason`, `decided_by`.

---

## 14. Documents, communication, SaaS, audit

### Documents
- **`document_categories`** — `school_id`, `code`, `name`, `applies_to`.
- **`documents`** — `school_id`, `category_id`, `owner_type` (`STUDENT`, `GUARDIAN`, `TEACHER`,
  `CLASS`, `SCHOOL`), `owner_id`, `name`, `storage_path`, `mime_type`, `size_bytes`, `checksum`,
  `visibility` (`PRIVATE`, `SCHOOL`, `OWNER`, `GUARDIANS`), `uploaded_by`.

### Communication
- **`notifications`** — `school_id`, `user_id`, `type`, `title`, `body`, `data jsonb`,
  `entity_type`, `entity_id`, `read_at`, `created_at`. Index `(user_id, read_at, created_at desc)`.
- **`notification_preferences`** — `school_id`, `user_id`, `notification_type`,
  `channels` text[] (`IN_APP` seul actif en V1, ADR-010).
- **`announcements`** — `school_id`, `title`, `body`, `audience jsonb` (rôles, niveaux, classes),
  `status`, `published_at`, `expires_at`, `author_id`.
- **`push_subscriptions`** — `user_id`, `endpoint`, `keys jsonb`, `user_agent` (phase 9).

### SaaS
- **`plans`** — `code`, `name`, `price_amount`, `currency`, `billing_period`, `limits jsonb`
  (élèves, utilisateurs, stockage, SMS), `features jsonb`, `is_public`, `is_active`.
- **`subscriptions`** — `school_id`, `plan_id`, `status` (`TRIALING`, `ACTIVE`, `PAST_DUE`,
  `SUSPENDED`, `CANCELLED`), `started_at`, `current_period_start`, `current_period_end`,
  `trial_ends_at`, `cancel_at`.
- **`subscription_items`** — `subscription_id`, `metric`, `quantity`, `unit_price`.
- **`usage_records`** — `school_id`, `metric` (`STUDENTS`, `USERS`, `STORAGE_MB`, `SMS_SENT`),
  `value`, `recorded_for date`, `source`. `UNIQUE (school_id, metric, recorded_for)`.
- **`payments`** — `school_id`, `subscription_id`, `amount`, `currency`, `method`
  (`MOBILE_MONEY`, `BANK_TRANSFER`, `CASH`, `CARD`), `provider`, `provider_reference`, `status`,
  `paid_at`, `recorded_by`. Agnostique du fournisseur (Q2 de `DECISIONS.md`).
- **`school_features`** — `school_id`, `feature_code`, `is_enabled`, `override_reason`.
  Dérogation ponctuelle au plan, décidée par le Super Admin.

### `audit_logs`
`id`, `school_id` nullable, `actor_user_id`, `actor_is_platform_admin`, `actor_role`, `action`,
`module`, `entity_type`, `entity_id`, `before jsonb`, `after jsonb`, `ip inet`, `user_agent`,
`request_id`, `created_at`.

Index `(school_id, created_at desc)` et `(entity_type, entity_id, created_at desc)`.
Partitionnement mensuel prévu dès que le volume l'exige. **Jamais** de secret dans `before` ou
`after` : les champs sensibles sont masqués à l'écriture par une liste de refus explicite.

### `sync_operations` (ADR-009)
`school_id`, `user_id`, `client_operation_id`, `operation_type`, `payload jsonb`, `status`
(`RECEIVED`, `APPLIED`, `REJECTED`, `CONFLICT`), `result jsonb`, `error jsonb`, `received_at`,
`applied_at`. **`UNIQUE (school_id, client_operation_id)`** — la clé de toute l'idempotence.

---

## 15. Fonctions de sécurité (schéma `app`)

Toutes en `SECURITY DEFINER`, `STABLE`, avec `SET search_path = app, public, pg_temp`.

```sql
app.current_user_id()                    -- auth.uid()
app.is_platform_admin()                  -- ADR-007
app.is_member_of(p_school uuid)          -- appartenance ACTIVE
app.school_is_writable(p_school uuid)    -- statut de l'établissement + année non close
app.has_permission(p_school uuid, p_code text)
app.teaches_class(p_class uuid)
app.teaches_group(p_group uuid)
app.is_guardian_of(p_student uuid)
app.is_self_student(p_student uuid)
app.visible_student_ids(p_school uuid)   -- union des scopes de l'utilisateur
```

`STABLE` est essentiel : PostgreSQL évalue la fonction une fois par requête et non une fois par
ligne. Sans cela, une policy sur une table de 50 000 notes déclencherait 50 000 sous-requêtes.

### Forme canonique d'une policy

```sql
alter table students enable row level security;
alter table students force  row level security;

create policy students_select on students for select using (
  app.is_platform_admin()
  or (
    app.is_member_of(school_id)
    and (
      app.has_permission(school_id, 'students.view')
      or id = any (app.visible_student_ids(school_id))
    )
  )
);

create policy students_insert on students for insert with check (
  app.is_platform_admin()
  or (app.is_member_of(school_id)
      and app.school_is_writable(school_id)
      and app.has_permission(school_id, 'students.create'))
);
```

Le même gabarit, décliné par table, est généré et vérifié par la suite de tests RLS : toute
table tenant sans policy de chaque type fait échouer la suite.

---

## 16. Index à créer dès la première migration

```
school_memberships   (user_id, school_id, status)          -- chaque policy en dépend
schools              (slug) unique
account_access       (school_id, login_identifier) unique
guardians            (school_id, phone_e164) unique
students             (school_id, matricule) unique
students             (school_id, status, last_name)
student_enrollments  (school_id, academic_year_id, class_id)
student_guardians    (guardian_id) / (student_id)
schedule_sessions    (school_id, schedule_version_id, day_of_week)
session_occurrences  (school_id, occurs_on, status)
attendance_records   (school_id, student_id, recorded_at desc)
grades               (school_id, student_id) / (assessment_id)
audit_logs           (school_id, created_at desc)
credential_deliveries(status, next_attempt_at)
notifications        (user_id, read_at, created_at desc)
```

---

## 17. Migrations appliquées

État réel au 11/09/2026 — 30 migrations, toutes appliquées sur la base Supabase.

| # | Contenu |
|---|---|
| 0001 | Schéma `app`, `touch_updated_at()`, énumérations transverses |
| 0002 | `schools`, `school_settings`, `school_branding_templates`, `platform_admins` |
| 0003 | `users`, trigger de synchronisation depuis `auth.users`, `school_memberships` |
| 0004 | `permissions`, `roles`, `role_permissions`, `membership_roles`, `membership_scope_grants` |
| 0005 | Fonctions de sécurité `app.*` + `app.tenant_tables_without_rls()` |
| 0006 | RLS du noyau (0002 à 0004) |
| 0007 | Gestion des accès : `account_access`, `credential_deliveries`, lots, `access_events` ; protection de `_migrations` |
| 0008 | `academic_years`, `academic_periods`, `school_calendar_events`, `app.can_write_year()` |
| 0009 | `cycles`, `levels` |
| 0010 | `subjects`, `level_subjects` |
| 0011 | `teachers`, `teacher_subjects`, `teacher_availability` |
| 0012 | `room_types`, `room_features`, `rooms`, `room_room_features`, `room_availability` |
| 0013 | `classes`, `groups`, `group_classes` |
| 0014 | `students`, `student_enrollments`, `guardians`, `student_guardians`, `student_groups` ; périmètres parent et élève |
| 0015 | `teaching_assignments` ; périmètre enseignant, complétion de `app.can_see_student()` |
| 0016 | `schedule_configurations`, `time_slots` |
| 0017 | `teaching_requirements` + cibles + enseignants |
| 0018 | `schedule_versions`, `schedule_sessions` + liaisons, `schedule_constraints`, `app.can_see_session()` |
| 0019 | `schedule_conflicts`, `schedule_generation_jobs`, `session_occurrences` |
| 0020 | `attendance_registers`, `attendance_records`, `absence_justifications`, vue `v_lateness_records` |
| 0021 | Barèmes, types d'évaluation, `assessments`, `grades` ; vue passée en `security_invoker` |
| 0022 | Calcul des moyennes et des rangs (`SECURITY INVOKER`) |
| 0023 | Bulletins, modèles, conseils de classe |
| 0024 | `applications`, `student_transfers`, `document_categories`, `documents` |
| 0025 | `notifications`, `notification_preferences`, `announcements`, `push_subscriptions` |
| 0026 | `plans`, `subscriptions`, `subscription_items`, `usage_records`, `payments`, `school_features` |
| 0027 | `audit_logs` (immuable), `sync_operations` |
| 0028 | Seed : 131 permissions, 9 rôles système, matrice, plan `STARTER` |
| 0029 | **Correctif** : récursion infinie entre les policies `grades` et `assessments` |
| 0030 | Stockage : 3 buckets privés, policies alignées sur les tables |

### Écarts par rapport à la conception initiale

| Écart | Raison |
|---|---|
| Pas d'extension `citext` | Index uniques sur `lower(colonne)` : même garantie, sans extension ni problème de `search_path`. |
| RLS écrite **dans chaque migration de domaine**, et non regroupée en fin de parcours | Aucune fenêtre où une table existe sans protection, et chaque domaine se relit d'un seul tenant. |
| Ordre des domaines revu (matières et enseignants avant les classes) | Supprime toutes les références en avant : chaque clé étrangère pointe vers une table déjà créée. |
| Pack pays `CI` absent du seed SQL | Barème, trimestres et structure sont rattachés à un établissement : ils n'existent qu'à sa création, via `src/config/defaults/`. |
| 0029, correctif de récursion | Détecté par la suite de tests, pas en production. Voir ci-dessous. |

### Leçon retenue de 0029

Deux policies qui s'interrogent mutuellement par sous-requête provoquent une récursion
infinie (SQLSTATE `42P17`) : ni fuite, mais un déni de service complet sur la table. Règle
désormais appliquée : **toute condition qui lit une autre table protégée passe par une
fonction `SECURITY DEFINER` renvoyant un booléen**, jamais par une sous-requête directe dans
la policy.
