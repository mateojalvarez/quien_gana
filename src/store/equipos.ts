import AsyncStorage from '@react-native-async-storage/async-storage';
import { create } from 'zustand';
import { createJSONStorage, persist } from 'zustand/middleware';

import type { Persona, Restriccion } from '@/features/equipos/rules';
import { uid } from '@/lib/id';

type EquiposState = {
  /** Se guardan: rearmar los mismos equipos la semana que viene es lo normal. */
  gente: Persona[];
  restricciones: Restriccion[];
  cantidad: number;
  /** El último reparto. No se persiste a propósito: se rearma cada vez. */
  equipos: Persona[][] | null;
  desbalanceado: boolean;

  agregar: (name: string) => void;
  agregarVarios: (names: string[]) => void;
  quitar: (id: string) => void;
  limpiar: () => void;
  setCantidad: (n: number) => void;
  agregarRestriccion: (a: string, b: string) => void;
  quitarRestriccion: (a: string, b: string) => void;
  setEquipos: (equipos: Persona[][] | null, desbalanceado?: boolean) => void;
  mover: (personaId: string, destino: number) => void;
};

const mismoPar = (r: Restriccion, a: string, b: string) =>
  (r.a === a && r.b === b) || (r.a === b && r.b === a);

export const useEquipos = create<EquiposState>()(
  persist(
    (set) => ({
      gente: [],
      restricciones: [],
      cantidad: 2,
      equipos: null,
      desbalanceado: false,

      agregar: (name) =>
        set((s) => {
          const limpio = name.trim();
          if (!limpio) return s;
          return { gente: [...s.gente, { id: uid(), name: limpio }], equipos: null };
        }),

      agregarVarios: (names) =>
        set((s) => {
          const tengo = new Set(s.gente.map((p) => p.name.toLowerCase()));
          const nuevos = names
            .map((n) => n.trim())
            .filter((n) => n && !tengo.has(n.toLowerCase()))
            .map((name) => ({ id: uid(), name }));
          return nuevos.length ? { gente: [...s.gente, ...nuevos], equipos: null } : s;
        }),

      quitar: (id) =>
        set((s) => ({
          gente: s.gente.filter((p) => p.id !== id),
          // una restricción sin sus dos personas no significa nada
          restricciones: s.restricciones.filter((r) => r.a !== id && r.b !== id),
          equipos: null,
        })),

      limpiar: () => set({ gente: [], restricciones: [], equipos: null }),
      setCantidad: (cantidad) => set({ cantidad, equipos: null }),

      agregarRestriccion: (a, b) =>
        set((s) =>
          a === b || s.restricciones.some((r) => mismoPar(r, a, b))
            ? s
            : { restricciones: [...s.restricciones, { a, b }], equipos: null },
        ),

      quitarRestriccion: (a, b) =>
        set((s) => ({ restricciones: s.restricciones.filter((r) => !mismoPar(r, a, b)), equipos: null })),

      setEquipos: (equipos, desbalanceado = false) => set({ equipos, desbalanceado }),

      mover: (personaId, destino) =>
        set((s) => {
          if (!s.equipos || !s.equipos[destino]) return s;
          const persona = s.equipos.flat().find((p) => p.id === personaId);
          if (!persona) return s;
          return {
            equipos: s.equipos.map((eq, i) =>
              i === destino ? [...eq.filter((p) => p.id !== personaId), persona] : eq.filter((p) => p.id !== personaId),
            ),
          };
        }),
    }),
    {
      name: 'qg-equipos',
      storage: createJSONStorage(() => AsyncStorage),
      version: 1,
      // el reparto se rearma; lo que se guarda es la gente y las reglas
      partialize: (s) => ({ gente: s.gente, restricciones: s.restricciones, cantidad: s.cantidad }),
    },
  ),
);
