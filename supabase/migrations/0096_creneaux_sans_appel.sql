-- =============================================================================
-- 0096 — Les creneaux sans appel
--
-- Un cours passe sans appel laisse ses eleves « non renseignes » : ni presents,
-- ni absents. Personne ne le voit, et les statistiques mentent par omission.
--
-- MAIS un appel manquant N'ACCUSE PERSONNE. L'enseignant peut etre absent, le
-- cours peut n'avoir pas eu lieu, le telephone peut avoir lache — ou l'appel a
-- simplement ete oublie. L'application LISTE et demande qu'on QUALIFIE ; elle
-- ne conclut pas.
--
-- Le droit de voir cette liste est un droit a part, configurable comme les
-- autres : toutes les ecoles ne confient pas ce suivi a la meme personne.
-- =============================================================================

insert into permissions (code, module, action, description, is_platform_only) values
  ('attendance.missing_calls', 'attendance', 'missing_calls', 'Suivre les appels non faits et les qualifier', false)
on conflict (code) do nothing;

-- Le censeur et l'educateur suivent la vie scolaire au quotidien ; la direction
-- voit tout. On rattache par CODE de role, pour couvrir le modele systeme et la
-- copie de chaque ecole.
with cible as (
  select p.id permission_id, r.id role_id
  from permissions p
  join roles r on r.code = any (array['CENSOR', 'SUPERVISOR', 'DIRECTOR', 'SCHOOL_ADMIN'])
  where p.code = 'attendance.missing_calls'
)
insert into role_permissions (role_id, permission_id)
select role_id, permission_id from cible
on conflict do nothing;

-- -----------------------------------------------------------------------------
-- La qualification d'un creneau sans appel
--
-- `reason` est un TEXTE, pas un enum : la liste des motifs se regle par
-- etablissement (school_settings / espace `attendance`, cle `gapReasons`).
-- Une ecole peut en ajouter un que nous n'avions pas prevu sans migration.
-- -----------------------------------------------------------------------------

create table attendance_gaps (
  id                    uuid primary key default gen_random_uuid(),
  school_id             uuid not null references schools(id) on delete cascade,
  session_occurrence_id uuid not null references session_occurrences(id) on delete cascade,

  reason                text not null,
  note                  text,

  reviewed_by           uuid references users(id) on delete set null,
  reviewed_at           timestamptz not null default now(),
  created_at            timestamptz not null default now(),
  updated_at            timestamptz not null default now(),

  -- Une seule qualification par creneau : on corrige la ligne, on n'empile pas
  -- des avis contradictoires.
  unique (session_occurrence_id),
  constraint attendance_gaps_reason_len check (char_length(reason) between 1 and 40),
  constraint attendance_gaps_note_len   check (note is null or char_length(note) <= 500)
);

create index attendance_gaps_school_idx on attendance_gaps (school_id, reviewed_at desc);

create trigger attendance_gaps_touch before update on attendance_gaps
  for each row execute function app.touch_updated_at();

alter table attendance_gaps enable row level security;
alter table attendance_gaps force  row level security;

-- L'enseignant concerne voit ce qu'on a note sur SES creneaux : etre mis en
-- cause sans le savoir serait injuste.
create policy attendance_gaps_select on attendance_gaps for select to authenticated
using (
  app.can_read(attendance_gaps.school_id, 'attendance.missing_calls')
  or app.can_read(attendance_gaps.school_id, 'attendance.view_all')
  or exists (
    -- Celui qui tient le creneau : l'enseignant de la seance, ou celui qui le
    -- remplace ce jour-la.
    select 1
    from public.session_occurrences o
    left join public.schedule_session_teachers st on st.session_id = o.schedule_session_id
    where o.id = session_occurrence_id
      and app.my_teacher_id(attendance_gaps.school_id) in (st.teacher_id, o.override_teacher_id)
  )
);

create policy attendance_gaps_insert on attendance_gaps for insert to authenticated
with check (app.can_write(school_id, 'attendance.missing_calls'));

create policy attendance_gaps_update on attendance_gaps for update to authenticated
using (app.can_write(school_id, 'attendance.missing_calls'))
with check (app.can_write(school_id, 'attendance.missing_calls'));

create policy attendance_gaps_delete on attendance_gaps for delete to authenticated
using (app.can_write(school_id, 'attendance.missing_calls'));

comment on table attendance_gaps is
  'Pourquoi l''appel n''a pas ete fait sur un creneau. Qualifie a la main : l''application ne conclut jamais seule.';
comment on column attendance_gaps.reason is
  'Code du motif, choisi dans la liste reglee par l''etablissement (school_settings / attendance / gapReasons).';
