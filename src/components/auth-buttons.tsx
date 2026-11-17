import { Image } from 'expo-image';
import { Pressable, Text, View } from 'react-native';
import Svg, { Path } from 'react-native-svg';

import { haptic } from '@/lib/haptics';
import { border, fonts, radius, space } from '@/theme/tokens';
import { useTheme } from '@/theme/use-theme';
import { Spinner } from './ui';

/**
 * Botones de ingreso con forma propia (píldora de 58, como el resto de la app).
 * Ninguno es el botón nativo del sistema: el de Apple usa su glifo y el de
 * Google el logo oficial del kit de marca, en nuestra píldora.
 */

function AppleGlyph({ color, size = 20 }: { color: string; size?: number }) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24" accessibilityRole="image" aria-label="Apple">
      <Path
        d="M17.05 12.73c.02-2.3 1.88-3.4 1.96-3.45-1.07-1.57-2.73-1.78-3.32-1.82-1.41-.11-2.76.82-3.48.82-.72 0-1.83-.8-3.01-.78-1.55.02-2.98.9-3.78 2.29-1.61 2.8-.41 6.93 1.15 9.2.77 1.1 1.68 2.33 2.88 2.29 1.15-.05 1.58-.74 2.97-.74 1.38 0 1.77.74 2.98.72 1.23-.02 2.01-1.12 2.76-2.22.87-1.27 1.23-2.5 1.25-2.56-.03-.01-2.4-.92-2.42-3.66zM14.8 5.9c.63-.76 1.05-1.82.94-2.87-.93.04-2.05.62-2.71 1.38-.6.68-1.1 1.76-.96 2.8 1.03.08 2.08-.53 2.73-1.31z"
        fill={color}
      />
    </Svg>
  );
}

type Props = { label: string; onPress: () => void; loading?: boolean; disabled?: boolean };

/** Apple: acción principal en negro (marfil en modo oscuro), como el mockup. */
export function AppleButton({ label, onPress, loading, disabled }: Props) {
  const { c } = useTheme();
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={label}
      disabled={disabled || loading}
      onPress={() => {
        haptic.tap();
        onPress();
      }}
      style={({ pressed }) => ({
        height: 58,
        borderRadius: radius.pill,
        backgroundColor: c.inverseBg,
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'center',
        gap: space.md,
        paddingHorizontal: space.xl,
        opacity: disabled ? 0.35 : pressed ? 0.78 : 1,
      })}
    >
      {loading ? (
        <Spinner color={c.inverseInk} />
      ) : (
        <>
          <AppleGlyph color={c.inverseInk} size={21} />
          <Text style={{ fontFamily: fonts.semibold, fontSize: 17.5, color: c.inverseInk }}>{label}</Text>
        </>
      )}
    </Pressable>
  );
}

/**
 * Google: logo oficial (assets/google, recortado del kit) sobre nuestra
 * píldora con borde 1.5. Los colores siguen sus temas Light / Dark.
 */
const GOOGLE = {
  light: { bg: '#FFFFFF', borderColor: '#747775', text: '#1F1F1F', logo: require('@/assets/google/g-light.png') },
  dark: { bg: '#131314', borderColor: '#8E918F', text: '#E3E3E3', logo: require('@/assets/google/g-dark.png') },
} as const;

export function GoogleButton({ label = 'Continuar con Google', onPress, loading, disabled }: Partial<Props> & { onPress: () => void }) {
  const { scheme } = useTheme();
  const t = GOOGLE[scheme];
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={label}
      disabled={disabled || loading}
      onPress={() => {
        haptic.tap();
        onPress();
      }}
      style={({ pressed }) => ({
        height: 58,
        borderRadius: radius.pill,
        borderWidth: border,
        borderColor: t.borderColor,
        backgroundColor: t.bg,
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'center',
        gap: space.md,
        paddingHorizontal: space.xl,
        opacity: disabled ? 0.35 : pressed ? 0.8 : 1,
      })}
    >
      {loading ? (
        <Spinner color={t.text} />
      ) : (
        <>
          <View style={{ width: 20, height: 20 }}>
            <Image source={t.logo} style={{ width: 20, height: 20 }} contentFit="contain" />
          </View>
          <Text style={{ fontFamily: fonts.semibold, fontSize: 17.5, color: t.text }}>{label}</Text>
        </>
      )}
    </Pressable>
  );
}
