import { Image } from 'expo-image';
import type { StyleProp } from 'react-native';
import type { ImageStyle } from 'expo-image';

const sources = {
  corazon: require('@/assets/clay/corazon.png'),
  dado: require('@/assets/clay/dado.png'),
  pulsador: require('@/assets/clay/pulsador.png'),
  relojArena: require('@/assets/clay/reloj-arena.png'),
  lapiz: require('@/assets/clay/lapiz.png'),
  trofeo: require('@/assets/clay/trofeo.png'),
  corona: require('@/assets/clay/corona.png'),
  abanicoCartas: require('@/assets/clay/abanico-cartas.png'),
  cartaAs: require('@/assets/clay/carta-as.png'),
  destello: require('@/assets/clay/destello.png'),
  asteriscoSalvia: require('@/assets/clay/asterisco-salvia.png'),
  asteriscoTomate: require('@/assets/clay/asterisco-tomate.png'),
  composicion: require('@/assets/clay/composicion-grande.png'),
  cinta: require('@/assets/clay/cinta.png'),
  boomerang: require('@/assets/clay/boomerang.png'),
} as const;

export type ClayName = keyof typeof sources;

/** Las ilustraciones son lo único "clay": botones y tarjetas quedan planos. */
export function Clay({ name, size = 72, style }: { name: ClayName; size?: number; style?: StyleProp<ImageStyle> }) {
  return <Image source={sources[name]} style={[{ width: size, height: size }, style]} contentFit="contain" />;
}
