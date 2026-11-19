export type Player = { id: string; name: string };

type GameBase = {
  id: string;
  title: string;
  players: Player[];
  createdAt: string;
  updatedAt: string;
  finishedAt?: string | null;
};

/** Anotador genérico: cada ronda es un mapa playerId → puntos. */
export type AnotadorGame = GameBase & {
  kind: 'anotador';
  rounds: Record<string, number>[];
  target: number | null;
  lowestWins: boolean;
};

export type CorazonesRound = {
  bids: Record<string, number>; // predicción de bazas
  tricks: Record<string, number>; // bazas ganadas
};

export type CorazonesGame = GameBase & {
  kind: 'corazones';
  rounds: CorazonesRound[];
  totalRounds: number;
  /** Mazos usados: define el máximo de cartas por ronda. Opcional: partidas viejas no lo traen. */
  decks?: number;
  /** Desde esta ronda (1-indexed) el acierto vale el bonus alto. Opcional: partidas viejas no lo traen. */
  bonusFromRound?: number;
};

/**
 * Truco: no hay rondas, hay toques. Cada +1 o −1 queda guardado para poder
 * deshacer el último, y el tanteador se deriva de la suma.
 */
export type TrucoMove = { team: 0 | 1; delta: 1 | -1 };

export type TrucoGame = GameBase & {
  kind: 'truco';
  /** `players` son los dos equipos, en orden. */
  moves: TrucoMove[];
  /** A 15 no hay buenas; a 30 los primeros 15 son malas. */
  target: 15 | 30;
  /** Dibujar los puntos como fósforos de a cinco. */
  matches: boolean;
};

export type Game = AnotadorGame | CorazonesGame | TrucoGame;
export type GameKind = Game['kind'];

/** Las partidas con rondas; Truco queda afuera porque cuenta toques. */
export type RoundGame = AnotadorGame | CorazonesGame;
export const hasRounds = (g: Game): g is RoundGame => g.kind !== 'truco';
