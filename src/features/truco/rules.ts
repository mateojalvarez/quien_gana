// Truco. Los números viven acá y en ningún otro lado.

import type { TrucoGame, TrucoMove } from '@/features/types';

export const TARGETS = [15, 30] as const;
export type TrucoTarget = (typeof TARGETS)[number];

export const RULES = {
  /** Un fósforo cruza a los otros cuatro: el grupo cierra en cinco. */
  perGroup: 5,
  /** Tres grupos por fila: quince puntos, una vuelta entera. */
  groupsPerRow: 3,
  /** A 30, los primeros quince son malas. */
  malas: 15,
} as const;

/** Quince: lo que entra en una fila de fósforos. */
export const porVuelta = RULES.perGroup * RULES.groupsPerRow;

export const DEFAULTS = {
  target: 30 as TrucoTarget,
  matches: true,
  teams: ['Nosotros', 'Ellos'],
};

/** El tanteador de cada equipo, derivado de los toques. Nunca baja de cero. */
export function scores(game: TrucoGame): [number, number] {
  const out: [number, number] = [0, 0];
  for (const m of game.moves) out[m.team] = Math.max(0, out[m.team] + m.delta);
  return out;
}

/** Índice del equipo ganador, o null. */
export function winner(game: TrucoGame): 0 | 1 | null {
  const [a, b] = scores(game);
  if (a >= game.target) return 0;
  if (b >= game.target) return 1;
  return null;
}

/**
 * Si un toque cambia algo. Restar en cero no hace nada, así que tampoco se
 * guarda: si no, "Deshacer" habría que apretarlo dos veces para ver un cambio.
 */
export function movePossible(game: TrucoGame, move: TrucoMove): boolean {
  if (move.delta === -1) return scores(game)[move.team] > 0;
  return winner(game) === null;
}

/** A 15 no hay buenas. A 30, se pasa a buenas al superar los quince. */
export const enBuenas = (score: number, target: TrucoTarget) => target === 30 && score > RULES.malas;

export const faltan = (score: number, target: TrucoTarget) => Math.max(0, target - score);

/** Cuántos fósforos tiene cada grupo de una fila de quince. 7 → [5, 2, 0]. */
export function matchRow(points: number): number[] {
  const p = Math.max(0, Math.min(porVuelta, points));
  return Array.from({ length: RULES.groupsPerRow }, (_, i) =>
    Math.max(0, Math.min(RULES.perGroup, p - i * RULES.perGroup)),
  );
}

/** Las dos filas. A 15 la de buenas no existe. */
export function matchRows(score: number, target: TrucoTarget): { malas: number[]; buenas: number[] | null } {
  if (target === 15) return { malas: matchRow(score), buenas: null };
  return { malas: matchRow(Math.min(score, RULES.malas)), buenas: matchRow(Math.max(0, score - RULES.malas)) };
}

/** Texto del último toque, para la línea de Deshacer. */
export function lastMoveLabel(game: TrucoGame): string | null {
  const m = game.moves[game.moves.length - 1];
  if (!m) return null;
  const equipo = game.players[m.team]?.name ?? (m.team === 0 ? 'Nosotros' : 'Ellos');
  return `${m.delta > 0 ? '+1' : '−1'} a ${equipo}`;
}

/** Resumen corto para la lista de partidas: "a 30 · 18 a 11". */
export function summary(game: TrucoGame): string {
  const [a, b] = scores(game);
  return `a ${game.target} · ${a} a ${b}`;
}
