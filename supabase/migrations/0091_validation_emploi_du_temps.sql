-- =============================================================================
-- 0091 — Une version d'emploi du temps se valide avant d'etre publiee
--
-- L'etat VALIDATED existait depuis l'origine dans `schedule_version_status`,
-- mais rien ne l'utilisait : une version passait de brouillon a publiee d'un
-- seul clic, et tout l'etablissement decouvrait le resultat en meme temps.
--
-- On ouvre l'etape manquante. Deux signatures distinctes, deux droits
-- distincts (`schedule.validate` puis `schedule.publish`), tous deux deja
-- presents dans le catalogue : celui qui verifie n'est pas forcement celui qui
-- diffuse.
--
-- L'etape est obligatoire par defaut, mais reglable : une petite ecole ou le
-- meme personne fait tout n'a pas besoin de deux clics. Le reglage vit dans
-- school_settings / espace `schedule` (`requireValidation`).
-- =============================================================================

alter table schedule_versions
  add column if not exists validated_at timestamptz,
  add column if not exists validated_by uuid references users(id) on delete set null,
  add column if not exists validation_note text;

comment on column schedule_versions.validated_at is
  'Quand la version a ete verifiee. Une version rouverte en brouillon le perd.';
comment on column schedule_versions.validation_note is
  'Ce que le verificateur a note : reserves, points a surveiller.';

-- Une version validee porte toujours sa date : sans elle, on ne saurait pas
-- quand la verification a eu lieu, ni si elle est anterieure a une retouche.
alter table schedule_versions drop constraint if exists schedule_versions_validated_pair;
alter table schedule_versions
  add constraint schedule_versions_validated_pair check (
    status <> 'VALIDATED' or validated_at is not null
  );
