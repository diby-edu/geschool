-- =============================================================================
-- 0146 — Suspendre une personne dans UNE école, pas dans toutes
-- =============================================================================
--
-- Défaut trouvé le 2026-10-26 : suspendre l'accès d'une personne dans une école
-- bannissait son compte d'authentification, donc la bloquait dans TOUTES ses
-- écoles (un enseignant de deux lycées). Désormais (src/services/access-status.ts) :
--   - suspendre passe son appartenance à SUSPENDED dans cette école seulement ;
--     la base n'ouvre une école qu'à une appartenance ACTIVE (app.is_member…) ;
--   - le compte n'est banni que si la personne n'a plus aucune école active.
--
-- Ici : la direction doit continuer à VOIR la personne suspendue (son nom dans
-- Accès et Personnel, pour la réactiver). app.can_view_user n'acceptait que les
-- appartenances ACTIVE ; elle accepte aussi SUSPENDED. Rien d'autre ne change.
-- =============================================================================

create or replace function app.can_view_user(p_user uuid)
returns boolean
language sql
stable
security definer
set search_path = app, public, pg_temp
as $$
  select p_user = auth.uid()
      or app.is_platform_admin()
      or exists (
        select 1
        from public.school_memberships mine
        join public.school_memberships theirs on theirs.school_id = mine.school_id
        where mine.user_id = auth.uid()
          and mine.status = 'ACTIVE'
          and theirs.user_id = p_user
          and theirs.status in ('ACTIVE', 'SUSPENDED')
          and (
            app.has_permission(mine.school_id, 'users.view')
            or app.has_permission(mine.school_id, 'access_accounts.view')
          )
      );
$$;
