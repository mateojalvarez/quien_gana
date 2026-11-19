import { Tabs } from 'expo-router/tabs';

import { TabBar } from '@/components/tab-bar';
import { useTheme } from '@/theme/use-theme';

export default function TabsLayout() {
  const { c } = useTheme();
  return (
    // La barra es nuestra: el tabBar del sistema no se dibuja nunca.
    <Tabs
      tabBar={(props) => <TabBar {...props} />}
      screenOptions={{ headerShown: false, sceneStyle: { backgroundColor: c.bg } }}
    >
      <Tabs.Screen name="index" />
      <Tabs.Screen name="juegos" />
      <Tabs.Screen name="grupos" />
      <Tabs.Screen name="perfil" />
    </Tabs>
  );
}
