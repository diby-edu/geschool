-- =============================================================================
-- 0034 — Generation atomique du matricule eleve (additif comptes §6)
-- =============================================================================
--
-- Le matricule doit etre attribue par le SERVEUR (jamais par un appareil hors
-- ligne) et sans collision meme sous inscriptions concurrentes. Un simple
-- count(*)+1 serait fautif. On utilise un compteur par (etablissement, annee)
-- incremente atomiquement par un UPSERT.

create table matricule_counters (
  school_id        uuid not null references schools(id) on delete cascade,
  academic_year_id uuid not null references academic_years(id) on delete cascade,
  next_seq         integer not null default 1,
  primary key (school_id, academic_year_id)
);

-- Renvoie le prochain numero de sequence, de facon atomique.
create or replace function app.next_matricule_seq(p_school uuid, p_year uuid)
returns integer
language sql
security definer
set search_path = app, public, pg_temp
as $$
  insert into public.matricule_counters (school_id, academic_year_id, next_seq)
  values (p_school, p_year, 2)
  on conflict (school_id, academic_year_id)
  do update set next_seq = matricule_counters.next_seq + 1
  returning next_seq - 1;
$$;

grant execute on function app.next_matricule_seq(uuid, uuid) to authenticated, service_role;

-- -----------------------------------------------------------------------------
-- RLS : la table est interne, ecrite uniquement par la fonction DEFINER (qui
-- s'execute en tant que postgres, porteur de BYPASSRLS). Aucun acces direct
-- pour authenticated. Les quatre policies « plateforme uniquement » satisfont
-- le controle de couverture RLS tout en fermant l'acces.
-- -----------------------------------------------------------------------------

alter table matricule_counters enable row level security;
alter table matricule_counters force  row level security;

create policy matricule_counters_select on matricule_counters for select to authenticated
using (app.is_platform_admin());
create policy matricule_counters_insert on matricule_counters for insert to authenticated
with check (app.is_platform_admin());
create policy matricule_counters_update on matricule_counters for update to authenticated
using (app.is_platform_admin()) with check (app.is_platform_admin());
create policy matricule_counters_delete on matricule_counters for delete to authenticated
using (app.is_platform_admin());

grant select, insert, update, delete on matricule_counters to authenticated;
