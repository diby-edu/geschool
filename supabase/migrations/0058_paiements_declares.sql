-- =============================================================================
-- 0058 — Paiement declare par l'etablissement : en attente jusqu'a confirmation
-- =============================================================================
--
-- PROBLEME  La page Facturation laissait l'etablissement (droit billing.manage)
--           enregistrer un paiement avec n'importe quel statut, « Paye » compris.
--           Sans effet sur l'abonnement, mais la ligne apparaissait telle quelle
--           cote plateforme : rien ne distinguait un paiement DECLARE par l'ecole
--           d'un paiement CONFIRME par la plateforme.
--
-- REGLE     L'etablissement DECLARE (statut PENDING, sans date de paiement) ; seul
--           le Super Admin confirme (PAID) ou refuse (CANCELLED) — la mise a jour
--           lui est deja reservee (payments_update, 0026). La base l'impose, pas
--           seulement l'interface : un appel direct a l'API ne peut pas non plus
--           creer un paiement « Paye ».

drop policy payments_insert on payments;

create policy payments_insert on payments for insert to authenticated
with check (
  app.is_platform_admin()
  or (app.can_write(school_id, 'billing.manage') and status = 'PENDING' and paid_at is null)
);
