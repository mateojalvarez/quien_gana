import { Stack } from 'expo-router';

import { useSync } from '@/lib/sync';
import { useTheme } from '@/theme/use-theme';

export default function AppLayout() {
  useSync();
  const { c } = useTheme();
  return (
    // Sin presentaciones modales del sistema: todas las pantallas empujan igual.
    <Stack screenOptions={{ headerShown: false, contentStyle: { backgroundColor: c.bg }, animation: 'slide_from_right' }}>
      <Stack.Screen name="(tabs)" />
      <Stack.Screen name="nueva" />
      <Stack.Screen name="grupos/[id]/index" />
      <Stack.Screen name="grupos/[id]/invitar" />
      <Stack.Screen name="g/[code]" />
      <Stack.Screen name="truco/nueva" />
      <Stack.Screen name="truco/[id]" />
      <Stack.Screen name="equipos/index" />
      <Stack.Screen name="equipos/resultado" />
      <Stack.Screen name="generala/[id]/index" />
      <Stack.Screen name="generala/[id]/planilla" />
      <Stack.Screen name="pulsador" options={{ gestureEnabled: false }} />
    </Stack>
  );
}
