-- 0054 : formation de l'enseignant.
--
-- La fiche Enseignant gagne le diplome (comme la fiche Personnel, migration 0052) :
-- le niveau, choisi dans une liste, et une precision libre (« Licence en
-- mathematiques »). Le type de contrat, la date de naissance, la date de prise de
-- fonction et l'adresse existaient deja sur la table ; ils entrent simplement dans
-- le formulaire.
--
-- Aucune politique a modifier : les nouvelles colonnes suivent les droits de la
-- ligne (teachers.view / teachers.update), comme le reste de la fiche. Rejouable.

alter table teachers
  add column if not exists diploma        text,
  add column if not exists diploma_detail text;

do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'teachers_diploma_detail_len') then
    alter table teachers
      add constraint teachers_diploma_detail_len check (diploma_detail is null or char_length(diploma_detail) <= 160);
  end if;
end $$;
