import { useMemo } from 'react';
import { Platform } from 'react-native';
import Zeroconf, { useZeroconf } from 'react-native-zeroconf';

import { normalizeCode } from './room';

/**
 * Salas del pulsador en la misma red wifi (Bonjour / mDNS), como una Jam de
 * Spotify: el anfitrión elige hacerse visible y quien tenga la app abierta en
 * Pulsador la ve aparecer. Sólo se anuncia el código de la sala; la partida
 * sigue viajando por Supabase Realtime como siempre.
 *
 * iOS: el tipo tiene que estar en `NSBonjourServices` (app.json) y la primera
 * vez el sistema pide permiso de "red local".
 */
const TYPE = 'quiengana';
const PROTOCOL = 'tcp';
/** El puerto no se usa (no hay servidor local), pero Bonjour pide uno. */
const PORT = 7243;

export type SalaCerca = { code: string; host: string; nombre: string };

const disponible = Platform.OS === 'ios' || Platform.OS === 'android';

let instancia: Zeroconf | null = null;
const zc = () => (instancia ??= new Zeroconf());

/** Anuncia la sala en la red. Devuelve la función para dejar de anunciarla. */
export async function publicarSala(code: string, host: string): Promise<() => void> {
  if (!disponible) return () => {};
  const publicado = await zc().publishService({
    type: TYPE,
    protocol: PROTOCOL,
    name: `Pulsador ${code}`,
    port: PORT,
    txt: { code, host: host.slice(0, 24) },
  });
  return () => {
    zc()
      .unpublishService(publicado.name)
      .catch(() => {});
  };
}

/** Salas visibles en la red mientras `activo` sea true (el hook para de escanear al desmontarse). */
export function useSalasCerca(activo: boolean): { salas: SalaCerca[]; error: string | null } {
  const { services, error } = useZeroconf({ type: TYPE, protocol: PROTOCOL, enabled: activo && disponible });

  const salas = useMemo(() => {
    const vistas = new Map<string, SalaCerca>();
    for (const s of services) {
      const code = normalizeCode(String(s.txt?.code ?? ''));
      if (code.length !== 4) continue;
      vistas.set(code, { code, host: String(s.txt?.host ?? 'Anfitrión'), nombre: s.name });
    }
    return [...vistas.values()];
  }, [services]);

  // -65570: iOS sin permiso de red local. Otros errores (wifi apagado, etc.)
  // simplemente dejan la lista vacía.
  const mensaje =
    error?.code === -65570 ? 'Sin permiso de red local: activalo en Ajustes → ¿Quién gana? → Red local.' : null;
  return { salas, error: mensaje };
}
