-- =============================================================================
-- 0078 — Statut « Affecté / Non affecté » de l'élève
-- =============================================================================
--
-- En Cote d'Ivoire, un eleve du public est AFFECTE par l'Etat a un
-- etablissement, ou NON AFFECTE (il s'inscrit alors a titre prive). C'est une
-- information administrative que toutes les listes officielles reclament, et
-- que l'application ne savait pas stocker.
--
-- Colonne NULLABLE, volontairement : les eleves deja inscrits avant cette
-- migration n'ont pas cette information, et l'inventer serait mentir. Les
-- formulaires l'exigent desormais a la saisie ; les anciennes fiches affichent
-- « non renseigne » jusqu'a ce qu'on les complete.
--
-- Un booleen plutot qu'un enum : il n'y a que deux etats, et un enum de deux
-- valeurs se paie d'une migration a chaque nuance future sans rien apporter.

alter table public.students
  add column if not exists is_state_assigned boolean;

comment on column public.students.is_state_assigned is
  'Eleve AFFECTE par l''Etat (true) ou NON AFFECTE (false). NULL = non renseigne.';

-- Les listes filtrent dessus (« tous les non affectes de 2nde »).
create index if not exists students_state_assigned_idx
  on public.students (school_id, is_state_assigned)
  where is_state_assigned is not null;
