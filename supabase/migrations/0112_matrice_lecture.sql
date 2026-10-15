-- =============================================================================
-- 0112 — Tirer la matrice d'une classe, c'est pouvoir lire ses moyennes
-- =============================================================================
-- Le droit `reports.matrix` (0111) est donné par défaut à l'informaticien, qui
-- n'a pas « voir toutes les notes ». Sans cette ligne, sa matrice sortait vide.
create or replace function app.can_view_class_grades(p_class uuid)
returns boolean
language sql
stable
security definer
set search_path to 'app', 'public', 'pg_temp'
as $$
  select app.is_platform_admin()
    or exists (
      select 1 from public.classes c
      where c.id = p_class
        and (app.can_read(c.school_id, 'grades.view_all') or app.can_read(c.school_id, 'reports.matrix'))
    )
    or app.is_head_teacher_of(p_class);
$$;
