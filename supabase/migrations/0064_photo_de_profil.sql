-- =============================================================================
-- 0064 — Photo de profil : chacun dépose la sienne
-- =============================================================================
--
-- Le bucket `avatars` (0030) n'acceptait que les photos d'élèves et
-- d'enseignants, déposées par quelqu'un qui a le droit de les MODIFIER
-- (students.update / teachers.update). La photo de profil, elle, est déposée
-- par la personne elle-même : elle apparaît dans la barre du haut, à la place
-- de « Se déconnecter ».
--
-- Chemin imposé, dans la même arborescence :
--   schools/{school_id}/users/{user_id}/photo.jpg
--
-- Règle : on ne dépose que SA photo, et seulement dans un établissement dont on
-- est membre actif. La lecture reste celle de 0030 (un membre lit les avatars de
-- son établissement). Personne ne peut écrire la photo d'un autre.

create or replace function app.storage_is_own_avatar(p_name text)
returns boolean
language sql
stable
set search_path = app, public, pg_temp
as $$
  select split_part(p_name, '/', 3) = 'users'
     and split_part(p_name, '/', 4) = auth.uid()::text
     and app.is_member_of(app.storage_school_id(p_name));
$$;

grant execute on function app.storage_is_own_avatar(text) to authenticated, service_role;

drop policy if exists geschool_avatar_self_insert on storage.objects;
create policy geschool_avatar_self_insert on storage.objects for insert to authenticated
with check (bucket_id = 'avatars' and app.storage_school_id(name) is not null and app.storage_is_own_avatar(name));

drop policy if exists geschool_avatar_self_update on storage.objects;
create policy geschool_avatar_self_update on storage.objects for update to authenticated
using (bucket_id = 'avatars' and app.storage_school_id(name) is not null and app.storage_is_own_avatar(name))
with check (bucket_id = 'avatars' and app.storage_school_id(name) is not null and app.storage_is_own_avatar(name));

drop policy if exists geschool_avatar_self_delete on storage.objects;
create policy geschool_avatar_self_delete on storage.objects for delete to authenticated
using (bucket_id = 'avatars' and app.storage_school_id(name) is not null and app.storage_is_own_avatar(name));
