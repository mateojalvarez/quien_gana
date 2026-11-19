-- ¿Quién gana? — Amigo invisible (etapa 4)
--
-- La promesa de la feature es "nadie sabe qué persona le tocó a otro, ni
-- siquiera el anfitrión". Eso define todo el esquema:
--
--   1. La asignación NO vive en una columna de la tabla de participantes.
--      Vive en `secret_santa_assignments`, una tabla con RLS activa y CERO
--      policies, y además sin privilegios para anon/authenticated. Ni el
--      ciphertext asoma por PostgREST.
--   2. Lo que se guarda ahí está cifrado con AES-256-GCM. La clave es un
--      secret de la Edge Function y nunca estuvo en la base.
--   3. El tracking de apertura lo escribe sólo el service_role: al anfitrión
--      se le quita el UPDATE y se le devuelve por columna (`grant update (…)`),
--      porque RLS es por fila y no sabe esconder columnas.
--   4. `reveal_to_host` deja que el anfitrión elija un sorteo a la vista, donde
--      él sí ve el reparto. Es una decisión del momento de crearlo y NO está en
--      la lista de columnas que puede actualizar: encenderla después de sortear
--      convertiría en mentira lo que ya leyeron los participantes en su correo.
--      Cada modo manda un texto distinto, así nadie se entera tarde.
--
-- Hasta dónde llega la promesa, para que la UI no prometa de más:
--   · Frente al ANFITRIÓN, se sostiene: no tiene consola ni service_role, y no
--     hay ninguna fila legible que contenga el destino.
--   · Frente al dueño del proyecto de Supabase (o sea, el desarrollador), no:
--     quien tenga a la vez la base y el secret puede descifrar.
--   · El anfitrión igual puede poner su propio mail en lugar del de otro. Eso
--     no lo arregla la criptografía; la promesa correcta es "la app no se lo
--     muestra", no "le es imposible".
--   · Con 3 participantes, el anfitrión que conoce su propio destino deduce el
--     resto con certeza. Por eso el mínimo es 4 (y la UI avisa hasta 5).


-- ───────────── Sorteos ─────────────
create table public.secret_santa (
  id         uuid primary key default gen_random_uuid(),
  owner_id   uuid not null default auth.uid() references auth.users (id) on delete cascade,
  group_id   uuid references public.groups (id) on delete set null,
  name       text not null check (length(btrim(name)) between 1 and 60),
  message    text not null default '' check (length(message) <= 500),
  -- Decorativos: viajan en el mail y nada más.
  event_date date,
  budget     text check (budget is null or length(budget) <= 40),
  -- Sorteo a la vista: el anfitrión puede pedir el reparto completo. Se decide
  -- al crearlo y después no se mueve (ver los grants del final).
  reveal_to_host boolean not null default false,
  status     text not null default 'draft'
               check (status in ('draft', 'drawing', 'drawn', 'error')),
  drawn_at   timestamptz,
  -- Fecha a partir de la cual conviene borrar el cifrado: achica la ventana
  -- del único agujero real (ver cabecera).
  purge_at   timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index secret_santa_owner_idx on public.secret_santa (owner_id, created_at desc);


-- ───────────── Participantes ─────────────
-- Son datos de terceros: nombre y mail cargados por el anfitrión. No se atan a
-- auth.users a propósito — la gracia es que el participante no necesita cuenta.
create table public.secret_santa_members (
  id         uuid primary key default gen_random_uuid(),
  draw_id    uuid not null references public.secret_santa (id) on delete cascade,
  -- Sólo para la fila del propio anfitrión cuando decide participar: sirve para
  -- marcarla como "vos" y para no dejar que se agregue dos veces.
  user_id    uuid references auth.users (id) on delete set null,
  name       text not null check (length(btrim(name)) between 1 and 40),
  email      text not null
               check (email ~* '^[^@[:space:]]+@[^@[:space:]]+\.[^@[:space:]]+$' and length(email) <= 254),
  email_norm text generated always as (lower(btrim(email))) stored,

  -- Estado del envío. Lo escribe la función, no el anfitrión.
  sent_at    timestamptz,
  send_error text,
  attempts   int not null default 0,

  -- Señal de apertura. Es una señal, no un acuse de recibo: ver la nota en
  -- secret_santa_opens.
  opened_at  timestamptz,
  opens      int not null default 0,
  -- true cuando la única señal vino de una precarga o un proxy.
  opened_unreliable boolean not null default false,

  -- Sólo el sha256 del token del pixel. El token en claro se re-deriva por
  -- HMAC al reenviar, así que no hace falta guardarlo — y con un dump de la
  -- base no se pueden fabricar aperturas falsas.
  pixel_token_hash bytea unique,

  created_at timestamptz not null default now()
);

create unique index secret_santa_members_email_idx
  on public.secret_santa_members (draw_id, email_norm);
create index secret_santa_members_draw_idx
  on public.secret_santa_members (draw_id, created_at);

-- El anfitrión entra una vez o ninguna.
create unique index secret_santa_members_self_idx
  on public.secret_santa_members (draw_id, user_id)
  where user_id is not null;


-- Parejas y hermanos que no pueden tocarse entre sí. Simétrico: se guarda una
-- fila sola y el sorteo la lee para los dos lados.
create table public.secret_santa_exclusions (
  draw_id uuid not null references public.secret_santa (id) on delete cascade,
  a_id    uuid not null references public.secret_santa_members (id) on delete cascade,
  b_id    uuid not null references public.secret_santa_members (id) on delete cascade,
  primary key (draw_id, a_id, b_id),
  check (a_id <> b_id)
);


-- ───────────── La asignación (lo secreto) ─────────────
-- Una fila por participante. `target_enc` es el uuid de a quién le regala,
-- cifrado con AES-256-GCM. El AAD es el id del propio participante: mover un
-- ciphertext de una fila a otra lo vuelve indescifrable.
create table public.secret_santa_assignments (
  member_id   uuid primary key references public.secret_santa_members (id) on delete cascade,
  draw_id     uuid not null references public.secret_santa (id) on delete cascade,
  nonce       bytea not null check (octet_length(nonce) = 12),
  target_enc  bytea not null,
  key_version int   not null default 1,
  created_at  timestamptz not null default now()
);

create index secret_santa_assignments_draw_idx on public.secret_santa_assignments (draw_id);


-- ───────────── Bitácoras ─────────────
-- Aperturas. `minute` es el minuto truncado: el índice único absorbe las
-- precargas en ráfaga (Apple pide la imagen seis veces seguidas) sin que eso
-- cuente como seis aperturas.
create table public.secret_santa_opens (
  id         bigserial primary key,
  member_id  uuid not null references public.secret_santa_members (id) on delete cascade,
  minute     timestamptz not null,
  user_agent text,
  proxy      boolean not null default false,
  created_at timestamptz not null default now()
);

create unique index secret_santa_opens_dedupe on public.secret_santa_opens (member_id, minute);

create table public.secret_santa_sends (
  id         bigserial primary key,
  member_id  uuid not null references public.secret_santa_members (id) on delete cascade,
  to_email   text not null,
  ok         boolean not null,
  error      text,
  -- Id del mensaje en Resend: es lo único con lo que se rastrea un rebote en
  -- su panel cuando el participante dice que no le llegó.
  provider_id text,
  created_at timestamptz not null default now()
);

create index secret_santa_sends_member_idx on public.secret_santa_sends (member_id, created_at desc);


-- ───────────── Quién es el anfitrión ─────────────
-- security definer, como is_group_admin: si consultaran la tabla de frente,
-- la policy se llamaría a sí misma.
create or replace function public.is_santa_host(did uuid)
returns boolean language sql security definer stable set search_path = ''
as $$
  select exists (
    select 1 from public.secret_santa s
     where s.id = did and s.owner_id = (select auth.uid())
  );
$$;

create or replace function public.santa_is_draft(did uuid)
returns boolean language sql security definer stable set search_path = ''
as $$
  select exists (
    select 1 from public.secret_santa s
     where s.id = did and s.owner_id = (select auth.uid()) and s.status = 'draft'
  );
$$;

revoke execute on function public.is_santa_host(uuid)   from public, anon;
revoke execute on function public.santa_is_draft(uuid)  from public, anon;
grant  execute on function public.is_santa_host(uuid)   to authenticated;
grant  execute on function public.santa_is_draft(uuid)  to authenticated;


-- ───────────── RLS ─────────────
alter table public.secret_santa             enable row level security;
alter table public.secret_santa_members     enable row level security;
alter table public.secret_santa_exclusions  enable row level security;
alter table public.secret_santa_assignments enable row level security;  -- sin policies, a propósito
alter table public.secret_santa_opens       enable row level security;
alter table public.secret_santa_sends       enable row level security;

-- ── sorteos ──
create policy "sorteos: ver los míos"
  on public.secret_santa for select to authenticated
  using ((select auth.uid()) = owner_id);

create policy "sorteos: crear"
  on public.secret_santa for insert to authenticated
  with check (
    (select auth.uid()) = owner_id
    -- Un invitado anónimo no manda mails a terceros desde nuestro dominio.
    and (select (auth.jwt() ->> 'is_anonymous')::boolean) is not true
  );

create policy "sorteos: editar los míos"
  on public.secret_santa for update to authenticated
  using ((select auth.uid()) = owner_id)
  with check ((select auth.uid()) = owner_id);

create policy "sorteos: borrar los míos"
  on public.secret_santa for delete to authenticated
  using ((select auth.uid()) = owner_id);

-- ── participantes ──
-- El anfitrión ve la lista entera y el estado de cada mail. El destino no está
-- en esta tabla, así que no hay nada que esconderle acá.
create policy "participantes: ver los de mis sorteos"
  on public.secret_santa_members for select to authenticated
  using (public.is_santa_host(draw_id));

create policy "participantes: agregar mientras sea borrador"
  on public.secret_santa_members for insert to authenticated
  -- `user_id` sólo puede apuntarse a uno mismo: es una marca, no una forma de
  -- colgarle una fila a otra cuenta.
  with check (public.santa_is_draft(draw_id) and (user_id is null or user_id = (select auth.uid())));

create policy "participantes: sacar mientras sea borrador"
  on public.secret_santa_members for delete to authenticated
  using (public.santa_is_draft(draw_id));

-- Corregir sí se puede siempre: el caso más común de todos es un mail con una
-- letra de más, y arreglarlo no puede obligar a sortear de nuevo.
create policy "participantes: corregir los de mis sorteos"
  on public.secret_santa_members for update to authenticated
  using (public.is_santa_host(draw_id))
  with check (public.is_santa_host(draw_id));

-- ── exclusiones ──
create policy "exclusiones: ver las de mis sorteos"
  on public.secret_santa_exclusions for select to authenticated
  using (public.is_santa_host(draw_id));

create policy "exclusiones: editar mientras sea borrador"
  on public.secret_santa_exclusions for all to authenticated
  using (public.santa_is_draft(draw_id))
  with check (public.santa_is_draft(draw_id));

-- ── bitácoras: sólo lectura, y sólo del anfitrión ──
create policy "aperturas: ver las de mis sorteos"
  on public.secret_santa_opens for select to authenticated
  using (public.is_santa_host(
    (select m.draw_id from public.secret_santa_members m where m.id = member_id)
  ));

create policy "envíos: ver los de mis sorteos"
  on public.secret_santa_sends for select to authenticated
  using (public.is_santa_host(
    (select m.draw_id from public.secret_santa_members m where m.id = member_id)
  ));

-- ── asignaciones: ninguna policy ──
-- RLS activa sin policies ⇒ authenticated y anon ven cero filas. Encima les
-- sacamos el privilegio, así la tabla no existe para PostgREST. El service_role
-- conserva el suyo: la Edge Function es la única que la toca.
revoke all on table public.secret_santa_assignments from anon, authenticated;


-- ───────────── Privilegios por columna ─────────────
-- RLS decide filas, no columnas. Sin esto, un anfitrión con el anon key y curl
-- podría marcarse los mails como abiertos, o devolver el sorteo a 'draft' para
-- sortear dos veces y cruzar los resultados, que es un ataque real contra el
-- secreto.
revoke update on table public.secret_santa_members from authenticated;
grant  update (name, email) on table public.secret_santa_members to authenticated;

revoke update on table public.secret_santa from authenticated;
-- `reveal_to_host` NO está en esta lista, y es deliberado: se fija al crear el
-- sorteo y no se puede encender después. Si se pudiera, el anfitrión prometería
-- secreto en los correos y se daría vuelta una vez que todos los leyeron.
grant  update (name, message, event_date, budget, group_id, updated_at)
  on table public.secret_santa to authenticated;
