import AsyncStorage from '@react-native-async-storage/async-storage';
import { create } from 'zustand';
import { createJSONStorage, persist } from 'zustand/middleware';

import { toolById, type Tool } from '@/features/catalog';

/** Más viejo que esto no sirve para "frecuentes": se recorta al guardar. */
const KEEP_DAYS = 90;

type CatalogState = {
  /** ids de juego, en el orden en que se marcaron. */
  favorites: string[];
  /** id de juego → ISO de cada apertura. */
  plays: Record<string, string[]>;
  toggleFavorite: (id: string) => void;
  recordPlay: (id: string) => void;
  reset: () => void;
};

const sinceISO = (days: number) => new Date(Date.now() - days * 86_400_000).toISOString();

export const useCatalog = create<CatalogState>()(
  persist(
    (set) => ({
      // Dos favoritos de arranque: si no, Inicio abre vacío.
      favorites: ['corazones', 'dados'],
      plays: {},

      toggleFavorite: (id) =>
        set((s) => ({
          favorites: s.favorites.includes(id) ? s.favorites.filter((f) => f !== id) : [...s.favorites, id],
        })),

      recordPlay: (id) =>
        set((s) => {
          const limite = sinceISO(KEEP_DAYS);
          const previas = (s.plays[id] ?? []).filter((at) => at >= limite);
          return { plays: { ...s.plays, [id]: [...previas, new Date().toISOString()] } };
        }),

      reset: () => set({ favorites: ['corazones', 'dados'], plays: {} }),
    }),
    { name: 'qg-catalog', storage: createJSONStorage(() => AsyncStorage), version: 1 },
  ),
);

/** Favoritos resueltos a juegos, salteando ids de juegos que ya no existen. */
export const favoriteTools = (favorites: string[]): Tool[] =>
  favorites.map(toolById).filter((t): t is Tool => !!t && !t.pronto);

/**
 * Los más abiertos en la ventana pedida. Excluye los favoritos: si no, Inicio
 * repite las mismas tarjetas dos veces.
 */
export function frequentTools(
  plays: Record<string, string[]>,
  { days = 30, limit = 3, exclude = [] as string[] } = {},
): { tool: Tool; n: number }[] {
  const desde = sinceISO(days);
  return Object.entries(plays)
    .map(([id, fechas]) => ({ tool: toolById(id), n: fechas.filter((at) => at >= desde).length }))
    .filter((r): r is { tool: Tool; n: number } => !!r.tool && !r.tool.pronto && r.n > 0)
    .filter((r) => !exclude.includes(r.tool.id))
    .sort((a, b) => b.n - a.n || a.tool.name.localeCompare(b.tool.name))
    .slice(0, limit);
}
