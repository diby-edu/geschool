-- 0053 — Isolation en lecture : comptes, fiches d'enseignants, role anonyme
--
-- Audit d'isolation du 2026-09-20 (identites reelles simulees, transactions
-- annulees). Isolation ENTRE ETABLISSEMENTS : parfaite (0 ligne visible ou
-- modifiable d'une autre ecole, y compris pour un administrateur). Mais, DANS un
-- etablissement, deux tables etaient lisibles par TOUS les membres :
--
--   * `users`    — policy « soi OU partage un etablissement avec moi » : un parent
--                  lisait les noms, l'e-mail technique et, quand ils sont
--                  renseignes, l'e-mail de contact et le telephone des 19 autres
--                  membres (autres parents compris) ;
--   * `teachers` — policy « membre de l'etablissement » : un parent ou un
--                  collegue lisait la fiche complete de chaque enseignant
--                  (telephone, e-mail, adresse, date de naissance, notes).
--
-- La RLS filtre des LIGNES, pas des colonnes : la seule facon de fermer ces
-- lectures est de restreindre les lignes visibles. Regles retenues :
--
--   users    : soi-meme, ou une personne de MON etablissement quand j'y detiens
--              `users.view` (page Personnel) ou `access_accounts.view` (Gestion des
--              acces). L'application ne lit jamais cette table cote enseignant ou
--              parent : le nom affiche vient de la session.
--   teachers : la fiche de soi-meme, ou toutes les fiches quand je detiens un droit
--              dont les pages affichent des noms d'enseignants (personnel,
--              affectations, classes, emploi du temps, appels). Un enseignant ou un
--              parent n'en detient aucun.
--
-- Role anonyme : il ne voit deja aucune ligne (aucune policy ne le vise), mais
-- il gardait le droit technique de lecture/ecriture sur toutes les tables. Aucune
-- page publique n'interroge la base avec ce role (les acces avant connexion passent
-- par le service serveur). On retire le droit : une policy oubliee ou trop large
-- ne suffirait plus a exposer une table sans connexion.
--
-- Rejouable ; aucun changement de schema, aucune donnee touchee.

-- -----------------------------------------------------------------------------
-- 1. Comptes utilisateurs
-- -----------------------------------------------------------------------------

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
          and theirs.status = 'ACTIVE'
          and (
            app.has_permission(mine.school_id, 'users.view')
            or app.has_permission(mine.school_id, 'access_accounts.view')
          )
      );
$$;
revoke all on function app.can_view_user(uuid) from public, anon;
grant execute on function app.can_view_user(uuid) to authenticated, service_role;

drop policy if exists users_select on users;
create policy users_select on users for select to authenticated
using (app.can_view_user(id));

-- -----------------------------------------------------------------------------
-- 2. Fiches d'enseignants
-- -----------------------------------------------------------------------------

drop policy if exists teachers_select on teachers;
create policy teachers_select on teachers for select to authenticated
using (
  app.is_platform_admin()
  or user_id = auth.uid()
  or app.has_any_permission(
    school_id,
    array['teachers.view', 'assignments.view', 'classes.view', 'schedule.view_all', 'attendance.view_all']
  )
);

-- -----------------------------------------------------------------------------
-- 3. Role anonyme : plus aucun droit sur les tables et les sequences
-- -----------------------------------------------------------------------------

revoke all on all tables in schema public from anon;
revoke all on all sequences in schema public from anon;
alter default privileges for role postgres in schema public revoke all on tables from anon;
alter default privileges for role postgres in schema public revoke all on sequences from anon;
