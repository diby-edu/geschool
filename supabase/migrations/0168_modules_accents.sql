-- =============================================================================
-- 0168 — Noms des modules avec leurs accents
-- =============================================================================
-- Constaté le 2026-10-31 sur le premier reçu en ligne : « Abonnement — Appel
-- numerique ». Les modules ont été créés sans accents (0042) ; la page
-- Abonnement les affichait corrigés, mais le reçu et le Super Admin lisent le
-- nom en base. Seuls les textes encore identiques à l'origine sont touchés :
-- un nom changé depuis par le Super Admin reste tel quel. Les reçus déjà émis
-- ne changent pas (un reçu ne change plus).
-- =============================================================================

update public.modules set name = 'Appel numérique'
where code = 'APPEL' and name = 'Appel numerique';

update public.modules set description = 'Présence prise depuis le téléphone de l''enseignant, sans papier.'
where code = 'APPEL' and description = 'Presence prise depuis le telephone de l''enseignant, sans papier.';

update public.modules set description = 'Élèves, enseignants, classes, salles, emploi du temps, notes et bulletins.'
where code = 'SCOL' and description = 'Eleves, enseignants, classes, salles, emploi du temps, notes et bulletins.';
