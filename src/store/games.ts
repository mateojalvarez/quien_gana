import AsyncStorage from '@react-native-async-storage/async-storage';
import { create } from 'zustand';
import { createJSONStorage, persist } from 'zustand/middleware';

import type { AnotadorGame, CorazonesGame, CorazonesRound, Game, Player } from '@/features/types';
import { uid } from '@/lib/id';

type NewGameInput =
  | { kind: 'anotador'; title: string; players: string[]; target: number | null; lowestWins: boolean }
  | { kind: 'corazones'; title: string; players: string[]; totalRounds: number; decks: number; bonusFromRound: number };

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
  undoRound: (id: string) => void;
  finish: (id: string, finished: boolean) => void;

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
          input.kind === 'anotador'
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

      undoRound: (id) => {
        const g = get().games[id];
        if (!g || g.rounds.length === 0) return;
        set((s) => touch(s, { ...g, rounds: g.rounds.slice(0, -1), finishedAt: null } as Game));
      },

      finish: (id, finished) => {
        const g = get().games[id];
        if (g) set((s) => touch(s, { ...g, finishedAt: finished ? now() : null }));
      },

      mergeRemote: (remote) =>
        set((s) => {
          const games = { ...s.games };
          for (const r of remote) {
            if (s.pendingDeletes.includes(r.id)) continue;
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
