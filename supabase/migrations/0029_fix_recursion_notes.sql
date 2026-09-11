-- =============================================================================
-- 0029 — Correctif : recursion infinie entre les policies grades et assessments
-- =============================================================================
--
-- SYMPTOME  « infinite recursion detected in policy for relation "grades" »
--           (SQLSTATE 42P17) sur toute lecture de note, et le meme sur
--           assessments.
--
-- CAUSE     Les deux policies se referencaient mutuellement :
--
--             grades_select      -> sous-requete sur assessments (« publiee ? »)
--             assessments_select -> sous-requete sur grades (« concerne un de
--                                    mes enfants ? »)
--
--           Evaluer l'une declenche l'autre, qui redeclenche la premiere.
--           PostgreSQL detecte la boucle et refuse la requete. Ce n'est donc
--           pas une fuite, mais un deni de service complet sur les notes.
--
-- CORRECTIF Deplacer les deux sous-requetes dans des fonctions SECURITY
--           DEFINER. Le corps d'une fonction DEFINER n'est pas soumis a la
--           RLS : la chaine s'interrompt. C'est exactement le mecanisme deja
--           employe par la migration 0005 pour les policies d'appartenance.
--
--           Les fonctions ne renvoient qu'un booleen, jamais de donnee : elles
--           n'ouvrent aucun acces qui n'etait pas deja decide par la policy
--           appelante.

-- -----------------------------------------------------------------------------
-- Fonctions de rupture de cycle
-- -----------------------------------------------------------------------------

create or replace function app.assessment_is_published(p_assessment uuid)
returns boolean
language sql
stable
security definer
set search_path = app, public, pg_temp
as $$
  select exists (
    select 1 from public.assessments a
    where a.id = p_assessment and a.status = 'PUBLISHED'
  );
$$;

-- Une evaluation encore ouverte reste modifiable par l'enseignant qui la
-- porte ; une fois CLOSED ou PUBLISHED, seule la direction intervient.
create or replace function app.assessment_is_open(p_assessment uuid)
returns boolean
language sql
stable
security definer
set search_path = app, public, pg_temp
as $$
  select exists (
    select 1 from public.assessments a
    where a.id = p_assessment and a.status in ('DRAFT', 'OPEN')
  );
$$;

-- Cette evaluation porte-t-elle sur un eleve de mon perimetre familial ?
create or replace function app.assessment_concerns_my_student(
  p_school     uuid,
  p_assessment uuid
)
returns boolean
language sql
stable
security definer
set search_path = app, public, pg_temp
as $$
  select exists (
    select 1
    from public.grades g
    where g.assessment_id = p_assessment
      and g.student_id = any (app.my_student_ids(p_school))
  );
$$;

grant execute on function
  app.assessment_is_published(uuid),
  app.assessment_is_open(uuid),
  app.assessment_concerns_my_student(uuid, uuid)
to authenticated, service_role;

-- -----------------------------------------------------------------------------
-- Policies reecrites
-- -----------------------------------------------------------------------------

drop policy if exists assessments_select on assessments;

create policy assessments_select on assessments for select to authenticated
using (
  app.can_read(school_id, 'assessments.view')
  or app.owns_assessment(id)
  or (class_id is not null and app.teaches_class(class_id))
  or (group_id is not null and app.teaches_group(group_id))
  -- Familles : uniquement les evaluations publiees qui concernent leur enfant
  or (status = 'PUBLISHED' and app.assessment_concerns_my_student(school_id, id))
);

drop policy if exists grades_select on grades;

create policy grades_select on grades for select to authenticated
using (
  app.can_read(school_id, 'grades.view_all')
  or app.owns_assessment(assessment_id)
  or (
    app.can_see_student(school_id, student_id)
    and (
      app.has_permission(school_id, 'grades.view')
      or app.assessment_is_published(assessment_id)
    )
  )
);

drop policy if exists grades_update on grades;

create policy grades_update on grades for update to authenticated
using (
  app.can_write(school_id, 'grades.update')
  or (app.owns_assessment(assessment_id) and app.assessment_is_open(assessment_id))
)
with check (
  app.can_write(school_id, 'grades.update')
  or (app.owns_assessment(assessment_id) and app.assessment_is_open(assessment_id))
);
