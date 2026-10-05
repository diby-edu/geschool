-- =============================================================================
-- 0101 — La discipline revient a ceux dont c'est le metier
--
-- Anomalie trouvee en relisant la matrice complete : sur les cinq droits du
-- module Discipline, SEUL LE DIRECTEUR en avait un. Ni le censeur, ni le
-- surveillant general, ni l'educateur — alors que leurs propres descriptions
-- disent le contraire :
--
--   Censeur              « Emploi du temps, suivi pedagogique et DISCIPLINE »
--   Surveillant general  « Absences, retards, DISCIPLINE… »
--   Educateur            « Absences, retards, DISCIPLINE… »
--
-- L'application promettait donc une responsabilite qu'elle ne donnait pas : un
-- educateur ne pouvait meme pas signaler un incident.
--
-- Le partage retenu suit la hierarchie reelle d'un etablissement ivoirien :
--
--   CONSTATER (signaler)   educateur, surveillant general, inspecteur, censeur
--   DECIDER (sanctionner)  surveillant general, inspecteur, censeur
--   LE REGLEMENT (motifs)  censeur — c'est lui qui le tient
--   SUPPRIMER              personne d'autre que le directeur : effacer un
--                          incident efface une trace, cela se decide en haut
--
-- Rien n'est impose : chaque ecole coche et decoche. C'est un POINT DE DEPART
-- credible, pas une regle.
-- =============================================================================

with voulu(role_code, permission_code) as (
  values
    -- Censeur : tient le reglement interieur et tranche.
    ('CENSOR', 'discipline.view'),
    ('CENSOR', 'discipline.create'),
    ('CENSOR', 'discipline.decide'),
    ('CENSOR', 'discipline.configure'),
    -- Surveillant general : responsable de la vie scolaire.
    ('HEAD_SUPERVISOR', 'discipline.view'),
    ('HEAD_SUPERVISOR', 'discipline.create'),
    ('HEAD_SUPERVISOR', 'discipline.decide'),
    -- Inspecteur d'education : superieur des educateurs.
    ('EDUCATION_INSPECTOR', 'discipline.view'),
    ('EDUCATION_INSPECTOR', 'discipline.create'),
    ('EDUCATION_INSPECTOR', 'discipline.decide'),
    -- Educateur : il constate ; la sanction se decide au-dessus de lui.
    ('SUPERVISOR', 'discipline.view'),
    ('SUPERVISOR', 'discipline.create'),
    -- Directeur adjoint : seconde le directeur.
    ('DEPUTY_DIRECTOR', 'discipline.view'),
    ('DEPUTY_DIRECTOR', 'discipline.create'),
    ('DEPUTY_DIRECTOR', 'discipline.decide'),
    ('DEPUTY_DIRECTOR', 'discipline.configure')
),
cible as (
  -- Par CODE de role : le modele systeme ET la copie de chaque ecole.
  select r.id as role_id, p.id as permission_id
  from voulu v
  join roles r on r.code = v.role_code
  join permissions p on p.code = v.permission_code
)
insert into role_permissions (role_id, permission_id)
select role_id, permission_id from cible
on conflict do nothing;
