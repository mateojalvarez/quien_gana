import { useCallback, useEffect } from 'react';

import { useAuth } from '@/providers/auth-provider';
import { useGrupos } from '@/store/grupos';
import { getActiveGroupRemote, listGroups, setActiveGroupRemote } from './api';

/**
 * Trae los grupos y el grupo activo. Local-first igual que las partidas: la
 * pantalla dibuja la copia guardada y se actualiza cuando contesta el servidor.
 */
export function useGruposSync() {
  const { session } = useAuth();
  const userId = session?.user.id;
  const refresh = useRefreshGrupos();

  useEffect(() => {
    if (!userId) return;
    refresh();
    getActiveGroupRemote(userId)
      .then((id) => {
        // El servidor manda, salvo que no tenga ninguno elegido todavía.
        if (id) useGrupos.getState().setActive(id);
      })
      .catch(() => {});
  }, [userId, refresh]);
}

export function useRefreshGrupos() {
  const { session } = useAuth();
  const userId = session?.user.id;

  return useCallback(async () => {
    if (!userId) return;
    const { setGroups, setLoading } = useGrupos.getState();
    setLoading(true);
    try {
      setGroups(await listGroups());
    } catch {
      // sin conexión: se queda la copia guardada
    } finally {
      setLoading(false);
    }
  }, [userId]);
}

/** Elegir grupo activo: primero local (instantáneo), después al servidor. */
export function useSetActiveGroup() {
  const { session } = useAuth();
  const userId = session?.user.id;

  return useCallback(
    (groupId: string | null) => {
      useGrupos.getState().setActive(groupId);
      if (userId) setActiveGroupRemote(userId, groupId).catch(() => {});
    },
    [userId],
  );
}
