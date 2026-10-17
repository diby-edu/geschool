-- =============================================================================
-- 0131 — Droits d'ÉCRITURE : calculés une fois par requête, plus par ligne
-- =============================================================================
-- Suite de 0121-0127 (lecture). 303 appels à app.can_write / can_write_year
-- dans les règles d'écriture (166 règles) étaient évalués pour CHAQUE ligne
-- écrite. Mesuré le 2026-10-16 : générer les bulletins d'une classe écrit
-- 600 lignes de matières, 5,5 s pour cet envoi seul ; un appel (50 élèves),
-- une saisie de notes ou un import paient le même prix ligne par ligne.
--
-- can_write(S, D) = is_platform_admin()
--                   OR (is_member_of(S) AND school_is_writable(S) AND has_permission(S, D))
--   -> ((SELECT app.is_platform_admin()) OR S IN (SELECT app.my_writable_schools_with(D)))
--
-- can_write_year(S, Y, D) = is_platform_admin() OR (can_write(S, D) AND year_is_open(Y))
--   -> ((SELECT app.is_platform_admin())
--       OR (S IN (SELECT app.my_writable_schools_with(D)) AND (Y IS NULL OR Y IN (SELECT app.open_years()))))
--
-- my_writable_schools_with(D) = my_schools_with(D) (appartenance ACTIVE + droit,
-- exactement has_permission) restreint aux écoles ACTIVE (school_is_writable).
-- open_years() = les années DRAFT ou ACTIVE (year_is_open, Y non nul).
-- Les fonctions d'origine restent, pour le code qui les appelle.
-- =============================================================================

create or replace function app.my_writable_schools_with(p_code text)
returns setof uuid
language sql
stable
security definer
set search_path = app, public, pg_temp
as $$
  select w.school_id
  from (select app.my_schools_with(p_code) as school_id) w
  join public.schools s on s.id = w.school_id and s.status = 'ACTIVE';
$$;

create or replace function app.open_years()
returns setof uuid
language sql
stable
security definer
set search_path = app, public, pg_temp
as $$
  select y.id from public.academic_years y where y.status in ('DRAFT', 'ACTIVE');
$$;

revoke all on function app.my_writable_schools_with(text) from public, anon;
revoke all on function app.open_years() from public, anon;
grant execute on function app.my_writable_schools_with(text) to authenticated, service_role;
grant execute on function app.open_years() to authenticated, service_role;

do $$
declare
  r record;
  v_q text;
  v_w text;
  v_sql text;
  c_write constant text := '((SELECT app.is_platform_admin()) OR \1 IN (SELECT app.my_writable_schools_with(\2)))';
  c_year constant text :=
    '((SELECT app.is_platform_admin()) OR (\1 IN (SELECT app.my_writable_schools_with(\3)) AND (\2 IS NULL OR \2 IN (SELECT app.open_years()))))';
  re_write constant text := 'app\.can_write\(([a-z_][a-z0-9_.]*), (''[a-z_.]+''::text)\)';
  re_year constant text := 'app\.can_write_year\(([a-z_][a-z0-9_.]*), ([a-z_][a-z0-9_.]*), (''[a-z_.]+''::text)\)';
begin
  for r in
    select tablename, policyname, qual, with_check
    from pg_policies
    where schemaname = 'public'
      and (coalesce(qual, '') like '%app.can_write%' or coalesce(with_check, '') like '%app.can_write%')
  loop
    v_q := r.qual;
    v_w := r.with_check;
    if v_q is not null then
      v_q := regexp_replace(regexp_replace(v_q, re_year, c_year, 'g'), re_write, c_write, 'g');
    end if;
    if v_w is not null then
      v_w := regexp_replace(regexp_replace(v_w, re_year, c_year, 'g'), re_write, c_write, 'g');
    end if;
    if v_q is distinct from r.qual or v_w is distinct from r.with_check then
      v_sql := format('alter policy %I on public.%I', r.policyname, r.tablename);
      if v_q is not null then v_sql := v_sql || format(' using (%s)', v_q); end if;
      if v_w is not null then v_sql := v_sql || format(' with check (%s)', v_w); end if;
      execute v_sql;
    end if;
  end loop;
end;
$$;
