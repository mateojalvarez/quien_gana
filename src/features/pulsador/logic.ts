import type { Anuncio, Marcador, Mode, RoundResult, Rules, Scores, Tap, TieGroup } from './types';

/**
 * Resolución de una ronda. Sin React y sin red: es lo único acá que conviene
 * poder razonar de un vistazo, porque de esto depende quién gana.
 */

/**
 * Por debajo de esto no distinguimos: el error de sincronización de reloj
 * ronda los 10–15 ms y no queremos inventar un orden que no existe.
 */
export const TIE_MS = 25;

/**
 * Lo que el árbitro espera, desde el primer toque, a que lleguen los rezagados.
 * Es el precio de la justicia: un toque anterior puede llegar más tarde.
 */
export const COLLECT_MS = 300;

/** Un jugador vale por su primer toque; los repetidos se ignoran. */
function firstPerPlayer(taps: Tap[]): Tap[] {
  const best = new Map<string, number>();
  for (const tap of taps) {
    const prev = best.get(tap.playerId);
    if (prev === undefined || tap.t < prev) best.set(tap.playerId, tap.t);
  }
  return [...best].map(([playerId, t]) => ({ playerId, t })).sort((a, b) => a.t - b.t);
}

/**
 * Agrupa en escalones: cada toque que cae dentro de `tieMs` del primero de su
 * escalón empata con él. La comparación es contra el primero del grupo y no
 * contra el anterior, para que una fila de toques cercanos no encadene a todos
 * en un empate único.
 */
export function rank(taps: Tap[], tieMs = TIE_MS): TieGroup[] {
  const groups: TieGroup[] = [];
  for (const tap of firstPerPlayer(taps)) {
    const last = groups[groups.length - 1];
    if (last && tap.t - last.t <= tieMs) last.playerIds.push(tap.playerId);
    else groups.push({ playerIds: [tap.playerId], t: tap.t });
  }
  return groups;
}

export function resolveRound(
  roundId: string,
  taps: Tap[],
  opts: { mode: Mode; goAt: number | null },
): RoundResult {
  const { mode, goAt } = opts;
  if (mode !== 'senal' || goAt === null) return { roundId, queue: rank(taps), fouls: [] };

  // Con señal: el que se adelantó queda descalificado en la ronda, incluso si
  // después toca bien.
  const fouls = [...new Set(taps.filter((t) => t.t < goAt).map((t) => t.playerId))];
  const valid = taps.filter((t) => !fouls.includes(t.playerId));
  return { roundId, queue: rank(valid), fouls };
}

/** Milisegundos de ventaja del ganador sobre el escalón siguiente. */
export function marginMs(queue: TieGroup[]): number | null {
  return queue.length >= 2 ? Math.round(queue[1].t - queue[0].t) : null;
}

/* ───────────── Puntaje ───────────── */

export const REGLAS_DEFAULT: Rules = { acierto: 1, fallo: 1, rondas: null };

export const MARCADOR_INICIAL: Marcador = { rules: REGLAS_DEFAULT, scores: {}, jugadas: 0, ultimo: {}, anuncio: null };

/**
 * Suma o resta a quienes tenían la palabra. En empate técnico responden
 * juntos, así que el acierto (o el error) es de todos.
 */
export function aplicarTurno(scores: Scores, ids: string[], ok: boolean, rules: Rules): { scores: Scores; delta: Scores } {
  const d = ok ? rules.acierto : -rules.fallo;
  const next = { ...scores };
  const delta: Scores = {};
  for (const id of ids) {
    next[id] = (next[id] ?? 0) + d;
    delta[id] = d;
  }
  return { scores: next, delta };
}

/** Ranking de los que están en la sala, de más a menos puntos. Estable por el orden de llegada. */
export function ranking(scores: Scores, ids: string[]): { id: string; puntos: number }[] {
  return ids.map((id) => ({ id, puntos: scores[id] ?? 0 })).sort((a, b) => b.puntos - a.puntos);
}

/**
 * ¿Ya hay ganador? Sólo con rondas limitadas.
 *
 * Matemático: lo más que el segundo puede descontar por ronda es que el líder
 * falle (−fallo) y el segundo acierte después (+acierto). Si ni ganando todas
 * así alcanza, está definido.
 * Final: se jugaron todas; si arriba hay empate, ganan todos los empatados.
 */
export function definido(scores: Scores, ids: string[], rules: Rules, jugadas: number): Omit<Anuncio, 'terminado'> | null {
  if (rules.rondas === null || ids.length < 2) return null;
  const tabla = ranking(scores, ids);
  const restantes = Math.max(0, rules.rondas - jugadas);
  if (restantes === 0) {
    const top = tabla[0]!.puntos;
    return { ganadores: tabla.filter((t) => t.puntos === top).map((t) => t.id), motivo: 'final' };
  }
  const ventaja = tabla[0]!.puntos - tabla[1]!.puntos;
  if (ventaja > restantes * (rules.acierto + rules.fallo)) return { ganadores: [tabla[0]!.id], motivo: 'matematico' };
  return null;
}

/** Clave de un anuncio: si el anfitrión eligió seguir jugando, no se repite el mismo. */
export const claveAnuncio = (a: Pick<Anuncio, 'ganadores' | 'motivo'>) => `${a.motivo}:${[...a.ganadores].sort().join(',')}`;
