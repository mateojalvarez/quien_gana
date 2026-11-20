// Edge Function: amigo-invisible-recibido
//
// El botón "marcar como recibido" del correo. Es la única señal honesta que
// tiene el anfitrión: un clic lo da una persona, una imagen cargada no.
//
// Por qué son DOS pasos (abrir la página y después tocar el botón): Outlook
// Safe Links, Proofpoint y Mimecast abren todos los enlaces de un correo para
// escanearlos. Si el enlace confirmara al abrirse, media oficina aparecería
// confirmada sola — exactamente el falso positivo que este botón vino a
// resolver. Un GET nunca escribe; sólo el POST del formulario confirma.
//
// La página no dice ningún nombre: el token viaja por el correo, pero igual es
// una URL pública y no tiene por qué contar de qué sorteo se trata ni a quién
// le toca regalar quién.
//
// ⚠️ OJO: desplegada en *.supabase.co esta página NO se ve como página. El
// gateway de Supabase le reescribe el Content-Type a text/plain y le agrega
// nosniff a cualquier respuesta HTML —es a propósito, para que nadie use el
// dominio de Supabase para armar un phishing— así que el navegador muestra el
// código fuente. Para que funcione, el HTML tiene que salir de un dominio
// propio: o se sirve la página desde quien-gana.app y postea acá, o el
// proyecto usa el add-on de dominio propio de Supabase.
//
// Deploy:   supabase functions deploy amigo-invisible-recibido --no-verify-jwt

import { createClient } from 'npm:@supabase/supabase-js@2';

import { aHex, hashToken } from '../_compartido/amigo/cripto.ts';

const pagina = (titulo: string, cuerpo: string, status = 200) =>
  new Response(
    `<!doctype html>
<html lang="es">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width,initial-scale=1">
  <meta name="robots" content="noindex">
  <title>${titulo}</title>
</head>
<body style="margin:0;background:#f6f3ec;font:16px/1.6 -apple-system,Segoe UI,Roboto,Arial,sans-serif;color:#2b2722">
  <div style="max-width:420px;margin:0 auto;padding:48px 20px">
    <p style="margin:0;font:600 13px/1.4 -apple-system,Segoe UI,Roboto,Arial,sans-serif;letter-spacing:.08em;text-transform:uppercase;color:#8a8275">¿Quién gana? · Amigo invisible</p>
    <div style="margin-top:16px;background:#fffdf8;border:2px solid #2b2722;border-radius:24px;padding:28px">
      ${cuerpo}
    </div>
  </div>
</body>
</html>`,
    { status, headers: { 'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'no-store' } },
  );

// Va con 200 y no con 404: un 404 le confirmaría a quien sondea que ese token
// no existe. Misma razón por la que el pixel devuelve siempre la imagen.
const invalida = () =>
  pagina(
    'Enlace vencido',
    `<h1 style="margin:0;font:700 22px/1.3 -apple-system,Segoe UI,Roboto,Arial,sans-serif">Este enlace ya no sirve</h1>
     <p style="margin:12px 0 0;color:#5a5349">Puede que el sorteo se haya borrado. Si te llegó tu amigo invisible, no hace falta hacer nada más.</p>`,
  );

const listo = (titulo: string) =>
  pagina(
    titulo,
    `<h1 style="margin:0;font:700 22px/1.3 -apple-system,Segoe UI,Roboto,Arial,sans-serif">${titulo}</h1>
     <p style="margin:12px 0 0;color:#5a5349">Quien armó el sorteo ya sabe que te llegó. Podés cerrar esta página.</p>`,
  );

Deno.serve(async (req) => {
  const url = new URL(req.url);
  let token = url.searchParams.get('t') ?? '';

  if (req.method === 'POST') {
    // El token viaja también en el formulario: así el POST se sostiene solo
    // aunque el cliente de correo recorte la query al abrir la página.
    const form = await req.formData().catch(() => null);
    token = (form?.get('t') as string | null) ?? token;
  } else if (req.method !== 'GET') {
    return pagina('No disponible', '<p style="margin:0">Método no permitido.</p>', 405);
  }

  if (!token || token.length > 128) return invalida();

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
  if (!m) return invalida();

  if (req.method === 'GET') {
    if (m.received_at) return listo('Ya lo habías confirmado');
    const t = token.replace(/"/g, '&quot;');
    return pagina(
      'Confirmar que te llegó',
      `<h1 style="margin:0;font:700 22px/1.3 -apple-system,Segoe UI,Roboto,Arial,sans-serif">¿Te llegó tu amigo invisible?</h1>
       <p style="margin:12px 0 20px;color:#5a5349">Tocá el botón y quien armó el sorteo va a ver que ya lo tenés. No le muestra a quién te tocó.</p>
       <form method="POST">
         <input type="hidden" name="t" value="${t}">
         <button type="submit" style="width:100%;padding:16px;border:0;border-radius:999px;background:#2b2722;color:#fffdf8;font:600 16px/1 -apple-system,Segoe UI,Roboto,Arial,sans-serif;cursor:pointer">Sí, ya me llegó</button>
       </form>`,
    );
  }

  // POST: confirma. Idempotente — confirmar dos veces no cambia la primera vez.
  if (!m.received_at) {
    await admin
      .from('secret_santa_members')
      .update({
        received_at: new Date().toISOString(),
        received_user_agent: (req.headers.get('user-agent') ?? '').slice(0, 300),
      })
      .eq('id', m.id);
  }
  return listo('¡Listo!');
});
