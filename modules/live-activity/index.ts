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

export type EstadoReloj = {
  /** Epoch en ms en que llega a cero (si corre). */
  finMs: number;
  duracionMs: number;
  restanteMs: number;
  pausado: boolean;
};

/** Cómo quedó el reloj afuera de la app: alarma de AlarmKit (iOS 26+), Live Activity o nada. */
export type ModoReloj = 'alarma' | 'actividad' | '';

type Nativo = {
  soportado: () => boolean;
  iniciarTruco: (estado: EstadoTruco) => string | null;
  actualizarTruco: (estado: EstadoTruco) => void;
  terminarTruco: (partidaId: string | null) => void;
  tomarPendientes: () => { partidaId: string; acciones: AccionPendiente[] };
  permisoAlarma?: () => Promise<boolean>;
  reloj?: (estado: EstadoReloj) => Promise<ModoReloj>;
  terminarReloj?: (llego: boolean, enPantalla: boolean) => Promise<void>;
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

/* ───────────── Reloj ───────────── */

/** iOS 26+: permiso para que el reloj sea una alarma del sistema. */
export const permisoAlarma = async (): Promise<boolean> => {
  try {
    return (await nativo?.permisoAlarma?.()) ?? false;
  } catch {
    return false;
  }
};

export const reloj = async (estado: EstadoReloj): Promise<ModoReloj> => {
  try {
    return (await nativo?.reloj?.(estado)) ?? '';
  } catch {
    return '';
  }
};

/** `llego`: terminó la cuenta (si no, se reinició o se salió). `enPantalla`: la app está abierta. */
export const terminarReloj = async (llego: boolean, enPantalla: boolean): Promise<void> => {
  try {
    await nativo?.terminarReloj?.(llego, enPantalla);
  } catch {
    // ídem
  }
};
