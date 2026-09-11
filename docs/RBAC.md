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
| `SCHOOL_ADMIN` | Administrateur | Configuration, utilisateurs, accès, tout le périmètre |
| `DIRECTOR` | Directeur / Proviseur | Direction pédagogique, validation, publication |
| `CENSOR` | Censeur | Emploi du temps, discipline, suivi pédagogique |
| `SECRETARY` | Secrétaire | Inscriptions, dossiers, documents |
| `SUPERVISOR` | Éducateur / Surveillant | Absences, retards, discipline, transmission des accès |
| `ACCOUNTANT` | Comptable | Facturation et paiements de l'établissement |
| `TEACHER` | Enseignant | Ses classes, ses groupes, ses évaluations, ses appels |
| `PARENT` | Parent / Tuteur | Ses enfants uniquement |
| `STUDENT` | Élève | Ses propres données uniquement |

Les rôles sont **cumulables** : un censeur qui enseigne porte `CENSOR` et `TEACHER`, et l'union
de leurs permissions s'applique.

Un établissement peut **cloner** un rôle système pour en ajuster les permissions sans toucher
au modèle partagé (§15 de l'additif comptes : « ne pas donner automatiquement tous les droits
à tous les éducateurs »).

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
| `grades.create` | ✓ | ✓ | — | — | — | siennes | — | — |
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

---

## 6. Règles particulières

**Enseignant.** Il crée et modifie **ses** évaluations et **ses** notes. Il ne peut pas modifier
celles d'un collègue, même sur la même classe. Après `grades.validate` par la direction, une note
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
