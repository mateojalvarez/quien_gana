-- ¿Quién gana? — Truco (etapa 3)
--
-- El estado de la partida va entero en `data` (jsonb), que es opaco para el
-- sync, así que no hay que tocar nada más. Lo único que no es retrocompatible
-- es el `kind`: la constraint lo tiene enumerado y hay que ampliarla antes de
-- que un teléfono intente subir una partida de truco.

alter table public.games drop constraint if exists games_kind_check;

alter table public.games
  add constraint games_kind_check
  check (kind in ('anotador', 'corazones', 'truco'));
