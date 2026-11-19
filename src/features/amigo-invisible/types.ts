export type EstadoSorteo = 'draft' | 'drawing' | 'drawn' | 'error';

export type Sorteo = {
  id: string;
  name: string;
  message: string;
  eventDate: string | null;
  budget: string | null;
  status: EstadoSorteo;
  /**
   * Sorteo a la vista: el anfitrión puede pedir el reparto. Se decide al
   * crearlo y no se puede cambiar después — el correo que ya recibieron los
   * participantes dice cuál de los dos modos es.
   */
  revelaAlAnfitrion: boolean;
  drawnAt: string | null;
  createdAt: string;
  /** Cuántos participantes tiene. Lo trae el listado. */
  cuantos: number;
};

export type Participante = {
  id: string;
  name: string;
  email: string;
  /** La fila del propio anfitrión, cuando decidió participar. */
  esElAnfitrion: boolean;
  sentAt: string | null;
  sendError: string | null;
  attempts: number;
  openedAt: string | null;
  opens: number;
  openedUnreliable: boolean;
};

/**
 * Lo único que se puede afirmar es si el mail salió. La apertura es una señal
 * ruidosa, no un acuse de recibo, y por eso tiene estados propios: ver el
 * comentario largo en supabase/functions/amigo-invisible-pixel/index.ts.
 */
export type EstadoMail = 'sin-enviar' | 'fallo' | 'enviado' | 'abierto-dudoso' | 'abierto';

export function estadoMail(p: Participante): EstadoMail {
  if (!p.sentAt) return p.sendError ? 'fallo' : 'sin-enviar';
  if (!p.openedAt) return 'enviado';
  return p.openedUnreliable ? 'abierto-dudoso' : 'abierto';
}

/** El texto que se le muestra al anfitrión. Nunca dice "lo leyó". */
export const ETIQUETA: Record<EstadoMail, string> = {
  'sin-enviar': 'Sin enviar',
  fallo: 'No salió',
  enviado: 'Enviado',
  'abierto-dudoso': 'Señal automática',
  abierto: 'Señal de apertura',
};

export const EXPLICACION: Record<EstadoMail, string> = {
  'sin-enviar': 'Todavía no se mandó.',
  fallo: 'No se pudo entregar. Revisá la dirección y reenviá.',
  enviado: 'Puede que ya lo haya leído: muchos programas de correo ocultan esta señal.',
  'abierto-dudoso': 'El correo se abrió solo, probablemente una precarga del teléfono y no la persona.',
  abierto: 'El correo se abrió. Es una señal, no una confirmación.',
};

export type Match = { de: string; para: string };

export const fechaCorta = (iso: string | null): string => {
  if (!iso) return '';
  const d = new Date(iso);
  return `${String(d.getDate()).padStart(2, '0')}/${String(d.getMonth() + 1).padStart(2, '0')} ${String(
    d.getHours(),
  ).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
};
