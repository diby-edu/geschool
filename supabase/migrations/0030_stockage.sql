-- =============================================================================
-- 0030 — Stockage : buckets prives et policies alignees sur les tables
-- =============================================================================
--
-- Arborescence imposee (ARCHITECTURE.md §4) :
--
--   schools/{school_id}/students/{student_id}/photo.jpg
--   schools/{school_id}/documents/{document_id}/{fichier}
--   schools/{school_id}/reports/{academic_year_id}/{report_card_id}.pdf
--
-- Les policies lisent le school_id dans le DEUXIEME segment du chemin et
-- appliquent exactement les memes fonctions d'appartenance que les tables. Le
-- stockage ne doit pas etre une porte laterale vers les donnees d'un autre
-- etablissement.
--
-- Principe de lecture : un fichier est lisible si et seulement si la ligne
-- `documents` qui le decrit est lisible. La sous-requete sur documents
-- s'execute avec la RLS de l'appelant, donc herite sans duplication de toutes
-- ses regles de visibilite (proprietaire, responsables legaux, etablissement).

-- -----------------------------------------------------------------------------
-- Extraction sure du school_id depuis un chemin
--
-- Un simple `split_part(...)::uuid` leverait une erreur sur un chemin mal
-- forme, et une erreur dans une policy fait echouer la requete entiere au
-- lieu de simplement refuser l'objet. La fonction renvoie NULL, et NULL
-- ferme l'acces.
-- -----------------------------------------------------------------------------

create or replace function app.storage_school_id(p_name text)
returns uuid
language sql
immutable
set search_path = app, public, pg_temp
as $$
  select case
    when split_part(p_name, '/', 1) = 'schools'
     and split_part(p_name, '/', 2) ~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
    then split_part(p_name, '/', 2)::uuid
  end;
$$;

grant execute on function app.storage_school_id(text) to authenticated, service_role;

-- -----------------------------------------------------------------------------
-- Buckets
--
-- Tous PRIVES : un fichier n'est jamais servi que par URL signee a duree
-- courte. Taille et types MIME sont plafonnes par Supabase lui-meme, en plus
-- de la verification par signature de fichier faite cote serveur (§53).
-- -----------------------------------------------------------------------------

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values
  ('documents', 'documents', false, 10485760, array[
     'application/pdf',
     'image/jpeg', 'image/png', 'image/webp',
     'text/csv',
     'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
     'application/vnd.openxmlformats-officedocument.wordprocessingml.document'
  ]),
  ('avatars', 'avatars', false, 2097152, array['image/jpeg', 'image/png', 'image/webp']),
  ('reports', 'reports', false, 10485760, array['application/pdf'])
on conflict (id) do update
  set public             = false,
      file_size_limit    = excluded.file_size_limit,
      allowed_mime_types = excluded.allowed_mime_types;

-- -----------------------------------------------------------------------------
-- Policies sur storage.objects
--
-- Prefixees `geschool_` : storage.objects est partage par tous les buckets du
-- projet, et ces policies ne doivent jamais s'appliquer au-dela des trois
-- buckets de l'application.
-- -----------------------------------------------------------------------------

drop policy if exists geschool_objects_select on storage.objects;
drop policy if exists geschool_objects_insert on storage.objects;
drop policy if exists geschool_objects_update on storage.objects;
drop policy if exists geschool_objects_delete on storage.objects;

create policy geschool_objects_select on storage.objects for select to authenticated
using (
  bucket_id in ('documents', 'avatars', 'reports')
  and app.storage_school_id(name) is not null
  and (
    app.is_platform_admin()
    -- Photos : visibles des membres de l'etablissement, comme l'annuaire
    or (bucket_id = 'avatars' and app.is_member_of(app.storage_school_id(name)))
    -- Documents et bulletins : visibles si la ligne documents l'est
    or exists (
      select 1 from public.documents d
      where d.storage_path = storage.objects.name
    )
  )
);

create policy geschool_objects_insert on storage.objects for insert to authenticated
with check (
  bucket_id in ('documents', 'avatars', 'reports')
  and app.storage_school_id(name) is not null
  and (
    app.is_platform_admin()
    or (bucket_id = 'documents'
        and app.can_write(app.storage_school_id(name), 'documents.upload'))
    or (bucket_id = 'reports'
        and app.can_write(app.storage_school_id(name), 'reports.generate'))
    or (bucket_id = 'avatars'
        and (app.can_write(app.storage_school_id(name), 'students.update')
             or app.can_write(app.storage_school_id(name), 'teachers.update')))
  )
);

create policy geschool_objects_update on storage.objects for update to authenticated
using (
  bucket_id in ('documents', 'avatars', 'reports')
  and app.storage_school_id(name) is not null
  and (
    app.is_platform_admin()
    or (bucket_id = 'documents'
        and app.can_write(app.storage_school_id(name), 'documents.upload'))
    or (bucket_id = 'reports'
        and app.can_write(app.storage_school_id(name), 'reports.generate'))
    or (bucket_id = 'avatars'
        and (app.can_write(app.storage_school_id(name), 'students.update')
             or app.can_write(app.storage_school_id(name), 'teachers.update')))
  )
)
with check (
  bucket_id in ('documents', 'avatars', 'reports')
  and app.storage_school_id(name) is not null
  and (
    app.is_platform_admin()
    or (bucket_id = 'documents'
        and app.can_write(app.storage_school_id(name), 'documents.upload'))
    or (bucket_id = 'reports'
        and app.can_write(app.storage_school_id(name), 'reports.generate'))
    or (bucket_id = 'avatars'
        and (app.can_write(app.storage_school_id(name), 'students.update')
             or app.can_write(app.storage_school_id(name), 'teachers.update')))
  )
);

create policy geschool_objects_delete on storage.objects for delete to authenticated
using (
  bucket_id in ('documents', 'avatars', 'reports')
  and app.storage_school_id(name) is not null
  and (
    app.is_platform_admin()
    or app.can_write(app.storage_school_id(name), 'documents.delete')
  )
);
