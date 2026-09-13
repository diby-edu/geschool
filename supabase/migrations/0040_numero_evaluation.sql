-- =============================================================================
-- 0040 — Numero d'evaluation (« Devoir n°2 », etc.)
-- =============================================================================
--
-- Formulaire simplifie du tableau de bord enseignant (§ evaluations) : le
-- numero n'est plus une simple suggestion d'affichage, l'enseignant le
-- choisit desormais dans une liste qui omet les numeros deja pris pour la
-- meme matiere + classe + periode + type. Il faut donc le stocker.

alter table assessments
  add column sequence_number integer not null default 1;

alter table assessments
  add constraint assessments_sequence_number_positive check (sequence_number >= 1);
