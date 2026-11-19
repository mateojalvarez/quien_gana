// Edge Function: amigo-invisible-ver
//
// Devuelve el reparto completo, y SÓLO si el anfitrión eligió un sorteo a la
// vista cuando lo creó (`reveal_to_host`). Esa columna no está entre las que el
// anfitrión puede actualizar, así que no se puede encender después: el correo
// que ya leyeron los participantes dice cuál de los dos modos era.
//
// Si el sorteo es secreto, esta función no sirve de nada aunque la llame el
// dueño: la respuesta es 403 y no se descifra nada.
//
// Deploy:   supabase functions deploy amigo-invisible-ver

import { createClient } from 'npm:@supabase/supabase-js@2';

import { cors, json } from '../_compartido/cors.ts';
import { deHex, descifrarDestino } from '../_compartido/amigo/cripto.ts';

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors });
  if (req.method !== 'POST') return json({ error: 'method not allowed' }, 405);

  const jwt = req.headers.get('Authorization')?.replace('Bearer ', '');
  if (!jwt) return json({ error: 'unauthorized' }, 401);

  const admin = createClient(
    Deno.env.get('SUPABASE_URL')!,
    Deno.env.get('SUPABASE_SECRET_KEY') ?? Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
    { auth: { persistSession: false } },
  );

  const { data: userData } = await admin.auth.getUser(jwt);
  const user = userData?.user;
  if (!user) return json({ error: 'unauthorized' }, 401);

  const body = await req.json().catch(() => ({}));
  const drawId: string | undefined = body?.drawId;
  if (!drawId) return json({ error: 'falta_draw_id' }, 400);

  const { data: sorteo } = await admin
    .from('secret_santa')
    .select('id, status, reveal_to_host')
    .eq('id', drawId)
    .eq('owner_id', user.id)
    .maybeSingle();
  if (!sorteo) return json({ error: 'no_encontrado' }, 404);
  if (!sorteo.reveal_to_host) return json({ error: 'sorteo_secreto' }, 403);
  if (sorteo.status !== 'drawn') return json({ error: 'todavia_no_se_sorteo' }, 409);

  const { data: miembros } = await admin
    .from('secret_santa_members')
    .select('id, name')
    .eq('draw_id', drawId)
    .order('created_at');
  const nombre = new Map((miembros ?? []).map((m) => [m.id, m.name as string]));

  const { data: asignaciones } = await admin
    .from('secret_santa_assignments')
    .select('member_id, nonce, target_enc, key_version')
    .eq('draw_id', drawId);

  const reparto: { de: string; para: string }[] = [];
  for (const a of asignaciones ?? []) {
    const destinoId = await descifrarDestino(
      a.member_id,
      deHex(a.nonce),
      deHex(a.target_enc),
      a.key_version,
    );
    reparto.push({ de: nombre.get(a.member_id) ?? '?', para: nombre.get(destinoId) ?? '?' });
  }

  // En el orden en que se cargaron: así se lee como la lista de la pantalla.
  const orden = [...nombre.values()];
  reparto.sort((x, y) => orden.indexOf(x.de) - orden.indexOf(y.de));

  return json({ reparto });
});
