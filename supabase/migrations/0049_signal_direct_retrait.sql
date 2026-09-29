-- 0049 — Signal instantane : suppressions et retraits de visibilite
--
-- Complete 0048. Supabase Realtime « Postgres Changes » ne signale ni les
-- SUPPRESSIONS (impossibles a filtrer par etablissement) ni les PERTES DE
-- VISIBILITE (dependre publie un bulletin : la RLS est evaluee sur la nouvelle
-- ligne, que le parent n'a plus le droit de lire, donc rien ne lui est envoye).
-- Resultat : l'ecran de ces personnes gardait une ligne perimee.
--
-- Ici, la base elle-meme envoie un signal (Realtime Broadcast) sur le canal
-- prive `school:<id>` :
--   * a chaque suppression dans une table diffusee ;
--   * a chaque changement de `status` dans les tables dont la visibilite en
--     depend (annonces, evaluations, bulletins, versions d'emploi du temps).
-- Le signal ne porte que le nom de la table : aucune donnee de ligne. Les
-- ecrans relisent ensuite avec leurs droits habituels.
--
-- Un seul message par instruction et par etablissement (declencheurs
-- « statement » + tables de transition) : valider 40 bulletins d'un coup
-- n'envoie qu'un signal.
--
-- Securite : seuls les membres actifs de l'etablissement (et les Super Admin)
-- peuvent ECOUTER ce canal (politique sur realtime.messages) ; aucun client ne
-- peut y ECRIRE (pas de politique d'insertion) : seule la base emet.
--
-- Additif : aucune table applicative n'est modifiee, seulement des
-- declencheurs ajoutes.

-- Identifiant de l'etablissement porte par un nom de canal `school:<uuid>`.
-- Renvoie null pour tout autre format (la politique ne doit jamais lever
-- d'erreur de conversion sur un nom de canal choisi par le client).
create or replace function app.live_topic_school(p_topic text)
returns uuid
language sql
immutable
set search_path = ''
as $$
  select case
    when p_topic ~ '^school:[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
    then substr(p_topic, 8)::uuid
  end
$$;

-- Emission : SECURITY DEFINER car realtime.send ecrit dans realtime.messages, ce
-- que le role de l'appelant (authenticated, service_role) ne peut pas faire.
create or replace function app.live_notify_delete()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  s uuid;
begin
  for s in select distinct school_id from changed where school_id is not null loop
    perform realtime.send(
      jsonb_build_object('table', tg_table_name, 'op', 'DELETE'), 'changed', 'school:' || s::text, true
    );
  end loop;
  return null;
end;
$$;

create or replace function app.live_notify_status()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  s uuid;
begin
  for s in
    select distinct n.school_id
    from new_rows n
    join old_rows o on o.id = n.id
    where n.school_id is not null and n.status is distinct from o.status
  loop
    perform realtime.send(
      jsonb_build_object('table', tg_table_name, 'op', 'STATUS'), 'changed', 'school:' || s::text, true
    );
  end loop;
  return null;
end;
$$;

-- Fonctions de declencheur : jamais appelables comme RPC.
revoke all on function app.live_notify_delete() from public, anon, authenticated;
revoke all on function app.live_notify_status() from public, anon, authenticated;

do $$
declare
  t text;
begin
  -- Suppressions : les memes tables que 0048 (liste alignee sur
  -- src/components/realtime/live-tables.ts).
  foreach t in array array[
    'students', 'student_enrollments', 'student_guardians', 'teachers',
    'account_access', 'credential_deliveries',
    'assessments', 'report_cards', 'attendance_registers', 'absence_justifications',
    'announcements', 'notifications',
    'academic_years', 'classes', 'subjects', 'rooms', 'teaching_assignments', 'schedule_versions'
  ]
  loop
    execute format('drop trigger if exists live_notify_delete on public.%I', t);
    execute format(
      'create trigger live_notify_delete after delete on public.%I
         referencing old table as changed
         for each statement execute function app.live_notify_delete()', t);
  end loop;

  -- Changements de statut : uniquement les tables dont une politique SELECT
  -- depend de `status` (announcements, assessments, report_cards,
  -- schedule_versions). Ailleurs, un changement de statut ne retire l'acces a
  -- personne et Postgres Changes suffit.
  foreach t in array array['announcements', 'assessments', 'report_cards', 'schedule_versions']
  loop
    execute format('drop trigger if exists live_notify_status on public.%I', t);
    execute format(
      'create trigger live_notify_status after update on public.%I
         referencing old table as old_rows new table as new_rows
         for each statement execute function app.live_notify_status()', t);
  end loop;
end $$;

-- Ecoute du canal prive `school:<id>` : membres actifs de l'etablissement et
-- Super Admin. Evaluee une fois a la connexion au canal.
drop policy if exists live_school_changes_read on realtime.messages;
create policy live_school_changes_read on realtime.messages
  for select to authenticated
  using (
    realtime.messages.extension = 'broadcast'
    and (
      app.is_member_of(app.live_topic_school(realtime.topic()))
      or app.is_platform_admin()
    )
  );
