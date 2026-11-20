// Edge Function: amigo-invisible-reenviar
//
// Vuelve a mandar el mismo mail sin re-sortear: descifra la asignación que ya
// estaba guardada. Esto es lo que hace que un mail con una letra de más no
// obligue a sortear de nuevo y a avisarles a los quince que lo anterior no vale.
//
// Sin `memberId` reenvía a todos los que todavía no salieron.
//
// Deploy:   supabase functions deploy amigo-invisible-reenviar

import { createClient } from 'npm:@supabase/supabase-js@2';

import { cors, json } from '../_compartido/cors.ts';
import { secretsQueFaltan } from '../_compartido/amigo/config.ts';
import { deHex, descifrarDestino } from '../_compartido/amigo/cripto.ts';
import { dormir, mandarUno, RESPIRO_MS, type Miembro } from '../_compartido/amigo/envio.ts';
import { abrirCartero } from '../_compartido/amigo/mail.ts';

/** Para que el botón de reenviar no sea un cañón de spam. */
const ESPERA_MS = 60_000;

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
  const memberId: string | undefined = body?.memberId;
  if (!drawId) return json({ error: 'falta_draw_id' }, 400);

  const faltan = secretsQueFaltan();
  if (faltan.length > 0) return json({ error: 'config_incompleta', faltan }, 500);

  const { data: sorteo } = await admin
    .from('secret_santa')
    .select('id, name, message, event_date, budget, reveal_to_host, status')
    .eq('id', drawId)
    .eq('owner_id', user.id)
    .maybeSingle();
  if (!sorteo) return json({ error: 'no_encontrado' }, 404);
  if (sorteo.status !== 'drawn') return json({ error: 'todavia_no_se_sorteo' }, 409);

  let q = admin
    .from('secret_santa_members')
    .select('id, name, email, attempts')
    .eq('draw_id', drawId);
  // Sin participante, los que faltan: justo los que fallaron la primera vez.
  q = memberId ? q.eq('id', memberId) : q.is('sent_at', null);
  const { data: miembros } = await q.order('created_at');

  const gente = (miembros ?? []) as Miembro[];
  if (gente.length === 0) return json({ ok: true, enviados: 0, fallidos: [] });

  // Un solo pedido a la bitácora para todos: evita N consultas en el lote.
  const desde = new Date(Date.now() - ESPERA_MS).toISOString();
  const { data: recientes } = await admin
    .from('secret_santa_sends')
    .select('member_id')
    .in('member_id', gente.map((m) => m.id))
    .gte('created_at', desde);
  const frenados = new Set((recientes ?? []).map((r) => r.member_id));

  const pendientes = gente.filter((m) => !frenados.has(m.id));
  if (pendientes.length === 0) return json({ error: 'muy_seguido' }, 429);

  const { data: asignaciones } = await admin
    .from('secret_santa_assignments')
    .select('member_id, nonce, target_enc, key_version')
    .in('member_id', pendientes.map((m) => m.id));

  const { data: todos } = await admin
    .from('secret_santa_members')
    .select('id, name')
    .eq('draw_id', drawId);
  const nombre = new Map((todos ?? []).map((m) => [m.id, m.name as string]));

  const cartero = await abrirCartero();
  let enviados = 0;
  const fallidos: { memberId: string; name: string; error: string }[] = [];

  try {
    for (const m of pendientes) {
      const a = (asignaciones ?? []).find((x) => x.member_id === m.id);
      if (!a) {
        fallidos.push({ memberId: m.id, name: m.name, error: 'sin_asignacion' });
        continue;
      }
      const destinoId = await descifrarDestino(m.id, deHex(a.nonce), deHex(a.target_enc), a.key_version);
      const r = await mandarUno(admin, cartero, sorteo, m, nombre.get(destinoId) ?? 'tu amigo invisible');
      if (r.ok) enviados++;
      else fallidos.push({ memberId: m.id, name: m.name, error: r.error });
      await dormir(RESPIRO_MS);
    }
  } finally {
    await cartero.cerrar();
  }

  // No se toca `opened_at` ni `opens`: la señal de apertura vieja sigue valiendo.
  return json({ ok: true, enviados, fallidos });
});
