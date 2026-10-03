-- =============================================================================
-- 0082 — Ce que le bulletin ne savait pas encore porter
--
-- Trois manques, tous sur le dernier bulletin de l'annee :
--
--   1. la MOYENNE ANNUELLE et son rang. Ils ne se recalculent pas a
--      l'affichage : un bulletin deja remis a une famille doit rester
--      identique meme si une note est corrigee l'annee suivante. Comme le
--      reste du bulletin (migration 0023), ils sont FIGES a la generation.
--
--   2. le LIBELLE de la mention et de la decision. La base ne connait que des
--      codes (`council_distinction`, `council_decision`) ; les mots
--      appartiennent a l'etablissement, qui les regle dans l'espace
--      `reporting` de school_settings. On garde donc les deux : le code pour
--      chercher et compter, le libelle pour imprimer.
--
--   3. l'ADDITIF. « Souvent il y a des additifs aux mentions » : une phrase
--      libre a cote de la mention calculee, sans la remplacer.
-- =============================================================================

alter table report_cards
  add column if not exists annual_average     numeric(8,3),
  add column if not exists annual_rank        integer,
  add column if not exists distinction_label  text,
  add column if not exists distinction_note   text,
  add column if not exists decision_label     text;

comment on column report_cards.annual_average is
  'Moyenne de l''annee, figee a la generation du dernier bulletin. Nulle sur les autres.';
comment on column report_cards.annual_rank is
  'Rang annuel dans la classe, fige en meme temps que annual_average.';
comment on column report_cards.distinction_label is
  'Le mot imprime pour la mention (regle par l''etablissement). distinction garde le code.';
comment on column report_cards.distinction_note is
  'Additif libre ecrit a cote de la mention, sans la remplacer.';
comment on column report_cards.decision_label is
  'Le texte imprime pour la decision du conseil, classe d''arrivee comprise.';

-- Une moyenne annuelle sans rang, ou l'inverse, signalerait un calcul a
-- moitie fait : les deux vont ensemble ou aucun des deux.
alter table report_cards
  drop constraint if exists report_cards_annual_pair;
alter table report_cards
  add constraint report_cards_annual_pair check (
    (annual_average is null and annual_rank is null)
    or (annual_average is not null)
  );

-- L'appreciation par matiere existait deja en colonne (0023) sans jamais etre
-- remplie : c'est desormais le palier calcule. On le dit.
comment on column report_card_items.appreciation is
  'Palier calcule a partir de la moyenne de la matiere (reglage reporting.subjectTiers).';
