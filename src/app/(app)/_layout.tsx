import { Stack } from 'expo-router';

import { useSync } from '@/lib/sync';
import { useTheme } from '@/theme/use-theme';

export default function AppLayout() {
  useSync();
  const { c } = useTheme();
  return (
    // Sin presentaciones modales del sistema: todas las pantallas empujan igual.
    <Stack screenOptions={{ headerShown: false, contentStyle: { backgroundColor: c.bg }, animation: 'slide_from_right' }}>
      <Stack.Screen name="index" />
      <Stack.Screen name="nueva" />
      <Stack.Screen name="pulsador" options={{ gestureEnabled: false }} />
    </Stack>
  );
}
