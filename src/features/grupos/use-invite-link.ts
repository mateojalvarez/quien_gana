import AsyncStorage from '@react-native-async-storage/async-storage';
import * as Linking from 'expo-linking';
import { router } from 'expo-router';
import { useEffect, useRef } from 'react';

import { codeFromInput } from './types';

const CLAVE = 'qg-invitacion-pendiente';

/**
 * `https://quien-gana.app/g/ABC` o `quiengana://g/ABC` → el código.
 *
 * Un código mal copiado NO se descarta acá: se pasa igual a la pantalla, que
 * avisa que no encontró el grupo. Descartarlo en silencio era peor, porque el
 * enlace abría la app y no pasaba nada.
 */
function codeFromUrl(url: string): string | null {
  const { path } = Linking.parse(url);
  if (!path) return null;
  const partes = path.replace(/^\/+/, '').split('/');
  if (partes[0] !== 'g' || !partes[1]) return null;
  const bruto = partes[1].replace(/[^0-9A-Za-z-]/g, '').slice(0, 24);
  return codeFromInput(bruto) ?? (bruto || null);
}

/**
 * El enlace de invitación es la puerta de entrada de la app: lo normal es que
 * quien lo recibe todavía no tenga cuenta. Si llega sin sesión, el código se
 * guarda y se retoma apenas entra, en vez de perderse en la pantalla de login.
 */
export function useInviteLink(haySesion: boolean) {
  const url = Linking.useURL();
  const atendido = useRef<string | null>(null);

  // 1. Llega un enlace: lo uso ahora o lo guardo para después de entrar.
  useEffect(() => {
    if (!url || atendido.current === url) return;
    const code = codeFromUrl(url);
    if (!code) return;
    atendido.current = url;

    if (haySesion) router.push(`/g/${code}`);
    else AsyncStorage.setItem(CLAVE, code).catch(() => {});
  }, [url, haySesion]);

  // 2. Aparece la sesión: si había uno guardado, lo retomo.
  useEffect(() => {
    if (!haySesion) return;
    let vivo = true;
    AsyncStorage.getItem(CLAVE)
      .then(async (code) => {
        if (!vivo || !code) return;
        await AsyncStorage.removeItem(CLAVE);
        router.push(`/g/${code}`);
      })
      .catch(() => {});
    return () => {
      vivo = false;
    };
  }, [haySesion]);
}
