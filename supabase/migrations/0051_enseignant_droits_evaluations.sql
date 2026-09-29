-- 0051 — Enseignant : plus de droit GENERAL sur les evaluations et les notes
--
-- Probleme. Les policies de 0021 sont de la forme « proprietaire de l'evaluation
-- OU app.can_write(ecole, '<permission generale>') » (assessments_update,
-- assessments_delete, grades_insert). Or le role TEACHER detenait
-- `assessments.update`, `assessments.delete` et `grades.create` avec une portee
-- « CLASS » purement indicative : app.has_permission ignore la portee, donc
-- detenir la permission = pouvoir sur TOUTE l'ecole. Un enseignant pouvait ainsi
-- modifier, supprimer et noter dans l'evaluation d'un collegue, alors que
-- docs/RBAC.md §6 et le commentaire de 0021 disent l'inverse.
--
-- Correction. On retire ces trois droits generaux du role TEACHER, modele systeme
-- ET copies par etablissement (0050). Les policies n'ont pas besoin de changer :
-- la branche « proprietaire » (app.owns_assessment) reste, elle, ouverte a
-- l'enseignant pour SES evaluations ; la branche « permission generale » ne
-- reste ouverte qu'a la direction (DIRECTOR, DEPUTY_DIRECTOR, SCHOOL_ADMIN...).
-- `assessments.create` est conserve : un enseignant doit pouvoir creer.
--
-- Rejouable : la suppression est sans effet si les lignes ont deja disparu.
-- Aucune modification de schema, aucune policy touchee.
--
-- ORDRE DE DEPLOIEMENT. Le code applicatif qui accompagne cette migration
-- (features/evaluations : proprietaire OU permission generale) fonctionne AVANT
-- comme APRES elle. L'ancien code, lui, exigeait ces permissions dans le
-- contexte : une fois la migration appliquee, il refuserait a l'enseignant la
-- saisie de ses notes. Base partagee local/production : deployer le code
-- d'abord, appliquer cette migration ensuite.

-- Garde-fou : ne rien retirer si la direction ne detient pas elle-meme les droits
-- generaux — personne ne pourrait plus intervenir sur l'evaluation d'un autre.
do $$
declare
  v_missing text;
begin
  select r.code || ' / ' || p.code into v_missing
  from roles r
  cross join permissions p
  where r.school_id is null
    and r.code in ('SCHOOL_ADMIN', 'DIRECTOR')
    and p.code in ('assessments.update', 'assessments.delete', 'grades.create')
    and not exists (
      select 1 from role_permissions rp where rp.role_id = r.id and rp.permission_id = p.id
    )
  limit 1;
  if v_missing is not null then
    raise exception '0051 interrompue : le droit general % est absent du modele de la direction.', v_missing;
  end if;
end $$;

delete from role_permissions rp
using roles r, permissions p
where r.id = rp.role_id
  and p.id = rp.permission_id
  and r.code = 'TEACHER'
  and p.code in ('assessments.update', 'assessments.delete', 'grades.create');
