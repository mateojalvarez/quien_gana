import AsyncStorage from '@react-native-async-storage/async-storage';
import * as Linking from 'expo-linking';
import { router, type Href } from 'expo-router';
import { useEffect, useRef } from 'react';

import { codeFromInput } from './types';

const CLAVE = 'qg-invitacion-pendiente';

type Destino = { tipo: 'g' | 'p' | 't'; code: string };

/**
 * Los enlaces que abren la app:
 *  · `/g/CODIGO` → invitación a un grupo
 *  · `/p/ABCD`   → sala del pulsador (el QR de la sala)
 *  · `/t/CODIGO` → torneo compartido
 * Sirven igual con `https://quien-gana.app/…` que con `quiengana://…`.
 *
 * Un código mal copiado NO se descarta acá: se pasa igual a la pantalla, que
 * avisa que no lo encontró. Descartarlo en silencio era peor, porque el
 * enlace abría la app y no pasaba nada.
 */
export function destinoDeUrl(url: string): Destino | null {
  const { path, hostname } = Linking.parse(url);
  // `quiengana://p/ABCD` se parsea con "p" como hostname.
  const partes = [hostname, ...(path ?? '').split('/')]
    .filter((x): x is string => !!x && x !== 'quien-gana.app' && x !== 'www.quien-gana.app')
    .map((x) => x.replace(/^\/+/, ''));
  const [tipo, bruto0] = partes;
  if ((tipo !== 'g' && tipo !== 'p' && tipo !== 't') || !bruto0) return null;
  const bruto = bruto0.replace(/[^0-9A-Za-z-]/g, '').slice(0, 24);
  if (!bruto) return null;
  if (tipo === 'g') return { tipo, code: codeFromInput(bruto) ?? bruto };
  return { tipo, code: bruto.toUpperCase() };
}

function ir({ tipo, code }: Destino) {
  if (tipo === 'g') router.push(`/g/${code}`);
  else if (tipo === 'p') router.push({ pathname: '/pulsador', params: { code } });
  else router.push(`/t/${code}` as Href);
}

/**
 * El enlace es la puerta de entrada de la app: lo normal es que quien lo
 * recibe todavía no tenga cuenta. Si llega sin sesión, el destino se guarda y
 * se retoma apenas entra, en vez de perderse en la pantalla de login.
 */
export function useInviteLink(haySesion: boolean) {
  const url = Linking.useURL();
  const atendido = useRef<string | null>(null);

  // 1. Llega un enlace: lo uso ahora o lo guardo para después de entrar.
  useEffect(() => {
    if (!url || atendido.current === url) return;
    const destino = destinoDeUrl(url);
    if (!destino) return;
    atendido.current = url;

    if (haySesion) ir(destino);
    else AsyncStorage.setItem(CLAVE, JSON.stringify(destino)).catch(() => {});
  }, [url, haySesion]);

  // 2. Aparece la sesión: si había uno guardado, lo retomo.
  useEffect(() => {
    if (!haySesion) return;
    let vivo = true;
    AsyncStorage.getItem(CLAVE)
      .then(async (guardado) => {
        if (!vivo || !guardado) return;
        await AsyncStorage.removeItem(CLAVE);
        // Antes se guardaba sólo el código de grupo, como texto.
        const destino: Destino = guardado.startsWith('{') ? JSON.parse(guardado) : { tipo: 'g', code: guardado };
        ir(destino);
      })
      .catch(() => {});
    return () => {
      vivo = false;
    };
  }, [haySesion]);
}
