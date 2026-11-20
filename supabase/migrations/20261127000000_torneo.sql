-- ¿Quién gana? — Generador de torneos
--
-- 1) Los torneos viajan como cualquier partida: el estado entero en `data`
--    (jsonb opaco para el sync). Sólo hay que ampliar la constraint de `kind`.
--
-- 2) El catálogo de equipos FC (ratings) se publica en el bucket `datos`, que la
--    app lee sin sesión. Lo sube scripts/equipos-fc con la service role, que
--    saltea RLS: no hay políticas de escritura para nadie más.

alter table public.games drop constraint if exists games_kind_check;

alter table public.games
  add constraint games_kind_check
  check (kind in ('anotador', 'corazones', 'truco', 'generala', 'torneo'));

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('datos', 'datos', true, 2097152, array['application/json'])
on conflict (id) do update
  set public             = excluded.public,
      file_size_limit    = excluded.file_size_limit,
      allowed_mime_types = excluded.allowed_mime_types;
