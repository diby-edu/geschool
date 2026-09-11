-- =============================================================================
-- 0028 — Seed : catalogue des permissions, roles systeme, matrice
-- =============================================================================
--
-- Idempotent : `on conflict do nothing` partout, la migration peut etre
-- rejouee sans effet.
--
-- Le « pack pays » (bareme /20, trimestres, types d'evaluation, structure
-- 6e-Terminale) n'est PAS ici : ces objets sont rattaches a un etablissement
-- et n'existent donc qu'a sa creation. Ils vivent dans src/config/defaults/
-- et sont appliques par le service de creation d'etablissement (ADR-012).

-- -----------------------------------------------------------------------------
-- Catalogue des permissions
-- -----------------------------------------------------------------------------

insert into permissions (code, module, action, description, is_platform_only) values
  ('students.view',              'students',   'view',      'Consulter les eleves', false),
  ('students.create',            'students',   'create',    'Inscrire un eleve', false),
  ('students.update',            'students',   'update',    'Modifier un dossier eleve', false),
  ('students.delete',            'students',   'delete',    'Supprimer un eleve', false),
  ('students.export',            'students',   'export',    'Exporter la liste des eleves', false),
  ('students.import',            'students',   'import',    'Importer des eleves', false),
  ('students.view_sensitive',    'students',   'view_sensitive', 'Consulter les donnees sensibles (medical, social)', false),

  ('guardians.view',             'guardians',  'view',      'Consulter les responsables legaux', false),
  ('guardians.create',           'guardians',  'create',    'Enregistrer un responsable legal', false),
  ('guardians.update',           'guardians',  'update',    'Modifier un responsable legal', false),
  ('guardians.delete',           'guardians',  'delete',    'Supprimer un responsable legal', false),

  ('enrollments.view',           'enrollments','view',      'Consulter les inscriptions', false),
  ('enrollments.create',         'enrollments','create',    'Creer une inscription', false),
  ('enrollments.validate',       'enrollments','validate',  'Valider une inscription', false),
  ('enrollments.transfer',       'enrollments','transfer',  'Transferer un eleve de classe', false),
  ('enrollments.withdraw',       'enrollments','withdraw',  'Enregistrer une sortie', false),

  ('applications.view',          'applications','view',     'Consulter les candidatures', false),
  ('applications.review',        'applications','review',   'Instruire une candidature', false),
  ('applications.decide',        'applications','decide',   'Decider d''une candidature', false),

  ('teachers.view',              'teachers',   'view',      'Consulter les enseignants', false),
  ('teachers.create',            'teachers',   'create',    'Enregistrer un enseignant', false),
  ('teachers.update',            'teachers',   'update',    'Modifier un enseignant', false),
  ('teachers.delete',            'teachers',   'delete',    'Supprimer un enseignant', false),
  ('teachers.manage_availability','teachers',  'manage_availability', 'Gerer les disponibilites des enseignants', false),

  ('users.view',                 'users',      'view',      'Consulter les utilisateurs', false),
  ('users.create',               'users',      'create',    'Creer un utilisateur', false),
  ('users.update',               'users',      'update',    'Modifier un utilisateur', false),
  ('users.disable',              'users',      'disable',   'Desactiver un utilisateur', false),
  ('users.assign_roles',         'users',      'assign_roles', 'Attribuer des roles', false),

  ('access_accounts.view',       'access_accounts','view',       'Consulter la gestion des acces', false),
  ('access_accounts.send',       'access_accounts','send',       'Envoyer les identifiants', false),
  ('access_accounts.resend',     'access_accounts','resend',     'Renvoyer les identifiants', false),
  ('access_accounts.bulk_send',  'access_accounts','bulk_send',  'Envoi groupe des identifiants', false),
  ('access_accounts.reset',      'access_accounts','reset',      'Reinitialiser un mot de passe', false),
  ('access_accounts.disable',    'access_accounts','disable',    'Desactiver un acces', false),
  ('access_accounts.reactivate', 'access_accounts','reactivate', 'Reactiver un acces', false),
  ('access_accounts.view_history','access_accounts','view_history','Consulter l''historique des acces', false),

  ('cycles.view',                'cycles',     'view',      'Consulter les cycles', false),
  ('cycles.manage',              'cycles',     'manage',    'Gerer les cycles', false),
  ('levels.view',                'levels',     'view',      'Consulter les niveaux', false),
  ('levels.manage',              'levels',     'manage',    'Gerer les niveaux', false),

  ('classes.view',               'classes',    'view',      'Consulter les classes', false),
  ('classes.create',             'classes',    'create',    'Creer une classe', false),
  ('classes.update',             'classes',    'update',    'Modifier une classe', false),
  ('classes.delete',             'classes',    'delete',    'Supprimer une classe', false),

  ('groups.view',                'groups',     'view',      'Consulter les groupes', false),
  ('groups.create',              'groups',     'create',    'Creer un groupe', false),
  ('groups.update',              'groups',     'update',    'Modifier un groupe', false),
  ('groups.delete',              'groups',     'delete',    'Supprimer un groupe', false),
  ('groups.assign_students',     'groups',     'assign_students', 'Affecter les eleves aux groupes', false),

  ('subjects.view',              'subjects',   'view',      'Consulter les matieres', false),
  ('subjects.create',            'subjects',   'create',    'Creer une matiere', false),
  ('subjects.update',            'subjects',   'update',    'Modifier une matiere', false),
  ('subjects.delete',            'subjects',   'delete',    'Supprimer une matiere', false),

  ('assignments.view',           'assignments','view',      'Consulter les affectations', false),
  ('assignments.manage',         'assignments','manage',    'Gerer les affectations pedagogiques', false),

  ('rooms.view',                 'rooms',      'view',      'Consulter les salles', false),
  ('rooms.create',               'rooms',      'create',    'Creer une salle', false),
  ('rooms.update',               'rooms',      'update',    'Modifier une salle', false),
  ('rooms.delete',               'rooms',      'delete',    'Supprimer une salle', false),
  ('rooms.manage_availability',  'rooms',      'manage_availability', 'Gerer les disponibilites des salles', false),

  ('schedule.view',              'schedule',   'view',      'Consulter l''emploi du temps', false),
  ('schedule.view_all',          'schedule',   'view_all',  'Consulter tous les emplois du temps', false),
  ('schedule.create',            'schedule',   'create',    'Creer des seances', false),
  ('schedule.update',            'schedule',   'update',    'Modifier des seances', false),
  ('schedule.delete',            'schedule',   'delete',    'Supprimer des seances', false),
  ('schedule.lock',              'schedule',   'lock',      'Verrouiller une seance', false),
  ('schedule.generate',          'schedule',   'generate',  'Lancer une generation automatique', false),
  ('schedule.validate',          'schedule',   'validate',  'Valider une version', false),
  ('schedule.publish',           'schedule',   'publish',   'Publier un emploi du temps', false),
  ('schedule.manage_constraints','schedule',   'manage_constraints', 'Gerer les contraintes', false),
  ('schedule.manage_configuration','schedule', 'manage_configuration', 'Gerer la grille horaire', false),

  ('assessments.view',           'assessments','view',      'Consulter les evaluations', false),
  ('assessments.create',         'assessments','create',    'Creer une evaluation', false),
  ('assessments.update',         'assessments','update',    'Modifier une evaluation', false),
  ('assessments.delete',         'assessments','delete',    'Supprimer une evaluation', false),

  ('grades.view',                'grades',     'view',      'Consulter les notes de son perimetre', false),
  ('grades.view_all',            'grades',     'view_all',  'Consulter toutes les notes', false),
  ('grades.create',              'grades',     'create',    'Saisir des notes', false),
  ('grades.update',              'grades',     'update',    'Modifier des notes', false),
  ('grades.delete',              'grades',     'delete',    'Supprimer des notes', false),
  ('grades.validate',            'grades',     'validate',  'Valider des notes', false),
  ('grades.publish',             'grades',     'publish',   'Publier des notes', false),
  ('grading.manage_scales',      'grading',    'manage_scales',   'Gerer les baremes', false),
  ('grading.manage_settings',    'grading',    'manage_settings', 'Gerer les regles de notation', false),

  ('attendance.view',            'attendance', 'view',      'Consulter les presences de son perimetre', false),
  ('attendance.view_all',        'attendance', 'view_all',  'Consulter toutes les presences', false),
  ('attendance.create',          'attendance', 'create',    'Faire l''appel', false),
  ('attendance.update',          'attendance', 'update',    'Modifier un appel', false),
  ('attendance.validate',        'attendance', 'validate',  'Valider un appel', false),
  ('attendance.justify',         'attendance', 'justify',   'Traiter les justificatifs', false),
  ('attendance.manage_settings', 'attendance', 'manage_settings', 'Gerer les regles de presence', false),

  ('reports.view',               'reports',    'view',      'Consulter les bulletins', false),
  ('reports.generate',           'reports',    'generate',  'Generer les bulletins', false),
  ('reports.validate',           'reports',    'validate',  'Valider les bulletins', false),
  ('reports.publish',            'reports',    'publish',   'Publier les bulletins', false),
  ('reports.manage_templates',   'reports',    'manage_templates', 'Gerer les modeles de bulletin', false),

  ('councils.view',              'councils',   'view',      'Consulter les conseils de classe', false),
  ('councils.manage',            'councils',   'manage',    'Organiser les conseils de classe', false),
  ('councils.decide',            'councils',   'decide',    'Enregistrer les decisions du conseil', false),

  ('documents.view',             'documents',  'view',      'Consulter les documents', false),
  ('documents.upload',           'documents',  'upload',    'Deposer un document', false),
  ('documents.download',         'documents',  'download',  'Telecharger un document', false),
  ('documents.delete',           'documents',  'delete',    'Supprimer un document', false),

  ('announcements.view',         'announcements','view',    'Consulter les annonces', false),
  ('announcements.create',       'announcements','create',  'Rediger une annonce', false),
  ('announcements.publish',      'announcements','publish', 'Publier une annonce', false),
  ('notifications.send',         'notifications','send',    'Envoyer des notifications ciblees', false),

  ('settings.view',              'settings',   'view',      'Consulter la configuration', false),
  ('settings.update',            'settings',   'update',    'Modifier la configuration', false),
  ('settings.manage_branding',   'settings',   'manage_branding', 'Gerer l''identite visuelle', false),

  ('academic_years.view',        'academic_years','view',   'Consulter les annees scolaires', false),
  ('academic_years.manage',      'academic_years','manage', 'Gerer les annees scolaires', false),
  ('academic_years.close',       'academic_years','close',  'Cloturer une annee scolaire', false),
  ('academic_years.reopen',      'academic_years','reopen', 'Rouvrir une annee cloturee', false),

  ('audit.view',                 'audit',      'view',      'Consulter le journal d''audit', false),
  ('billing.view',               'billing',    'view',      'Consulter la facturation', false),
  ('billing.manage',             'billing',    'manage',    'Gerer la facturation', false),

  ('platform.schools.view',        'platform', 'schools_view',        'Consulter les etablissements', true),
  ('platform.schools.create',      'platform', 'schools_create',      'Creer un etablissement', true),
  ('platform.schools.update',      'platform', 'schools_update',      'Modifier un etablissement', true),
  ('platform.schools.suspend',     'platform', 'schools_suspend',     'Suspendre un etablissement', true),
  ('platform.plans.manage',        'platform', 'plans_manage',        'Gerer les plans', true),
  ('platform.subscriptions.manage','platform', 'subscriptions_manage','Gerer les abonnements', true),
  ('platform.payments.manage',     'platform', 'payments_manage',     'Gerer les paiements', true),
  ('platform.users.manage',        'platform', 'users_manage',        'Gerer les utilisateurs plateforme', true),
  ('platform.stats.view',          'platform', 'stats_view',          'Consulter les statistiques globales', true),
  ('platform.audit.view',          'platform', 'audit_view',          'Consulter le journal global', true),
  ('platform.settings.manage',     'platform', 'settings_manage',     'Gerer les parametres SaaS', true),
  ('platform.features.manage',     'platform', 'features_manage',     'Gerer les fonctionnalites', true),
  ('platform.support.access',      'platform', 'support_access',      'Acceder au support', true)
on conflict (code) do nothing;

-- -----------------------------------------------------------------------------
-- Roles systeme
-- -----------------------------------------------------------------------------

insert into roles (school_id, code, name, description, is_system, level) values
  (null, 'SCHOOL_ADMIN', 'Administrateur',        'Configuration et administration complete de l''etablissement', true, 'SCHOOL'),
  (null, 'DIRECTOR',     'Directeur',             'Direction pedagogique, validation et publication', true, 'SCHOOL'),
  (null, 'CENSOR',       'Censeur',               'Emploi du temps, suivi pedagogique et discipline', true, 'SCHOOL'),
  (null, 'SECRETARY',    'Secretaire',            'Inscriptions, dossiers et documents', true, 'SCHOOL'),
  (null, 'SUPERVISOR',   'Educateur',             'Absences, retards, discipline, transmission des acces', true, 'SCHOOL'),
  (null, 'ACCOUNTANT',   'Comptable',             'Facturation et paiements', true, 'SCHOOL'),
  (null, 'TEACHER',      'Enseignant',            'Ses classes, ses groupes, ses evaluations', true, 'SCHOOL'),
  (null, 'PARENT',       'Parent',                'Ses enfants uniquement', true, 'SCHOOL'),
  (null, 'STUDENT',      'Eleve',                 'Ses propres donnees uniquement', true, 'SCHOOL')
on conflict do nothing;

-- -----------------------------------------------------------------------------
-- Matrice role / permissions
--
-- POINT CAPITAL — PARENT et STUDENT ne recoivent AUCUNE permission.
--
-- Ce n'est pas un oubli. Leur acces provient entierement du PERIMETRE DERIVE :
-- app.is_guardian_of() et app.is_self_student() les autorisent sur leurs
-- propres donnees, directement dans les policies.
--
-- Leur accorder `students.view` produirait exactement l'inverse de l'effet
-- recherche : la branche `has_permission(school,'students.view')` de
-- app.can_see_student() est NON SCOPEE, et un parent verrait alors tous les
-- eleves de l'etablissement. Idem pour reports.view, documents.view ou
-- grades.view. La regle se lit ainsi : une permission ouvre l'ETABLISSEMENT,
-- un perimetre derive ouvre SES PROPRES DONNEES. Les deux ne se cumulent pas.
-- -----------------------------------------------------------------------------

-- SCHOOL_ADMIN et DIRECTOR : tout, sauf les permissions plateforme
insert into role_permissions (role_id, permission_id, default_scope)
select r.id, p.id, 'SCHOOL'::scope_type
from roles r
cross join permissions p
where r.is_system and r.code in ('SCHOOL_ADMIN', 'DIRECTOR')
  and not p.is_platform_only
on conflict do nothing;

-- CENSOR : pedagogie, emploi du temps, discipline. Ni comptes, ni facturation,
-- ni publication des bulletins.
insert into role_permissions (role_id, permission_id, default_scope)
select r.id, p.id, 'SCHOOL'::scope_type
from roles r
cross join permissions p
where r.is_system and r.code = 'CENSOR'
  and p.code in (
    'students.view', 'students.export', 'guardians.view',
    'enrollments.view', 'enrollments.transfer',
    'teachers.view', 'teachers.manage_availability',
    'cycles.view', 'levels.view',
    'classes.view', 'classes.create', 'classes.update',
    'groups.view', 'groups.create', 'groups.update', 'groups.assign_students',
    'subjects.view', 'assignments.view', 'assignments.manage',
    'rooms.view', 'rooms.manage_availability',
    'schedule.view', 'schedule.view_all', 'schedule.create', 'schedule.update',
    'schedule.delete', 'schedule.lock', 'schedule.generate', 'schedule.validate',
    'schedule.manage_constraints', 'schedule.manage_configuration',
    'assessments.view', 'grades.view_all', 'grades.validate',
    'attendance.view_all', 'attendance.create', 'attendance.update',
    'attendance.validate', 'attendance.justify',
    'reports.view', 'reports.generate',
    'councils.view', 'councils.manage', 'councils.decide',
    'documents.view', 'announcements.view', 'academic_years.view'
  )
on conflict do nothing;

-- SECRETARY : dossiers, inscriptions, documents, transmission des acces
insert into role_permissions (role_id, permission_id, default_scope)
select r.id, p.id, 'SCHOOL'::scope_type
from roles r
cross join permissions p
where r.is_system and r.code = 'SECRETARY'
  and p.code in (
    'students.view', 'students.create', 'students.update', 'students.export', 'students.import',
    'guardians.view', 'guardians.create', 'guardians.update',
    'enrollments.view', 'enrollments.create', 'enrollments.validate', 'enrollments.withdraw',
    'applications.view', 'applications.review',
    'teachers.view', 'classes.view', 'groups.view', 'groups.assign_students',
    'subjects.view', 'rooms.view', 'schedule.view',
    'access_accounts.view', 'access_accounts.send', 'access_accounts.resend',
    'access_accounts.view_history',
    'attendance.view_all', 'attendance.justify',
    'reports.view', 'documents.view', 'documents.upload', 'documents.download',
    'announcements.view', 'academic_years.view'
  )
on conflict do nothing;

-- SUPERVISOR (educateur) : presence et discipline. Par defaut il transmet les
-- identifiants mais ne reinitialise PAS les mots de passe (additif §15 :
-- « ne pas donner automatiquement tous les droits a tous les educateurs »).
insert into role_permissions (role_id, permission_id, default_scope)
select r.id, p.id, 'SCHOOL'::scope_type
from roles r
cross join permissions p
where r.is_system and r.code = 'SUPERVISOR'
  and p.code in (
    'students.view', 'guardians.view',
    'classes.view', 'groups.view', 'schedule.view', 'schedule.view_all',
    'access_accounts.view', 'access_accounts.send', 'access_accounts.resend',
    'access_accounts.view_history',
    'attendance.view_all', 'attendance.create', 'attendance.update',
    'attendance.validate', 'attendance.justify',
    'announcements.view', 'documents.view'
  )
on conflict do nothing;

-- ACCOUNTANT
insert into role_permissions (role_id, permission_id, default_scope)
select r.id, p.id, 'SCHOOL'::scope_type
from roles r
cross join permissions p
where r.is_system and r.code = 'ACCOUNTANT'
  and p.code in ('students.view', 'billing.view', 'billing.manage', 'announcements.view')
on conflict do nothing;

-- TEACHER : ses evaluations, ses notes, ses appels.
-- Pas de students.view : ses eleves lui viennent de app.teaches_student().
-- grades.view et attendance.view sont en revanche necessaires — combines au
-- perimetre derive, ils lui donnent SES eleves, et eux seuls.
insert into role_permissions (role_id, permission_id, default_scope)
select r.id, p.id, 'CLASS'::scope_type
from roles r
cross join permissions p
where r.is_system and r.code = 'TEACHER'
  and p.code in (
    'schedule.view',
    'assessments.view', 'assessments.create', 'assessments.update', 'assessments.delete',
    'grades.view', 'grades.create',
    'attendance.view',
    'reports.view',
    'announcements.view'
  )
on conflict do nothing;

-- PARENT et STUDENT : aucune permission, par construction. Voir le
-- commentaire ci-dessus.

-- -----------------------------------------------------------------------------
-- Plan par defaut
-- -----------------------------------------------------------------------------

insert into plans (code, name, description, price_amount, currency, billing_period, limits, features, is_public)
values (
  'STARTER',
  'Starter',
  'Plan initial : un etablissement, fonctionnalites de base',
  0,
  'XOF',
  'YEARLY',
  '{"students": 500, "users": 100, "storage_mb": 2048, "sms_per_month": 1000}'::jsonb,
  '{"schedule_solver": true, "reports": true, "offline": true, "ai": false}'::jsonb,
  true
)
on conflict (code) do nothing;
