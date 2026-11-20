// Torneos compartidos: verlos (grupo o enlace) y, con permiso del anfitrión,
// cargar resultados. Las reglas y RPCs están en
// supabase/migrations/20261130000000_torneo_compartido.sql.
//
// Para el anfitrión el torneo sigue siendo una partida local que se sincroniza
// como cualquier otra. Para los demás vive sólo en la base: se lee, se escucha
// por Realtime y se escribe por `update_torneo_data` (nunca entra al store de
// partidas, así el sync no intenta subirlo como propio).

import { useCallback, useEffect, useState } from 'react';

import type { TorneoGame } from '@/features/types';
import { supabase } from '@/lib/supabase';
import { push } from '@/lib/sync';
import { useGames } from '@/store/games';

export type RolTorneo = 'anfitrion' | 'editor' | 'espectador';

export type Persona = {
  userId: string;
  name: string;
  avatarUrl: string | null;
  canEdit: boolean;
  origen: 'grupo' | 'link';
};

type Fila = { data: TorneoGame; updated_at: string; user_id: string };

export const torneoUrl = (code: string) => `https://quien-gana.app/t/${code}`;

/** Torneos de otros que puedo ver, del más reciente al más viejo. */
export async function torneosCompartidos(miId: string): Promise<TorneoGame[]> {
  const { data, error } = await supabase
    .from('games')
    .select('data')
    .eq('kind', 'torneo')
    .neq('user_id', miId)
    .order('updated_at', { ascending: false })
    .limit(30);
  if (error) throw error;
  return (data ?? []).map((r) => r.data as TorneoGame);
}

async function leer(id: string): Promise<Fila | null> {
  const { data, error } = await supabase.from('games').select('data, updated_at, user_id').eq('id', id).maybeSingle();
  if (error) throw error;
  return (data as Fila | null) ?? null;
}

async function miRol(id: string, duenio: string, miId: string): Promise<RolTorneo> {
  if (duenio === miId) return 'anfitrion';
  const { data } = await supabase.rpc('can_edit_game', { gid: id });
  return data ? 'editor' : 'espectador';
}

/**
 * Un torneo ajeno en vivo: lo carga, sabe qué rol tengo y se actualiza solo
 * cuando alguien carga un resultado.
 */
export function useTorneoRemoto(id: string, miId: string | undefined) {
  const [estado, setEstado] = useState<
    | { paso: 'cargando' }
    | { paso: 'no-existe' }
    | { paso: 'error'; mensaje: string }
    | { paso: 'listo'; juego: TorneoGame; rol: RolTorneo; version: string }
  >({ paso: 'cargando' });

  const recargar = useCallback(async () => {
    if (!miId) return;
    try {
      const fila = await leer(id);
      if (!fila) return setEstado({ paso: 'no-existe' });
      const rol = await miRol(id, fila.user_id, miId);
      setEstado({ paso: 'listo', juego: fila.data, rol, version: fila.updated_at });
    } catch (e) {
      setEstado({ paso: 'error', mensaje: (e as Error).message ?? 'Sin conexión' });
    }
  }, [id, miId]);

  useEffect(() => {
    // La primera lectura va por la misma vía que los avisos de Realtime: el
    // estado cambia recién cuando responde la base, nunca en este render.
    const primera = setTimeout(recargar, 0);
    const ch = supabase
      .channel(`torneo:${id}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'games', filter: `id=eq.${id}` }, () => recargar())
      .subscribe();
    return () => {
      clearTimeout(primera);
      supabase.removeChannel(ch);
    };
  }, [id, recargar]);

  /**
   * Aplica un cambio (cargar un resultado, resolver un empate) sobre la última
   * versión de la base. Si alguien guardó en el medio, relee y reintenta.
   */
  const actualizar = useCallback(
    async (cambio: (g: TorneoGame) => TorneoGame) => {
      for (let intento = 0; intento < 3; intento++) {
        const fila = await leer(id);
        if (!fila) throw new Error('El torneo ya no existe.');
        const nuevo = cambio(fila.data);
        const { data, error } = await supabase.rpc('update_torneo_data', {
          gid: id,
          nuevo,
          esperado: fila.updated_at,
        });
        if (error) throw error;
        if (data) {
          await recargar();
          return;
        }
      }
      throw new Error('Otra persona está cargando resultados a la vez. Probá de nuevo.');
    },
    [id, recargar],
  );

  return { estado, recargar, actualizar };
}

/** El anfitrión escucha cambios de sus editores y los trae a su copia local. */
export function useCambiosDeEditores(id: string, activo: boolean) {
  useEffect(() => {
    if (!activo) return;
    const ch = supabase
      .channel(`torneo-propio:${id}`)
      .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'games', filter: `id=eq.${id}` }, (p) => {
        const data = (p.new as { data?: TorneoGame }).data;
        if (data) useGames.getState().mergeRemote([data]);
      })
      .subscribe();
    return () => {
      supabase.removeChannel(ch);
    };
  }, [id, activo]);
}

/** Código del enlace del torneo. Antes se sube la partida: la fila tiene que existir. */
export async function compartirTorneo(id: string): Promise<string> {
  await push();
  const { data, error } = await supabase.rpc('create_torneo_share', { gid: id });
  if (error) throw error;
  return data as string;
}

export async function unirseATorneo(code: string): Promise<string> {
  const { data, error } = await supabase.rpc('join_torneo_by_code', { code });
  if (error) throw error;
  return data as string;
}

export async function personasDelTorneo(id: string): Promise<Persona[]> {
  const { data, error } = await supabase.rpc('torneo_personas', { gid: id });
  if (error) throw error;
  return ((data ?? []) as { user_id: string; name: string; avatar_url: string | null; can_edit: boolean; origen: 'grupo' | 'link' }[])
    .map((r) => ({ userId: r.user_id, name: r.name, avatarUrl: r.avatar_url, canEdit: r.can_edit, origen: r.origen }))
    .sort((a, b) => Number(b.origen === 'grupo') - Number(a.origen === 'grupo') || a.name.localeCompare(b.name));
}

export async function permitirCargar(id: string, userId: string, puede: boolean): Promise<void> {
  const { error } = await supabase.rpc('set_torneo_editor', { gid: id, uid: userId, puede });
  if (error) throw error;
}

export async function dejarDeSeguir(id: string, miId: string): Promise<void> {
  const { error } = await supabase.from('tournament_access').delete().eq('game_id', id).eq('user_id', miId);
  if (error) throw error;
}
