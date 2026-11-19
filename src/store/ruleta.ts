import AsyncStorage from '@react-native-async-storage/async-storage';
import { create } from 'zustand';
import { createJSONStorage, persist } from 'zustand/middleware';

import type { Premio } from '@/features/ruleta/rules';
import { uid } from '@/lib/id';

type RuletaState = {
  /** Los que todavía están en la rueda. */
  premios: Premio[];
  /** Los que ya salieron y se sacaron. Se guardan para poder devolverlos. */
  sacados: Premio[];
  /** El último que cantó la rueda. No se persiste: es de esta vuelta. */
  ultimo: Premio | null;
  /** Ángulo acumulado de la rueda, para que no pegue el volantazo para atrás. */
  angulo: number;

  agregar: (name: string) => void;
  agregarVarios: (names: string[]) => void;
  quitar: (id: string) => void;
  /** Lo que pide el juego al salir un premio: fuera de la rueda, pero reversible. */
  sacar: (id: string) => void;
  devolver: (id: string) => void;
  limpiar: () => void;
  setUltimo: (premio: Premio | null) => void;
  setAngulo: (angulo: number) => void;
};

export const useRuleta = create<RuletaState>()(
  persist(
    (set) => ({
      premios: [],
      sacados: [],
      ultimo: null,
      angulo: 0,

      agregar: (name) =>
        set((s) => {
          const limpio = name.trim();
          if (!limpio) return s;
          return { premios: [...s.premios, { id: uid(), name: limpio }], ultimo: null };
        }),

      agregarVarios: (names) =>
        set((s) => {
          const tengo = new Set([...s.premios, ...s.sacados].map((p) => p.name.toLowerCase()));
          const nuevos = names
            .map((n) => n.trim())
            .filter((n) => n && !tengo.has(n.toLowerCase()))
            .map((name) => ({ id: uid(), name }));
          return nuevos.length ? { premios: [...s.premios, ...nuevos], ultimo: null } : s;
        }),

      quitar: (id) =>
        set((s) => ({
          premios: s.premios.filter((p) => p.id !== id),
          sacados: s.sacados.filter((p) => p.id !== id),
          ultimo: s.ultimo?.id === id ? null : s.ultimo,
        })),

      sacar: (id) =>
        set((s) => {
          const premio = s.premios.find((p) => p.id === id);
          if (!premio) return s;
          return {
            premios: s.premios.filter((p) => p.id !== id),
            sacados: [premio, ...s.sacados],
            ultimo: null,
          };
        }),

      devolver: (id) =>
        set((s) => {
          const premio = s.sacados.find((p) => p.id === id);
          if (!premio) return s;
          return { premios: [...s.premios, premio], sacados: s.sacados.filter((p) => p.id !== id) };
        }),

      limpiar: () => set({ premios: [], sacados: [], ultimo: null }),
      setUltimo: (ultimo) => set({ ultimo }),
      setAngulo: (angulo) => set({ angulo }),
    }),
    {
      name: 'qg-ruleta',
      storage: createJSONStorage(() => AsyncStorage),
      version: 1,
      // El ángulo y el último cantado son de la vuelta en curso: al volver a
      // abrir la app la rueda arranca derecha y sin cartel viejo.
      partialize: (s) => ({ premios: s.premios, sacados: s.sacados }),
    },
  ),
);
