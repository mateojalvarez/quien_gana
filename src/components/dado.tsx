import { Pressable, View } from 'react-native';

import { radius } from '@/theme/tokens';

/** Qué casillas de la grilla 3×3 se pintan en cada cara. */
const CARAS: Record<number, number[]> = {
  1: [4],
  2: [0, 8],
  3: [0, 4, 8],
  4: [0, 2, 6, 8],
  5: [0, 2, 4, 6, 8],
  6: [0, 2, 3, 5, 6, 8],
};

/**
 * Un dado dibujado, con los puntos en grilla. Fijo = se da vuelta el color y
 * sube un poco, para que se vea cuál se queda sin tocar nada más.
 */
export function Dado({
  valor,
  fijo,
  color,
  tinta,
  size = 62,
  onPress,
  label,
  borde,
}: {
  valor: number;
  fijo?: boolean;
  /** Color de la cara cuando está libre. */
  color: string;
  /** Color de los puntos cuando está libre. */
  tinta: string;
  size?: number;
  onPress?: () => void;
  label: string;
  /** Contorno del dado todavía sin tirar; va en el color del tema. */
  borde?: string;
}) {
  const punto = Math.round(size * 0.145);
  const cara = CARAS[valor] ?? [];
  // Antes del primer tiro no hay cara: un cuadrado de color lleno se ve roto,
  // así que queda el contorno punteado de un lugar todavía vacío.
  const vacio = !cara.length;

  const cuerpo = (
    <View
      style={{
        width: size,
        height: size,
        borderRadius: radius.field,
        borderWidth: vacio ? 1.5 : 0,
        borderStyle: 'dashed',
        borderColor: borde ?? tinta,
        opacity: vacio ? 0.35 : 1,
        backgroundColor: vacio ? 'transparent' : fijo ? tinta : color,
        flexDirection: 'row',
        flexWrap: 'wrap',
        padding: size * 0.145,
        transform: [{ translateY: fijo ? -6 : 0 }],
      }}
    >
      {Array.from({ length: 9 }, (_, i) => (
        <View key={i} style={{ width: '33.33%', height: '33.33%', alignItems: 'center', justifyContent: 'center' }}>
          {cara.includes(i) ? (
            <View style={{ width: punto, height: punto, borderRadius: punto / 2, backgroundColor: fijo ? color : tinta }} />
          ) : null}
        </View>
      ))}
    </View>
  );

  if (!onPress) return cuerpo;
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityState={{ selected: !!fijo }}
      onPress={onPress}
      style={({ pressed }) => ({ opacity: pressed ? 0.8 : 1 })}
    >
      {cuerpo}
    </Pressable>
  );
}
