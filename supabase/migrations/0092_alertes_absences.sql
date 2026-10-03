-- =============================================================================
-- 0092 — Les alertes d'absence partent vraiment
--
-- L'ecran de reglage existait (seuil d'alerte, seuil de convocation,
-- destinataires), mais RIEN ne lisait ces valeurs : des boutons qui ne
-- commandaient rien. Cette table est la piece manquante.
--
-- Elle retient ce qui a DEJA ete signale, pour ne pas prevenir deux fois le
-- meme franchissement. Sans cela, chaque passage de la tache enverrait une
-- notification de plus a la meme famille, pour la meme absence.
-- =============================================================================

create type attendance_alert_kind as enum ('ALERT', 'SUMMONS');

create table attendance_alerts (
  id                 uuid primary key default gen_random_uuid(),
  school_id          uuid not null references schools(id) on delete cascade,
  student_id         uuid not null references students(id) on delete cascade,
  academic_period_id uuid not null references academic_periods(id) on delete cascade,
  kind               attendance_alert_kind not null,

  -- Le seuil franchi, et le total au moment du signalement : si l'ecole releve
  -- son seuil plus tard, on saura pourquoi l'alerte etait partie.
  threshold_hours    integer not null,
  hours_at_alert     integer not null,

  -- Combien de personnes ont ete prevenues, et par quel moyen.
  recipients         integer not null default 0,
  sms_sent           integer not null default 0,

  created_at         timestamptz not null default now(),

  constraint attendance_alerts_hours check (threshold_hours >= 0 and hours_at_alert >= 0)
);

-- Un seul signalement par eleve, par periode et par type. Le jour ou le seuil
-- change, l'ecole peut effacer la ligne pour relancer le signalement.
create unique index attendance_alerts_key
  on attendance_alerts (student_id, academic_period_id, kind);

create index attendance_alerts_school_idx on attendance_alerts (school_id, created_at desc);

alter table attendance_alerts enable row level security;
alter table attendance_alerts force  row level security;

-- Voir les alertes, c'est voir les absences : meme droit.
create policy attendance_alerts_select on attendance_alerts for select to authenticated
using (
  app.is_platform_admin()
  or school_id in (select app.my_schools_with('attendance.view_all'))
);

comment on table attendance_alerts is
  'Signalements d''absence deja envoyes. Empeche de prevenir deux fois la meme famille pour le meme franchissement.';
