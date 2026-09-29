-- =============================================================================
-- 0076 — Retrait de la note éliminatoire
-- =============================================================================
--
-- `assessments.is_eliminatory` et `eliminatory_threshold` existaient depuis
-- 0021 : une case a cocher et un seuil, dans le formulaire d'une evaluation.
-- Aucun calcul, aucun ecran, aucun bulletin ne les a jamais lus — on pouvait
-- les remplir, il ne se passait rien.
--
-- Decision (2026-09-27) : les retirer. Une note eliminatoire est une notion
-- d'EXAMEN (« sous ce seuil, recale quoi qu'il arrive ») ; ce module calcule
-- des moyennes de classe, ou elle n'a pas de sens. Un controle qui ne fait
-- rien ne reste pas dans l'application.
--
-- Verifie avant ecriture : 0 evaluation sur 11 212 portait le drapeau, et
-- aucun seuil n'etait renseigne. Rien n'est donc perdu. La contrainte
-- assessments_eliminatory_coherent disparait avec les colonnes.

alter table public.assessments
  drop column if exists is_eliminatory,
  drop column if exists eliminatory_threshold;
