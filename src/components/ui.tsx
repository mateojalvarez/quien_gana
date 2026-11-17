import { router } from 'expo-router';
import type { ReactNode } from 'react';
import { useEffect, useState } from 'react';
import {
  Animated,
  Easing,
  Pressable,
  ScrollView,
  Text,
  TextInput,
  View,
  type StyleProp,
  type TextInputProps,
  type TextProps,
  type TextStyle,
  type ViewStyle,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { haptic } from '@/lib/haptics';
import { border, fonts, onPlayerColor, radius, space, touch } from '@/theme/tokens';
import { useTheme } from '@/theme/use-theme';
import { Icon, type IconName } from './icons';

/* ───────────── Tipografía (Jost) ───────────── */

type TProps = TextProps & { color?: string; style?: StyleProp<TextStyle> };

/** Títulos grandes: Jost 800, tracking cerrado. */
export function Display({ style, color, ...p }: TProps) {
  const { c } = useTheme();
  return (
    <Text
      {...p}
      style={[
        { fontFamily: fonts.black, fontSize: 40, lineHeight: 42, letterSpacing: -1.1, color: color ?? c.ink },
        style,
      ]}
    />
  );
}

export function Title({ style, color, ...p }: TProps) {
  const { c } = useTheme();
  return (
    <Text
      {...p}
      style={[{ fontFamily: fonts.bold, fontSize: 21, lineHeight: 26, letterSpacing: -0.2, color: color ?? c.ink }, style]}
    />
  );
}

export function Body({ style, color, ...p }: TProps) {
  const { c } = useTheme();
  return <Text {...p} style={[{ fontFamily: fonts.regular, fontSize: 16, lineHeight: 22, color: color ?? c.ink }, style]} />;
}

/** Texto de apoyo: 13px, semibold, apagado. Sin mayúsculas forzadas. */
export function Label({ style, color, ...p }: TProps) {
  const { c } = useTheme();
  return <Text {...p} style={[{ fontFamily: fonts.semibold, fontSize: 13, lineHeight: 17, color: color ?? c.muted }, style]} />;
}

/** Números: tabulares, Jost bold. */
export function Num({ style, color, ...p }: TProps) {
  const { c } = useTheme();
  return (
    <Text
      {...p}
      style={[{ fontFamily: fonts.bold, fontSize: 17, color: color ?? c.ink, fontVariant: ['tabular-nums'] }, style]}
    />
  );
}

/* ───────────── Estructura ───────────── */

export function Rule({ strong, vertical, style }: { strong?: boolean; vertical?: boolean; style?: StyleProp<ViewStyle> }) {
  const { c } = useTheme();
  return (
    <View
      style={[
        vertical ? { width: 1, alignSelf: 'stretch' } : { height: 1, alignSelf: 'stretch' },
        { backgroundColor: strong ? c.lineStrong : c.line },
        style,
      ]}
    />
  );
}

export function Row({ children, style }: { children: ReactNode; style?: StyleProp<ViewStyle> }) {
  return <View style={[{ flexDirection: 'row', alignItems: 'center' }, style]}>{children}</View>;
}

/** Botón circular con borde: el "volver" del mockup. */
export function IconButton({
  name,
  onPress,
  label,
  variant = 'outline',
  size = touch,
  color,
}: {
  name: IconName;
  onPress: () => void;
  label: string;
  variant?: 'outline' | 'solid' | 'ghost';
  size?: number;
  color?: string;
}) {
  const { c } = useTheme();
  const fg = color ?? (variant === 'solid' ? c.inverseInk : c.ink);
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={label}
      hitSlop={6}
      onPress={() => {
        haptic.tap();
        onPress();
      }}
      style={({ pressed }) => ({
        width: size,
        height: size,
        borderRadius: size / 2,
        alignItems: 'center',
        justifyContent: 'center',
        borderWidth: variant === 'outline' ? border : 0,
        borderColor: c.lineStrong,
        backgroundColor: variant === 'solid' ? c.inverseBg : 'transparent',
        opacity: pressed ? 0.6 : 1,
      })}
    >
      <Icon name={name} size={Math.round(size * 0.45)} color={fg} />
    </Pressable>
  );
}

type ScreenProps = {
  title?: string;
  /** Línea chica arriba del título. */
  meta?: string;
  back?: boolean;
  right?: ReactNode;
  children: ReactNode;
  scroll?: boolean;
  padded?: boolean;
  footer?: ReactNode;
  /** Ilustración que puede asomar detrás del encabezado. */
  decor?: ReactNode;
};

export function Screen({
  title,
  meta,
  back = true,
  right,
  children,
  scroll = true,
  padded = true,
  footer,
  decor,
}: ScreenProps) {
  const { c } = useTheme();
  const insets = useSafeAreaInsets();
  const pad = padded ? { paddingHorizontal: space.xl } : undefined;
  const content = padded ? <View style={{ paddingHorizontal: space.xl }}>{children}</View> : children;

  return (
    <View style={{ flex: 1, backgroundColor: c.bg, paddingTop: insets.top + space.sm }}>
      {(title || back || right) && (
        <View style={[pad, { paddingBottom: space.md }]}>
          {decor}
          <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', minHeight: touch }}>
            {back ? (
              <IconButton
                name="chevronLeft"
                label="Volver"
                onPress={() => (router.canGoBack() ? router.back() : router.replace('/'))}
              />
            ) : (
              <View style={{ width: 1 }} />
            )}
            {right}
          </View>
          {title ? (
            <View style={{ paddingTop: space.lg }}>
              {meta ? <Label style={{ marginBottom: space.xs }}>{meta}</Label> : null}
              <Display numberOfLines={2} style={decor ? { maxWidth: '72%' } : undefined}>
                {title}
              </Display>
            </View>
          ) : null}
        </View>
      )}

      {scroll ? (
        <ScrollView
          contentContainerStyle={{ paddingBottom: (footer ? space.lg : insets.bottom + space.huge) }}
          keyboardShouldPersistTaps="handled"
          showsVerticalScrollIndicator={false}
        >
          {content}
        </ScrollView>
      ) : (
        <View style={{ flex: 1 }}>{content}</View>
      )}

      {footer ? (
        <View
          style={{
            paddingHorizontal: space.xl,
            paddingTop: space.md,
            paddingBottom: insets.bottom + space.lg,
            backgroundColor: c.bg,
          }}
        >
          {footer}
        </View>
      ) : null}
    </View>
  );
}

/* ───────────── Tarjetas ───────────── */

export function Card({
  children,
  color,
  onPress,
  style,
  big,
  clip,
}: {
  children: ReactNode;
  /** Color pleno de la tarjeta; si falta usa el neutro del tema. */
  color?: string;
  onPress?: () => void;
  style?: StyleProp<ViewStyle>;
  big?: boolean;
  /** Por defecto la arcilla puede salirse de la tarjeta, como en el mockup. */
  clip?: boolean;
}) {
  const { c } = useTheme();
  const box: ViewStyle = {
    borderRadius: big ? radius.cardLg : radius.card,
    backgroundColor: color ?? c.card,
    overflow: clip ? 'hidden' : 'visible',
  };
  if (!onPress) return <View style={[box, style]}>{children}</View>;
  return (
    <Pressable
      onPress={() => {
        haptic.tap();
        onPress();
      }}
      style={({ pressed }) => [box, { opacity: pressed ? 0.82 : 1 }, style]}
    >
      {children}
    </Pressable>
  );
}

/** Píldora chica de estado: "Reparte", "Final", etc. */
export function Tag({ label, color, bg }: { label: string; color?: string; bg?: string }) {
  const { c } = useTheme();
  return (
    <View style={{ paddingHorizontal: 11, paddingVertical: 5, borderRadius: radius.pill, backgroundColor: bg ?? c.inverseBg }}>
      <Text style={{ fontFamily: fonts.semibold, fontSize: 12, color: color ?? c.inverseInk }}>{label}</Text>
    </View>
  );
}

/* ───────────── Botones ───────────── */

type ButtonProps = {
  label: string;
  onPress: () => void;
  /** primary = acción negra del mockup; outline = borde 1.5; ghost = sin caja. */
  variant?: 'primary' | 'outline' | 'ghost' | 'color';
  color?: string;
  disabled?: boolean;
  loading?: boolean;
  style?: StyleProp<ViewStyle>;
  meta?: string;
  icon?: IconName;
  trailingIcon?: IconName;
  size?: 'md' | 'sm';
};

export function Button({
  label,
  onPress,
  variant = 'primary',
  color,
  disabled,
  loading,
  style,
  meta,
  icon,
  trailingIcon,
  size = 'md',
}: ButtonProps) {
  const { c } = useTheme();
  const bg = variant === 'primary' ? c.inverseBg : variant === 'color' ? (color ?? c.accent) : 'transparent';
  const fg =
    variant === 'primary' ? c.inverseInk : variant === 'color' ? onPlayerColor : (color ?? c.ink);
  const h = size === 'sm' ? 44 : 58;

  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={label}
      disabled={disabled || loading}
      onPress={() => {
        haptic.tap();
        onPress();
      }}
      style={({ pressed }) => [
        {
          height: h,
          paddingHorizontal: space.xl,
          borderRadius: radius.pill,
          backgroundColor: bg,
          borderWidth: variant === 'outline' ? border : 0,
          borderColor: color ?? c.lineStrong,
          flexDirection: 'row',
          alignItems: 'center',
          justifyContent: 'center',
          gap: space.sm,
          opacity: disabled ? 0.35 : pressed ? 0.76 : 1,
        },
        style,
      ]}
    >
      {loading ? (
        <Spinner color={fg} />
      ) : (
        <>
          {icon ? <Icon name={icon} size={20} color={fg} /> : null}
          <Text style={{ fontFamily: fonts.semibold, fontSize: size === 'sm' ? 15 : 17.5, color: fg }}>{label}</Text>
          {meta ? (
            <Text style={{ fontFamily: fonts.medium, fontSize: 14, color: fg, opacity: 0.72, fontVariant: ['tabular-nums'] }}>
              {meta}
            </Text>
          ) : null}
          {trailingIcon ? <Icon name={trailingIcon} size={20} color={fg} /> : null}
        </>
      )}
    </Pressable>
  );
}

/** Spinner propio: tres puntos que late. Nada de ActivityIndicator del sistema. */
export function Spinner({ color, size = 8 }: { color: string; size?: number }) {
  const dots = [0, 1, 2];
  return (
    <View style={{ flexDirection: 'row', gap: size * 0.6, alignItems: 'center', height: size * 2 }}>
      {dots.map((i) => (
        <PulseDot key={i} color={color} size={size} delay={i * 160} />
      ))}
    </View>
  );
}

function PulseDot({ color, size, delay }: { color: string; size: number; delay: number }) {
  const [v] = useState(() => new Animated.Value(0.35));
  useEffect(() => {
    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(v, { toValue: 1, duration: 420, delay, easing: Easing.out(Easing.quad), useNativeDriver: true }),
        Animated.timing(v, { toValue: 0.35, duration: 420, easing: Easing.in(Easing.quad), useNativeDriver: true }),
      ]),
    );
    loop.start();
    return () => loop.stop();
  }, [delay, v]);
  return (
    <Animated.View
      style={{
        width: size,
        height: size,
        borderRadius: size / 2,
        backgroundColor: color,
        opacity: v,
        transform: [{ scale: v }],
      }}
    />
  );
}

/** Chips de filtro del hub. */
export function Chip({ label, active, onPress }: { label: string; active?: boolean; onPress: () => void }) {
  const { c } = useTheme();
  return (
    <Pressable
      accessibilityRole="button"
      onPress={() => {
        haptic.tap();
        onPress();
      }}
      style={({ pressed }) => ({
        height: 40,
        paddingHorizontal: space.lg,
        borderRadius: radius.pill,
        borderWidth: border,
        borderColor: c.lineStrong,
        backgroundColor: active ? c.inverseBg : 'transparent',
        alignItems: 'center',
        justifyContent: 'center',
        opacity: pressed ? 0.7 : 1,
      })}
    >
      <Text style={{ fontFamily: fonts.semibold, fontSize: 15, color: active ? c.inverseInk : c.ink }}>{label}</Text>
    </Pressable>
  );
}

/** Pestañas en píldora: borde 1.5 por fuera, pastilla negra adentro. */
export function Segmented<T extends string | number>({
  options,
  value,
  onChange,
  style,
}: {
  options: { value: T; label: string; meta?: string }[];
  value: T;
  onChange: (v: T) => void;
  style?: StyleProp<ViewStyle>;
}) {
  const { c } = useTheme();
  return (
    <View
      accessibilityRole="tablist"
      style={[
        {
          height: 50,
          borderRadius: radius.pill,
          borderWidth: border,
          borderColor: c.lineStrong,
          flexDirection: 'row',
          padding: 4,
          gap: 4,
        },
        style,
      ]}
    >
      {options.map((o) => {
        const active = o.value === value;
        return (
          <Pressable
            key={String(o.value)}
            accessibilityRole="tab"
            accessibilityState={{ selected: active }}
            onPress={() => {
              haptic.tap();
              onChange(o.value);
            }}
            style={{
              flex: 1,
              borderRadius: radius.pill,
              backgroundColor: active ? c.inverseBg : 'transparent',
              alignItems: 'center',
              justifyContent: 'center',
              flexDirection: 'row',
              gap: 5,
            }}
          >
            <Text style={{ fontFamily: fonts.semibold, fontSize: 15, color: active ? c.inverseInk : c.ink }}>{o.label}</Text>
            {o.meta ? (
              <Text
                style={{
                  fontFamily: fonts.medium,
                  fontSize: 14,
                  color: active ? c.inverseInk : c.muted,
                  fontVariant: ['tabular-nums'],
                }}
              >
                {o.meta}
              </Text>
            ) : null}
          </Pressable>
        );
      })}
    </View>
  );
}

/** −/+ del mockup: menos con borde, más en negro, número grande en el medio. */
export function Stepper({
  value,
  onChange,
  min = 0,
  max = 99,
  size = 44,
  labelMinus = 'Restar',
  labelPlus = 'Sumar',
  onColored,
}: {
  value: number;
  onChange: (n: number) => void;
  min?: number;
  max?: number;
  size?: number;
  labelMinus?: string;
  labelPlus?: string;
  /** true cuando va sobre una tarjeta de color: el texto queda tinta. */
  onColored?: boolean;
}) {
  const { c } = useTheme();
  const ink = onColored ? onPlayerColor : c.ink;
  const solidBg = onColored ? onPlayerColor : c.inverseBg;
  const solidFg = onColored ? '#FBF8F2' : c.inverseInk;

  const btn = (name: IconName, next: number, off: boolean, label: string, solid: boolean) => (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={label}
      hitSlop={4}
      disabled={off}
      onPress={() => {
        haptic.tap();
        onChange(next);
      }}
      style={({ pressed }) => ({
        width: size,
        height: size,
        borderRadius: size / 2,
        alignItems: 'center',
        justifyContent: 'center',
        borderWidth: solid ? 0 : border,
        borderColor: ink,
        backgroundColor: solid ? solidBg : 'transparent',
        opacity: off ? 0.3 : pressed ? 0.65 : 1,
      })}
    >
      <Icon name={name} size={Math.round(size * 0.42)} color={solid ? solidFg : ink} />
    </Pressable>
  );

  return (
    <View style={{ flexDirection: 'row', alignItems: 'center', gap: space.md }}>
      {btn('minus', value - 1, value <= min, labelMinus, false)}
      <Num numberOfLines={1} style={{ minWidth: 42, textAlign: 'center', fontSize: 26, fontFamily: fonts.black }} color={ink}>
        {value}
      </Num>
      {btn('plus', value + 1, value >= max, labelPlus, true)}
    </View>
  );
}

/** Interruptor propio, animado. Reemplaza al Switch del sistema. */
export function Toggle({ value, onChange, label }: { value: boolean; onChange: (v: boolean) => void; label: string }) {
  const { c } = useTheme();
  const [anim] = useState(() => new Animated.Value(value ? 1 : 0));
  useEffect(() => {
    Animated.timing(anim, { toValue: value ? 1 : 0, duration: 180, easing: Easing.out(Easing.cubic), useNativeDriver: false }).start();
  }, [value, anim]);

  const W = 58;
  const H = 34;
  const knob = 26;

  return (
    <Pressable
      accessibilityRole="switch"
      accessibilityLabel={label}
      accessibilityState={{ checked: value }}
      onPress={() => {
        haptic.tap();
        onChange(!value);
      }}
      style={{ width: W, height: H }}
    >
      <Animated.View
        style={{
          width: W,
          height: H,
          borderRadius: radius.pill,
          borderWidth: border,
          borderColor: c.lineStrong,
          backgroundColor: anim.interpolate({ inputRange: [0, 1], outputRange: ['rgba(0,0,0,0)', c.inverseBg] }),
          justifyContent: 'center',
        }}
      >
        <Animated.View
          style={{
            width: knob,
            height: knob,
            borderRadius: knob / 2,
            backgroundColor: value ? c.accent : c.lineStrong,
            transform: [{ translateX: anim.interpolate({ inputRange: [0, 1], outputRange: [3, W - knob - 5] }) }],
          }}
        />
      </Animated.View>
    </Pressable>
  );
}

/** Ficha redonda con la inicial del jugador. */
export function Avatar({
  name,
  color,
  size = 34,
  ring,
  style,
}: {
  name: string;
  color: string;
  size?: number;
  /** Color del aro, para los avatares superpuestos sobre una tarjeta. */
  ring?: string;
  style?: StyleProp<ViewStyle>;
}) {
  return (
    <View
      style={[
        {
          width: size,
          height: size,
          borderRadius: size / 2,
          backgroundColor: color,
          alignItems: 'center',
          justifyContent: 'center',
          borderWidth: ring ? 2 : 0,
          borderColor: ring,
        },
        style,
      ]}
    >
      <Text style={{ fontFamily: fonts.bold, fontSize: size * 0.42, color: onPlayerColor }}>
        {(name.trim()[0] ?? '?').toUpperCase()}
      </Text>
    </View>
  );
}

/** Barra de progreso con borde, como la tabla del mockup. */
export function Bar({ progress, color, height = 14 }: { progress: number; color: string; height?: number }) {
  const { c } = useTheme();
  return (
    <View
      style={{
        height,
        borderRadius: radius.pill,
        borderWidth: border,
        borderColor: c.lineStrong,
        overflow: 'hidden',
        justifyContent: 'center',
      }}
    >
      <View
        style={{
          position: 'absolute',
          left: 0,
          top: 0,
          bottom: 0,
          width: `${Math.max(0, Math.min(1, progress)) * 100}%`,
          backgroundColor: color,
        }}
      />
    </View>
  );
}

/** Campo de texto propio: caja redondeada con borde 1.5 y etiqueta arriba. */
export function Field({
  label,
  style,
  align = 'left',
  mono,
  ...props
}: TextInputProps & { label?: string; style?: StyleProp<ViewStyle>; align?: 'left' | 'right'; mono?: boolean }) {
  const { c } = useTheme();
  return (
    <View style={style}>
      {label ? <Label style={{ marginBottom: space.sm }}>{label}</Label> : null}
      <View
        style={{
          minHeight: 56,
          borderRadius: radius.field,
          borderWidth: border,
          borderColor: c.line,
          paddingHorizontal: space.lg,
          justifyContent: 'center',
        }}
      >
        <TextInput
          placeholderTextColor={c.muted}
          {...props}
          style={{
            fontFamily: mono ? fonts.bold : fonts.medium,
            fontSize: 17,
            color: c.ink,
            textAlign: align,
            paddingVertical: space.md,
            ...(mono ? { fontVariant: ['tabular-nums'] as const } : null),
          }}
        />
      </View>
    </View>
  );
}

/** Encabezado de sección: título a la izquierda, dato a la derecha. */
export function SectionHead({ title, meta, style }: { title: string; meta?: string; style?: StyleProp<ViewStyle> }) {
  return (
    <View
      style={[{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'baseline', marginBottom: space.md }, style]}
    >
      <Title>{title}</Title>
      {meta ? <Label style={{ fontVariant: ['tabular-nums'] }}>{meta}</Label> : null}
    </View>
  );
}

export function Swatch({ color, size = 12 }: { color: string; size?: number }) {
  return <View style={{ width: size, height: size, borderRadius: size / 2, backgroundColor: color }} />;
}
