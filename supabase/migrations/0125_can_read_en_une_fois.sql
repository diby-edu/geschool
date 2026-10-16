-- =============================================================================
-- 0125 — app.can_read() dans les règles de lecture : calculé une fois par requête
-- =============================================================================
-- Suite de 0121-0123. 26 règles de lecture appelaient app.can_read(école, droit)
-- pour CHAQUE ligne (comptes d'accès, appels, conseils, discipline…). Mesuré le
-- 2026-10-16 : la page « Accès » lançait une dizaine de comptages de 2 à 3 s
-- chacun sur 232 comptes seulement.
--
-- can_read(S, D) = is_platform_admin() OR (is_member_of(S) AND has_permission(S, D)).
-- has_permission exige déjà une appartenance ACTIVE ; my_schools_with(D) rend
-- exactement les écoles où has_permission(S, D) est vrai. Donc :
--
--   app.can_read(S, 'D'::text)
--     -> ((SELECT app.is_platform_admin()) OR S IN (SELECT app.my_schools_with('D'::text)))
--
-- Seules les formes simples (colonne, droit écrit en dur) sont réécrites ; un
-- appel aux arguments plus complexes reste tel quel. Rejouable.
-- =============================================================================
do $$
declare
  r record;
  v_new text;
begin
  for r in
    select tablename, policyname, qual
    from pg_policies
    where schemaname = 'public' and qual like '%app.can_read(%'
  loop
    v_new := regexp_replace(
      r.qual,
      'app\.can_read\(([a-z_][a-z0-9_.]*), (''[a-z_.]+''::text)\)',
      '((SELECT app.is_platform_admin()) OR \1 IN (SELECT app.my_schools_with(\2)))',
      'g'
    );
    if v_new <> r.qual then
      execute format('alter policy %I on public.%I using (%s)', r.policyname, r.tablename, v_new);
    end if;
  end loop;
end;
$$;
