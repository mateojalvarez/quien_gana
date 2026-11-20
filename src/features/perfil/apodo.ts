import { create } from 'zustand';

import { supabase } from '@/lib/supabase';

/**
 * El apodo vive en `profiles.nickname` (ver la migración
 * 20261128000000_apodo_nombres.sql). Es el nombre que ven los grupos y el que
 * se usa en toda la app en lugar del de la cuenta.
 */
type Apodo = {
  nickname: string | null;
  cargado: string | null;
  cargar: (userId: string) => Promise<void>;
  guardar: (userId: string, nickname: string | null) => Promise<void>;
};

export const APODO_MAX = 30;

export const useApodo = create<Apodo>((set, get) => ({
  nickname: null,
  cargado: null,
  cargar: async (userId) => {
    if (get().cargado === userId) return;
    const { data } = await supabase.from('profiles').select('nickname').eq('id', userId).maybeSingle();
    set({ nickname: (data?.nickname as string | null) ?? null, cargado: userId });
  },
  guardar: async (userId, nickname) => {
    const limpio = nickname?.trim().slice(0, APODO_MAX) || null;
    const { error } = await supabase.from('profiles').update({ nickname: limpio }).eq('id', userId);
    if (error) throw error;
    set({ nickname: limpio, cargado: userId });
  },
}));
