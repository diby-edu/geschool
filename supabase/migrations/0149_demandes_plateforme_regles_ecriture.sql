-- =============================================================================
-- 0149 — Demandes à la plateforme : les règles d'écriture explicites
-- =============================================================================
--
-- Règle du projet (tests/rls/coverage.test.ts) : toute table rattachée à une
-- école a ses quatre règles, jamais une absence implicite. Les écritures des
-- demandes passent par le serveur (services/platform-requests.ts, client
-- d'administration, après le contrôle du droit) : en direct, seule la
-- plateforme peut écrire.
-- =============================================================================

create policy platform_requests_insert on platform_requests for insert to authenticated
with check (app.is_platform_admin());

create policy platform_requests_update on platform_requests for update to authenticated
using (app.is_platform_admin()) with check (app.is_platform_admin());

create policy platform_requests_delete on platform_requests for delete to authenticated
using (app.is_platform_admin());
