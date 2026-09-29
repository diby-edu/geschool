-- =============================================================================
-- 0045 — Code ecole : attribution par valeur par defaut (et non par trigger)
-- =============================================================================
--
-- Un trigger BEFORE INSERT laisse la colonne « obligatoire » aux yeux du
-- client genere (types Insert) : chaque insertion applicative devrait fournir
-- un code qu'elle ne doit justement pas choisir. Une valeur par defaut rend la
-- colonne facultative a l'insertion tout en garantissant l'attribution.
--
-- La fonction est SECURITY DEFINER et ne fait que renvoyer un code libre : la
-- laisser executable par les roles qui inserent des ecoles (Super Admin via son
-- jeton, service_role) n'expose rien.

grant execute on function app.generate_school_code() to authenticated, service_role;

alter table schools alter column login_code set default app.generate_school_code();

drop trigger schools_login_code_before_insert on schools;
drop function app.schools_set_login_code();
