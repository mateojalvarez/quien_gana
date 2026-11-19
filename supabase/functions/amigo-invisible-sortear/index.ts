// Edge Function: amigo-invisible-sortear
//
// Sortea, cifra el resultado y manda un mail a cada participante. Es el único
// lugar del sistema donde la asignación existe en claro, y vive ahí sólo
// mientras corre la función.
//
// Dos reglas que no se negocian en este archivo:
//   · NUNCA un console.log de la asignación ni de un destino. Los logs de las
//     Edge Functions quedan guardados y se leen desde el dashboard.
//   · La respuesta no puede traer nada derivado del reparto — ni "cuántos
//     ciclos quedaron", que también filtra.
//
// Deploy:   supabase functions deploy amigo-invisible-sortear
// Secrets:  ver supabase/functions/.env.example

import { createClient } from 'npm:@supabase/supabase-js@2';

import { cors, json } from '../_compartido/cors.ts';
import { cifrarDestino } from '../_compartido/amigo/cripto.ts';
import { dormir, mandarUno, RESPIRO_MS, type Miembro } from '../_compartido/amigo/envio.ts';
import { abrirCartero } from '../_compartido/amigo/mail.ts';
import { sortear } from '../_compartido/amigo/sorteo.ts';

// Con 3, el anfitrión que conoce su propio destino deduce el resto con
// certeza. El máximo lo pone el reloj: la función corta cerca de los 150 s y
// entre el pedido a Resend y el respiro cada mail se lleva casi un segundo.
const LIMITES = { min: 4, max: 60 } as const;

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
  if (user.is_anonymous) return json({ error: 'necesita_cuenta' }, 403);

  const body = await req.json().catch(() => ({}));
  const drawId: string | undefined = body?.drawId;
  if (!drawId) return json({ error: 'falta_draw_id' }, 400);

  // Candado atómico contra el doble toque: el UPDATE condicional es lo que
  // garantiza que dos pedidos en paralelo no sorteen dos veces y manden dos
  // resultados distintos. El segundo no encuentra la fila en 'draft'.
  const { data: sorteo } = await admin
    .from('secret_santa')
    .update({ status: 'drawing' })
    .eq('id', drawId)
    .eq('owner_id', user.id)
    .eq('status', 'draft')
    .select('id, name, message, event_date, budget, reveal_to_host')
    .maybeSingle();
  if (!sorteo) return json({ error: 'estado_invalido' }, 409);

  const volver = async (estado: 'draft' | 'error') => {
    await admin.from('secret_santa').update({ status: estado }).eq('id', drawId);
  };

  try {
    const { data: miembros } = await admin
      .from('secret_santa_members')
      .select('id, name, email, attempts')
      .eq('draw_id', drawId)
      .order('created_at');

    const gente = (miembros ?? []) as Miembro[];
    if (gente.length < LIMITES.min || gente.length > LIMITES.max) {
      await volver('draft');
      return json({ error: 'cantidad_invalida', min: LIMITES.min, max: LIMITES.max }, 422);
    }

    const { data: exc } = await admin
      .from('secret_santa_exclusions')
      .select('a_id, b_id')
      .eq('draw_id', drawId);

    let reparto: Map<string, string>;
    try {
      reparto = sortear(
        gente.map((m) => m.id),
        (exc ?? []).map((e) => ({ a: e.a_id, b: e.b_id })),
      );
    } catch {
      await volver('draft');
      return json({ error: 'sin_solucion' }, 422);
    }

    const nombre = new Map(gente.map((m) => [m.id, m.name]));

    // Primero se guarda el cifrado y después se manda: si el SMTP falla a
    // mitad, el reparto ya está firme y se arregla reenviando.
    const filas = await Promise.all(
      gente.map(async (m) => {
        const { nonce, cifrado, version } = await cifrarDestino(m.id, reparto.get(m.id)!);
        return {
          member_id: m.id,
          draw_id: drawId,
          nonce: `\\x${[...nonce].map((x) => x.toString(16).padStart(2, '0')).join('')}`,
          target_enc: `\\x${[...cifrado].map((x) => x.toString(16).padStart(2, '0')).join('')}`,
          key_version: version,
        };
      }),
    );
    const { error: errAsig } = await admin.from('secret_santa_assignments').insert(filas);
    if (errAsig) throw new Error(`no se pudo guardar la asignación: ${errAsig.message}`);

    const cartero = await abrirCartero();
    let enviados = 0;
    const fallidos: { memberId: string; name: string; error: string }[] = [];

    for (const m of gente) {
      const r = await mandarUno(admin, cartero, sorteo, m, nombre.get(reparto.get(m.id)!)!);
      if (r.ok) enviados++;
      else fallidos.push({ memberId: m.id, name: m.name, error: r.error });
      await dormir(RESPIRO_MS);
    }
    await cartero.cerrar();

    // Queda 'drawn' aunque algún mail haya fallado: el reparto ya es
    // definitivo y los que fallaron se arreglan con reenviar, no re-sorteando.
    const treintaDias = new Date(Date.now() + 30 * 24 * 3600_000).toISOString();
    await admin
      .from('secret_santa')
      .update({ status: 'drawn', drawn_at: new Date().toISOString(), purge_at: treintaDias })
      .eq('id', drawId);

    return json({ ok: true, enviados, fallidos });
  } catch (e) {
    await volver('error');
    return json({ error: String(e).slice(0, 300) }, 500);
  }
});
