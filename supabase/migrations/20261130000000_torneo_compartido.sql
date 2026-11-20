-- Torneos compartidos
--
-- Un torneo sigue siendo una fila de `games` del que lo creó (el anfitrión),
-- con todo el estado en `data`. Ahora además lo pueden ver:
--   · todos los integrantes del grupo con el que se creó (`games.group_id`);
--   · quien entró con el enlace / QR (`tournament_access`).
-- Y cargar resultados, sólo a quienes el anfitrión se lo habilite
-- (`tournament_access.can_edit`). Las escrituras de terceros pasan siempre por
-- `update_torneo_data`, nunca por un update directo: el anfitrión es el único
-- dueño de la fila.

-- ───────────── Columnas nuevas en games ─────────────
alter table public.games add column if not exists group_id uuid references public.groups (id) on delete set null;
alter table public.games add column if not exists share_code text unique;

create index if not exists games_group_idx on public.games (group_id) where group_id is not null;

-- El grupo sale de `data.grupoId` (lo pone la app al crear el torneo). Sólo se
-- acepta si el dueño es integrante: nadie puede "colgar" un torneo en un grupo ajeno.
create or replace function public.games_set_group()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare gid uuid;
begin
  if new.kind <> 'torneo' then
    new.group_id := null;
    return new;
  end if;
  begin
    gid := nullif(new.data ->> 'grupoId', '')::uuid;
  exception when others then
    gid := null;
  end;
  if gid is not null and exists (
    select 1 from public.group_members m where m.group_id = gid and m.user_id = new.user_id
  ) then
    new.group_id := gid;
  else
    new.group_id := null;
  end if;
  return new;
end;
$$;

drop trigger if exists games_set_group on public.games;
create trigger games_set_group
  before insert or update of data, kind on public.games
  for each row execute function public.games_set_group();

-- Torneos ya creados con grupo.
update public.games set data = data where kind = 'torneo' and data ? 'grupoId';

-- ───────────── Accesos ─────────────
create table if not exists public.tournament_access (
  game_id   uuid not null references public.games (id) on delete cascade,
  user_id   uuid not null references auth.users (id) on delete cascade,
  can_edit  boolean not null default false,
  -- 'link': entró con el enlace; 'grupo': fila creada sólo para darle permisos a alguien del grupo.
  origen    text not null default 'link' check (origen in ('link', 'grupo')),
  joined_at timestamptz not null default now(),
  primary key (game_id, user_id)
);

alter table public.tournament_access enable row level security;

create or replace function public.is_game_owner(gid uuid)
returns boolean
language sql stable security definer set search_path = ''
as $$
  select exists (select 1 from public.games g where g.id = gid and g.user_id = (select auth.uid()));
$$;

create or replace function public.can_view_game(gid uuid)
returns boolean
language sql stable security definer set search_path = ''
as $$
  select exists (
    select 1 from public.games g
     where g.id = gid
       and (
         g.user_id = (select auth.uid())
         or exists (select 1 from public.tournament_access a where a.game_id = g.id and a.user_id = (select auth.uid()))
         or (g.group_id is not null and public.is_group_member(g.group_id))
       )
  );
$$;

create or replace function public.can_edit_game(gid uuid)
returns boolean
language sql stable security definer set search_path = ''
as $$
  select public.is_game_owner(gid)
      or exists (
        select 1 from public.tournament_access a
         where a.game_id = gid and a.user_id = (select auth.uid()) and a.can_edit
           -- un integrante que se fue del grupo pierde lo que tenía por el grupo
           and (a.origen = 'link' or exists (
             select 1 from public.games g where g.id = gid and g.group_id is not null and public.is_group_member(g.group_id)
           ))
      );
$$;

revoke execute on function public.is_game_owner(uuid) from public, anon;
revoke execute on function public.can_view_game(uuid) from public, anon;
revoke execute on function public.can_edit_game(uuid) from public, anon;
grant  execute on function public.is_game_owner(uuid) to authenticated;
grant  execute on function public.can_view_game(uuid) to authenticated;
grant  execute on function public.can_edit_game(uuid) to authenticated;

-- Cada uno ve su propio acceso; el dueño ve todos los de su torneo.
create policy "tournament_access: ver propio o del dueño"
  on public.tournament_access for select to authenticated
  using (user_id = (select auth.uid()) or public.is_game_owner(game_id));

-- Salir de un torneo compartido.
create policy "tournament_access: salir"
  on public.tournament_access for delete to authenticated
  using (user_id = (select auth.uid()) or public.is_game_owner(game_id));

-- ───────────── games: ver los compartidos ─────────────
create policy "games: select compartidos"
  on public.games for select to authenticated
  using (kind = 'torneo' and public.can_view_game(id));

-- ───────────── RPCs ─────────────

-- Enlace del torneo: se crea una vez y se reutiliza.
create or replace function public.create_torneo_share(gid uuid)
returns text
language plpgsql security definer set search_path = ''
as $$
declare code text;
begin
  if not public.is_game_owner(gid) then
    raise exception 'no_es_tuyo' using errcode = '42501';
  end if;
  select g.share_code into code from public.games g where g.id = gid;
  if code is not null then return code; end if;
  loop
    code := (
      select string_agg(substr('23456789ABCDEFGHJKMNPQRSTUVWXYZ', (floor(random() * 31) + 1)::int, 1), '')
        from generate_series(1, 8)
    );
    exit when not exists (select 1 from public.games where share_code = code);
  end loop;
  update public.games set share_code = code where id = gid;
  return code;
end;
$$;

create or replace function public.join_torneo_by_code(code text)
returns uuid
language plpgsql security definer set search_path = ''
as $$
declare gid uuid; owner uuid;
begin
  select g.id, g.user_id into gid, owner
    from public.games g
   where g.share_code = upper(btrim(code)) and g.kind = 'torneo';
  if gid is null then
    raise exception 'no_existe' using errcode = 'P0002';
  end if;
  if owner <> (select auth.uid()) then
    insert into public.tournament_access (game_id, user_id, origen)
    values (gid, (select auth.uid()), 'link')
    on conflict (game_id, user_id) do update set origen = 'link';
  end if;
  return gid;
end;
$$;

-- Quiénes pueden verlo (grupo + enlace) y quién carga resultados. Sólo el dueño.
create or replace function public.torneo_personas(gid uuid)
returns table (user_id uuid, name text, avatar_url text, can_edit boolean, origen text)
language plpgsql stable security definer set search_path = ''
as $$
declare grp uuid; owner uuid;
begin
  if not public.is_game_owner(gid) then
    raise exception 'no_es_tuyo' using errcode = '42501';
  end if;
  select g.group_id, g.user_id into grp, owner from public.games g where g.id = gid;
  return query
  with gente as (
    select m.user_id as uid, 'grupo'::text as origen from public.group_members m where grp is not null and m.group_id = grp
    union
    select a.user_id, a.origen from public.tournament_access a where a.game_id = gid
  )
  select distinct on (x.uid)
         x.uid,
         coalesce(p.nickname, p.display_name, 'Jugador'),
         p.avatar_url,
         coalesce(a.can_edit, false),
         x.origen
    from gente x
    left join public.profiles p on p.id = x.uid
    left join public.tournament_access a on a.game_id = gid and a.user_id = x.uid
   where x.uid <> owner
   order by x.uid, (x.origen = 'grupo') desc;
end;
$$;

create or replace function public.set_torneo_editor(gid uuid, uid uuid, puede boolean)
returns void
language plpgsql security definer set search_path = ''
as $$
declare grp uuid;
begin
  if not public.is_game_owner(gid) then
    raise exception 'no_es_tuyo' using errcode = '42501';
  end if;
  select g.group_id into grp from public.games g where g.id = gid;
  -- Sólo a quien ya lo puede ver: alguien del grupo o que entró con el enlace.
  if not exists (select 1 from public.tournament_access a where a.game_id = gid and a.user_id = uid)
     and not (grp is not null and exists (select 1 from public.group_members m where m.group_id = grp and m.user_id = uid)) then
    raise exception 'no_lo_ve' using errcode = '42501';
  end if;
  insert into public.tournament_access (game_id, user_id, can_edit, origen)
  values (gid, uid, puede, 'grupo')
  on conflict (game_id, user_id) do update set can_edit = excluded.can_edit;
end;
$$;

-- Escritura de un editor (o del dueño desde otro lado). Concurrencia
-- optimista: si la fila cambió desde que se leyó, devuelve null y la app
-- relee, re-aplica el resultado y vuelve a intentar.
create or replace function public.update_torneo_data(gid uuid, nuevo jsonb, esperado timestamptz)
returns timestamptz
language plpgsql security definer set search_path = ''
as $$
declare actual timestamptz; ahora timestamptz := now();
begin
  if not public.can_edit_game(gid) then
    raise exception 'sin_permiso' using errcode = '42501';
  end if;
  select g.updated_at into actual from public.games g where g.id = gid and g.kind = 'torneo' for update;
  if actual is null then
    raise exception 'no_existe' using errcode = 'P0002';
  end if;
  if actual > esperado then
    return null;
  end if;
  update public.games
     set data = jsonb_set(
                  -- Un editor sólo cambia resultados: no puede renombrar, mudar
                  -- de grupo ni tocar la lista de participantes.
                  nuevo || jsonb_build_object(
                    'id', data -> 'id',
                    'title', data -> 'title',
                    'grupoId', data -> 'grupoId',
                    'participantes', data -> 'participantes'
                  ),
                  '{updatedAt}', to_jsonb(to_char(ahora at time zone 'utc', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"'))
                ),
         updated_at  = ahora,
         finished_at = case when nuevo ->> 'fase' = 'terminado' then coalesce(finished_at, ahora) else null end
   where id = gid;
  return ahora;
end;
$$;

-- La web (quien-gana.app/t/CODIGO) lo muestra sin sesión: sólo lectura y sólo
-- lo que hace falta para dibujar tablas y cuadro.
create or replace function public.torneo_publico(code text)
returns table (title text, data jsonb, updated_at timestamptz)
language sql stable security definer set search_path = ''
as $$
  select g.title,
         jsonb_build_object(
           'deporte', g.data -> 'deporte',
           'formato', g.data -> 'formato',
           'fase', g.data -> 'fase',
           'participantes', (
             select coalesce(jsonb_agg(jsonb_build_object('id', p -> 'id', 'nombre', p -> 'nombre', 'equipo', p -> 'equipo')), '[]'::jsonb)
               from jsonb_array_elements(coalesce(g.data -> 'participantes', '[]'::jsonb)) p
           ),
           'grupos', g.data -> 'grupos',
           'partidos', g.data -> 'partidos',
           'llaves', g.data -> 'llaves',
           'desempates', g.data -> 'desempates',
           'campeon', g.data -> 'campeon'
         ),
         g.updated_at
    from public.games g
   where g.share_code = upper(btrim(code)) and g.kind = 'torneo';
$$;

revoke execute on function public.create_torneo_share(uuid)                      from public, anon;
revoke execute on function public.join_torneo_by_code(text)                      from public, anon;
revoke execute on function public.torneo_personas(uuid)                          from public, anon;
revoke execute on function public.set_torneo_editor(uuid, uuid, boolean)         from public, anon;
revoke execute on function public.update_torneo_data(uuid, jsonb, timestamptz)   from public, anon;
grant  execute on function public.create_torneo_share(uuid)                      to authenticated;
grant  execute on function public.join_torneo_by_code(text)                      to authenticated;
grant  execute on function public.torneo_personas(uuid)                          to authenticated;
grant  execute on function public.set_torneo_editor(uuid, uuid, boolean)         to authenticated;
grant  execute on function public.update_torneo_data(uuid, jsonb, timestamptz)   to authenticated;
grant  execute on function public.torneo_publico(text)                           to anon, authenticated;

-- ───────────── Realtime ─────────────
-- Los que miran ven los resultados en vivo (Realtime respeta las políticas de select).
do $$
begin
  if not exists (
    select 1 from pg_publication_tables
     where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'games'
  ) then
    alter publication supabase_realtime add table public.games;
  end if;
end;
$$;
