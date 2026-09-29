-- =============================================================================
-- 0044 — Code ecole : identifiant de connexion court, genere par la plateforme
-- =============================================================================
--
-- Les enseignants et les parents se connectent avec : code ecole + telephone +
-- mot de passe, sur la page de connexion unique. Le code ecole est genere par
-- la plateforme (6 chiffres, jamais de zero en tete) et non le code officiel
-- du Ministere : celui-ci est saisi sans verification, donc ni unique ni
-- stable (doublons, fautes de frappe, remplacement d'un code provisoire).
-- Le code officiel reste une simple information (schools.registration_number).
--
-- Le code est attribue par un trigger a l'insertion : aucun code applicatif
-- (inscription en libre-service, creation par le Super Admin) n'a a s'en
-- occuper. Il est immuable : les SMS deja envoyes et les appareils qui l'ont
-- memorise ne doivent jamais devenir faux.

alter table schools add column login_code text;

-- SECURITY DEFINER : doit voir TOUS les codes deja attribues, quelles que
-- soient les policies RLS de l'appelant. Le verrou consultatif serialise les
-- attributions concurrentes (creation d'ecole : operation rare).
create or replace function app.generate_school_code()
returns text
language plpgsql
volatile
security definer
set search_path = public, pg_temp
as $$
declare
  candidate text;
  attempts  int := 0;
begin
  perform pg_advisory_xact_lock(4210044);
  loop
    candidate := (100000 + floor(random() * 900000))::int::text;
    exit when not exists (select 1 from public.schools where login_code = candidate);
    attempts := attempts + 1;
    if attempts > 500 then
      raise exception 'Espace des codes ecole sature.';
    end if;
  end loop;
  return candidate;
end;
$$;

revoke all on function app.generate_school_code() from public, authenticated;

create or replace function app.schools_set_login_code()
returns trigger
language plpgsql
as $$
begin
  if new.login_code is null then
    new.login_code := app.generate_school_code();
  end if;
  return new;
end;
$$;

create trigger schools_login_code_before_insert
  before insert on schools
  for each row execute function app.schools_set_login_code();

-- Ecoles deja creees
update schools set login_code = app.generate_school_code() where login_code is null;

alter table schools alter column login_code set not null;
alter table schools add constraint schools_login_code_key unique (login_code);
alter table schools add constraint schools_login_code_format check (login_code ~ '^[1-9][0-9]{5}$');

comment on column schools.login_code is
  'Code ecole de connexion (6 chiffres), genere par la plateforme, unique et immuable. Distinct du code officiel (registration_number).';

create or replace function app.schools_login_code_immutable()
returns trigger
language plpgsql
as $$
begin
  if new.login_code is distinct from old.login_code then
    raise exception 'Le code ecole est immuable.' using errcode = '23514';
  end if;
  return new;
end;
$$;

create trigger schools_login_code_immutable
  before update of login_code on schools
  for each row execute function app.schools_login_code_immutable();
