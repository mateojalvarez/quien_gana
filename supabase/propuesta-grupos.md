# Etapa 2 · Grupos — esquema y RLS propuestos

Todavía **no toqué la base**: no hay migración ni nada aplicado. Cuando lo apruebes
esto se convierte en `supabase/migrations/2026…_grupos.sql`.

Sí lo probé: corrí todo el SQL en el Postgres local de Docker dentro de una
transacción que termina en `rollback`, con tres usuarios de prueba, y verifiqué que
las políticas hacen lo que dicen (ver §8). La base quedó como estaba — siguen
existiendo solo `games` y `profiles`, y no quedó ningún usuario de prueba.

---

## 1. Qué tiene que resolver

| Requisito | Cómo se resuelve |
|---|---|
| Crear grupo | `public.groups` + trigger que mete al creador como admin |
| Invitar por enlace y QR, vence a los 7 días | `public.group_invites` con `code` y `expires_at`; se usa por RPC, nunca por `select` directo |
| Integrantes sin cuenta, solo en el teléfono | **No van a la base.** Viven en AsyncStorage, en un store nuevo `qg-grupos` |
| Un único grupo activo que precarga integrantes | `profiles.active_group_id`, con espejo local |

---

## 2. Tablas

```sql
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
```

**Por qué no hay tabla de integrantes sin cuenta**: pediste que queden solo en el
teléfono. Si los subiéramos, serían datos de terceros en un servidor sin que esas
personas lo sepan. Quedan en el store local, atados al `group_id`.

La consecuencia hay que decirla en la pantalla: **los integrantes sin cuenta los ves
solo vos**. Los demás del grupo no los ven, y si cambiás de teléfono se pierden.
En el diseño (pantalla 24) ya están marcados con "Local · solo en este teléfono".

---

## 3. Dos funciones `security definer` (para no caer en recursión)

Esta es la parte donde RLS se rompe sola si se escribe derecho. La política de
`group_members` necesita preguntar "¿soy integrante de este grupo?", lo que implica
leer `group_members` — y Postgres entra en recursión infinita. La salida estándar es
una función `security definer`, que se saltea RLS:

```sql
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
```

---

## 4. Políticas RLS

```sql
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
```

---

## 5. El huevo y la gallina al crear un grupo

Si el `insert` en `group_members` exige `is_group_admin`, nadie puede crear el
primer integrante: el grupo recién nacido no tiene ninguno. Lo resuelve un trigger:

```sql
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
```

---

## 6. Las tres RPC

Unirse necesita leer una invitación **sin ser integrante todavía**. En vez de abrir
un `select` permisivo sobre `group_invites` (que dejaría enumerar códigos y espiar
nombres de grupos), todo pasa por funciones `security definer` que devuelven
exactamente lo necesario:

```sql
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
```

El vencimiento a los 7 días lo controla la RPC (`expires_at > now()`), no RLS: una
invitación vencida sigue existiendo para que la pantalla pueda decir "venció" en vez
de "no existe".

---

## 7. Decisiones que quiero que mires

**a) Los invitados no pueden crear ni unirse a grupos.** Un invitado pierde todo al
cerrar sesión; meterlo en un grupo compartido deja integrantes fantasma. La política
de `insert` en `groups` y la RPC de unirse lo bloquean, y la app le muestra "Vinculá
una cuenta". Si preferís que puedan, se saca el chequeo de `is_anonymous`.

**b) El grupo activo viaja con la cuenta** (`profiles.active_group_id`). Hoy el cliente
no lee ni escribe `profiles` — solo sincroniza `games` — así que esto suma un camino
de sincronización nuevo. La alternativa es guardarlo solo en el teléfono: más simple,
pero en un teléfono nuevo hay que volver a elegirlo. Me inclino por la cuenta: elegir
grupo es justo lo que no querés repetir.

**c) El código de invitación es aleatorio, no `VIERNES-7K2`.** El del diseño
(pantalla 25) lleva el nombre del grupo adentro, así que cualquiera que vea el enlace
—en una captura, en un chat reenviado— se entera de cómo se llama. Propongo 10
caracteres aleatorios mostrados como `K7M2-PQRX-94`, y que la pantalla muestre el
nombre del grupo arriba, como ya hace.

**d) El QR y el enlace necesitan definir un dominio.** El diseño dice
`quien-gana.app/g/…`. Si tenés ese dominio, conviene un universal link (archivo AASA)
para que abra la app directo. Si no, el QR codifica `quiengana://g/<code>`, que funciona
solo si la app ya está instalada — a quien no la tenga, el QR no le dice nada.
**Necesito que me digas si el dominio existe.**
Para escanear no hace falta cámara en la app: la cámara de iOS abre el enlace sola.
Dibujar el QR sí, con `react-native-qrcode-svg` sobre el `react-native-svg` que ya está.

**e) "Lo que más juegan" (pantalla 24) queda calculado en el teléfono.** Para que fuera
real haría falta compartir partidas dentro del grupo, que es bastante más que esta
etapa. Propongo guardar un `groupId` opcional adentro del `data` jsonb de cada partida
—retrocompatible, igual que `decks` y `bonusFromRound`— y contar local. Si preferís,
lo saco de la pantalla hasta que las partidas se compartan.

**f) Sin cambios en `games` ni en su RLS.** Las partidas siguen siendo de cada uno.
El grupo solo precarga nombres de jugadores al crear una partida.

---

## 8. Lo que ya verifiqué (transacción revertida, Postgres local)

| # | Prueba | Resultado |
|---|---|---|
| 1 | Ana crea un grupo | el trigger la deja como `admin` |
| 2 | `select` sobre `group_members` siendo integrante | **no recursiona** — devuelve 1 fila |
| 3 | Beto, ajeno al grupo | ve 0 grupos y 0 invitaciones |
| 4 | Ana crea una invitación | código de 10 caracteres, vence en 7 días |
| 5 | Beto previsualiza con el código y se une | entra; pasa a ver 2 integrantes y los perfiles de Ana y Beto |
| 6 | Caro, ajena, **con el código en la mano** | ve 0 filas de `group_invites` y solo su propio perfil |
| 7 | Un invitado (anónimo) intenta unirse | rechazado: `necesita_cuenta` |
| 8 | Beto intenta echar a Ana, que es la dueña | el `delete` no afecta ninguna fila |
| 9 | Beto se va solo | sale; queda 1 integrante |

La #2 es la que importa: es el punto donde RLS sobre una tabla de pertenencia entra
en recursión infinita si no se usa la función `security definer`.

### Un error que estas pruebas no alcanzaron a ver

Probando después contra PostgREST con usuarios reales apareció algo que en psql no
se notaba: **crear un grupo fallaba** con "new row violates row-level security policy".

El trigger que suma al dueño como integrante es `AFTER INSERT`, y `supabase-js` hace
`.insert().select()`, que es `Prefer: return=representation`. En el `RETURNING`, la fila
todavía no tiene integrantes, así que `is_group_member(id)` da falso y el creador no
puede ver su propio grupo recién creado. Con `return=minimal` andaba; con la
representación, no.

Por eso la política de `select` sobre `groups` lleva `or (select auth.uid()) = owner_id`.
Vale la pena anotarlo porque es justo el tipo de error que no aparece probando el SQL
solo: hace falta pasar por la API.

---

## 9. Si aprobás, lo que sigue en la etapa 2

1. La migración, aplicada primero en local (`npm run db:reset`) y después en la nube.
2. `src/features/grupos/` con los tipos y las llamadas a Supabase, y
   `src/store/grupos.ts` con los integrantes sin cuenta y el espejo del grupo activo.
3. Pantallas: Grupos (lista real, reemplaza el vacío de la etapa 1), Grupo · detalle,
   e Invitar como hoja propia con el QR.
4. El deep link `quiengana://g/<code>` y la pantalla de unirse.
5. `nueva.tsx` precarga los integrantes del grupo activo, con sus modos oscuros.
