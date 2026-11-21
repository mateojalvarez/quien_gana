-- ¿Quién gana? — Anotadores de Burako y Calaveras y piratas
--
-- Viajan como cualquier partida: el estado entero en `data`. Sólo hay que
-- ampliar la constraint de `kind`.

alter table public.games drop constraint if exists games_kind_check;

alter table public.games
  add constraint games_kind_check
  check (kind in ('anotador', 'corazones', 'truco', 'generala', 'torneo', 'burako', 'calaveras'));
