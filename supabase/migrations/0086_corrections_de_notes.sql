-- =============================================================================
-- 0086 — Corriger une note apres cloture, sans pouvoir le faire en cachette
--
-- Apres la cloture, les professeurs principaux verifient les moyennes avec
-- l'administration, et des corrections apparaissent. Le risque est evident :
-- changer la note d'un enseignant sans son accord.
--
-- LA REGLE : on ne corrige jamais une moyenne, on corrige une NOTE. Une moyenne
-- modifiee a la main ne correspondrait a aucune note — impossible a justifier
-- devant un parent qui demande le detail. La moyenne se recalcule seule.
--
-- LE CIRCUIT :
--   1. quelqu'un DEMANDE la correction, motif obligatoire ;
--   2. RIEN NE CHANGE : la note reste l'ancienne ;
--   3. l'enseignant voit l'avant, l'apres, qui demande et pourquoi ;
--   4. il accepte (la note change) ou il refuse (rien ne bouge) ;
--   5. sans reponse, la demande reste en attente — jamais appliquee seule ;
--   6. le directeur peut passer outre, et la ligne le DIT.
--
-- Cette table est aussi le JOURNAL : rien ne s'y efface, aucune politique de
-- suppression n'est creee.
-- =============================================================================

create type grade_change_status as enum (
  'PENDING',                  -- en attente de la reponse de l'enseignant
  'ACCEPTED',                 -- l'enseignant a accepte, la note est changee
  'REFUSED',                  -- l'enseignant a refuse, rien n'a bouge
  'APPLIED_WITHOUT_CONSENT'   -- la direction est passee outre
);

create table grade_change_requests (
  id              uuid primary key default gen_random_uuid(),
  school_id       uuid not null references schools(id) on delete cascade,

  grade_id        uuid not null references grades(id) on delete cascade,
  assessment_id   uuid not null references assessments(id) on delete cascade,
  student_id      uuid not null references students(id) on delete cascade,
  -- L'enseignant a qui la demande est adressee : celui de l'evaluation, fige
  -- ici pour que la demande survive a un changement d'affectation.
  teacher_id      uuid references teachers(id) on delete set null,

  old_score       numeric(8,3),
  old_is_absent   boolean not null default false,
  new_score       numeric(8,3),
  new_is_absent   boolean not null default false,

  reason          text not null,
  status          grade_change_status not null default 'PENDING',

  requested_by    uuid not null references users(id) on delete restrict,
  requested_at    timestamptz not null default now(),
  decided_by      uuid references users(id) on delete set null,
  decided_at      timestamptz,
  decision_reason text,

  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now(),

  -- Un motif vide viderait le journal de son interet.
  constraint grade_change_reason_not_blank check (length(btrim(reason)) >= 5),
  -- Demander une correction identique a la note actuelle n'a pas de sens.
  constraint grade_change_is_a_change check (
    old_score is distinct from new_score or old_is_absent is distinct from new_is_absent
  ),
  -- Une decision porte toujours son auteur et sa date.
  constraint grade_change_decision_complete check (
    (status = 'PENDING' and decided_by is null and decided_at is null)
    or (status <> 'PENDING' and decided_at is not null)
  )
);

-- Une seule demande en attente par note : sinon deux corrections
-- contradictoires pourraient etre acceptees l'une apres l'autre.
create unique index grade_change_one_pending
  on grade_change_requests (grade_id) where status = 'PENDING';

create index grade_change_teacher_idx on grade_change_requests (school_id, teacher_id, status);
create index grade_change_assessment_idx on grade_change_requests (school_id, assessment_id);

create trigger grade_change_requests_touch before update on grade_change_requests
  for each row execute function app.touch_updated_at();

-- -----------------------------------------------------------------------------
-- Acces
-- -----------------------------------------------------------------------------

alter table grade_change_requests enable row level security;
alter table grade_change_requests force  row level security;

-- Voir : l'administration qui suit les moyennes, l'enseignant concerne, et
-- celui qui a fait la demande.
create policy grade_change_select on grade_change_requests for select to authenticated
using (
  school_id in (select app.my_schools_with('grades.view_all'))
  or teacher_id = app.my_teacher_id(school_id)
  or requested_by = auth.uid()
);

create policy grade_change_insert on grade_change_requests for insert to authenticated
with check (
  app.can_write(school_id, 'grades.request_change')
  and requested_by = auth.uid()
  and status = 'PENDING'
);

-- Repondre : l'enseignant concerne. Passer outre : qui detient grades.override.
create policy grade_change_update on grade_change_requests for update to authenticated
using (
  teacher_id = app.my_teacher_id(school_id)
  or app.can_write(school_id, 'grades.override')
)
with check (
  teacher_id = app.my_teacher_id(school_id)
  or app.can_write(school_id, 'grades.override')
);

-- Pas de politique de suppression : un journal ne s'efface pas.

comment on table grade_change_requests is
  'Demandes de correction de note apres cloture, et journal des decisions. Rien ne s''y efface.';
comment on column grade_change_requests.status is
  'APPLIED_WITHOUT_CONSENT : la direction a applique la correction malgre l''enseignant. La mention reste.';

-- -----------------------------------------------------------------------------
-- Accepter, refuser, passer outre — en UNE operation
--
-- Changer la note d'un cote et le statut de l'autre laisserait, au moindre
-- incident, une demande « acceptee » sur une note inchangee. Les deux vont
-- ensemble ou aucun des deux.
-- -----------------------------------------------------------------------------

create or replace function app.decide_grade_change(
  p_request uuid,
  p_accept boolean,
  p_reason text default null
)
returns grade_change_status
language plpgsql
security definer
set search_path to 'app', 'public', 'pg_temp'
as $$
declare
  d            grade_change_requests%rowtype;
  est_le_prof  boolean;
  peut_forcer  boolean;
  nouveau      grade_change_status;
begin
  select * into d from public.grade_change_requests where id = p_request;
  if not found then
    raise exception 'Demande de correction introuvable.';
  end if;
  if d.status <> 'PENDING' then
    raise exception 'Cette demande a déjà reçu une réponse.';
  end if;

  est_le_prof := d.teacher_id is not null and d.teacher_id = app.my_teacher_id(d.school_id);
  peut_forcer := app.can_write(d.school_id, 'grades.override');

  if not est_le_prof and not peut_forcer then
    raise exception 'Seul l''enseignant concerné peut répondre à cette demande.';
  end if;

  if not p_accept then
    if est_le_prof then
      nouveau := 'REFUSED';
    else
      raise exception 'Un refus n''appartient qu''à l''enseignant concerné.';
    end if;
  elsif est_le_prof then
    nouveau := 'ACCEPTED';
  else
    -- La direction applique malgre l'enseignant : la mention reste, pour
    -- toujours, dans le journal.
    nouveau := 'APPLIED_WITHOUT_CONSENT';
  end if;

  if nouveau <> 'REFUSED' then
    update public.grades
       set score = d.new_score,
           is_absent = d.new_is_absent,
           updated_by = auth.uid(),
           updated_at = now()
     where id = d.grade_id;
    if not found then
      raise exception 'La note visée n''existe plus.';
    end if;
  end if;

  update public.grade_change_requests
     set status = nouveau,
         decided_by = auth.uid(),
         decided_at = now(),
         decision_reason = nullif(btrim(coalesce(p_reason, '')), '')
   where id = p_request;

  return nouveau;
end;
$$;

comment on function app.decide_grade_change(uuid, boolean, text) is
  'Reponse a une demande de correction : la note et le journal changent ensemble, jamais l''un sans l''autre.';

create or replace function decide_grade_change(p_request uuid, p_accept boolean, p_reason text default null)
returns grade_change_status
language sql
security definer
set search_path to 'app', 'public', 'pg_temp'
as $$
  select app.decide_grade_change(p_request, p_accept, p_reason);
$$;

grant execute on function decide_grade_change(uuid, boolean, text) to authenticated;
