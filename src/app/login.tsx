import { useEffect, useState } from 'react';
import { Platform, Pressable, Text, View, useWindowDimensions } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { AppleButton, GoogleButton } from '@/components/auth-buttons';
import { Clay } from '@/components/clay';
import { useOverlay } from '@/components/overlay';
import { Display, Label } from '@/components/ui';
import {
  isAppleNativeAvailable,
  isIdentityConflict,
  signInAsGuest,
  signInWithAppleNative,
  signInWithOAuth,
} from '@/lib/auth';
import { supabaseUrl } from '@/lib/supabase';
import { useAuth } from '@/providers/auth-provider';
import { fonts, palette, radius, space } from '@/theme/tokens';
import { useTheme } from '@/theme/use-theme';

const appleWebEnabled = process.env.EXPO_PUBLIC_APPLE_WEB_ENABLED === 'true';

export default function Login() {
  const { c } = useTheme();
  const { configured } = useAuth();
  const insets = useSafeAreaInsets();
  const { width, height } = useWindowDimensions();
  const overlay = useOverlay();
  const [appleNative, setAppleNative] = useState(false);
  const [busy, setBusy] = useState<null | 'apple' | 'google' | 'guest'>(null);

  useEffect(() => {
    isAppleNativeAvailable().then(setAppleNative);
  }, []);

  async function run(kind: 'apple' | 'google' | 'guest', fn: () => Promise<unknown>) {
    if (!configured) {
      await overlay.notice({
        title: 'Supabase sin configurar',
        message: 'Completá EXPO_PUBLIC_SUPABASE_URL y la publishable key en .env.',
      });
      return;
    }
    setBusy(kind);
    try {
      await fn();
    } catch (e: unknown) {
      const err = e as { code?: string; status?: number; message?: string };
      if (err.code === 'ERR_REQUEST_CANCELED') return; // canceló Apple
      if (isIdentityConflict(e)) {
        // Dos cuentas reales no se combinan solas: hay que entrar con la primera.
        await overlay.notice({
          title: 'Ese email ya tiene cuenta',
          message: 'Entrá con el método que usaste la primera vez y vinculá este desde Ajustes.',
        });
        return;
      }
      const detail = [err.message ?? 'Probá de nuevo.', err.code, err.status ? `HTTP ${err.status}` : null]
        .filter(Boolean)
        .join(' · ');
      // En desarrollo mostramos backend y proveedor: casi siempre el problema es de config.
      console.warn(`[auth:${kind}] ${detail} — backend ${supabaseUrl}`, e);
      await overlay.notice({
        title: 'No pudimos iniciar sesión',
        message: __DEV__ ? `${detail}\n\nBackend: ${supabaseUrl}` : detail,
      });
    } finally {
      setBusy(null);
    }
  }

  const showApple = appleNative || (Platform.OS === 'android' && appleWebEnabled);
  const cardH = Math.min(360, height * 0.42);
  const clayW = Math.min(width - 80, cardH - 50);

  return (
    <View style={{ flex: 1, backgroundColor: c.bg, paddingTop: insets.top }}>
      <View style={{ flex: 1, paddingHorizontal: space.xl, paddingTop: space.huge }}>
        {/* Tarjeta mostaza con la composición de arcilla, igual que el mockup */}
        <View
          style={{
            height: cardH,
            borderRadius: radius.cardLg,
            backgroundColor: palette.mostaza,
            alignItems: 'center',
            justifyContent: 'center',
          }}
        >
          <Clay name="composicion" size={clayW} />
        </View>

        <View style={{ marginTop: space.xxl, gap: space.sm }}>
          <Label>Anotadores, dados y pulsadores</Label>
          <Display style={{ fontSize: 46, lineHeight: 55 }}>¿Quién gana?</Display>
        </View>
      </View>

      <View style={{ paddingHorizontal: space.xl, paddingBottom: insets.bottom + space.xxl, gap: space.sm }}>
        {showApple ? (
          <AppleButton
            label="Continuar con Apple"
            loading={busy === 'apple'}
            disabled={busy !== null && busy !== 'apple'}
            onPress={() => run('apple', appleNative ? signInWithAppleNative : () => signInWithOAuth('apple'))}
          />
        ) : null}

        <GoogleButton
          label="Continuar con Google"
          loading={busy === 'google'}
          disabled={busy !== null && busy !== 'google'}
          onPress={() => run('google', () => signInWithOAuth('google'))}
        />

        <Pressable
          accessibilityRole="button"
          onPress={() => run('guest', signInAsGuest)}
          disabled={busy !== null}
          style={({ pressed }) => ({ height: 46, alignItems: 'center', justifyContent: 'center', opacity: pressed ? 0.6 : 1 })}
        >
          <Text
            style={{
              fontFamily: fonts.semibold,
              fontSize: 16,
              color: c.ink,
              textDecorationLine: 'underline',
            }}
          >
            {busy === 'guest' ? 'Entrando…' : 'Entrar como invitado'}
          </Text>
        </Pressable>

        <Label style={{ textAlign: 'center', fontSize: 12.5, lineHeight: 18, marginHorizontal: space.sm }}>
          Como invitado, tus partidas quedan solo en este teléfono. Podés vincular una cuenta más tarde desde Ajustes.
        </Label>
      </View>
    </View>
  );
}
