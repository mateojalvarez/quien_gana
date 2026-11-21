import type { CalaverasGame, CalaverasRound, Player } from '../types';

/**
 * Reglas del anotador de Calaveras y piratas (juego de bazas con pedidos).
 *
 * - En la ronda N se reparten N cartas.
 * - Pedido ≥ 1: acertar paga 20 por baza pedida; fallar resta 10 por cada baza
 *   de diferencia.
 * - Pedido 0: acertar paga 10 × cartas de la ronda; fallar resta lo mismo.
 * - Los bonus se cobran sólo si se acierta el pedido.
 * - Edición nueva: la apuesta (0, 10 o 20) se suma si se acierta y se resta si
 *   no; con el Kraken una baza se pierde y las bazas suman una menos.
 *
 * Los números exactos viven acá y en ningún otro lado.
 */
export const RULES = {
  porBazaPedida: 20,
  porBazaErrada: 10,
  porCartaPedidoCero: 10,
} as const;

export type Conjunto = 'base' | 'edicionNueva' | 'expansion';

export type Bonus = {
  key: string;
  label: string;
  /** Puntos por cada una. */
  valor: number;
  conjunto: Conjunto;
};

/** Bonus por captura. Si tu reglamento dice otra cosa, se corrige sólo acá. */
export const BONUS: Bonus[] = [
  { key: 'catorce', label: '14 de color', valor: 10, conjunto: 'base' },
  { key: 'catorceNegro', label: '14 negro', valor: 20, conjunto: 'base' },
  { key: 'sirenaPorPirata', label: 'Sirena capturada por pirata', valor: 20, conjunto: 'base' },
  { key: 'pirataPorRey', label: 'Pirata capturado por el Rey', valor: 30, conjunto: 'base' },
  { key: 'reyPorSirena', label: 'Rey capturado por sirena', valor: 40, conjunto: 'base' },
  { key: 'botin', label: 'Botín con aliado que acertó', valor: 20, conjunto: 'edicionNueva' },
  { key: 'ocho', label: '8 capturado', valor: 5, conjunto: 'expansion' },
  { key: 'siete', label: '7 capturado', valor: -5, conjunto: 'expansion' },
  { key: 'primerOficial', label: 'Primer oficial capturado', valor: 30, conjunto: 'expansion' },
  { key: 'monstruo', label: 'Monstruo capturado por Davy Jones', valor: 20, conjunto: 'expansion' },
];

export const APUESTAS = [0, 10, 20] as const;

export const DEFAULTS = { totalRounds: 10 } as const;

export const LIMITS = { minPlayers: 2, maxBase: 6, maxPlayers: 8, maxRounds: 15, maxBonus: 8 } as const;

export const maxPlayersFor = (extras: CalaverasGame['extras']) =>
  extras.edicionNueva || extras.expansion ? LIMITS.maxPlayers : LIMITS.maxBase;

export const bonusActivos = (extras: CalaverasGame['extras']) =>
  BONUS.filter((b) => b.conjunto === 'base' || extras[b.conjunto]);

/** Cartas (= bazas) de la ronda. Después de la 10 se sigue con 10. */
export const cardsForRound = (roundNumber: number) => Math.min(roundNumber, 10);

/** Las bazas cargadas suman las cartas de la ronda, o una menos si salió el Kraken. */
export function bazasEsperadas(roundNumber: number, kraken: boolean) {
  return cardsForRound(roundNumber) - (kraken ? 1 : 0);
}

export const emptyRound = (): CalaverasRound => ({ bids: {}, tricks: {}, bonus: {}, apuesta: {}, kraken: false });

export const acerto = (round: CalaverasRound, pid: string) => (round.bids[pid] ?? 0) === (round.tricks[pid] ?? 0);

export function puntosBonus(round: CalaverasRound, pid: string, extras: CalaverasGame['extras']) {
  const cuenta = round.bonus[pid] ?? {};
  return bonusActivos(extras).reduce((a, b) => a + (cuenta[b.key] ?? 0) * b.valor, 0);
}

export function roundScore(
  round: CalaverasRound,
  pid: string,
  roundNumber: number,
  extras: CalaverasGame['extras'],
): number {
  const bid = round.bids[pid] ?? 0;
  const tricks = round.tricks[pid] ?? 0;
  const cards = cardsForRound(roundNumber);
  const apuesta = extras.edicionNueva ? (round.apuesta[pid] ?? 0) : 0;
  if (bid === tricks) {
    const base = bid === 0 ? RULES.porCartaPedidoCero * cards : RULES.porBazaPedida * bid;
    return base + puntosBonus(round, pid, extras) + apuesta;
  }
  const castigo = bid === 0 ? RULES.porCartaPedidoCero * cards : RULES.porBazaErrada * Math.abs(bid - tricks);
  return -castigo - apuesta;
}

export function totals(game: Pick<CalaverasGame, 'players' | 'rounds' | 'extras'>): Record<string, number> {
  const out: Record<string, number> = {};
  for (const p of game.players) out[p.id] = 0;
  game.rounds.forEach((r, i) => {
    for (const p of game.players) out[p.id] += roundScore(r, p.id, i + 1, game.extras);
  });
  return out;
}

export function standings(game: Pick<CalaverasGame, 'players' | 'rounds' | 'extras'>): { player: Player; total: number }[] {
  const t = totals(game);
  return [...game.players].sort((a, b) => t[b.id] - t[a.id]).map((p) => ({ player: p, total: t[p.id] }));
}

export const isFinished = (game: CalaverasGame) => game.rounds.length >= game.totalRounds;

/** Repartidor de la ronda: rota uno por ronda. */
export function dealer(game: Pick<CalaverasGame, 'players'>, roundNumber: number): Player | undefined {
  if (game.players.length === 0) return undefined;
  return game.players[(roundNumber - 1) % game.players.length];
}

/** La fase de bonus sólo hace falta si alguien acertó o hay apuestas en juego. */
export function necesitaBonus(round: CalaverasRound, players: Player[], extras: CalaverasGame['extras']) {
  return players.some((p) => acerto(round, p.id)) || extras.edicionNueva;
}
