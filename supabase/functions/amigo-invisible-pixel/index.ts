// Edge Function: amigo-invisible-pixel
//
// La imagen de 1x1 que va al pie del mail. Es la única función pública
// (verify_jwt = false): la pide el cliente de correo, que no manda headers.
//
// Lo que registra es una SEÑAL, no un acuse de recibo. Gmail proxea las
// imágenes, Apple Mail Privacy Protection las precarga aunque nadie abra el
// mail (falso positivo), y Outlook las bloquea por defecto (falso negativo).
// Por eso se marca `opened_unreliable` y la app nunca dice "lo leyó".
//
// Deploy:   supabase functions deploy amigo-invisible-pixel --no-verify-jwt

import { createClient } from 'npm:@supabase/supabase-js@2';

import { aHex, hashToken } from '../_compartido/amigo/cripto.ts';

/** GIF transparente de 1x1: 43 bytes. */
const GIF = Uint8Array.from(
  atob('R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7'),
  (ch) => ch.charCodeAt(0),
);

const imagen = () =>
  new Response(GIF, {
    status: 200,
    headers: {
      'Content-Type': 'image/gif',
      'Content-Length': String(GIF.length),
      // Sin esto el proxy de Gmail cachea y la segunda apertura no llega nunca.
      'Cache-Control': 'no-store, no-cache, must-revalidate, max-age=0, private',
      Pragma: 'no-cache',
      Expires: '0',
      'X-Content-Type-Options': 'nosniff',
    },
  });

/** Los que piden la imagen sin que haya una persona mirando. */
const PROXIES = /GoogleImageProxy|YahooMailProxy|Apple-?Mail|Barracuda|Proofpoint|Mimecast/i;

Deno.serve(async (req) => {
  // Pase lo que pase se devuelve el GIF: un 404 le avisaría a quien sondea que
  // ese token no existe, y además dejaría un hueco en el mail.
  try {
    const token = new URL(req.url).searchParams.get('t');
    if (!token || token.length > 128) return imagen();

    const admin = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SECRET_KEY') ?? Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
      { auth: { persistSession: false } },
    );

    const { data: m } = await admin
      .from('secret_santa_members')
      .select('id, sent_at, opened_at, opens')
      .eq('token_hash', aHex(await hashToken(token)))
      .maybeSingle();
    if (!m) return imagen();

    const ua = req.headers.get('user-agent') ?? '';
    const ahora = Date.now();
    // Un pedido a segundos del envío es un escáner, no alguien leyendo.
    const apurado = m.sent_at ? ahora - Date.parse(m.sent_at) < 15_000 : false;
    const dudosa = PROXIES.test(ua) || apurado;

    // El índice único (member_id, minute) absorbe las precargas en ráfaga:
    // Apple pide la imagen seis veces seguidas y eso no son seis aperturas.
    const minute = new Date(Math.floor(ahora / 60_000) * 60_000).toISOString();
    const { error } = await admin
      .from('secret_santa_opens')
      .insert({ member_id: m.id, minute, user_agent: ua.slice(0, 300), proxy: dudosa });
    if (error) return imagen(); // repetida dentro del mismo minuto: no se cuenta dos veces

    await admin
      .from('secret_santa_members')
      .update({
        opens: m.opens + 1,
        ...(m.opened_at ? {} : { opened_at: new Date(ahora).toISOString() }),
        // Una apertura limpia posterior le saca la duda a la primera.
        ...(dudosa ? (m.opened_at ? {} : { opened_unreliable: true }) : { opened_unreliable: false }),
      })
      .eq('id', m.id);
  } catch {
    // El tracking jamás puede romper la imagen del mail.
  }
  return imagen();
});
