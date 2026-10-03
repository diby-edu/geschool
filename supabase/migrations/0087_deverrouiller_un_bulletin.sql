-- =============================================================================
-- 0087 — Un bulletin valide est definitif. Sauf pour le directeur.
--
-- « Quand il est valide, il est valide definitivement. Le seul qui puisse le
-- modifier, c'est le directeur. » La generation refusait deja d'ecraser un
-- bulletin VALIDE ou PUBLIE — mais personne ne pouvait le rouvrir, meme pour
-- corriger une erreur reconnue.
--
-- On ouvre donc une porte, une seule, avec trois garanties :
--   * un droit a part (`reports.unlock`), donne au directeur seul ;
--   * un MOTIF obligatoire, conserve sur le bulletin ;
--   * un compteur de rectifications, qui ne s'incremente QUE si le bulletin
--     avait deja ete remis aux familles — corriger avant publication n'est pas
--     une rectification, c'est du travail normal.
-- =============================================================================

alter table report_cards
  add column if not exists unlocked_at    timestamptz,
  add column if not exists unlocked_by    uuid references users(id) on delete set null,
  add column if not exists unlock_reason  text,
  add column if not exists revision       integer not null default 0;

comment on column report_cards.unlock_reason is
  'Pourquoi le directeur a rouvert ce bulletin. Reste apres la regeneration.';
comment on column report_cards.revision is
  'Nombre de fois que ce bulletin a ete rectifie APRES avoir ete remis aux familles. 0 = jamais.';

-- Rouvrir sans dire pourquoi reviendrait a effacer la trace.
alter table report_cards drop constraint if exists report_cards_unlock_reason;
alter table report_cards
  add constraint report_cards_unlock_reason check (
    unlocked_at is null or length(btrim(coalesce(unlock_reason, ''))) >= 5
  );

insert into permissions (code, module, action, description, is_platform_only) values
  ('reports.unlock', 'reports', 'unlock', 'Rouvrir un bulletin deja valide', false)
on conflict (code) do nothing;

-- Le directeur, et le fondateur qui peut tout dans son etablissement. Comme en
-- 0085, on rattache par CODE de role pour couvrir le modele systeme et les
-- copies de chaque ecole.
with cible as (
  select p.id permission_id, r.id role_id
  from permissions p
  join roles r on r.code = any (array['DIRECTOR', 'SCHOOL_ADMIN'])
  where p.code = 'reports.unlock'
)
insert into role_permissions (role_id, permission_id)
select role_id, permission_id from cible
on conflict do nothing;
