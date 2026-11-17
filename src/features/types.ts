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

export type Game = AnotadorGame | CorazonesGame;
export type GameKind = Game['kind'];
