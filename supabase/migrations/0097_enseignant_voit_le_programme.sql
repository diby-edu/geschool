-- =============================================================================
-- 0097 — L'enseignant peut consulter le programme
--
-- L'ecran « Programme par niveau » (matieres, coefficients, volumes horaires)
-- a toujours ete concu POUR l'enseignant : le menu de son espace le propose,
-- et son tableau de bord en fait un raccourci.
--
-- Sauf que l'entree, la page et le raccourci exigent tous `subjects.view`, que
-- le role Enseignant ne portait pas. Resultat : l'entree ne s'affichait jamais,
-- et l'URL repondait 404. Un module qui ne menait nulle part.
--
-- On accorde donc la LECTURE des matieres au role Enseignant. Creer, modifier
-- ou supprimer une matiere restent des droits distincts, qu'il n'a pas.
-- Comme toujours, chaque ecole reste libre de decocher ce droit.
-- =============================================================================

with cible as (
  select p.id as permission_id, r.id as role_id
  from permissions p
  join roles r on r.code = 'TEACHER'
  where p.code = 'subjects.view'
)
insert into role_permissions (role_id, permission_id)
select role_id, permission_id from cible
on conflict do nothing;
