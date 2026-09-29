-- =============================================================================
-- 0075 — Lecture des notes a l'echelle reelle (RLS)
-- =============================================================================
--
-- Suite de 0073, sur la chaine des notes. Meme cause, meme correction.
--
-- app.can_read(school_id, '<droit>') est evaluee UNE FOIS PAR LIGNE, et elle
-- contient app.has_permission : une jointure sur quatre tables. Sur une ecole
-- reelle (mesure sur l'ecole de demonstration : 10 848 evaluations, 542 400
-- notes), compter les evaluations de l'annee pour paginer la liste prenait
-- 16 110 ms — trois fois le statement_timeout. L'ecran « Notes & evaluations »
-- de l'administration ne s'affichait tout simplement pas.
--
-- Avec une premiere branche NON CORRELEE a la ligne, evaluee une seule fois
-- pour toute la requete : 145 ms. Meme resultat exact (10 848 lignes visibles),
-- donc meme perimetre de securite — seul le chemin pour y arriver change.
--
-- app.my_schools_with(text) vient de 0073 ; elle est redefinie ici a
-- l'identique pour que cette migration reste applicable seule.

create or replace function app.my_schools_with(p_code text)
returns setof uuid
language sql
stable
security definer
set search_path = app, public, pg_temp
as $$
  select m.school_id
  from public.school_memberships m
  join public.membership_roles mr on mr.membership_id = m.id
  join public.role_permissions rp on rp.role_id = mr.role_id
  join public.permissions perm on perm.id = rp.permission_id
  where m.user_id = auth.uid()
    and m.status = 'ACTIVE'
    and perm.code = p_code;
$$;

grant execute on function app.my_schools_with(text) to authenticated, service_role;

-- Les evaluations.
drop policy if exists assessments_select on public.assessments;
create policy assessments_select on public.assessments
for select using (
  school_id in (select app.my_schools_with('assessments.view'))
  or (select app.is_platform_admin())
  or app.owns_assessment(id)
  or (class_id is not null and app.teaches_class(class_id))
  or (group_id is not null and app.teaches_group(group_id))
  or (status = 'PUBLISHED' and app.assessment_concerns_my_student(school_id, id))
);

-- Les notes.
drop policy if exists grades_select on public.grades;
create policy grades_select on public.grades
for select using (
  school_id in (select app.my_schools_with('grades.view_all'))
  or (select app.is_platform_admin())
  or app.owns_assessment(assessment_id)
  or (
    app.can_see_student(school_id, student_id)
    and (app.has_permission(school_id, 'grades.view') or app.assessment_is_published(assessment_id))
  )
);

-- Les bulletins et leurs lignes.
drop policy if exists report_cards_select on public.report_cards;
create policy report_cards_select on public.report_cards
for select using (
  school_id in (select app.my_schools_with('reports.view'))
  or (select app.is_platform_admin())
  or (status = 'PUBLISHED' and app.can_see_student(school_id, student_id))
);

drop policy if exists report_items_select on public.report_card_items;
create policy report_items_select on public.report_card_items
for select using (
  school_id in (select app.my_schools_with('reports.view'))
  or (select app.is_platform_admin())
  or exists (
    select 1
    from public.report_cards rc
    where rc.id = report_card_items.report_card_id
      and rc.status = 'PUBLISHED'
      and app.can_see_student(rc.school_id, rc.student_id)
  )
);
