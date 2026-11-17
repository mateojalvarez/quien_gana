import 'react-native-url-polyfill/auto';

import AsyncStorage from '@react-native-async-storage/async-storage';
import { createClient, processLock } from '@supabase/supabase-js';
import { AppState, Platform } from 'react-native';

const url = process.env.EXPO_PUBLIC_SUPABASE_URL;
const key = process.env.EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY;

export const isSupabaseConfigured = Boolean(url && key);
export const supabaseUrl = url ?? '';

const host = (() => {
  try {
    return new URL(url ?? '').hostname;
  } catch {
    return '';
  }
})();

/** 127.0.0.1 / localhost / 10.0.2.2 / IP LAN → Supabase corriendo en Docker. */
export const isLocalSupabase =
  /^(127\.0\.0\.1|localhost|10\.0\.2\.2)$/.test(host) ||
  /^(10\.|192\.168\.|172\.(1[6-9]|2\d|3[01])\.)/.test(host);

/**
 * GoTrue local arma su callback con 127.0.0.1 incluso cuando la app lo consume
 * por la IP LAN, así que el OAuth web nunca puede volver a la app en un
 * dispositivo físico. Lo detectamos para avisar en vez de abrir un navegador
 * que termina en una pantalla de error.
 */
export const localSupabaseOverLan = isLocalSupabase && !/^(127\.0\.0\.1|localhost)$/.test(host);

if (!isSupabaseConfigured) {
  console.warn(
    '[quien-gana] Faltan EXPO_PUBLIC_SUPABASE_URL / EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY. Copiá .env.example a .env.',
  );
}

const isSSR = Platform.OS === 'web' && typeof window === 'undefined';

export const supabase = createClient(url ?? 'http://localhost', key ?? 'missing', {
  auth: {
    storage: isSSR ? undefined : AsyncStorage,
    autoRefreshToken: true,
    persistSession: !isSSR,
    detectSessionInUrl: false,
    flowType: 'pkce',
    lock: processLock,
  },
});

// En RN el refresh automático sólo debe correr con la app en primer plano.
if (Platform.OS !== 'web') {
  AppState.addEventListener('change', (state) => {
    if (state === 'active') supabase.auth.startAutoRefresh();
    else supabase.auth.stopAutoRefresh();
  });
}
