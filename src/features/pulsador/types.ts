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

/** Reglas de puntaje que fija el anfitrión. */
export type Rules = {
  /** Lo que suma acertar. */
  acierto: number;
  /** Lo que resta fallar (0 = no resta). */
  fallo: number;
  /** null = rondas ilimitadas. */
  rondas: number | null;
};

/** Puntos por id de jugador. */
export type Scores = Record<string, number>;

/** Partido definido: por diferencia imposible de remontar o por llegar al final. */
export type Anuncio = {
  /** Más de uno = empate al final. */
  ganadores: string[];
  motivo: 'matematico' | 'final';
  /** El anfitrión cerró la partida: todos ven la planilla final. */
  terminado: boolean;
};

/** Todo lo que el anfitrión difunde del marcador, de una sola vez. */
export type Marcador = {
  rules: Rules;
  scores: Scores;
  /** Rondas cerradas (alguien acertó o nadie acertó). */
  jugadas: number;
  /** Último cambio de puntos por jugador, para la flechita de la planilla. */
  ultimo: Scores;
  anuncio: Anuncio | null;
};

export type Msg =
  | { type: 'ping'; from: string; id: string }
  | { type: 'pong'; to: string; id: string; tHost: number }
  | { type: 'arm'; roundId: string; mode: Mode; goAt: number | null }
  | { type: 'tap'; roundId: string; playerId: string; t: number }
  | { type: 'result'; result: RoundResult }
  | { type: 'turn'; turn: Turn }
  | { type: 'marcador'; marcador: Marcador }
  | { type: 'end' };
