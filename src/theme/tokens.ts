// Tokens de diseño — tomados del mockup "¿Quién gana? · Pantallas v1".
// UI plana: marfil, tinta, tarjetas de color pleno y píldoras con borde 1.5.
// La arcilla (PNG) sólo aparece como ilustración, nunca como botón.

export const palette = {
  marfil: '#FBF8F2',
  tinta: '#151110',
  tintaSuave: '#2A221E',
  mostaza: '#F4B740',
  tomate: '#EF7A57',
  salvia: '#86C1B7',
  rosa: '#F3C2C9',
  crema: '#EFE6D8',
  arena: '#D9CDBE',
  tierra: '#5A4A40',
  piedra: '#8C7A6C',
  verde: '#1F6B5F',
  rojo: '#B23F1C',
  azul: '#7FA8C9',
} as const;

export type ColorScheme = 'light' | 'dark';

export type Colors = {
  bg: string;
  ink: string;
  muted: string;
  line: string;
  lineStrong: string;
  wash: string;
  /** Fondo de tarjeta neutra (sobre el fondo de pantalla). */
  card: string;
  accent: string;
  onAccent: string;
  /** Acción principal: negro en claro, marfil en oscuro. */
  inverseBg: string;
  inverseInk: string;
  ok: string;
  bad: string;
  /** Las tarjetas de color mantienen texto tinta en los dos modos. */
  onColor: string;
  scrim: string;
};

export const colors: Record<ColorScheme, Colors> = {
  light: {
    bg: palette.marfil,
    ink: palette.tinta,
    muted: palette.tierra,
    line: palette.arena,
    lineStrong: palette.tinta,
    wash: palette.crema,
    card: palette.crema,
    accent: palette.mostaza,
    onAccent: palette.tinta,
    inverseBg: palette.tinta,
    inverseInk: palette.marfil,
    ok: palette.verde,
    bad: palette.rojo,
    onColor: palette.tinta,
    scrim: 'rgba(21,17,16,0.46)',
  },
  dark: {
    bg: palette.tinta,
    ink: palette.marfil,
    muted: '#B4A79C',
    line: '#3A322D',
    lineStrong: palette.marfil,
    wash: palette.tintaSuave,
    card: palette.tintaSuave,
    accent: palette.mostaza,
    onAccent: palette.tinta,
    inverseBg: palette.marfil,
    inverseInk: palette.tinta,
    ok: '#79C9B6',
    bad: '#F08A63',
    onColor: palette.tinta,
    scrim: 'rgba(0,0,0,0.6)',
  },
};

/** Colores de jugador: los cuatro del mockup y después el resto de la paleta. */
export function playerColor(index: number, _scheme: ColorScheme = 'light'): string {
  const list = [
    palette.mostaza,
    palette.salvia,
    palette.tomate,
    palette.rosa,
    palette.crema,
    palette.azul,
    palette.piedra,
    palette.marfil,
  ];
  return list[index % list.length];
}

/** Las fichas de jugador llevan texto tinta: toda la paleta de jugador es clara. */
export const onPlayerColor = palette.tinta;

export const fonts = {
  regular: 'Jost_400Regular',
  medium: 'Jost_500Medium',
  semibold: 'Jost_600SemiBold',
  bold: 'Jost_700Bold',
  black: 'Jost_800ExtraBold',
} as const;

export const space = { xs: 4, sm: 8, md: 12, lg: 16, xl: 20, xxl: 24, huge: 32 } as const;

/** Radios del mockup: píldora total, tarjetas grandes, campos medianos. */
export const radius = {
  pill: 999,
  card: 24,
  cardLg: 32,
  field: 18,
  sm: 12,
} as const;

/** Borde de píldora del mockup. */
export const border = 1.5;
export const hairline = 1;

/** Alto mínimo táctil. */
export const touch = 44;
