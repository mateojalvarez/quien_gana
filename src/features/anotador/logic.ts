import type { AnotadorGame } from '../types';

export function totals(game: AnotadorGame): Record<string, number> {
  const out: Record<string, number> = {};
  for (const p of game.players) out[p.id] = 0;
  for (const r of game.rounds) for (const p of game.players) out[p.id] += r[p.id] ?? 0;
  return out;
}

/** Ordena jugadores de mejor a peor según la regla de la partida. */
export function standings(game: AnotadorGame) {
  const t = totals(game);
  const sorted = [...game.players].sort((a, b) =>
    game.lowestWins ? t[a.id] - t[b.id] : t[b.id] - t[a.id],
  );
  return sorted.map((p) => ({ player: p, total: t[p.id] }));
}

/**
 * Hay ganador cuando alguien llega al objetivo.
 * - Más puntos gana: el primero en alcanzar/superar el objetivo.
 * - Menos puntos gana: alguien alcanza el objetivo y gana el que tenga menos.
 */
export function winner(game: AnotadorGame) {
  if (game.target == null || game.rounds.length === 0) return null;
  const s = standings(game);
  const reached = s.some((x) => x.total >= game.target!);
  if (!reached) return null;
  return s[0].player;
}
