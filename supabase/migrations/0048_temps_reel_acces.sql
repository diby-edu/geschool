-- 0048 — Ecrans en direct
--
-- Les ecrans de l'application se mettent a jour a la seconde des qu'une
-- information est VALIDEE : l'application s'abonne (Supabase Realtime) aux
-- changements des tables ci-dessous pour l'etablissement affiche, puis relit
-- les donnees cote serveur avec les droits de l'utilisateur.
--
-- Perimetre : les tables ou se lit une validation, pas chaque ligne saisie.
-- `grades` (des centaines de milliers de lignes) et `attendance_records` ne sont
-- pas diffusees ; l'application signale l'enregistrement des notes sur
-- `assessments` et la validation de l'appel se lit sur `attendance_registers`.
-- Idem pour l'emploi du temps : `schedule_versions`, pas les seances generees.
-- La liste doit rester alignee sur `src/components/realtime/live-tables.ts`.
--
-- Securite : Realtime evalue la RLS de chaque abonne. Une personne ne recoit
-- donc que les lignes que la politique SELECT de la table lui laisse deja lire ;
-- rien de plus n'est expose qu'en lecture directe.
--
-- Additif et sans effet sur le code deja deploye : ajouter une table a la
-- publication ne change ni le schema ni les requetes existantes. Toutes ces
-- tables ont une cle primaire (necessaire pour publier les UPDATE/DELETE).

do $$
declare
  t text;
begin
  -- Sur un Postgres qui n'est pas Supabase (CI, base locale), la publication
  -- n'existe pas : on la cree pour que la migration reste rejouable partout.
  if not exists (select 1 from pg_publication where pubname = 'supabase_realtime') then
    create publication supabase_realtime;
  end if;

  foreach t in array array[
    'students', 'student_enrollments', 'student_guardians', 'teachers',
    'account_access', 'credential_deliveries',
    'assessments', 'report_cards', 'attendance_registers', 'absence_justifications',
    'announcements', 'notifications',
    'academic_years', 'classes', 'subjects', 'rooms', 'teaching_assignments', 'schedule_versions'
  ]
  loop
    if not exists (
      select 1 from pg_publication_tables
      where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = t
    ) then
      execute format('alter publication supabase_realtime add table public.%I', t);
    end if;
  end loop;
end $$;
