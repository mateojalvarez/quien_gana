// Barra inferior propia, en píldora, como el mockup. No es el BottomTabBar de
// React Navigation: nada nativo de iOS entra acá.

import type { BottomTabBarProps } from 'expo-router/tabs';
import { Pressable, View } from 'react-native';

import { Icon, type IconName } from '@/components/icons';
import { haptic } from '@/lib/haptics';
import { radius, space } from '@/theme/tokens';
import { useTheme } from '@/theme/use-theme';

/** Alto de la barra más el aire de abajo: lo que cada pestaña deja libre al final. */
export const TAB_BAR_SPACE = 110;

const ICONOS: Record<string, { icon: IconName; label: string }> = {
  index: { icon: 'home', label: 'Inicio' },
  juegos: { icon: 'grid', label: 'Juegos' },
  grupos: { icon: 'users', label: 'Grupos' },
  perfil: { icon: 'user', label: 'Perfil' },
};

export function TabBar({ state, navigateToTab, insets }: BottomTabBarProps) {
  const { c } = useTheme();

  return (
    <View
      style={{
        position: 'absolute',
        left: space.xl,
        right: space.xl,
        bottom: insets.bottom + space.md,
        height: 64,
        borderRadius: radius.pill,
        backgroundColor: c.inverseBg,
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'space-between',
        paddingHorizontal: 6,
      }}
    >
      {state.routes.map((route, i) => {
        const meta = ICONOS[route.name];
        if (!meta) return null;
        return (
          <TabButton
            key={route.key}
            icon={meta.icon}
            label={meta.label}
            active={state.index === i}
            onPress={() => navigateToTab(route.key)}
          />
        );
      })}
    </View>
  );
}

function TabButton({
  icon,
  label,
  active,
  onPress,
}: {
  icon: IconName;
  label: string;
  active: boolean;
  onPress: () => void;
}) {
  const { c } = useTheme();
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityState={{ selected: active }}
      onPress={() => {
        haptic.tap();
        onPress();
      }}
      style={({ pressed }) => ({
        width: 52,
        height: 52,
        borderRadius: 26,
        alignItems: 'center',
        justifyContent: 'center',
        backgroundColor: active ? c.bg : 'transparent',
        opacity: pressed ? 0.7 : 1,
      })}
    >
      <Icon name={icon} size={22} color={active ? c.ink : c.inverseInk} />
    </Pressable>
  );
}
