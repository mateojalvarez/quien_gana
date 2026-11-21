import AsyncStorage from '@react-native-async-storage/async-storage';
import { create } from 'zustand';
import { createJSONStorage, persist } from 'zustand/middleware';

import type { DatosTorneo } from '@/features/torneo/types';
import type {
  AnotadorGame,
  BurakoGame,
  BurakoRound,
  CalaverasGame,
  CalaverasRound,
  CorazonesGame,
  CorazonesRound,
  Game,
  GeneralaGame,
  Player,
  TorneoGame,
  TrucoGame,
  TrucoMove,
} from '@/features/types';
import { KINDS } from '@/features/types';
import { movePossible } from '@/features/truco/rules';
import { uid } from '@/lib/id';

type NewGameInput =
  | { kind: 'anotador'; title: string; players: string[]; target: number | null; lowestWins: boolean }
  | { kind: 'corazones'; title: string; players: string[]; totalRounds: number; decks: number; bonusFromRound: number }
  | { kind: 'truco'; title: string; players: string[]; target: 15 | 30; matches: boolean }
  | { kind: 'generala'; title: string; players: string[] }
  /** Parejas: `players` son los nombres de los equipos y `integrantes` va en el mismo orden. */
  | { kind: 'burako'; title: string; players: string[]; modo: 'individual' | 'parejas'; integrantes?: string[][]; target: number }
  | { kind: 'calaveras'; title: string; players: string[]; totalRounds: number; extras: CalaverasGame['extras'] };

type GamesState = {
  games: Record<string, Game>;
  /** ids modificados localmente que todavía no se subieron a Supabase */
  dirty: string[];
  /** ids borrados localmente que hay que borrar en Supabase */
  pendingDeletes: string[];

  create: (input: NewGameInput) => string;
  remove: (id: string) => void;
  rename: (id: string, title: string) => void;
  addAnotadorRound: (id: string, round: Record<string, number>) => void;
  addCorazonesRound: (id: string, round: CorazonesRound) => void;
  updateCorazonesRound: (id: string, index: number, round: CorazonesRound) => void;
  addBurakoRound: (id: string, round: BurakoRound) => void;
  updateBurakoRound: (id: string, index: number, round: BurakoRound) => void;
  addCalaverasRound: (id: string, round: CalaverasRound) => void;
  updateCalaverasRound: (id: string, index: number, round: CalaverasRound) => void;
  undoRound: (id: string) => void;
  /** Truco: un toque de +1 o −1 a un equipo. */
  addTrucoMove: (id: string, move: TrucoMove) => void;
  /** Generala: anotar (o tachar) una categoría y pasar el turno. */
  anotarGenerala: (
    id: string,
    playerId: string,
    cat: string,
    entrada: { puntos: number; servida: boolean; cruzada: boolean },
    ganaServida?: boolean,
  ) => void;
  finish: (id: string, finished: boolean) => void;
  /** Torneo: los jugadores ya vienen con id (y su `ref` al grupo, si tienen). */
  crearTorneo: (title: string, players: Player[], datos: DatosTorneo) => string;
  /** Torneo: aplica una transformación pura (features/torneo/rules) y guarda. */
  actualizarTorneo: (id: string, cambio: (g: TorneoGame) => TorneoGame) => void;

  // usados por sync
  mergeRemote: (remote: Game[]) => void;
  markClean: (ids: string[]) => void;
  markAllDirty: () => void;
  clearDeletes: (ids: string[]) => void;
  reset: () => void;
};

const now = () => new Date().toISOString();

function touch(state: GamesState, game: Game): Partial<GamesState> {
  const updated = { ...game, updatedAt: now() } as Game;
  return {
    games: { ...state.games, [game.id]: updated },
    dirty: state.dirty.includes(game.id) ? state.dirty : [...state.dirty, game.id],
  };
}

export const useGames = create<GamesState>()(
  persist(
    (set, get) => ({
      games: {},
      dirty: [],
      pendingDeletes: [],

      create: (input) => {
        const id = uid();
        const players: Player[] = input.players.map((name) => ({ id: uid(), name }));
        const base = { id, title: input.title, players, createdAt: now(), updatedAt: now(), finishedAt: null };
        const game: Game =
          input.kind === 'burako'
            ? ({
                ...base,
                kind: 'burako',
                modo: input.modo,
                ...(input.integrantes
                  ? { integrantes: Object.fromEntries(players.map((p, i) => [p.id, input.integrantes?.[i] ?? []])) }
                  : {}),
                rounds: [],
                target: input.target,
              } satisfies BurakoGame)
            : input.kind === 'calaveras'
            ? ({ ...base, kind: 'calaveras', rounds: [], totalRounds: input.totalRounds, extras: input.extras } satisfies CalaverasGame)
            : input.kind === 'generala'
            ? ({ ...base, kind: 'generala', sheets: Object.fromEntries(players.map((p) => [p.id, {}])), turn: 0, servedWinner: null } satisfies GeneralaGame)
            : input.kind === 'truco'
            ? ({ ...base, kind: 'truco', moves: [], target: input.target, matches: input.matches } satisfies TrucoGame)
            : input.kind === 'anotador'
            ? ({ ...base, kind: 'anotador', rounds: [], target: input.target, lowestWins: input.lowestWins } satisfies AnotadorGame)
            : ({
                ...base,
                kind: 'corazones',
                rounds: [],
                totalRounds: input.totalRounds,
                decks: input.decks,
                bonusFromRound: input.bonusFromRound,
              } satisfies CorazonesGame);
        set((s) => touch(s, game));
        return id;
      },

      remove: (id) =>
        set((s) => {
          const { [id]: _removed, ...rest } = s.games;
          return {
            games: rest,
            dirty: s.dirty.filter((d) => d !== id),
            pendingDeletes: [...s.pendingDeletes, id],
          };
        }),

      rename: (id, title) => {
        const g = get().games[id];
        if (g) set((s) => touch(s, { ...g, title }));
      },

      addAnotadorRound: (id, round) => {
        const g = get().games[id];
        if (g?.kind === 'anotador') set((s) => touch(s, { ...g, rounds: [...g.rounds, round] }));
      },

      addCorazonesRound: (id, round) => {
        const g = get().games[id];
        if (g?.kind === 'corazones') set((s) => touch(s, { ...g, rounds: [...g.rounds, round] }));
      },

      updateCorazonesRound: (id, index, round) => {
        const g = get().games[id];
        if (g?.kind !== 'corazones') return;
        if (index < 0 || index >= g.rounds.length) return;
        const rounds = g.rounds.map((r, i) => (i === index ? round : r));
        set((s) => touch(s, { ...g, rounds }));
      },

      addBurakoRound: (id, round) => {
        const g = get().games[id];
        if (g?.kind === 'burako') set((s) => touch(s, { ...g, rounds: [...g.rounds, round] }));
      },

      updateBurakoRound: (id, index, round) => {
        const g = get().games[id];
        if (g?.kind !== 'burako' || index < 0 || index >= g.rounds.length) return;
        set((s) => touch(s, { ...g, rounds: g.rounds.map((r, i) => (i === index ? round : r)) }));
      },

      addCalaverasRound: (id, round) => {
        const g = get().games[id];
        if (g?.kind === 'calaveras') set((s) => touch(s, { ...g, rounds: [...g.rounds, round] }));
      },

      updateCalaverasRound: (id, index, round) => {
        const g = get().games[id];
        if (g?.kind !== 'calaveras' || index < 0 || index >= g.rounds.length) return;
        set((s) => touch(s, { ...g, rounds: g.rounds.map((r, i) => (i === index ? round : r)) }));
      },

      /** Deshacer: la última ronda, o en Truco el último toque. */
      undoRound: (id) => {
        const g = get().games[id];
        if (!g) return;
        if (g.kind === 'truco') {
          if (g.moves.length === 0) return;
          set((s) => touch(s, { ...g, moves: g.moves.slice(0, -1), finishedAt: null }));
          return;
        }
        // Generala no deshace: cada anotación cierra una categoría y el turno pasa.
        // Generala y Torneo no deshacen por acá (el torneo corrige partido por partido).
        if (g.kind === 'generala' || g.kind === 'torneo') return;
        if (g.rounds.length === 0) return;
        set((s) => touch(s, { ...g, rounds: g.rounds.slice(0, -1), finishedAt: null } as Game));
      },

      addTrucoMove: (id, move) => {
        const g = get().games[id];
        if (g?.kind !== 'truco' || !movePossible(g, move)) return;
        set((s) => touch(s, { ...g, moves: [...g.moves, move] }));
      },

      anotarGenerala: (id, playerId, cat, entrada, ganaServida) => {
        const g = get().games[id];
        if (g?.kind !== 'generala') return;
        const sheets = { ...g.sheets, [playerId]: { ...(g.sheets[playerId] ?? {}), [cat]: entrada } };
        const turn = (g.turn + 1) % Math.max(1, g.players.length);
        const termino = ganaServida || Object.values(sheets).every((s2) => Object.keys(s2).length >= 11);
        set((s) =>
          touch(s, {
            ...g,
            sheets,
            turn,
            servedWinner: ganaServida ? playerId : (g.servedWinner ?? null),
            finishedAt: termino ? now() : null,
          }),
        );
      },

      finish: (id, finished) => {
        const g = get().games[id];
        if (g) set((s) => touch(s, { ...g, finishedAt: finished ? now() : null }));
      },

      crearTorneo: (title, players, datos) => {
        const id = uid();
        const game: TorneoGame = {
          ...datos,
          id,
          title,
          players,
          createdAt: now(),
          updatedAt: now(),
          finishedAt: null,
          kind: 'torneo',
        };
        set((s) => touch(s, game));
        return id;
      },

      actualizarTorneo: (id, cambio) => {
        const g = get().games[id];
        if (g?.kind !== 'torneo') return;
        const nuevo = cambio(g);
        const finishedAt = nuevo.fase === 'terminado' ? (g.finishedAt ?? now()) : null;
        set((s) => touch(s, { ...nuevo, finishedAt }));
      },

      mergeRemote: (remote) =>
        set((s) => {
          const games = { ...s.games };
          for (const r of remote) {
            if (s.pendingDeletes.includes(r.id)) continue;
            // Una partida de un juego que esta versión no conoce (creada desde una
            // versión más nueva) se deja en la nube sin tocarla.
            if (!KINDS.includes(r.kind)) continue;
            const local = games[r.id];
            // last-write-wins por updatedAt
            if (!local || new Date(r.updatedAt) > new Date(local.updatedAt)) games[r.id] = r;
          }
          return { games };
        }),

      markClean: (ids) => set((s) => ({ dirty: s.dirty.filter((d) => !ids.includes(d)) })),
      /** Tras un merge de cuentas todo lo local es nuevo para el user_id destino. */
      markAllDirty: () => set((s) => ({ dirty: Object.keys(s.games) })),
      clearDeletes: (ids) => set((s) => ({ pendingDeletes: s.pendingDeletes.filter((d) => !ids.includes(d)) })),
      reset: () => set({ games: {}, dirty: [], pendingDeletes: [] }),
    }),
    { name: 'qg-games', storage: createJSONStorage(() => AsyncStorage), version: 1 },
  ),
);

export const sortedGames = (games: Record<string, Game>) =>
  Object.values(games).sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
