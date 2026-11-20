-- Apodo y nombres que nunca quedan vacíos
--
-- 1. `profiles.nickname`: el nombre que elige cada uno y que ven sus grupos.
--    Ningún trigger lo toca: sólo lo cambia su dueño.
-- 2. "Sin nombre": `display_name` y `avatar_url` salían solamente de
--    raw_user_meta_data. Un invitado que vincula Google/Apple tiene la metadata
--    vacía (los datos del proveedor quedan en auth.identities) y Apple manda el
--    nombre una sola vez, así que muchos perfiles quedaban en null. Ahora el
--    nombre se arma con: metadata → identidades vinculadas → la parte del mail
--    antes de la @. La foto igual, sin la parte del mail.

-- ───────────── Apodo ─────────────
alter table public.profiles
  add column if not exists nickname text
  check (nickname is null or char_length(btrim(nickname)) between 1 and 30);

-- ───────────── Nombre y foto desde auth ─────────────
create or replace function public.perfil_desde_auth(uid uuid)
returns table (nombre text, foto text)
language sql
stable
security definer
set search_path = ''
as $$
  select
    coalesce(
      nullif(btrim(u.raw_user_meta_data ->> 'full_name'), ''),
      nullif(btrim(u.raw_user_meta_data ->> 'name'), ''),
      (select coalesce(nullif(btrim(i.identity_data ->> 'full_name'), ''), nullif(btrim(i.identity_data ->> 'name'), ''))
         from auth.identities i
        where i.user_id = u.id
          and coalesce(i.identity_data ->> 'full_name', i.identity_data ->> 'name') is not null
        order by i.created_at desc
        limit 1),
      nullif(initcap(replace(replace(split_part(u.email, '@', 1), '.', ' '), '_', ' ')), '')
    ),
    coalesce(
      u.raw_user_meta_data ->> 'custom_avatar_url',
      u.raw_user_meta_data ->> 'avatar_url',
      u.raw_user_meta_data ->> 'picture',
      (select coalesce(i.identity_data ->> 'avatar_url', i.identity_data ->> 'picture')
         from auth.identities i
        where i.user_id = u.id
          and coalesce(i.identity_data ->> 'avatar_url', i.identity_data ->> 'picture') is not null
        order by i.created_at desc
        limit 1)
    )
  from auth.users u
  where u.id = uid;
$$;

revoke execute on function public.perfil_desde_auth(uuid) from public, anon, authenticated;

create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  insert into public.profiles (id, display_name, avatar_url)
  select new.id, a.nombre, a.foto
    from public.perfil_desde_auth(new.id) a
  on conflict (id) do nothing;
  return new;
end;
$$;

-- El nombre de la metadata manda; si no hay, se conserva el guardado y recién
-- después se cae a identidades/mail. La foto NO se coalesce con la guardada:
-- si el usuario saca la suya vuelve a la del proveedor (o a la inicial).
create or replace function public.handle_user_updated()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare a record;
begin
  select * into a from public.perfil_desde_auth(new.id);
  update public.profiles p
     set display_name = coalesce(
           nullif(btrim(new.raw_user_meta_data ->> 'full_name'), ''),
           nullif(btrim(new.raw_user_meta_data ->> 'name'), ''),
           p.display_name,
           a.nombre
         ),
         avatar_url = a.foto,
         updated_at = now()
   where p.id = new.id;
  return new;
end;
$$;

-- También al cambiar el mail (un invitado que vincula una cuenta lo recibe ahí).
drop trigger if exists on_auth_user_updated on auth.users;
create trigger on_auth_user_updated
  after update of raw_user_meta_data, email on auth.users
  for each row execute function public.handle_user_updated();

-- Al vincular Google/Apple los datos del proveedor llegan a auth.identities.
create or replace function public.handle_identity_linked()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare a record; meta jsonb;
begin
  select * into a from public.perfil_desde_auth(new.user_id);
  select u.raw_user_meta_data into meta from auth.users u where u.id = new.user_id;
  update public.profiles p
     -- Si la cuenta no tiene nombre propio en la metadata, el de la identidad
     -- recién vinculada le gana al que se armó con el mail.
     set display_name = case
           when coalesce(meta ->> 'full_name', meta ->> 'name', '') <> '' then p.display_name
           else coalesce(
             nullif(btrim(new.identity_data ->> 'full_name'), ''),
             nullif(btrim(new.identity_data ->> 'name'), ''),
             p.display_name,
             a.nombre
           )
         end,
         avatar_url   = coalesce(p.avatar_url, a.foto),
         updated_at   = now()
   where p.id = new.user_id;
  return new;
end;
$$;

drop trigger if exists on_auth_identity_linked on auth.identities;
create trigger on_auth_identity_linked
  after insert or update of identity_data on auth.identities
  for each row execute function public.handle_identity_linked();

-- ───────────── Backfill ─────────────
update public.profiles p
   set display_name = coalesce(p.display_name, a.nombre),
       avatar_url   = coalesce(p.avatar_url, a.foto),
       updated_at   = now()
  from auth.users u,
       lateral public.perfil_desde_auth(u.id) a
 where u.id = p.id
   and (p.display_name is null or p.avatar_url is null)
   and (a.nombre is not null or a.foto is not null);

-- ───────────── La invitación muestra el apodo ─────────────
create or replace function public.preview_group_invite(invite_code text)
returns table (group_name text, members int, inviter text)
language plpgsql security definer set search_path = ''
as $$
begin
  return query
  select g.name,
         (select count(*)::int from public.group_members m where m.group_id = g.id),
         coalesce(p.nickname, p.display_name)
    from public.group_invites i
    join public.groups   g on g.id = i.group_id
    left join public.profiles p on p.id = i.created_by
   where i.code = upper(btrim(invite_code))
     and i.revoked_at is null
     and i.expires_at > now();
end;
$$;
