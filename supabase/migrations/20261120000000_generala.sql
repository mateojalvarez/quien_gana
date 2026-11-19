-- ¿Quién gana? — Generala (etapa 5)
--
-- Igual que con Truco: el estado entero va en `data` (jsonb), que es opaco
-- para el sync. Lo único que hay que ampliar es la constraint de `kind`.

alter table public.games drop constraint if exists games_kind_check;

alter table public.games
  add constraint games_kind_check
  check (kind in ('anotador', 'corazones', 'truco', 'generala'));
