-- Confirmación de recepción del amigo invisible.
--
-- La apertura del pixel es una señal ruidosa (Apple precarga, Outlook bloquea).
-- Esto agrega la señal que sí vale: el participante tocó un botón en el correo
-- y después confirmó en una página. Un clic es intención humana.
--
-- El pixel sigue: responde "algo pasó con ese correo" cuando nadie confirma.

-- El token (HMAC del par sorteo+participante) ya no es sólo del pixel: también
-- firma el enlace de confirmación. El nombre tenía que dejar de decir "pixel".
alter table public.secret_santa_members
  rename column pixel_token_hash to token_hash;

alter table public.secret_santa_members
  -- Cuándo confirmó. Sin contador: confirmar dos veces no significa nada.
  add column if not exists received_at timestamptz,
  -- Para distinguir una confirmación de una persona de un escaneo raro, si
  -- alguna vez hay que investigar un caso puntual.
  add column if not exists received_user_agent text;

comment on column public.secret_santa_members.token_hash is
  'sha256 del token público (pixel y enlace de confirmación). El token en claro se re-deriva por HMAC.';
comment on column public.secret_santa_members.received_at is
  'El participante confirmó que le llegó, tocando el botón del correo. Es un acuse de recibo de verdad.';
