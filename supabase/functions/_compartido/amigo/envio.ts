// Mandar UN mail y dejar registrado qué pasó. Lo comparten sortear y reenviar
// para que las dos escriban exactamente el mismo estado.

import type { SupabaseClient } from 'npm:@supabase/supabase-js@2';
import { aHex, hashToken, tokenMiembro } from './cripto.ts';
import { enlaces } from './enlaces.ts';
import type { Cartero } from './mail.ts';
import { asunto, html, texto } from './plantilla.ts';

export type Sorteo = {
  id: string;
  name: string;
  message: string;
  event_date: string | null;
  budget: string | null;
  reveal_to_host: boolean;
};

export type Miembro = { id: string; name: string; email: string; attempts: number };

export type Resultado = { ok: true } | { ok: false; error: string };

const fecha = (iso: string | null) => {
  if (!iso) return null;
  const [a, m, d] = iso.split('-');
  return `${d}/${m}/${a}`;
};

export async function mandarUno(
  admin: SupabaseClient,
  cartero: Cartero,
  sorteo: Sorteo,
  miembro: Miembro,
  destino: string,
): Promise<Resultado> {
  const ahora = new Date().toISOString();
  try {
    const token = await tokenMiembro(sorteo.id, miembro.id);
    const { pixelUrl, recibidoUrl } = enlaces(token);
    const datos = {
      sorteo: sorteo.name,
      mensaje: sorteo.message,
      fecha: fecha(sorteo.event_date),
      presupuesto: sorteo.budget,
      destino,
      para: miembro.name,
      anfitrionVe: sorteo.reveal_to_host,
      pixelUrl,
      recibidoUrl,
    };

    const providerId = await cartero.enviar({
      para: miembro.email,
      asunto: asunto(sorteo.name),
      html: html(datos),
      texto: texto(datos),
    });

    await admin
      .from('secret_santa_members')
      .update({
        sent_at: ahora,
        send_error: null,
        attempts: miembro.attempts + 1,
        token_hash: aHex(await hashToken(token)),
      })
      .eq('id', miembro.id);

    await admin
      .from('secret_santa_sends')
      .insert({ member_id: miembro.id, to_email: miembro.email, ok: true, provider_id: providerId });

    return { ok: true };
  } catch (e) {
    const error = String(e).slice(0, 300);
    await admin
      .from('secret_santa_members')
      .update({ send_error: error, attempts: miembro.attempts + 1 })
      .eq('id', miembro.id);
    await admin
      .from('secret_santa_sends')
      .insert({ member_id: miembro.id, to_email: miembro.email, ok: false, error });
    return { ok: false, error };
  }
}

/** Resend corta a 2 pedidos por segundo en el plan gratis. */
export const RESPIRO_MS = 600;
export const dormir = (ms: number) => new Promise((r) => setTimeout(r, ms));
