import AsyncStorage from '@react-native-async-storage/async-storage';
import { create } from 'zustand';
import { createJSONStorage, persist } from 'zustand/middleware';

import type { CatalogoFC } from '@/features/torneo/types';

/**
 * Último catálogo de equipos FC que se bajó (ver features/torneo/catalogo-fc).
 * null = todavía nunca se bajó: se usa la copia de fábrica.
 */
type EquiposFCState = {
  catalogo: CatalogoFC | null;
  etag: string | null;
  /** Última vez que se preguntó al servidor, haya cambiado o no. ISO. */
  revisado: string | null;
  guardar: (catalogo: CatalogoFC | null, etag: string | null) => void;
  marcarRevisado: () => void;
};

export const useEquiposFC = create<EquiposFCState>()(
  persist(
    (set) => ({
      catalogo: null,
      etag: null,
      revisado: null,
      guardar: (catalogo, etag) =>
        set((s) => ({ catalogo: catalogo ?? s.catalogo, etag, revisado: new Date().toISOString() })),
      marcarRevisado: () => set({ revisado: new Date().toISOString() }),
    }),
    { name: 'qg-equipos-fc', storage: createJSONStorage(() => AsyncStorage), version: 1 },
  ),
);
