-- =============================================================================
-- 0171 — Alertes et notifications pour tous
-- =============================================================================
-- Décidé le 2026-10-31 (maquette docs/maquettes/alertes-et-notifications.html) :
--   * Gmail abandonné : tout arrive dans l'application (cloche, module du
--     tableau de bord) et sur le téléphone (notification de l'application
--     installée). SMS seulement pour les urgences du Super Admin.
--   * Chacun reçoit ce que ses droits lui ouvrent : « droit coché = messages
--     reçus », comme les tableaux de bord.
--
-- Les notifications des écoles existent déjà (0025, table notifications). On
-- ajoute :
--   1. les destinataires d'un droit dans une école (pour le service) ;
--   2. les notifications du Super Admin (sans école) et leur lecture ;
--   3. les téléphones abonnés aux notifications (Web Push) ;
--   4. ce que chacun a coupé sur son téléphone.
-- =============================================================================

-- -----------------------------------------------------------------------------
-- 1. Qui, dans une école, détient l'un de ces droits
-- -----------------------------------------------------------------------------
create or replace function public.school_users_with_permission(p_school uuid, p_codes text[])
returns setof uuid
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select distinct m.user_id
  from school_memberships m
  join membership_roles mr on mr.membership_id = m.id
  join role_permissions rp on rp.role_id = mr.role_id
  join permissions p on p.id = rp.permission_id
  where m.school_id = p_school
    and m.status = 'ACTIVE'
    and p.code = any(p_codes)
$$;
revoke all on function public.school_users_with_permission(uuid, text[]) from public, anon, authenticated;
grant execute on function public.school_users_with_permission(uuid, text[]) to service_role;

-- -----------------------------------------------------------------------------
-- 2. Notifications du Super Admin
-- -----------------------------------------------------------------------------
-- Paiement reçu, nouvelle école, nouveau message… Une notification vaut pour
-- tous les administrateurs de la plateforme ; chacun la lit pour lui.
create table if not exists platform_notifications (
  id          uuid primary key default gen_random_uuid(),
  type        text not null,
  title       text not null,
  body        text not null default '',
  href        text,
  school_id   uuid references schools(id) on delete set null,
  entity_type text,
  entity_id   uuid,
  created_at  timestamptz not null default now()
);
create index if not exists platform_notifications_created_idx on platform_notifications (created_at desc);

create table if not exists platform_notification_reads (
  notification_id uuid not null references platform_notifications(id) on delete cascade,
  user_id         uuid not null references users(id) on delete cascade,
  read_at         timestamptz not null default now(),
  primary key (notification_id, user_id)
);

alter table platform_notifications enable row level security;
alter table platform_notification_reads enable row level security;

drop policy if exists platform_notifications_select on platform_notifications;
create policy platform_notifications_select on platform_notifications for select to authenticated
using (app.is_platform_admin());

drop policy if exists platform_notification_reads_select on platform_notification_reads;
create policy platform_notification_reads_select on platform_notification_reads for select to authenticated
using (user_id = auth.uid() and app.is_platform_admin());
drop policy if exists platform_notification_reads_insert on platform_notification_reads;
create policy platform_notification_reads_insert on platform_notification_reads for insert to authenticated
with check (user_id = auth.uid() and app.is_platform_admin());

-- -----------------------------------------------------------------------------
-- 3. Téléphones abonnés (Web Push)
-- -----------------------------------------------------------------------------
-- Un appareil = une adresse d'envoi fournie par son navigateur. Chacun gère les
-- siens ; l'envoi se fait côté serveur (service_role).
create table if not exists push_subscriptions (
  id           uuid primary key default gen_random_uuid(),
  user_id      uuid not null references users(id) on delete cascade,
  endpoint     text not null unique,
  p256dh       text not null,
  auth         text not null,
  user_agent   text,
  created_at   timestamptz not null default now(),
  last_ok_at   timestamptz,
  failures     integer not null default 0
);
create index if not exists push_subscriptions_user_idx on push_subscriptions (user_id);

alter table push_subscriptions enable row level security;
drop policy if exists push_subscriptions_own on push_subscriptions;
create policy push_subscriptions_own on push_subscriptions for all to authenticated
using (user_id = auth.uid())
with check (user_id = auth.uid());

-- -----------------------------------------------------------------------------
-- 4. Ce que chacun a coupé sur son téléphone
-- -----------------------------------------------------------------------------
-- La cloche garde tout ; seules les notifications sur le téléphone se coupent,
-- type par type. On ne coupe jamais ce que ses droits n'ouvrent pas : on ne le
-- reçoit pas, tout simplement.
create table if not exists notification_preferences (
  user_id    uuid primary key references users(id) on delete cascade,
  muted      text[] not null default '{}',
  updated_at timestamptz not null default now()
);

alter table notification_preferences enable row level security;
drop policy if exists notification_preferences_own on notification_preferences;
create policy notification_preferences_own on notification_preferences for all to authenticated
using (user_id = auth.uid())
with check (user_id = auth.uid());

grant select, insert, update, delete on push_subscriptions, notification_preferences to authenticated;
grant select on platform_notifications to authenticated;
grant select, insert on platform_notification_reads to authenticated;

-- -----------------------------------------------------------------------------
-- 5. « Appel à faire » : les heures de cours qui commencent dans la fenêtre
-- -----------------------------------------------------------------------------
-- Pour le rappel envoyé à l'enseignant (programme de tâches, toutes les 5 min) :
-- chaque heure de cours (0170) qui commence entre p_from (exclu) et p_to (inclus)
-- et dont l'appel n'est pas encore fait, avec les comptes des enseignants.
create or replace function public.attendance_reminders(p_from timestamptz, p_to timestamptz)
returns table (
  school_id uuid,
  occurrence_id uuid,
  hour integer,
  hours integer,
  hour_start timestamptz,
  hour_end timestamptz,
  subject text,
  class_name text,
  user_ids uuid[]
)
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  with occ as materialized (
    select o.id, o.school_id, o.schedule_session_id, o.override_teacher_id,
           coalesce(o.override_starts_at, o.starts_at) as s,
           coalesce(o.override_ends_at, o.ends_at) as e,
           app.session_course_hours(o.schedule_session_id) as n
    from session_occurrences o
    where o.status = 'SCHEDULED'
      and o.occurs_on between (p_from at time zone 'UTC')::date - 1 and (p_to at time zone 'UTC')::date + 1
      and coalesce(o.override_starts_at, o.starts_at) <= p_to
      and coalesce(o.override_ends_at, o.ends_at) > p_from
  ),
  slots as (
    select oc.*, h.h,
           oc.s + (oc.e - oc.s) * (h.h - 1) / oc.n as hs,
           oc.s + (oc.e - oc.s) * h.h / oc.n as he
    from occ oc
    cross join lateral generate_series(1, greatest(oc.n, 1)) as h(h)
  )
  select sl.school_id, sl.id, sl.h, sl.n, sl.hs, sl.he,
         coalesce((select sj.name from schedule_sessions ss join subjects sj on sj.id = ss.subject_id where ss.id = sl.schedule_session_id), 'Cours'),
         (select string_agg(c.name, ' + ' order by c.name) from schedule_session_targets t join classes c on c.id = t.class_id
           where t.session_id = sl.schedule_session_id),
         array(
           select distinct te.user_id from teachers te
           where te.user_id is not null
             and te.id in (
               select sl.override_teacher_id where sl.override_teacher_id is not null
               union all
               select st.teacher_id from schedule_session_teachers st
               where st.session_id = sl.schedule_session_id and sl.override_teacher_id is null
             )
         )
  from slots sl
  left join attendance_registers r on r.session_occurrence_id = sl.id
  where sl.hs > p_from and sl.hs <= p_to
    and (r.id is null or r.hours_taken[sl.h] is null)
$$;
revoke all on function public.attendance_reminders(timestamptz, timestamptz) from public, anon, authenticated;
grant execute on function public.attendance_reminders(timestamptz, timestamptz) to service_role;
