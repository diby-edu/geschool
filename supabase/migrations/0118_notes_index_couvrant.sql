-- =============================================================================
-- 0118 — Index « couvrant » des notes pour les moyennes du tableau de bord
-- =============================================================================
-- Les moyennes par classe (dashboard_class_averages) lisent toutes les notes
-- d'une période : ~175 000 lignes pour un établissement de 80 classes. Avec
-- l'index simple sur assessment_id, chaque note oblige à relire la ligne dans
-- la table : 4 à 5 s quand la base est « froide », au-delà du délai de 8 s
-- quand plusieurs indicateurs tournent en même temps.
--
-- Cet index porte aussi les colonnes du calcul : la base répond depuis
-- l'index seul. Il remplace l'ancien index sur assessment_id (même premier
-- champ, donc mêmes usages).
create index if not exists grades_assessment_cover_idx
  on grades (assessment_id)
  include (student_id, score, is_absent, is_excluded_from_average);

drop index if exists grades_assessment_idx;
