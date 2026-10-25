-- =============================================================================
-- 0138 — Un enseignant ou un parent ne modifie plus sa propre fiche en base
-- =============================================================================
-- Constaté le 2026-10-25 en testant les écritures de chaque fonction : les règles
-- de modification des fiches enseignant et parent acceptaient, en plus du droit,
-- « c'est ma propre fiche » (user_id = auth.uid()), pour TOUTES les colonnes.
-- Avec son seul compte, un enseignant pouvait donc écrire en base :
--   - son taux horaire (hourly_rate = 99 999 F),
--   - son contrat (PERMANENT -> HOURLY : toutes ses heures deviennent payées),
--   - son quota hebdomadaire,
-- et gonfler sa paie. Un parent pouvait changer son téléphone, son statut, et
-- même l'école de sa fiche.
--
-- Aucun écran ne s'en sert : les fiches sont modifiées par le personnel avec
-- teachers.update / guardians.update, et le rattachement d'un compte passe par
-- le serveur (services/, clé de service). La photo de profil est dans `users`.
-- Aucune fonction SQL ne modifie ces tables avec les droits de l'appelant.
-- La règle devient : le droit, ou l'administrateur de la plateforme.
-- =============================================================================

drop policy teachers_update on teachers;
create policy teachers_update on teachers for update to authenticated
using (
  (select app.is_platform_admin())
  or school_id in (select app.my_writable_schools_with('teachers.update'))
)
with check (
  (select app.is_platform_admin())
  or school_id in (select app.my_writable_schools_with('teachers.update'))
);

drop policy guardians_update on guardians;
create policy guardians_update on guardians for update to authenticated
using (
  (select app.is_platform_admin())
  or school_id in (select app.my_writable_schools_with('guardians.update'))
)
with check (
  (select app.is_platform_admin())
  or school_id in (select app.my_writable_schools_with('guardians.update'))
);
