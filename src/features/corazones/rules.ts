import type { CorazonesGame, CorazonesRound, Player } from '../types';

/**
 * Reglas de Corazones (pedir bazas).
 *
 * - En la ronda N se reparten N cartas, hasta el máximo que permiten los mazos
 *   (52 × mazos ÷ jugadores). A partir de ahí la cantidad se mantiene (meseta).
 * - Acertar la predicción paga `exactBase` + las bazas hechas; desde la ronda de
 *   bonus paga `bonusBase` + las bazas hechas.
 * - Fallar no resta: se suman sólo las bazas hechas.
 * - El repartidor rota una posición por ronda, pide último y no puede hacer que
 *   la suma de pedidos iguale las cartas de la ronda.
 *
 * Los números exactos viven acá y en ningún otro lado.
 */
export const RULES = {
  cardsPerDeck: 52,
  pointsPerTrick: 1,
  exactBase: 10, // acierto antes de la ronda de bonus
  bonusBase: 20, // acierto desde la ronda de bonus
} as const;

export const DEFAULTS = {
  decks: 1,
  bonusFromRound: 8,
  totalRounds: 12,
} as const;

/** Config de la partida con defaults, para partidas creadas antes de estos campos. */
export function config(game: CorazonesGame) {
  return {
    decks: game.decks ?? DEFAULTS.decks,
    bonusFromRound: game.bonusFromRound ?? DEFAULTS.bonusFromRound,
  };
}

/** Jugadores admitidos en una partida de Corazones. */
export const LIMITS = { minPlayers: 2, maxPlayers: 8 } as const;

/**
 * El mazo es el que manda: para jugar `rounds` rondas completas hacen falta
 * `rounds × jugadores` cartas, y hay `52 × decks` disponibles. De ahí salen los
 * tres límites, que son la misma desigualdad despejada en cada variable.
 */
export function maxPlayersFor(rounds: number, decks: number) {
  const fit = Math.floor((RULES.cardsPerDeck * decks) / Math.max(1, rounds));
  return Math.min(LIMITS.maxPlayers, Math.max(LIMITS.minPlayers, fit));
}

/** Rondas que entran con esa cantidad de jugadores y mazos. */
export function maxRoundsFor(players: number, decks: number) {
  if (players <= 0) return 1;
  return Math.max(1, Math.floor((RULES.cardsPerDeck * decks) / players));
}

/** Mazos mínimos para repartir `rounds` rondas entre `players` jugadores. */
export function minDecksFor(players: number, rounds: number) {
  return Math.max(1, Math.ceil((players * rounds) / RULES.cardsPerDeck));
}

/** Máximo de cartas que se pueden repartir por ronda. */
export function maxCards(players: number, decks: number) {
  if (players <= 0) return 0;
  return Math.max(1, Math.floor((RULES.cardsPerDeck * decks) / players));
}

/** Cartas (= bazas) de la ronda: sube hasta el máximo y se mantiene. */
export function cardsForRound(game: CorazonesGame, roundNumber: number) {
  return Math.min(roundNumber, maxCards(game.players.length, config(game).decks));
}

export function bonusForRound(game: CorazonesGame, roundNumber: number) {
  return roundNumber >= config(game).bonusFromRound ? RULES.bonusBase : RULES.exactBase;
}

export function isBonusRound(game: CorazonesGame, roundNumber: number) {
  return roundNumber >= config(game).bonusFromRound;
}

/** Índice del repartidor de la ronda dentro de game.players. */
export function dealerIndex(game: CorazonesGame, roundNumber: number) {
  if (game.players.length === 0) return 0;
  return (roundNumber - 1) % game.players.length;
}

export function dealer(game: CorazonesGame, roundNumber: number): Player | undefined {
  return game.players[dealerIndex(game, roundNumber)];
}

/** Jugadores en orden de pedido: arranca el siguiente al repartidor, que queda último. */
export function playersInBidOrder(game: CorazonesGame, roundNumber: number): Player[] {
  const n = game.players.length;
  if (n === 0) return [];
  const start = (dealerIndex(game, roundNumber) + 1) % n;
  return Array.from({ length: n }, (_, k) => game.players[(start + k) % n]);
}

function sum(game: CorazonesGame, map: Record<string, number>) {
  return game.players.reduce((a, p) => a + (map[p.id] ?? 0), 0);
}

export const totalBids = (game: CorazonesGame, round: CorazonesRound) => sum(game, round.bids);
export const totalTricks = (game: CorazonesGame, round: CorazonesRound) => sum(game, round.tricks);

/** El repartidor no puede cerrar: la suma de pedidos no puede igualar las cartas. */
export function bidsBlocked(game: CorazonesGame, roundNumber: number, round: CorazonesRound) {
  return totalBids(game, round) === cardsForRound(game, roundNumber);
}

/** Las bazas cargadas tienen que dar exactamente las cartas de la ronda. */
export function tricksComplete(game: CorazonesGame, roundNumber: number, round: CorazonesRound) {
  return totalTricks(game, round) === cardsForRound(game, roundNumber);
}

export function roundScore(game: CorazonesGame, round: CorazonesRound, playerId: string, roundNumber: number) {
  const bid = round.bids[playerId] ?? 0;
  const tricks = round.tricks[playerId] ?? 0;
  const base = tricks * RULES.pointsPerTrick;
  if (bid === tricks) return base + bonusForRound(game, roundNumber);
  return base;
}

export function totals(game: CorazonesGame): Record<string, number> {
  const out: Record<string, number> = {};
  for (const p of game.players) out[p.id] = 0;
  game.rounds.forEach((r, i) => {
    for (const p of game.players) out[p.id] += roundScore(game, r, p.id, i + 1);
  });
  return out;
}

export function standings(game: CorazonesGame) {
  const t = totals(game);
  return [...game.players]
    .sort((a, b) => t[b.id] - t[a.id])
    .map((p) => ({ player: p, total: t[p.id] }));
}

export function isFinished(game: CorazonesGame) {
  return game.rounds.length >= game.totalRounds;
}
