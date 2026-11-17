-- ¿Quién gana? — esquema inicial
-- Aplicar con: supabase db push   (o pegarlo en SQL Editor)

-- ───────────── Perfiles ─────────────
create table if not exists public.profiles (
  id uuid primary key references auth.users (id) on delete cascade,
  display_name text,
  avatar_url text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.profiles enable row level security;

create policy "profiles: leer el propio"
  on public.profiles for select to authenticated
  using ((select auth.uid()) = id);

create policy "profiles: actualizar el propio"
  on public.profiles for update to authenticated
  using ((select auth.uid()) = id)
  with check ((select auth.uid()) = id);

-- Crea el perfil al registrarse (incluye usuarios anónimos/invitados)
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
    new.raw_user_meta_data ->> 'avatar_url'
  )
  on conflict (id) do nothing;
  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- Mantiene el nombre al vincular Apple/Google o cuando la app guarda full_name
create or replace function public.handle_user_updated()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  update public.profiles
     set display_name = coalesce(new.raw_user_meta_data ->> 'full_name', new.raw_user_meta_data ->> 'name', display_name),
         avatar_url   = coalesce(new.raw_user_meta_data ->> 'avatar_url', avatar_url),
         updated_at   = now()
   where id = new.id;
  return new;
end;
$$;

drop trigger if exists on_auth_user_updated on auth.users;
create trigger on_auth_user_updated
  after update of raw_user_meta_data on auth.users
  for each row execute function public.handle_user_updated();

-- ───────────── Partidas ─────────────
-- El estado completo de la partida vive en `data` (jsonb). La app es local-first
-- y sincroniza con last-write-wins usando updated_at.
create table if not exists public.games (
  id uuid primary key,
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  kind text not null check (kind in ('anotador', 'corazones')),
  title text not null default '',
  data jsonb not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  finished_at timestamptz
);

create index if not exists games_user_updated_idx on public.games (user_id, updated_at desc);

alter table public.games enable row level security;

create policy "games: select propias"
  on public.games for select to authenticated
  using ((select auth.uid()) = user_id);

create policy "games: insert propias"
  on public.games for insert to authenticated
  with check ((select auth.uid()) = user_id);

create policy "games: update propias"
  on public.games for update to authenticated
  using ((select auth.uid()) = user_id)
  with check ((select auth.uid()) = user_id);

create policy "games: delete propias"
  on public.games for delete to authenticated
  using ((select auth.uid()) = user_id);

-- Nota: los invitados (anonymous sign-in) usan el rol `authenticated` con
-- is_anonymous = true. Si querés limitar algo sólo a cuentas permanentes:
--   using ((select (auth.jwt() ->> 'is_anonymous')::boolean) is false)
