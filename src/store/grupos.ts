import AsyncStorage from '@react-native-async-storage/async-storage';
import { create } from 'zustand';
import { createJSONStorage, persist } from 'zustand/middleware';

import type { Group, LocalMember, MemberRow } from '@/features/grupos/types';
import { uid } from '@/lib/id';

/**
 * La lista vacía de un grupo sin integrantes sin cuenta, como una sola
 * referencia compartida.
 *
 * No es microoptimización: zustand 5 lee el store con `useSyncExternalStore`,
 * que compara el resultado del selector con `Object.is`. Un `[]` nuevo en cada
 * lectura nunca es igual al anterior, así que React vuelve a renderizar sin
 * parar. En desarrollo se ve como un aviso; en un build de release la app se
 * cierra. Pasaba justo al entrar a un grupo recién creado, que es el único que
 * todavía no tiene entrada en `locals`.
 */
export const SIN_LOCALES: LocalMember[] = [];

type GruposState = {
  /** Copia de lo último que trajo el servidor: la pantalla abre sin esperar la red. */
  groups: Group[];
  /** Integrantes sin cuenta, por grupo. Nunca salen de este teléfono. */
  locals: Record<string, LocalMember[]>;
  /** Espejo de profiles.active_group_id, para que funcione sin conexión. */
  activeId: string | null;
  loading: boolean;

  setGroups: (groups: Group[]) => void;
  setActive: (id: string | null) => void;
  setLoading: (v: boolean) => void;
  addLocal: (groupId: string, name: string) => void;
  renameLocal: (groupId: string, id: string, name: string) => void;
  removeLocal: (groupId: string, id: string) => void;
  reset: () => void;
};

export const useGrupos = create<GruposState>()(
  persist(
    (set) => ({
      groups: [],
      locals: {},
      activeId: null,
      loading: false,

      setGroups: (groups) =>
        set((s) => ({
          groups,
          // si el grupo activo dejó de existir (me fui, lo borraron), se limpia
          activeId: s.activeId && groups.some((g) => g.id === s.activeId) ? s.activeId : null,
        })),
      setActive: (activeId) => set({ activeId }),
      setLoading: (loading) => set({ loading }),

      addLocal: (groupId, name) =>
        set((s) => ({
          locals: { ...s.locals, [groupId]: [...(s.locals[groupId] ?? []), { id: uid(), groupId, name: name.trim() }] },
        })),

      renameLocal: (groupId, id, name) =>
        set((s) => ({
          locals: {
            ...s.locals,
            [groupId]: (s.locals[groupId] ?? []).map((m) => (m.id === id ? { ...m, name: name.trim() } : m)),
          },
        })),

      removeLocal: (groupId, id) =>
        set((s) => ({ locals: { ...s.locals, [groupId]: (s.locals[groupId] ?? []).filter((m) => m.id !== id) } })),

      reset: () => set({ groups: [], locals: {}, activeId: null, loading: false }),
    }),
    { name: 'qg-grupos', storage: createJSONStorage(() => AsyncStorage), version: 1 },
  ),
);

export const groupById = (groups: Group[], id: string | null) => groups.find((g) => g.id === id) ?? null;

/** Las dos listas juntas, como se ven en pantalla: primero las cuentas. */
export function memberRows(group: Group, locals: LocalMember[], meId: string | undefined): MemberRow[] {
  return [
    ...group.members.map<MemberRow>((m) => ({
      kind: 'remote',
      id: m.userId,
      name: m.name,
      isAdmin: m.role === 'admin',
      isMe: m.userId === meId,
    })),
    ...locals.map<MemberRow>((m) => ({ kind: 'local', id: m.id, name: m.name })),
  ];
}

/** Lo que se precarga al crear una partida: todos, con cuenta y sin cuenta. */
export function playerNames(group: Group, locals: LocalMember[]): string[] {
  return [...group.members.map((m) => m.name), ...locals.map((m) => m.name)];
}
