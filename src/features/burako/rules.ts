import type { BurakoGame, BurakoLado, BurakoRound, Player } from '../types';

/**
 * Reglas del anotador de Burako.
 *
 * Por ronda, cada lado (jugador o pareja) suma:
 * - 200 por cada canasta pura y 100 por cada impura;
 * - 100 si cortó (sólo un lado por ronda);
 * - los puntos de fichas: fichas bajadas menos las que quedaron en mano, así
 *   que pueden dar negativo;
 * - −100 si no levantó el muerto.
 *
 * Gana el primero que llega a la meta (3000 por defecto). Si al cerrar una
 * ronda más de uno la pasó, gana el de más puntos; si empatan arriba, se sigue.
 */
export const PUNTOS = { pura: 200, impura: 100, corte: 100, sinMuerto: -100 } as const;

export const DEFAULTS = { target: 3000 } as const;

export const LIMITS = {
  minTarget: 1500,
  maxTarget: 5000,
  stepTarget: 500,
  /** Individual: de a 2 o de a 3. En parejas son siempre 2 equipos de 2. */
  maxIndividual: 3,
  integrantesParejas: 4,
  maxCanastas: 20,
  maxFichas: 9999,
} as const;

export const ladoVacio = (): BurakoLado => ({ puras: 0, impuras: 0, fichas: 0, sinMuerto: false });

export function puntosLado(lado: BurakoLado | undefined, corto: boolean): number {
  const l = lado ?? ladoVacio();
  return (
    l.puras * PUNTOS.pura +
    l.impuras * PUNTOS.impura +
    (corto ? PUNTOS.corte : 0) +
    l.fichas +
    (l.sinMuerto ? PUNTOS.sinMuerto : 0)
  );
}

export const puntosRonda = (round: BurakoRound, playerId: string) =>
  puntosLado(round.lados[playerId], round.corto === playerId);

export function totals(game: Pick<BurakoGame, 'players' | 'rounds'>): Record<string, number> {
  const out: Record<string, number> = {};
  for (const p of game.players) out[p.id] = 0;
  for (const r of game.rounds) for (const p of game.players) out[p.id] += puntosRonda(r, p.id);
  return out;
}

export function standings(game: Pick<BurakoGame, 'players' | 'rounds'>): { player: Player; total: number }[] {
  const t = totals(game);
  return [...game.players].sort((a, b) => t[b.id] - t[a.id]).map((p) => ({ player: p, total: t[p.id] }));
}

/** Ganador al cerrar la última ronda cargada, o null si nadie llegó o hay empate arriba. */
export function ganador(game: Pick<BurakoGame, 'players' | 'rounds' | 'target'>): Player | null {
  if (game.rounds.length === 0) return null;
  const s = standings(game);
  if (s[0].total < game.target) return null;
  if (s.length > 1 && s[1].total === s[0].total) return null;
  return s[0].player;
}

/** Parejas sentadas enfrentadas: 1.º y 3.º contra 2.º y 4.º. */
export function armarParejas(nombres: string[]): [string[], string[]] {
  return [
    nombres.filter((_, i) => i % 2 === 0),
    nombres.filter((_, i) => i % 2 === 1),
  ];
}

export const nombreEquipo = (integrantes: string[]) => integrantes.join(' y ');
