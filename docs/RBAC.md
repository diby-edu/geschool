# RBAC : rôles, permissions, périmètres

Le contrôle d'accès ne repose **jamais** sur une comparaison de chaîne de caractères.
`if (role === 'admin')` est proscrit dans tout le code (§6).

```
Utilisateur
    |
Appartenance à un établissement      school_memberships
    |
Rôles (cumulables)                   membership_roles -> roles
    |
Permissions atomiques                role_permissions -> permissions
    |
Périmètre (scope)                    dérivé du métier + dérogations explicites
    |
Décision
```

Une action est autorisée si et seulement si **la permission existe** et que **l'objet visé
tombe dans le périmètre**. Les deux conditions sont vérifiées côté serveur. Le client ne fait
que masquer ce qui serait de toute façon refusé.

---

## 1. Niveaux

### Plateforme

`PLATFORM_ADMIN` — Super Admin. Table `platform_admins`, pas un rôle d'établissement.
Accès complet, lecture et écriture, sur tous les établissements (ADR-007), MFA obligatoire,
toutes ses actions journalisées avec `actor_is_platform_admin = true`.

### Établissement

| Code | Rôle | Vocation |
|---|---|---|
| `SCHOOL_ADMIN` | Fondateur | A créé l'établissement : tous les droits, non modifiables |
| `DIRECTOR` | Directeur / Proviseur | Direction pédagogique, validation, signature et publication des bulletins |
| `DEPUTY_DIRECTOR` | Directeur adjoint | Seconde le directeur ; sans facturation, rôles ni clôture d'année |
| `CENSOR` | Censeur | Emploi du temps, discipline, suivi pédagogique |
| `EDUCATION_INSPECTOR` | Inspecteur d'éducation | Supérieur hiérarchique des éducateurs |
| `HEAD_SUPERVISOR` | Surveillant général | Vie scolaire : absences, retards, discipline, transmission des accès |
| `SUPERVISOR` | Éducateur | Absences, retards, discipline, transmission des accès |
| `SECRETARY` | Secrétaire | Inscriptions, dossiers, documents |
| `IT_ADMIN` | Informaticien | Comptes et accès ; aucun accès aux notes ni aux bulletins |
| `ACCOUNTANT` | Comptable | *Non proposé* : le produit ne gère pas l'argent des inscriptions (ligne conservée) |
| `TEACHER` | Enseignant | Ses classes, ses groupes, ses évaluations, ses appels |
| `PARENT` | Parent / Tuteur | Ses enfants uniquement |
| `STUDENT` | Élève | Ses propres données uniquement |

Les rôles sont **cumulables** : un censeur qui enseigne porte `CENSOR` et `TEACHER`, et l'union
de leurs permissions s'applique.

Chaque établissement dispose de **ses propres copies** des fonctions du personnel
(`roles.school_id` renseigné, migration 0050, `app.ensure_school_roles`) : le fondateur coche et
décoche leurs droits depuis « Rôles et droits » sans toucher au modèle partagé. La base résout les
droits par `membership_roles -> role_permissions` : une copie est donc respectée partout, RLS
comprise.

Garde-fous **en base** (déclencheurs, migration 0050) : le rôle Fondateur est complet et
intouchable ; on ne peut accorder à un rôle, ni attribuer à quelqu'un, un droit qu'on ne possède
pas soi-même (pas d'auto-promotion). Le bulletin suit `reports.validate` → `reports.sign` →
`reports.publish`, chaque étape exigeant son droit. Le catalogue proposé à cocher
(`src/lib/permissions/catalog.ts`) ne contient que des droits qui ont un effet réel.

---

## 2. Catalogue des permissions

Format `module.action`. Le catalogue est global ; l'attribution est par rôle et par établissement.

### Élèves, responsables, inscriptions
```
students.view            students.create          students.update
students.delete          students.export          students.import
students.view_sensitive                             (notes médicales, dossier social)
guardians.view           guardians.create         guardians.update         guardians.delete
enrollments.view         enrollments.create       enrollments.validate
enrollments.transfer     enrollments.withdraw
applications.view        applications.review      applications.decide
```

### Personnel
```
teachers.view            teachers.create          teachers.update          teachers.delete
teachers.manage_availability
users.view               users.create             users.update
users.disable            users.assign_roles
```

### Gestion des accès (additif §15)
```
access_accounts.view             access_accounts.send            access_accounts.resend
access_accounts.reset            access_accounts.disable         access_accounts.reactivate
access_accounts.view_history     access_accounts.bulk_send
```

### Structure pédagogique
```
cycles.view     cycles.manage
levels.view     levels.manage
classes.view    classes.create   classes.update   classes.delete
groups.view     groups.create    groups.update    groups.delete    groups.assign_students
subjects.view   subjects.create  subjects.update  subjects.delete
assignments.view                 assignments.manage
rooms.view      rooms.create     rooms.update     rooms.delete     rooms.manage_availability
```

### Emploi du temps
```
schedule.view            schedule.view_all         (au-delà de son propre périmètre)
schedule.create          schedule.update           schedule.delete
schedule.lock            schedule.generate         schedule.validate
schedule.publish         schedule.manage_constraints
schedule.manage_configuration
```

### Notes
```
grades.view              grades.view_all
assessments.view         assessments.create        assessments.update       assessments.delete
grades.create            grades.update             grades.delete
grades.validate          grades.publish
grading.manage_scales    grading.manage_settings
```

### Présence
```
attendance.view          attendance.view_all
attendance.create        attendance.update         attendance.validate
attendance.justify       attendance.manage_settings
```

### Bulletins et conseils
```
reports.view             reports.generate          reports.validate        reports.publish
reports.manage_templates
councils.view            councils.manage           councils.decide
```

### Documents, communication, configuration, audit
```
documents.view           documents.upload          documents.delete        documents.download
announcements.view       announcements.create      announcements.publish
notifications.send
settings.view            settings.update           settings.manage_branding
academic_years.view      academic_years.manage     academic_years.close     academic_years.reopen
audit.view
billing.view             billing.manage
```

### Plateforme uniquement (`is_platform_only = true`)
```
platform.schools.view    platform.schools.create   platform.schools.update
platform.schools.suspend platform.plans.manage     platform.subscriptions.manage
platform.payments.manage platform.users.manage     platform.stats.view
platform.audit.view      platform.settings.manage  platform.features.manage
platform.support.access
```

---

## 3. Périmètres

```
GLOBAL      toute la plateforme                  PLATFORM_ADMIN
SCHOOL      tout l'établissement                 SCHOOL_ADMIN, DIRECTOR
CYCLE       un cycle                             dérogation explicite
LEVEL       un niveau                            dérogation explicite (censeur des 6e-5e)
CLASS       une classe                           enseignant, professeur principal
GROUP       un groupe                            enseignant d'un groupe
SUBJECT     une matière                          coordonnateur de discipline
CHILDREN    ses enfants                          PARENT
SELF        soi-même                             STUDENT, tout utilisateur sur son profil
```

### Deux sources de périmètre

**1. Périmètre dérivé** — déduit des données métier, jamais saisi à la main. C'est la source
principale, et elle reste juste automatiquement quand l'organisation évolue.

| Rôle | Dérivé de |
|---|---|
| `TEACHER` | `teaching_assignments` : ses classes, ses groupes, ses matières |
| Professeur principal | `classes.head_teacher_id` |
| `PARENT` | `student_guardians` : ses enfants, et eux seuls |
| `STUDENT` | `students.user_id = auth.uid()` |

**2. Dérogation explicite** — `membership_scope_grants`, pour ce que le métier ne dit pas :
un censeur limité à certains niveaux, un enseignant autorisé à consulter une classe qu'il
n'enseigne pas.

### Résolution

```
1. PLATFORM_ADMIN               -> autorisé, journalisé, fin
2. Appartenance ACTIVE ?        -> sinon 404 (jamais 403)
3. Établissement inscriptible ? -> sinon lecture seule (statut SUSPENDED ou année close)
4. Permission présente dans l'union des rôles ? -> sinon 403
5. Périmètre le plus large entre dérivé et dérogations
6. L'objet visé est-il dans ce périmètre ?      -> sinon 404
```

L'étape 6 est celle que l'on oublie et qui produit les IDOR. Elle est obligatoire pour **tout**
identifiant venant du client.

---

## 4. API applicative

Une seule implémentation, dans `src/lib/permissions/`.

```ts
// Lecture : renvoie un booléen, ne lève pas
hasPermission(ctx: TenantContext, code: PermissionCode): Promise<boolean>

// Écriture : lève AuthorizationError, à utiliser dans toute Server Action
requirePermission(ctx, code): Promise<void>

// Périmètre : vérifie l'appartenance de l'objet au périmètre de l'utilisateur
canAccess(ctx, resource: { type: ResourceType; id: string }): Promise<boolean>
requireAccess(ctx, resource): Promise<void>

// Périmètres résolus, mis en cache pour la durée de la requête
getScope(ctx, code): Promise<Scope>
visibleStudentIds(ctx): Promise<string[]>
visibleClassIds(ctx): Promise<string[]>
```

Gabarit imposé pour toute Server Action mutante :

```ts
'use server';
export async function updateGrade(slug: string, input: unknown) {
  const ctx = await getTenantContext(slug);          // 1. tenant, jamais depuis le client
  await requirePermission(ctx, 'grades.update');      // 2. permission
  const data = updateGradeSchema.parse(input);        // 3. validation Zod
  await requireAccess(ctx, { type: 'assessment', id: data.assessmentId }); // 4. périmètre
  const result = await gradeService.update(ctx, data);// 5. métier pur
  await audit(ctx, { action: 'grades.update', before, after });            // 6. audit
  return result;
}
```

Le composant client ne décide de rien. Il appelle `hasPermission` uniquement pour ne pas
afficher un bouton voué au refus.

---

## 5. Matrice indicative des rôles système

Attribution par défaut du seed. Chaque établissement peut la modifier.

| Permission | ADMIN | DIRECTOR | CENSOR | SECRETARY | SUPERVISOR | TEACHER | PARENT | STUDENT |
|---|:--:|:--:|:--:|:--:|:--:|:--:|:--:|:--:|
| `students.view` | ✓ | ✓ | ✓ | ✓ | ✓ | classe | enfants | soi |
| `students.create` | ✓ | ✓ | — | ✓ | — | — | — | — |
| `students.view_sensitive` | ✓ | ✓ | — | — | — | — | — | — |
| `guardians.create` | ✓ | ✓ | — | ✓ | — | — | — | — |
| `access_accounts.view` | ✓ | ✓ | — | ✓ | ✓ | — | — | — |
| `access_accounts.send` | ✓ | ✓ | — | ✓ | ✓ | — | — | — |
| `access_accounts.reset` | ✓ | ✓ | — | — | — | — | — | — |
| `teachers.create` | ✓ | ✓ | — | — | — | — | — | — |
| `classes.create` | ✓ | ✓ | ✓ | — | — | — | — | — |
| `groups.assign_students` | ✓ | ✓ | ✓ | ✓ | — | — | — | — |
| `assignments.manage` | ✓ | ✓ | ✓ | — | — | — | — | — |
| `schedule.view` | ✓ | ✓ | ✓ | ✓ | ✓ | sien | enfants | soi |
| `schedule.generate` | ✓ | ✓ | ✓ | — | — | — | — | — |
| `schedule.publish` | ✓ | ✓ | — | — | — | — | — | — |
| `assessments.create` | ✓ | ✓ | — | — | — | ✓ | — | — |
| `assessments.update` | ✓ | ✓ | — | — | — | siennes¹ | — | — |
| `assessments.delete` | ✓ | ✓ | — | — | — | siennes¹ | — | — |
| `grades.create` | ✓ | ✓ | — | — | — | siennes¹ | — | — |
| `grades.validate` | ✓ | ✓ | ✓ | — | — | — | — | — |
| `grades.view` | ✓ | ✓ | ✓ | — | — | siennes | enfants | soi |
| `attendance.create` | ✓ | ✓ | ✓ | — | ✓ | ses cours | — | — |
| `attendance.justify` | ✓ | ✓ | ✓ | ✓ | ✓ | — | — | — |
| `reports.generate` | ✓ | ✓ | ✓ | — | — | — | — | — |
| `reports.publish` | ✓ | ✓ | — | — | — | — | — | — |
| `reports.view` | ✓ | ✓ | ✓ | ✓ | — | ses classes | enfants | soi |
| `settings.update` | ✓ | ✓ | — | — | — | — | — | — |
| `audit.view` | ✓ | ✓ | — | — | — | — | — | — |
| `billing.view` | ✓ | ✓ | — | — | — | — | — | — |

« classe », « siennes », « enfants », « soi » désignent un périmètre restreint, pas une permission
plus faible : la permission est bien accordée, mais l'étape 6 de la résolution la borne.

¹ **Exception : ici la permission n'est pas accordée au rôle `TEACHER`.** `app.has_permission` ignore la
portée : détenir `assessments.update`, `assessments.delete` ou `grades.create`, c'est pouvoir sur
**toute** l'école. Le rôle les a détenues avec la portée `CLASS` (indicative) jusqu'à la migration
0051, et un enseignant pouvait alors modifier, supprimer et noter dans l'évaluation d'un collègue
(356 évaluations sur 364 dans l'audit du 2026-09-20). L'enseignant agit sur **ses** évaluations par
**propriété** (`teacher_id`, `app.owns_assessment` dans les policies, `assessmentAccess` côté
application), pas par permission ; la permission générale reste celle de la direction. Règle pour
tout droit à portée restreinte : ne pas l'accorder au rôle tant que la base ne borne pas elle-même
l'objet visé.

---

## 6. Règles particulières

**Enseignant.** Il crée et modifie **ses** évaluations et **ses** notes. Il ne peut pas modifier
celles d'un collègue, même sur la même classe : c'est la propriété de l'évaluation qui l'y autorise
(voir la note ¹ du §5), non une permission. Après `grades.validate` par la direction, une note
devient non modifiable par l'enseignant : seul un porteur de `grades.update` avec périmètre
`SCHOOL` peut intervenir, et la modification est auditée.

**Parent.** Périmètre strictement `student_guardians`. Un parent lié à Jean et Marie ne voit pas
Paul, même si Paul est dans la même classe et même si le second parent y est lié. Appliqué en RLS
par `app.is_guardian_of(student_id)`, jamais par un filtre côté client.

**Élève.** Périmètre `SELF`. Aucune donnée d'un autre élève, y compris les moyennes de classe,
sauf si `school_settings.grading.show_class_average_to_students` est activé — auquel cas seul un
agrégat non nominatif est exposé.

**Établissement suspendu.** Lecture conservée, écriture refusée pour tous les rôles
d'établissement. Le Super Admin reste inscriptible (ADR-007).

**Année close.** Mêmes effets. Rouvrir exige `academic_years.reopen`, réservée à `SCHOOL_ADMIN`,
et l'opération est auditée.

**IA (phase 11).** La couche IA s'exécute **sous l'identité de l'utilisateur** et ne reçoit que
les données déjà retournées par les requêtes autorisées. Elle n'a ni `service_role`, ni accès
direct à la base. Un parent demandant « les notes de toute la classe » obtient les notes de ses
enfants, car c'est tout ce que la couche de données lui aura transmis.

---

## 7. Tests obligatoires (§69)

Générés automatiquement à partir du catalogue des tables, exécutés à chaque CI.

```
Isolation tenant
  Utilisateur A / École A -> lecture A            AUTORISÉ
  Utilisateur A / École A -> lecture B            REFUSÉ
  Utilisateur A -> écriture B                     REFUSÉ
  Utilisateur A -> modification B                 REFUSÉ
  Utilisateur A -> suppression B                  REFUSÉ
  Utilisateur A -> id de B injecté dans l'URL     REFUSÉ (404)

Permissions
  Enseignant -> ses notes                         AUTORISÉ
  Enseignant -> notes d'un collègue               REFUSÉ
  Enseignant -> appel d'un cours qu'il ne fait pas REFUSÉ
  Surveillant -> envoi d'accès (si accordé)       AUTORISÉ
  Surveillant -> réinitialisation d'accès         REFUSÉ par défaut

Parent
  Parent -> Jean, Marie (liés)                    AUTORISÉ
  Parent -> Paul (non lié)                        REFUSÉ
  Parent -> autre parent du même élève            REFUSÉ

Élève
  Élève -> ses notes                              AUTORISÉ
  Élève -> notes d'un autre                       REFUSÉ

Super Admin
  Super Admin -> École A, lecture et écriture     AUTORISÉ
  Super Admin -> École B, lecture et écriture     AUTORISÉ
  Toute action                                    PRÉSENTE DANS audit_logs
```

Une table tenant dépourvue de policy `select`, `insert`, `update` ou `delete` fait **échouer la
suite** : c'est le garde-fou qui empêche qu'une nouvelle table arrive un jour sans RLS.

## Tableau de bord de la direction : lectures agrégées (migrations 0055 et 0056)

Les chiffres du tableau de bord (suivi du jour, moyennes et bulletins) sont lus par des
**fonctions SQL** `public.dashboard_*` qui vérifient UN droit puis agrègent en base : lues
sous RLS, les mêmes requêtes multiplient le coût par dix. Un enseignant, l'administrateur
d'un autre établissement et un anonyme sont refusés (testé sous les identités réelles).

| Section | Fonctions | Droit exigé |
|---|---|---|
| Suivi du jour (appels, présence, Top 5, classes à surveiller, assiduité) | `dashboard_day_*`, `dashboard_top_missed_calls`, `dashboard_teacher_call_detail`, `dashboard_low_attendance_classes`, `dashboard_weekly_attendance` | `attendance.view_all` |
| Téléphone dans le détail d'un enseignant | `dashboard_teacher_call_detail` | en plus `teachers.view` (sinon renvoyé vide) |
| Moyennes et bulletins | `dashboard_grading_overview`, `dashboard_grading_pending` | `grades.view_all` (direction, censeur, inspecteur — **pas** `reports.view`, que l'enseignant possède) |
| Dates et ouverture / fermeture de la période de calcul | mise à jour de `academic_periods` | `academic_years.manage` (RLS) |
| « J'ai terminé mes moyennes » | `average_completions` | propriétaire de l'affectation, fenêtre ouverte (RLS + déclencheur) ; lecture : propriétaire ou `grades.view_all` |

Règles de calcul : une séance est « attendue » à la **fin** de son créneau ; les élèves comptés
sont ceux des séances terminées et appelées ; une classe dont l'appel n'est pas fait n'est
comptée ni présente ni absente (« sans appel »).

## Tableaux de bord par fonction (migration 0060)

Le **fondateur** garde le tableau complet ci-dessus. Chaque autre fonction du personnel a
le sien (`src/features/dashboard/profiles.ts`), et l'espace Enseignant et l'espace Parent
ont chacun leur tableau. Règles, testées dans `profiles.test.ts` :

1. **Les droits décident, dans les deux sens.** Chaque indicateur et chaque bloc déclare le
   droit qui protège ses données. Décoché dans « Rôles et droits », il disparaît (jamais
   affiché à zéro) ; coché, il apparaît, **quelle que soit la fonction** — comme dans le menu.
2. **La fonction fixe l'ordre** : ses indicateurs principaux (tableau ci-dessous) d'abord,
   puis ceux qu'ouvrent les autres droits cochés, groupés par thème.
3. **Plusieurs fonctions : plusieurs thèmes principaux**, chaque indicateur une seule fois.

| Fonction | Thème principal | Indicateurs principaux |
|---|---|---|
| Directeur, directeur adjoint | Pédagogie | notes à arrêter, notes en retard, moyenne de l'établissement, classes sous 10, bulletins à valider, emploi du temps publié |
| Censeur | Assiduité | appels faits / non faits, absents, retards, classes à surveiller |
| Surveillant général | Vie scolaire | absents, retards, justificatifs en attente, élèves absents sur 30 jours |
| Éducateur | Suivi des élèves | appels du jour, absents, retards, justificatifs, identifiants à envoyer |
| Inspecteur d'éducation | Qualité pédagogique | évaluations de la période, enseignants sans évaluation, moyenne, moyennes terminées, programme renseigné |
| Secrétaire | Inscriptions | élèves inscrits, nouvelles inscriptions, comptes parents à activer, identifiants à envoyer, justificatifs |
| Informaticien | Comptes | accès non activés, comptes parents, envois en échec, accès suspendus, enseignants sans accès |

Nouvelles fonctions SQL (même principe : un droit vérifié, puis agrégat en base) :

| Fonction | Droit exigé |
|---|---|
| `dashboard_class_averages` (moyenne générale par classe, même règle que `class_period_ranking`) | `grades.view_all` |
| `dashboard_assessment_activity` (évaluations de la période par enseignant) | `assessments.view` |
| `dashboard_top_absent_students` (élèves les plus absents) | `attendance.view_all` |

**Aperçu** : depuis « Rôles et droits », « Voir son tableau de bord » affiche le tableau d'une
fonction calculé avec ses SEULS droits (réservé à `users.assign_roles` ; ne montre jamais
plus que ce que voit déjà la personne qui regarde).

## Étapes des circuits et coordonnées (migration 0059)

Chaque étape d'un circuit exige son propre droit, dans la base (déclencheurs de garde, comme
les bulletins) : clôturer / rouvrir une évaluation `grades.validate`, la publier
`grades.publish`, clôturer une année `academic_years.close`, la rouvrir
`academic_years.reopen`, publier un emploi du temps `schedule.publish`, valider un appel
`attendance.validate`. Une annonce ne peut naître publiée qu'avec `announcements.publish`.
Les coordonnées des enseignants (téléphone, e-mail, adresse, date de naissance, notes) ne se
lisent plus dans la table : `teacher_contacts()` exige `teachers.view` (ou sa propre fiche).
Tests : `tests/rls/step-rights.test.ts`.
