-- =============================================================================
-- 0137 — La matrice complète avec le droit « matrice » ; l'Informaticien imprime
-- =============================================================================
-- Décidé le 2026-10-25 : dans la plupart des écoles, c'est l'informaticien qui
-- tire les matrices (pour les professeurs principaux aussi) et les documents
-- finaux.
--
-- 1. reports.matrix ouvrait la matrice (can_view_class_grades) mais pas les
--    moyennes par matière (can_view_class_subject_grades) : l'Informaticien
--    voyait la matrice avec « — » dans chaque matière, seule la moyenne
--    générale s'affichait. Le droit « matrice » donne maintenant les moyennes
--    par matière de la classe, comme la matrice les montre.
--
-- 2. Informaticien : « Consulter les bulletins » et « Imprimer les bulletins »
--    par défaut (le modèle, et les copies d'école que l'école n'a pas
--    modifiées). Une école peut les décocher.
-- =============================================================================

-- 1. Moyennes par matière ----------------------------------------------------------
create or replace function app.can_view_class_subject_grades(p_class uuid, p_subject uuid)
returns boolean
language sql
stable
security definer
set search_path = app, public, pg_temp
as $$
  select app.is_platform_admin()
    or exists (
      select 1 from public.classes c
      where c.id = p_class
        and (app.can_read(c.school_id, 'grades.view_all') or app.can_read(c.school_id, 'reports.matrix'))
    )
    or exists (
      select 1
      from public.teaching_assignments ta
      join public.teachers t on t.id = ta.teacher_id
      where ta.class_id = p_class
        and ta.subject_id = p_subject
        and ta.status = 'ACTIVE'
        and t.user_id = auth.uid()
        and t.deleted_at is null
    )
    or app.is_head_teacher_of(p_class);
$$;

-- 2. Informaticien : bulletins -------------------------------------------------------
do $$
declare
  v_ids uuid[];
begin
  -- Écriture interne : les garde-fous de 0050 visent les actions d'un utilisateur.
  perform set_config('app.roles_provisioning', 'on', true);

  -- La liste est arrêtée AVANT de toucher au modèle (comparaison au modèle d'avant).
  select array_agg(ro.id) into v_ids
  from public.roles ro
  join public.roles tpl on tpl.school_id is null and tpl.code = ro.code
  where ro.code = 'IT_ADMIN'
    and (
      ro.school_id is null
      -- copie d'école restée identique au modèle
      or (select array_agg(p.code order by p.code)
          from public.role_permissions rp join public.permissions p on p.id = rp.permission_id
          where rp.role_id = ro.id)
       = (select array_agg(p.code order by p.code)
          from public.role_permissions rp join public.permissions p on p.id = rp.permission_id
          where rp.role_id = tpl.id)
    );

  insert into public.role_permissions (role_id, permission_id)
  select r_id, p.id
  from unnest(v_ids) as r_id
  cross join public.permissions p
  where p.code in ('reports.view', 'reports.print')
  on conflict do nothing;

  perform set_config('app.roles_provisioning', 'off', true);
end;
$$;
