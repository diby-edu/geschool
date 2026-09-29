-- =============================================================================
-- 0046 — Permission « Creer un acces »
-- =============================================================================
--
-- Le directeur peut creer l'acces de connexion d'un enseignant depuis sa fiche
-- (bouton « Creer l'acces »). Creer un compte est plus sensible qu'envoyer des
-- identifiants deja prepares : la permission est distincte et n'est donnee ni
-- au secretariat ni aux autres roles de gestion.

insert into permissions (code, module, action, description, is_platform_only)
values ('access_accounts.create', 'access_accounts', 'create', 'Creer un acces de connexion (enseignant)', false)
on conflict (code) do nothing;

-- Roles SCHOOL_ADMIN et DIRECTOR, y compris les copies propres a un etablissement.
insert into role_permissions (role_id, permission_id, default_scope)
select r.id, p.id, 'SCHOOL'::scope_type
from roles r
cross join permissions p
where r.code in ('SCHOOL_ADMIN', 'DIRECTOR')
  and p.code = 'access_accounts.create'
on conflict do nothing;
