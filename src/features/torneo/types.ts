// Tipos del generador de torneos. El estado entero viaja en `games.data`
// (jsonb opaco para el sync), así que todo acá tiene que ser JSON plano.

/** Fútbol/FIFA cuenta goles; "otro" (ping-pong, etc.) cuenta puntos o sets con las mismas reglas. */
export type Deporte = 'futbol' | 'otro';
export type Modalidad = 'individual' | 'parejas';

/** Un equipo del catálogo FC, tal como lo genera scripts/equipos-fc. */
export type EquipoFC = {
  id: string;
  nombre: string;
  liga: string;
  pais: string;
  ovr: number;
  ata: number;
  med: number;
  def: number;
  esSeleccion: boolean;
};

export type CatalogoFC = {
  edicion: string;
  generado: string;
  version: string;
  equipos: EquipoFC[];
};

/**
 * Copia del equipo al momento del sorteo: si el catálogo se actualiza, los
 * torneos ya sorteados no cambian. `ovr` y `estrellas` son null en los cargados a mano.
 */
export type EquipoAsignado = {
  id: string;
  nombre: string;
  ovr: number | null;
  estrellas: number | null;
};

export type Participante = {
  id: string;
  /** "Mateo" o "Mateo y Juan" en parejas. */
  nombre: string;
  /** ids de `players` que lo forman. */
  integrantes: string[];
  /** Índice en `bombos`. */
  bombo: number;
  equipo?: EquipoAsignado | null;
};

export type Bombo = { nombre: string; estrellas: number };

export type TipoFormato = 'liga' | 'grupos' | 'playoff';

export type Formato = {
  tipo: TipoFormato;
  /** Liga o fase de grupos a dos ruedas. */
  idaVuelta: boolean;
  /** Llaves de playoff a ida y vuelta: primero todas las idas, después todas las vueltas. */
  playoffIdaVuelta: boolean;
  /** Con playoff a ida y vuelta, la final igual se juega a un partido. */
  finalUnica: boolean;
  grupos?: { cantidad: number; clasificanPorGrupo: number };
};

export type FiltroEquipos = 'clubes' | 'selecciones' | 'todos';

export type Etapa = 'liga' | 'grupo' | 'playoff' | 'desempate';

export type Partido = {
  id: string;
  etapa: Etapa;
  /** Índice de grupo (fase de grupos, o el desempate de un grupo). */
  grupo?: number;
  /** Fecha (liga/grupos) o ronda del cuadro (playoff), desde 0. */
  ronda: number;
  /** Playoff: id de la llave. */
  llave?: string;
  /** Desempate: la clave del empate que resuelve. */
  clave?: string;
  pierna: 1 | 2;
  local: string;
  visitante: string;
  gl: number | null;
  gv: number | null;
  /** Sólo en el último partido de una llave empatada (o un desempate empatado). */
  penales?: { l: number; v: number } | null;
};

/** Una llave del cuadro. `a`/`b` en null = todavía no se sabe quién llega. */
export type Llave = {
  id: string;
  ronda: number;
  pos: number;
  a: string | null;
  b: string | null;
  /** Uno pasa directo: no hay partidos. */
  bye: boolean;
};

export type FaseTorneo = 'sorteo' | 'en-juego' | 'terminado';

export type OrigenEquipos = 'catalogo' | 'manual';

export type DatosTorneo = {
  deporte: Deporte;
  modalidad: Modalidad;
  grupoId?: string | null;
  /** Copia del nombre del grupo al crearlo, para mostrarlo sin buscarlo. */
  grupoNombre?: string | null;
  participantes: Participante[];
  bombos: Bombo[];
  usaEquipos: boolean;
  origenEquipos: OrigenEquipos;
  filtroEquipos: FiltroEquipos;
  /** Equipos cargados a mano, por bombo. El match con los participantes es al azar. */
  equiposManuales?: EquipoAsignado[][];
  formato: Formato;
  fase: FaseTorneo;
  /** Ids de participantes por grupo. */
  grupos?: string[][];
  partidos: Partido[];
  llaves?: Llave[];
  /** clave de empate → orden final de los empatados (por sorteo o desempate). */
  desempates?: Record<string, string[]>;
  /** Id del participante campeón. */
  campeon?: string | null;
  /**
   * Semilla del sorteo de cruces de grupos → playoff. Se guarda para que el
   * cuadro sea el mismo en todos los dispositivos y se pueda re-sortear
   * (cambiándola) mientras no se haya jugado nada del playoff.
   */
  semillaCruces?: number | null;
};
