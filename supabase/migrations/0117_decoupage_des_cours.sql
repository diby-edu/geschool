-- =============================================================================
-- 0117 — Découpage d'un enseignement en cours : « 4+2 », « 2+2+2 »…
-- =============================================================================
-- 6 h de maths peuvent se faire en 6 cours d'1 h, 3 cours de 2 h, ou 1 cours
-- de 4 h et 1 de 2 h. Chaque nombre est la durée d'un cours en heures (= en
-- créneaux consécutifs : 1 cours = 1 heure). Vide = « N séances de D »
-- comme avant (sessions_count, session_duration_minutes).
alter table teaching_requirements add column if not exists block_hours smallint[];
alter table teaching_requirements drop constraint if exists teaching_requirements_block_hours_valid;
alter table teaching_requirements add constraint teaching_requirements_block_hours_valid check (
  block_hours is null
  or (cardinality(block_hours) between 1 and 20 and 1 <= all (block_hours) and 8 >= all (block_hours))
);
comment on column teaching_requirements.block_hours is
  'Découpage de la semaine : durée de chaque cours en heures (créneaux). Ex. {4,2}. Vide = sessions_count x durée.';
