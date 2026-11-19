/** Tipos compartidos del pulsador multidispositivo. */

export type Mode = 'libre' | 'senal';

export type Player = {
  id: string;
  name: string;
  /** Reloj local del que se unió; sólo para ordenar de forma estable. */
  joinedAt: number;
  /** Índice de color, por orden de llegada. */
  slot: number;
  isHost: boolean;
};

export type Tap = { playerId: string; t: number };

/** Un escalón de la cola. Más de un id = empate técnico. */
export type TieGroup = { playerIds: string[]; t: number };

export type RoundResult = {
  roundId: string;
  /** Orden de respuesta, del más rápido al más lento. */
  queue: TieGroup[];
  /** Tocaron antes del ¡YA! (sólo en modo señal). */
  fouls: string[];
};

/** Quién tiene la palabra y cómo terminó la ronda. */
export type Turn = {
  roundId: string;
  index: number;
  ended: 'correcto' | 'nadie' | null;
};

export type Msg =
  | { type: 'ping'; from: string; id: string }
  | { type: 'pong'; to: string; id: string; tHost: number }
  | { type: 'arm'; roundId: string; mode: Mode; goAt: number | null }
  | { type: 'tap'; roundId: string; playerId: string; t: number }
  | { type: 'result'; result: RoundResult }
  | { type: 'turn'; turn: Turn }
  | { type: 'end' };
