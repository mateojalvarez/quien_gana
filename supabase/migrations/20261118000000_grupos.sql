-- ¿Quién gana? — Grupos (etapa 2)
-- Propuesta revisada en supabase/propuesta-grupos.md
-- Probada con RLS en los tres roles antes de aplicar.

-- ───────────── Grupos ─────────────
create table public.groups (
  id         uuid primary key default gen_random_uuid(),
  name       text not null check (length(btrim(name)) between 1 and 40),
  owner_id   uuid not null default auth.uid() references auth.users (id) on delete cascade,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.group_members (
  group_id  uuid not null references public.groups (id) on delete cascade,
  user_id   uuid not null references auth.users (id)    on delete cascade,
  role      text not null default 'member' check (role in ('admin', 'member')),
  joined_at timestamptz not null default now(),
  primary key (group_id, user_id)
);

create index group_members_user_idx on public.group_members (user_id);

create table public.group_invites (
  id         uuid primary key default gen_random_uuid(),
  group_id   uuid not null references public.groups (id) on delete cascade,
  code       text not null unique,
  created_by uuid not null default auth.uid() references auth.users (id) on delete cascade,
  created_at timestamptz not null default now(),
  expires_at timestamptz not null default now() + interval '7 days',
  revoked_at timestamptz
);

create index group_invites_group_idx on public.group_invites (group_id, created_at desc);

-- El grupo activo viaja con la cuenta: en un teléfono nuevo ya está elegido.
alter table public.profiles
  add column active_group_id uuid references public.groups (id) on delete set null;


create or replace function public.is_group_member(gid uuid)
returns boolean language sql security definer stable set search_path = ''
as $$
  select exists (
    select 1 from public.group_members m
     where m.group_id = gid and m.user_id = (select auth.uid())
  );
$$;

create or replace function public.is_group_admin(gid uuid)
returns boolean language sql security definer stable set search_path = ''
as $$
  select exists (
    select 1 from public.group_members m
     where m.group_id = gid and m.user_id = (select auth.uid()) and m.role = 'admin'
  );
$$;

create or replace function public.shares_group_with(other uuid)
returns boolean language sql security definer stable set search_path = ''
as $$
  select exists (
    select 1 from public.group_members a
      join public.group_members b on a.group_id = b.group_id
     where a.user_id = (select auth.uid()) and b.user_id = other
  );
$$;

revoke execute on function public.is_group_member(uuid)   from public, anon;
revoke execute on function public.is_group_admin(uuid)    from public, anon;
revoke execute on function public.shares_group_with(uuid) from public, anon;
grant  execute on function public.is_group_member(uuid)   to authenticated;
grant  execute on function public.is_group_admin(uuid)    to authenticated;
grant  execute on function public.shares_group_with(uuid) to authenticated;


alter table public.groups        enable row level security;
alter table public.group_members enable row level security;
alter table public.group_invites enable row level security;

-- ── groups ──
-- El `or owner_id` no es redundante: el trigger que agrega al dueño como
-- integrante es AFTER INSERT, así que en el RETURNING de un insert con
-- `.select()` la fila todavía no tiene integrantes y el dueño no la vería.
create policy "groups: ver los míos"
  on public.groups for select to authenticated
  using (public.is_group_member(id) or (select auth.uid()) = owner_id);

create policy "groups: crear"
  on public.groups for insert to authenticated
  with check (
    (select auth.uid()) = owner_id
    and (select (auth.jwt() ->> 'is_anonymous')::boolean) is not true
  );

create policy "groups: editar si soy admin"
  on public.groups for update to authenticated
  using (public.is_group_admin(id))
  with check (public.is_group_admin(id));

create policy "groups: borrar si soy dueño"
  on public.groups for delete to authenticated
  using ((select auth.uid()) = owner_id);

-- ── group_members ──
create policy "integrantes: ver los del grupo"
  on public.group_members for select to authenticated
  using (public.is_group_member(group_id));

-- Entrar es por RPC (security definer). Acá sólo queda que un admin agregue.
create policy "integrantes: agregar si soy admin"
  on public.group_members for insert to authenticated
  with check (public.is_group_admin(group_id));

create policy "integrantes: cambiar rol si soy admin"
  on public.group_members for update to authenticated
  using (public.is_group_admin(group_id))
  with check (public.is_group_admin(group_id));

-- Salirse uno mismo, o que un admin eche a otro. Al dueño no lo echa nadie.
create policy "integrantes: salir o echar"
  on public.group_members for delete to authenticated
  using (
    (select auth.uid()) = user_id
    or (
      public.is_group_admin(group_id)
      and user_id <> (select g.owner_id from public.groups g where g.id = group_id)
    )
  );

-- ── group_invites ──
-- Quien NO es integrante no tiene ninguna política: no puede leer invitaciones
-- ni aunque adivine el código. Unirse pasa sí o sí por la RPC.
create policy "invitaciones: ver las de mi grupo"
  on public.group_invites for select to authenticated
  using (public.is_group_member(group_id));

create policy "invitaciones: crear si soy admin"
  on public.group_invites for insert to authenticated
  with check (public.is_group_admin(group_id));

create policy "invitaciones: anular si soy admin"
  on public.group_invites for update to authenticated
  using (public.is_group_admin(group_id))
  with check (public.is_group_admin(group_id));

-- ── profiles ──
-- Hoy sólo se puede leer el propio perfil, así que la lista de integrantes
-- mostraría uuids. Esto abre los perfiles de quienes comparten grupo conmigo.
create policy "profiles: leer los de mi grupo"
  on public.profiles for select to authenticated
  using (public.shares_group_with(id));


create or replace function public.handle_new_group()
returns trigger language plpgsql security definer set search_path = ''
as $$
begin
  insert into public.group_members (group_id, user_id, role)
  values (new.id, new.owner_id, 'admin');
  return new;
end;
$$;

create trigger on_group_created
  after insert on public.groups
  for each row execute function public.handle_new_group();


-- Alfabeto sin 0/O/1/I/L: se dicta en voz alta sin confusión. 10 caracteres
-- sobre 31 símbolos ≈ 49 bits: no se adivina por fuerza bruta.
create or replace function public.create_group_invite(gid uuid)
returns table (code text, expires_at timestamptz)
language plpgsql security definer set search_path = ''
as $$
declare nuevo text;
begin
  if not public.is_group_admin(gid) then
    raise exception 'no_admin' using errcode = '42501';
  end if;

  loop
    nuevo := (
      select string_agg(substr('23456789ABCDEFGHJKMNPQRSTUVWXYZ',
                               (floor(random() * 31) + 1)::int, 1), '')
        from generate_series(1, 10)
    );
    exit when not exists (select 1 from public.group_invites i where i.code = nuevo);
  end loop;

  return query
    insert into public.group_invites (group_id, code)
    values (gid, nuevo)
    returning group_invites.code, group_invites.expires_at;
end;
$$;

-- Lo que ve quien abre el enlace ANTES de aceptar: nombre y cuántos son.
-- No devuelve ids ni la lista de integrantes.
create or replace function public.preview_group_invite(invite_code text)
returns table (group_name text, members int, inviter text)
language plpgsql security definer set search_path = ''
as $$
begin
  return query
  select g.name,
         (select count(*)::int from public.group_members m where m.group_id = g.id),
         p.display_name
    from public.group_invites i
    join public.groups   g on g.id = i.group_id
    left join public.profiles p on p.id = i.created_by
   where i.code = upper(btrim(invite_code))
     and i.revoked_at is null
     and i.expires_at > now();
end;
$$;

create or replace function public.join_group_by_code(invite_code text)
returns uuid
language plpgsql security definer set search_path = ''
as $$
declare gid uuid;
begin
  if (select (auth.jwt() ->> 'is_anonymous')::boolean) is true then
    raise exception 'necesita_cuenta' using errcode = '42501';
  end if;

  select i.group_id into gid
    from public.group_invites i
   where i.code = upper(btrim(invite_code))
     and i.revoked_at is null
     and i.expires_at > now();

  if gid is null then
    raise exception 'invitacion_invalida' using errcode = 'P0002';
  end if;

  insert into public.group_members (group_id, user_id, role)
  values (gid, (select auth.uid()), 'member')
  on conflict (group_id, user_id) do nothing;

  return gid;
end;
$$;

revoke execute on function public.create_group_invite(uuid)    from public, anon;
revoke execute on function public.preview_group_invite(text)   from public, anon;
revoke execute on function public.join_group_by_code(text)     from public, anon;
grant  execute on function public.create_group_invite(uuid)    to authenticated;
grant  execute on function public.preview_group_invite(text)   to authenticated;
grant  execute on function public.join_group_by_code(text)     to authenticated;
