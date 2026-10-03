-- =============================================================================
-- 0090 — Ce qui ne commande rien n'a rien a faire dans le catalogue
--
-- Deux retraits demandes :
--
--   1. LES DONNEES SENSIBLES. `students.medical_notes` existait depuis l'origine
--      sans qu'aucun ecran ne la montre ni ne la remplisse. Verifie avant :
--      0 ligne renseignee sur 5 602 eleves. Garder un champ medical qu'on ne
--      sait ni saisir ni proteger, c'est promettre une confidentialite qu'on
--      n'assure pas.
--
--   2. LES CANDIDATURES. L'admission en ligne ne sera pas construite :
--      « les inscriptions sont faites par l'ecole pour mieux affecter les
--      eleves ». Les trois droits disparaissent du catalogue — un droit qui ne
--      commande aucun ecran est pire qu'un droit absent : il fait croire a une
--      fonction qui n'existe pas.
--
--      La TABLE `applications` reste, vide (0 ligne verifiee) : l'application
--      vise aussi les etablissements prives, qui pourraient en avoir besoin.
--      On retire le droit, pas la possibilite.
-- =============================================================================

alter table students drop column if exists medical_notes;

delete from role_permissions
where permission_id in (
  select id from permissions
  where code = 'students.view_sensitive' or code like 'applications.%'
);

delete from permissions
where code = 'students.view_sensitive' or code like 'applications.%';

comment on table applications is
  'Admission en ligne : table conservee, non utilisee. Les inscriptions se font par l''ecole (decision du 2026-09-29).';
