-- =============================================================================
-- 0152 — Une salle peut recevoir plusieurs classes en même temps
-- =============================================================================
--
-- Jusqu'ici, une salle ne recevait qu'une classe à la fois. C'est juste pour une
-- salle de classe, faux pour un terrain de sport : c'est un grand espace avec
-- plusieurs aires, où plusieurs classes font EPS au même moment. Les
-- professeurs d'EPS s'organisent entre eux ; l'application n'a pas à le faire.
--
-- Une salle cochée n'est donc jamais « occupée » : la génération, le changement
-- de salle d'une classe, les salles libres et le contrôle des conflits ne la
-- comptent pas. Une fermeture ou une indisponibilité hebdomadaire la ferme
-- toujours.

alter table rooms
  add column if not exists allows_multiple_classes boolean not null default false;

comment on column rooms.allows_multiple_classes is
  'Vrai : la salle reçoit plusieurs classes en même temps (terrain, cour, amphithéâtre). Jamais considérée comme occupée.';
