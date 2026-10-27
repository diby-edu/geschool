-- =============================================================================
-- 0142 — Les droits de Super Admin sont liés au compte
-- =============================================================================
-- Constaté le 2026-10-25 : la page « Administrateurs » affichait 41 Super Admin
-- actifs pour 3 réels. Les 38 autres étaient des lignes laissées par les tests de
-- sécurité automatiques : ils créent un faux Super Admin, puis effacent son
-- compte — mais platform_admins n'était pas reliée aux comptes, la ligne
-- restait. Aucun de ces comptes n'existe : personne ne pouvait s'en servir.
--
-- 1. On supprime les lignes dont le compte n'existe plus.
-- 2. On relie platform_admins aux comptes (auth.users) : un compte supprimé
--    emporte ses droits de Super Admin.
-- (Les tests nettoient aussi leurs lignes eux-mêmes : tests/rls/helpers.ts.)
-- =============================================================================

delete from public.platform_admins pa
where not exists (select 1 from auth.users u where u.id = pa.user_id);

alter table public.platform_admins
  add constraint platform_admins_user_fk foreign key (user_id) references auth.users (id) on delete cascade;
