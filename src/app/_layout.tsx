import {
  Jost_400Regular,
  Jost_500Medium,
  Jost_600SemiBold,
  Jost_700Bold,
  Jost_800ExtraBold,
} from '@expo-google-fonts/jost';
import { useFonts } from 'expo-font';
import { DarkTheme, DefaultTheme, Stack, ThemeProvider } from 'expo-router';
import * as SplashScreen from 'expo-splash-screen';
import { StatusBar } from 'expo-status-bar';
import * as SystemUI from 'expo-system-ui';
import { useEffect } from 'react';
import { GestureHandlerRootView } from 'react-native-gesture-handler';

import { OverlayProvider } from '@/components/overlay';
import { useInviteLink } from '@/features/grupos/use-invite-link';
import { AuthProvider, useAuth } from '@/providers/auth-provider';
import { useTheme } from '@/theme/use-theme';

SplashScreen.preventAutoHideAsync();

function RootNavigator() {
  const { session, loading } = useAuth();
  const { scheme, c } = useTheme();
  const [fontsLoaded] = useFonts({
    Jost_400Regular,
    Jost_500Medium,
    Jost_600SemiBold,
    Jost_700Bold,
    Jost_800ExtraBold,
  });

  const ready = fontsLoaded && !loading;

  // Las invitaciones a grupos entran por acá, con sesión o sin ella.
  useInviteLink(!!session);

  useEffect(() => {
    SystemUI.setBackgroundColorAsync(c.bg);
  }, [c.bg]);

  useEffect(() => {
    if (ready) SplashScreen.hideAsync();
  }, [ready]);

  if (!ready) return null;

  const navTheme = scheme === 'dark' ? DarkTheme : DefaultTheme;

  return (
    <ThemeProvider
      value={{ ...navTheme, colors: { ...navTheme.colors, background: c.bg, card: c.bg, text: c.ink, border: c.line, primary: c.accent } }}
    >
      <StatusBar style={scheme === 'dark' ? 'light' : 'dark'} />
      <OverlayProvider>
        <Stack screenOptions={{ headerShown: false, contentStyle: { backgroundColor: c.bg } }}>
          <Stack.Protected guard={!!session}>
            <Stack.Screen name="(app)" />
          </Stack.Protected>
          <Stack.Protected guard={!session}>
            <Stack.Screen name="login" />
          </Stack.Protected>
          <Stack.Screen name="auth-callback" />
        </Stack>
      </OverlayProvider>
    </ThemeProvider>
  );
}

export default function RootLayout() {
  // GestureHandlerRootView tiene que envolver todo: sin él, cualquier
  // GestureDetector (el reordenar jugadores, por ejemplo) tira error de render.
  return (
    <GestureHandlerRootView style={{ flex: 1 }}>
      <AuthProvider>
        <RootNavigator />
      </AuthProvider>
    </GestureHandlerRootView>
  );
}
