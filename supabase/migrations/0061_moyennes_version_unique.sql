-- =============================================================================
-- 0061 — Calcul des moyennes : une seule version de chaque fonction
-- =============================================================================
--
-- PROBLEME  0038 a ajouté le paramètre p_include_draft à student_subject_average
--           et à class_subject_averages avec « create or replace ». Un paramètre
--           de plus ne REMPLACE pas une fonction, il en crée une seconde : les
--           anciennes versions à 7 paramètres (0022, 0036, 0037) sont restées.
--           Tout appel à 7 arguments devient alors ambigu :
--
--             function app.student_subject_average(uuid, uuid, uuid, numeric,
--             boolean, smallint, rounding_mode) is not unique
--
--           Touchés : app.student_period_average, donc app/public
--           class_period_ranking (page « Moyennes et classement », moyenne
--           générale et rang des bulletins) ; et l'appel HTTP de
--           class_subject_averages sans p_include_draft (moyennes par matière des
--           bulletins), que l'API ne sait pas départager non plus. Aucun bulletin
--           n'avait encore été généré : aucune donnée à reprendre.
--
-- CORRECTIF On retire les anciennes versions. Les nouvelles ont
--           p_include_draft = false par défaut : un appel à 7 arguments obtient
--           exactement l'ancien comportement (évaluations clôturées ou publiées).

drop function if exists app.student_subject_average(uuid, uuid, uuid, numeric, boolean, smallint, rounding_mode);
drop function if exists public.student_subject_average(uuid, uuid, uuid, numeric, boolean, smallint, rounding_mode);
drop function if exists app.class_subject_averages(uuid, uuid, uuid, numeric, boolean, smallint, rounding_mode);
drop function if exists public.class_subject_averages(uuid, uuid, uuid, numeric, boolean, smallint, rounding_mode);
