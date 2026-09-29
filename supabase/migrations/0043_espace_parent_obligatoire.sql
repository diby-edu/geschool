-- =============================================================================
-- 0043 — Espace Parent inclus pour tous les etablissements
-- =============================================================================
--
-- L'Espace Parent n'est plus un choix fait a l'inscription : il fait partie du
-- produit pour chaque etablissement (les familles le financent elles-memes,
-- 2 000 F/an, sans cout pour l'ecole). La colonne conserve son role de marqueur
-- mais vaut desormais « vrai » par defaut, et les etablissements deja crees
-- sont alignes. Aucune ligne de code ne la lit encore : le changement est sans
-- effet sur le comportement de l'application.

alter table schools alter column parent_portal_enabled set default true;

update schools set parent_portal_enabled = true where parent_portal_enabled is distinct from true;
