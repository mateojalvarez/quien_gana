-- ¿Quién gana? — Avatares (foto propia + la de Apple/Google)
--
-- La foto que elige el usuario vive en el bucket `avatars`, en una carpeta por
-- cuenta (`<user_id>/<archivo>`), y su URL se guarda en el metadata del usuario
-- bajo `custom_avatar_url`. El de la cuenta vinculada (Google manda `avatar_url`
-- / `picture`; Apple no manda ninguno) sigue llegando en `avatar_url`.
--
-- `profiles.avatar_url` guarda el avatar EFECTIVO, que es lo que ve el resto del
-- grupo: la foto propia si hay, si no la del proveedor. Al quitar la foto propia
-- la app escribe `custom_avatar_url = null` y el coalesce vuelve solo al del
-- proveedor.

-- ───────────── Bucket ─────────────
-- Público para leer: las fotos se muestran con <Image> sin firmar cada URL.
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('avatars', 'avatars', true, 5242880, array['image/jpeg', 'image/png', 'image/webp'])
on conflict (id) do update
  set public             = excluded.public,
      file_size_limit    = excluded.file_size_limit,
      allowed_mime_types = excluded.allowed_mime_types;

-- Escribir sólo dentro de la carpeta propia: `<user_id>/loquesea.jpg`.
drop policy if exists "avatars: subir el propio" on storage.objects;
create policy "avatars: subir el propio"
  on storage.objects for insert to authenticated
  with check (
    bucket_id = 'avatars'
    and (storage.foldername(name))[1] = (select auth.uid())::text
  );

drop policy if exists "avatars: reemplazar el propio" on storage.objects;
create policy "avatars: reemplazar el propio"
  on storage.objects for update to authenticated
  using (
    bucket_id = 'avatars'
    and (storage.foldername(name))[1] = (select auth.uid())::text
  )
  with check (
    bucket_id = 'avatars'
    and (storage.foldername(name))[1] = (select auth.uid())::text
  );

drop policy if exists "avatars: borrar el propio" on storage.objects;
create policy "avatars: borrar el propio"
  on storage.objects for delete to authenticated
  using (
    bucket_id = 'avatars'
    and (storage.foldername(name))[1] = (select auth.uid())::text
  );

-- ───────────── Avatar efectivo en profiles ─────────────
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  insert into public.profiles (id, display_name, avatar_url)
  values (
    new.id,
    coalesce(new.raw_user_meta_data ->> 'full_name', new.raw_user_meta_data ->> 'name'),
    coalesce(
      new.raw_user_meta_data ->> 'custom_avatar_url',
      new.raw_user_meta_data ->> 'avatar_url',
      new.raw_user_meta_data ->> 'picture'
    )
  )
  on conflict (id) do nothing;
  return new;
end;
$$;

-- A diferencia de antes, acá el avatar NO se coalesce contra el valor guardado:
-- si el usuario saca su foto, la columna tiene que poder volver a la del
-- proveedor (o quedar en null y mostrar la inicial).
create or replace function public.handle_user_updated()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  update public.profiles
     set display_name = coalesce(
           new.raw_user_meta_data ->> 'full_name',
           new.raw_user_meta_data ->> 'name',
           display_name
         ),
         avatar_url = coalesce(
           new.raw_user_meta_data ->> 'custom_avatar_url',
           new.raw_user_meta_data ->> 'avatar_url',
           new.raw_user_meta_data ->> 'picture'
         ),
         updated_at = now()
   where id = new.id;
  return new;
end;
$$;
