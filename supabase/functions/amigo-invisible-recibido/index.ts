// Edge Function: amigo-invisible-recibido
//
// Confirma que a un participante le llegó su amigo invisible. Es la única
// señal honesta que tiene el anfitrión: un clic lo da una persona, una imagen
// cargada no.
//
// Acá no hay página: sólo POST y JSON. La página es
// https://quien-gana.app/recibido —está en el repo del sitio, quien-gana-web,
// en app/recibido/— y es la que postea acá. No es un capricho: el gateway de Supabase le reescribe el
// Content-Type a text/plain y le agrega nosniff a cualquier respuesta HTML de
// una Edge Function —a propósito, para que nadie use su dominio para armar un
// phishing— así que el navegador mostraría el código fuente. De paso, el
// enlace del correo queda en el dominio propio.
//
// Son DOS pasos (abrir la página y recién ahí tocar el botón) porque Outlook
// Safe Links, Proofpoint y Mimecast abren todos los enlaces de un correo para
// escanearlos. Si el enlace confirmara al abrirse, media oficina aparecería
// confirmada sola: exactamente el falso positivo que este botón vino a
// resolver. Que el enlace vaya a una página estática lo refuerza: lo que el
// escáner abre no toca la base, porque acá sólo escribe el POST.
//
// La respuesta no dice ningún nombre ni de qué sorteo se trata: el token viaja
// por correo, pero el endpoint es público igual.
//
// Deploy:   supabase functions deploy amigo-invisible-recibido --no-verify-jwt

import { createClient } from 'npm:@supabase/supabase-js@2';

import { aHex, hashToken } from '../_compartido/amigo/cripto.ts';

/** De dónde se sirve la página que postea acá. */
const SITIO = (Deno.env.get('SITIO_BASE_URL') ?? 'https://quien-gana.app').replace(/\/+$/, '');

const cors = {
  // Acotado al sitio propio: el token ya es la autorización, pero no hay
  // ninguna razón para que esto se pueda llamar desde cualquier página.
  'Access-Control-Allow-Origin': SITIO,
  'Access-Control-Allow-Headers': 'content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Access-Control-Max-Age': '86400',
};

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { ...cors, 'Content-Type': 'application/json', 'Cache-Control': 'no-store' },
  });

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response(null, { status: 204, headers: cors });
  if (req.method !== 'POST') return json({ error: 'method_not_allowed' }, 405);

  // El token puede venir en el cuerpo o en la query: la página manda JSON, y
  // así un `curl -X POST ...?t=` alcanza para probar el deploy.
  const body = (await req.json().catch(() => null)) as { t?: unknown } | null;
  const token = typeof body?.t === 'string' ? body.t : (new URL(req.url).searchParams.get('t') ?? '');

  // `vencido` también cuando el token es basura. Son HMAC de 32 bytes: no se
  // adivinan, así que decirle "este enlace ya no sirve" a quien tiene uno roto
  // vale más que esconder si existía.
  if (!token || token.length > 128) return json({ ok: false, motivo: 'vencido' });

  const admin = createClient(
    Deno.env.get('SUPABASE_URL')!,
    Deno.env.get('SUPABASE_SECRET_KEY') ?? Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
    { auth: { persistSession: false } },
  );

  const { data: m } = await admin
    .from('secret_santa_members')
    .select('id, received_at')
    .eq('token_hash', aHex(await hashToken(token)))
    .maybeSingle();
  if (!m) return json({ ok: false, motivo: 'vencido' });

  // Idempotente: confirmar dos veces no mueve la primera vez.
  if (m.received_at) return json({ ok: true, ya: true });

  const { error } = await admin
    .from('secret_santa_members')
    .update({
      received_at: new Date().toISOString(),
      received_user_agent: (req.headers.get('user-agent') ?? '').slice(0, 300),
    })
    .eq('id', m.id);
  if (error) return json({ ok: false, motivo: 'error' }, 500);

  return json({ ok: true, ya: false });
});
