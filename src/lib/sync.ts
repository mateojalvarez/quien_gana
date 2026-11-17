import { useEffect } from 'react';
import { AppState } from 'react-native';

import type { Game } from '@/features/types';
import { useAuth } from '@/providers/auth-provider';
import { useGames } from '@/store/games';
import { supabase } from './supabase';

/**
 * Local-first: la app funciona offline con AsyncStorage y sincroniza con
 * Supabase (tabla public.games) cuando hay sesión. Conflictos: last-write-wins.
 */

type Row = {
  id: string;
  kind: Game['kind'];
  title: string;
  data: Game;
  updated_at: string;
  finished_at: string | null;
};

const toRow = (g: Game): Row => ({
  id: g.id,
  kind: g.kind,
  title: g.title,
  data: g,
  updated_at: g.updatedAt,
  finished_at: g.finishedAt ?? null,
});

let pushing = false;

export async function push() {
  if (pushing) return;
  pushing = true;
  try {
    const { games, dirty, pendingDeletes } = useGames.getState();
    const rows = dirty.map((id) => games[id]).filter(Boolean).map(toRow);
    if (rows.length) {
      const { error } = await supabase.from('games').upsert(rows);
      if (!error) useGames.getState().markClean(rows.map((r) => r.id));
    }
    if (pendingDeletes.length) {
      const { error } = await supabase.from('games').delete().in('id', pendingDeletes);
      if (!error) useGames.getState().clearDeletes(pendingDeletes);
    }
  } finally {
    pushing = false;
  }
}

export async function pull() {
  const { data, error } = await supabase
    .from('games')
    .select('data')
    .order('updated_at', { ascending: false })
    .limit(200);
  if (error || !data) return;
  useGames.getState().mergeRemote(data.map((r) => r.data as Game));
}

/** Hook montado una sola vez en el layout autenticado. */
export function useSync() {
  const { session } = useAuth();
  const userId = session?.user.id;

  useEffect(() => {
    if (!userId) return;
    pull().then(push);

    let timer: ReturnType<typeof setTimeout> | undefined;
    const unsub = useGames.subscribe((s, prev) => {
      if (s.dirty === prev.dirty && s.pendingDeletes === prev.pendingDeletes) return;
      clearTimeout(timer);
      timer = setTimeout(push, 1200); // debounce
    });
    const app = AppState.addEventListener('change', (st) => {
      if (st === 'active') pull().then(push);
    });
    return () => {
      clearTimeout(timer);
      unsub();
      app.remove();
    };
  }, [userId]);
}
