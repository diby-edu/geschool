-- =============================================================================
-- 0166 — Tableau de bord : le personnel en une lecture courte
-- =============================================================================
-- Mesuré en ligne le 2026-10-31 (relevé « [lent] » du serveur) : sur Cocotiers,
-- toutes les lectures du tableau de bord sont finies vers 0,5 s, sauf la liste
-- du personnel, qui arrive 0,4 s plus tard. Elle part des liens personne ↔
-- fonction de TOUTE la plateforme (parents et enseignants compris), droits
-- revérifiés ligne par ligne, pour ne garder que ceux de l'école.
--
-- Le tableau de bord n'affiche que le nombre de personnes et leurs fonctions :
-- cette fonction rend, pour l'école, une ligne par personne et par fonction
-- hors enseignant, parent et élève (le tri fin — fondateur, fonctions prévues ou
-- « F_… » — reste fait par l'application, comme dans la page Personnel).
-- Droit : consulter les utilisateurs (users.view), comme la page Personnel.
-- =============================================================================

create or replace function public.dashboard_staff_functions(p_school uuid)
returns table (user_id uuid, code text, name text)
language plpgsql
stable
security definer
set search_path = public, pg_temp
as $$
begin
  if not app.can_read(p_school, 'users.view') then
    raise exception 'Droit requis : consulter les utilisateurs.' using errcode = '42501';
  end if;
  return query
  select m.user_id, r.code::text, r.name::text
  from school_memberships m
  join membership_roles mr on mr.membership_id = m.id
  join roles r on r.id = mr.role_id
  where m.school_id = p_school
    and r.code not in ('TEACHER', 'PARENT', 'STUDENT');
end;
$$;

revoke all on function public.dashboard_staff_functions(uuid) from public, anon;
grant execute on function public.dashboard_staff_functions(uuid) to authenticated;
