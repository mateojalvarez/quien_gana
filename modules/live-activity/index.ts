import { requireOptionalNativeModule } from 'expo';

/**
 * Live Activities. Sólo iOS 17+: en cualquier otro lado el módulo no existe y
 * todo esto no hace nada, a propósito. La partida nunca depende de esto.
 */

export type EstadoTruco = {
  partidaId: string;
  target: number;
  nombreNos: string;
  nombreEllos: string;
  nosotros: number;
  ellos: number;
  /** A qué equipo fue el último toque; null si no hay nada que deshacer. */
  ultimoEquipo: number | null;
};

export type AccionPendiente = { tipo: 'sumar'; equipo: number } | { tipo: 'deshacer' };

type Nativo = {
  soportado: () => boolean;
  iniciarTruco: (estado: EstadoTruco) => string | null;
  actualizarTruco: (estado: EstadoTruco) => void;
  terminarTruco: (partidaId: string | null) => void;
  tomarPendientes: () => { partidaId: string; acciones: AccionPendiente[] };
};

const nativo = requireOptionalNativeModule<Nativo>('LiveActivity');

export const soportado = (): boolean => {
  try {
    return nativo?.soportado() ?? false;
  } catch {
    return false;
  }
};

export const iniciarTruco = (estado: EstadoTruco): string | null => {
  try {
    return nativo?.iniciarTruco(estado) ?? null;
  } catch {
    return null;
  }
};

export const actualizarTruco = (estado: EstadoTruco): void => {
  try {
    nativo?.actualizarTruco(estado);
  } catch {
    // La actividad es un extra: si falla, la partida sigue.
  }
};

export const terminarTruco = (partidaId: string | null = null): void => {
  try {
    nativo?.terminarTruco(partidaId);
  } catch {
    // ídem
  }
};

const NADA = { partidaId: '', acciones: [] as AccionPendiente[] };

/** Vacía la cola: lo que devuelve hay que aplicarlo sí o sí. */
export const tomarPendientes = (): { partidaId: string; acciones: AccionPendiente[] } => {
  try {
    return nativo?.tomarPendientes() ?? NADA;
  } catch {
    return NADA;
  }
};
