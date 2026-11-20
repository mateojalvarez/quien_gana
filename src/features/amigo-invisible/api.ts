// Todas las llamadas a Supabase del amigo invisible.
//
// Las políticas RLS están en supabase/migrations/20261122000000_amigo_invisible.sql.
// Lo importante de acá: el sorteo y el reenvío NO son un insert ni un update,
// son Edge Functions. La asignación nunca pasa por el teléfono.

import { supabase } from '@/lib/supabase';
import type { Match, Participante, Sorteo } from './types';

type FilaSorteo = {
  id: string;
  name: string;
  message: string;
  event_date: string | null;
  budget: string | null;
  status: Sorteo['status'];
  reveal_to_host: boolean;
  drawn_at: string | null;
  created_at: string;
  secret_santa_members: { count: number }[];
};

const aSorteo = (r: FilaSorteo): Sorteo => ({
  id: r.id,
  name: r.name,
  message: r.message,
  eventDate: r.event_date,
  budget: r.budget,
  status: r.status,
  revelaAlAnfitrion: r.reveal_to_host,
  drawnAt: r.drawn_at,
  createdAt: r.created_at,
  cuantos: r.secret_santa_members?.[0]?.count ?? 0,
});

const COLUMNAS = 'id, name, message, event_date, budget, reveal_to_host, status, drawn_at, created_at';

// Hay que nombrar la clave foránea: `secret_santa_assignments` también apunta a
// las dos tablas, así que PostgREST ve dos caminos posibles y no elige solo.
const CUENTA = 'secret_santa_members!secret_santa_members_draw_id_fkey (count)';

export async function listSorteos(): Promise<Sorteo[]> {
  const { data, error } = await supabase
    .from('secret_santa')
    .select(`${COLUMNAS}, ${CUENTA}`)
    .order('created_at', { ascending: false });
  if (error) throw error;
  return (data as unknown as FilaSorteo[]).map(aSorteo);
}

export async function getSorteo(id: string): Promise<Sorteo> {
  const { data, error } = await supabase
    .from('secret_santa')
    .select(`${COLUMNAS}, ${CUENTA}`)
    .eq('id', id)
    .single();
  if (error) throw error;
  return aSorteo(data as unknown as FilaSorteo);
}

export async function crearSorteo(v: {
  name: string;
  message?: string;
  eventDate?: string | null;
  budget?: string | null;
  /** Sólo se puede elegir acá: después la columna es de sólo lectura. */
  revelaAlAnfitrion?: boolean;
}): Promise<string> {
  const { data, error } = await supabase
    .from('secret_santa')
    .insert({
      name: v.name.trim(),
      message: v.message?.trim() ?? '',
      event_date: v.eventDate || null,
      budget: v.budget?.trim() || null,
      reveal_to_host: v.revelaAlAnfitrion ?? false,
    })
    .select('id')
    .single();
  if (error) throw error;
  return data.id as string;
}

export async function borrarSorteo(id: string): Promise<void> {
  const { error } = await supabase.from('secret_santa').delete().eq('id', id);
  if (error) throw error;
}

export async function agregarParticipantes(
  drawId: string,
  /** `yo` marca la fila del anfitrión cuando decidió participar. */
  gente: { name: string; email: string; yo?: boolean }[],
  miUserId?: string,
): Promise<void> {
  const { error } = await supabase.from('secret_santa_members').insert(
    gente.map((p) => ({
      draw_id: drawId,
      name: p.name.trim(),
      email: p.email.trim(),
      user_id: p.yo && miUserId ? miUserId : null,
    })),
  );
  if (error) throw error;
}

export async function listParticipantes(drawId: string): Promise<Participante[]> {
  const { data, error } = await supabase
    .from('secret_santa_members')
    .select('id, name, email, user_id, sent_at, send_error, attempts, opened_at, opens, opened_unreliable, received_at')
    .eq('draw_id', drawId)
    .order('created_at');
  if (error) throw error;
  return (data ?? []).map((r) => ({
    id: r.id,
    name: r.name,
    email: r.email,
    esElAnfitrion: r.user_id !== null,
    sentAt: r.sent_at,
    sendError: r.send_error,
    attempts: r.attempts,
    openedAt: r.opened_at,
    opens: r.opens,
    openedUnreliable: r.opened_unreliable,
    receivedAt: r.received_at,
  }));
}

/** Sólo nombre y correo: el resto de las columnas no las puede tocar el anfitrión. */
export async function corregirParticipante(id: string, v: { name?: string; email?: string }): Promise<void> {
  const { error } = await supabase
    .from('secret_santa_members')
    .update({ ...(v.name ? { name: v.name.trim() } : {}), ...(v.email ? { email: v.email.trim() } : {}) })
    .eq('id', id);
  if (error) throw error;
}

export async function quitarParticipante(id: string): Promise<void> {
  const { error } = await supabase.from('secret_santa_members').delete().eq('id', id);
  if (error) throw error;
}

export async function excluir(drawId: string, aId: string, bId: string): Promise<void> {
  const { error } = await supabase
    .from('secret_santa_exclusions')
    .insert({ draw_id: drawId, a_id: aId, b_id: bId });
  if (error) throw error;
}

export async function listExclusiones(drawId: string): Promise<{ a: string; b: string }[]> {
  const { data, error } = await supabase
    .from('secret_santa_exclusions')
    .select('a_id, b_id')
    .eq('draw_id', drawId);
  if (error) throw error;
  return (data ?? []).map((r) => ({ a: r.a_id, b: r.b_id }));
}

export async function quitarExclusion(drawId: string, aId: string, bId: string): Promise<void> {
  const { error } = await supabase
    .from('secret_santa_exclusions')
    .delete()
    .eq('draw_id', drawId)
    .eq('a_id', aId)
    .eq('b_id', bId);
  if (error) throw error;
}

export type Fallido = { memberId: string; name: string; error: string };
export type ResultadoEnvio = { enviados: number; fallidos: Fallido[] };

/** Los códigos que devuelven las funciones, traducidos a algo que se pueda leer. */
const MOTIVO: Record<string, string> = {
  necesita_cuenta: 'Para mandar los correos hace falta una cuenta, no alcanza con entrar como invitado.',
  estado_invalido: 'Este sorteo ya se sorteó.',
  cantidad_invalida: 'La cantidad de participantes no sirve para sortear.',
  sin_solucion: 'Con esas exclusiones no hay reparto posible. Sacá alguna o sumá gente.',
  sorteo_secreto: 'Este sorteo se creó en secreto: el reparto no se puede ver, y eso no se puede cambiar.',
  no_encontrado: 'No encontramos el sorteo.',
  todavia_no_se_sorteo: 'Todavía no se sorteó.',
  muy_seguido: 'Recién lo mandaste. Esperá un minuto y probá de nuevo.',
  config_incompleta:
    'Al servidor le faltan las claves de envío de correo. Hay que cargarlas con `supabase secrets set` ' +
    '(la lista está en supabase/functions/.env.example).',
};

/**
 * El cuerpo del error trae el código; sin esto el usuario ve "non-2xx".
 * `faltan` sólo viene con config_incompleta y se agrega al mensaje para no
 * tener que abrir los logs del proyecto.
 */
async function mensajeDeError(error: { context?: Response; message: string }): Promise<string> {
  const detalle = await error.context?.json?.().catch(() => null);
  const codigo = detalle?.error as string | undefined;
  const base = codigo && MOTIVO[codigo] ? MOTIVO[codigo] : (codigo ?? error.message);
  const faltan = detalle?.faltan as string[] | undefined;
  return Array.isArray(faltan) && faltan.length > 0 ? `${base}\n\nFaltan: ${faltan.join(', ')}.` : base;
}

async function invocar(fn: string, body: Record<string, unknown>): Promise<ResultadoEnvio> {
  const { data, error } = await supabase.functions.invoke(fn, { body });
  if (error) throw new Error(await mensajeDeError(error as { context?: Response; message: string }));
  return { enviados: data?.enviados ?? 0, fallidos: data?.fallidos ?? [] };
}

export const sortearYEnviar = (drawId: string) => invocar('amigo-invisible-sortear', { drawId });

/** Sólo funciona si el sorteo se creó a la vista. El servidor es el que decide. */
export async function verReparto(drawId: string): Promise<Match[]> {
  const { data, error } = await supabase.functions.invoke('amigo-invisible-ver', { body: { drawId } });
  if (error) throw new Error(await mensajeDeError(error as { context?: Response; message: string }));
  return data?.reparto ?? [];
}

/** Sin `memberId`, reenvía a todos los que todavía no salieron. */
export const reenviar = (drawId: string, memberId?: string) =>
  invocar('amigo-invisible-reenviar', { drawId, ...(memberId ? { memberId } : {}) });
