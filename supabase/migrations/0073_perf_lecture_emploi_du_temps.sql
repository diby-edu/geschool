-- =============================================================================
-- 0073 — Lecture de l'emploi du temps a l'echelle reelle (RLS)
-- =============================================================================
--
-- Meme classe de probleme que 0041, sur la table nommee dans son en-tete :
-- app.can_see_session est evaluee UNE FOIS PAR LIGNE, et elle contient
-- app.has_permission — une jointure sur quatre tables (school_memberships,
-- membership_roles, role_permissions, permissions).
--
-- Les trois tables filles (enseignants, cibles, salles d'une seance) portent
-- la MEME policy. Lire 200 seances avec leurs relations imbriquees appelle
-- donc app.can_see_session environ 800 fois. Constate en conditions reelles
-- (ecole de demonstration, 2 072 seances, compte fondateur authentifie) :
-- une page de 200 lignes frole le statement_timeout et le depasse par
-- intermittence — l'ecran de l'emploi du temps et la generation elle-meme
-- echouent alors, apres avoir deja tout calcule.
--
-- Correction : donner a la policy une premiere branche NON CORRELEE a la
-- ligne. « school_id in (select app.my_schools_with(...)) » ne depend que de
-- auth.uid() et d'une constante : Postgres l'evalue UNE fois pour toute la
-- requete (SubPlan hache) au lieu d'une fois par ligne. Pour un membre de
-- l'etablissement qui a le droit de tout voir — l'administration, c'est-a-dire
-- le cas de tous ces ecrans — plus aucune jointure par ligne.
--
-- Le perimetre ne change pas d'un iota : cette branche est exactement le
-- sous-ensemble « membre actif ET droit schedule.view_all » que
-- app.can_see_session accordait deja, et la fonction reste la derniere
-- branche pour les enseignants et les familles, inchangee.

-- Les etablissements ou l'utilisateur courant detient un droit donne.
-- Sans argument de ligne : c'est ce qui permet l'evaluation unique.
create or replace function app.my_schools_with(p_code text)
returns setof uuid
language sql
stable
security definer
set search_path = app, public, pg_temp
as $$
  select m.school_id
  from public.school_memberships m
  join public.membership_roles mr on mr.membership_id = m.id
  join public.role_permissions rp on rp.role_id = mr.role_id
  join public.permissions perm on perm.id = rp.permission_id
  where m.user_id = auth.uid()
    and m.status = 'ACTIVE'
    and perm.code = p_code;
$$;

grant execute on function app.my_schools_with(text) to authenticated, service_role;

-- La seance elle-meme.
drop policy if exists schedule_sessions_select on public.schedule_sessions;
create policy schedule_sessions_select on public.schedule_sessions
for select using (
  school_id in (select app.my_schools_with('schedule.view_all'))
  or (select app.is_platform_admin())
  or app.can_see_session(school_id, id)
);

-- Ses enseignants, ses cibles, ses salles : meme regle, meme optimisation.
drop policy if exists session_teachers_select on public.schedule_session_teachers;
create policy session_teachers_select on public.schedule_session_teachers
for select using (
  school_id in (select app.my_schools_with('schedule.view_all'))
  or (select app.is_platform_admin())
  or app.can_see_session(school_id, session_id)
);

drop policy if exists session_targets_select on public.schedule_session_targets;
create policy session_targets_select on public.schedule_session_targets
for select using (
  school_id in (select app.my_schools_with('schedule.view_all'))
  or (select app.is_platform_admin())
  or app.can_see_session(school_id, session_id)
);

drop policy if exists session_rooms_select on public.schedule_session_rooms;
create policy session_rooms_select on public.schedule_session_rooms
for select using (
  school_id in (select app.my_schools_with('schedule.view_all'))
  or (select app.is_platform_admin())
  or app.can_see_session(school_id, session_id)
);
