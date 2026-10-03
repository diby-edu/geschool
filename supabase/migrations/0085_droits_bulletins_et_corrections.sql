-- =============================================================================
-- 0085 — Quatre droits qui manquaient
--
--   reports.print            editer le PDF des bulletins
--   reports.manage_template  modifier le modele de bulletin
--   grades.request_change    demander la correction d'une note apres cloture
--   grades.override          appliquer une correction SANS l'accord de l'enseignant
--
-- « La seule personne habilitee a tirer les bulletins, c'est le directeur, le
-- sous-directeur ou le censeur. » Ce sont donc eux par defaut — mais rien n'est
-- fige : chaque etablissement recoche ces droits pour les fonctions qu'il veut,
-- y compris des roles qu'il a crees lui-meme.
--
-- ATTENTION AU RATTACHEMENT : une ecole ne partage pas les roles systeme, elle
-- en recoit une COPIE a sa creation. Donner un droit au seul role systeme ne le
-- donnerait a aucune ecole existante. On rattache donc par CODE de role, ce qui
-- couvre le modele systeme et toutes les copies.
-- =============================================================================

insert into permissions (code, module, action, description, is_platform_only) values
  ('reports.print',           'reports', 'print',           'Editer le PDF des bulletins', false),
  ('reports.manage_template', 'reports', 'manage_template', 'Modifier le modele de bulletin', false),
  ('grades.request_change',   'grades',  'request_change',  'Demander la correction d''une note apres cloture', false),
  ('grades.override',         'grades',  'override',        'Appliquer une correction sans l''accord de l''enseignant', false)
on conflict (code) do nothing;

-- -----------------------------------------------------------------------------
-- Rattachement par defaut, role systeme ET copies par etablissement.
-- -----------------------------------------------------------------------------

with cible as (
  select p.id permission_id, r.id role_id
  from permissions p
  join roles r on r.code = any (array['DIRECTOR', 'DEPUTY_DIRECTOR', 'CENSOR', 'SCHOOL_ADMIN'])
  where p.code in ('reports.print', 'reports.manage_template', 'grades.request_change')
)
insert into role_permissions (role_id, permission_id)
select role_id, permission_id from cible
on conflict do nothing;

-- Passer outre l'avis d'un enseignant ne se partage pas : le directeur, et le
-- fondateur qui peut tout dans son etablissement.
with cible as (
  select p.id permission_id, r.id role_id
  from permissions p
  join roles r on r.code = any (array['DIRECTOR', 'SCHOOL_ADMIN'])
  where p.code = 'grades.override'
)
insert into role_permissions (role_id, permission_id)
select role_id, permission_id from cible
on conflict do nothing;
