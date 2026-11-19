// Catálogo único de juegos: antes vivía como un array local en el hub.
// Lo comparten Inicio (favoritos y frecuentes) y la pestaña Juegos.
// Los ids son claves estables: los favoritos y el conteo de aperturas se guardan por id.

import type { Href } from 'expo-router';

import type { ClayName } from '@/components/clay';
import { palette } from '@/theme/tokens';

export type Categoria = 'anotadores' | 'dados' | 'tiempo' | 'reaccion' | 'organizar';

export type Tool = {
  id: string;
  name: string;
  /** Una línea para la fila del catálogo. */
  sub: string;
  /** Palabra corta para la tarjeta de favoritos. */
  kicker: string;
  clay: ClayName;
  color: string;
  categoria: Categoria;
  /** null cuando el juego todavía no existe. */
  href: Href | null;
  /** Se ve en el catálogo pero apagado: llega en una etapa posterior. */
  pronto?: boolean;
};

export const CATEGORIAS: { value: Categoria; label: string }[] = [
  { value: 'anotadores', label: 'Anotadores' },
  { value: 'dados', label: 'Dados y azar' },
  { value: 'tiempo', label: 'Tiempo' },
  { value: 'reaccion', label: 'Reacción' },
  { value: 'organizar', label: 'Organizar' },
];

export const TOOLS: Tool[] = [
  {
    id: 'corazones',
    name: 'Corazones',
    sub: 'Pedidos, bazas y bonus',
    kicker: 'Anotador',
    clay: 'corazon',
    color: palette.mostaza,
    categoria: 'anotadores',
    href: '/nueva?kind=corazones',
  },
  {
    id: 'truco',
    name: 'Truco',
    sub: 'A 15 o a 30, con fósforos',
    kicker: 'Anotador',
    clay: 'cartaEspada',
    color: palette.salvia,
    categoria: 'anotadores',
    href: '/truco/nueva',
  },
  {
    id: 'generala',
    name: 'Generala',
    sub: 'Dados y planilla juntos',
    kicker: 'Anotador',
    clay: 'dado',
    color: palette.crema,
    categoria: 'anotadores',
    href: '/nueva?kind=generala',
  },
  {
    id: 'anotador',
    name: 'Anotador libre',
    sub: 'Puntos por ronda, cualquier juego',
    kicker: 'Libre',
    clay: 'lapiz',
    color: palette.rosa,
    categoria: 'anotadores',
    href: '/nueva?kind=anotador',
  },
  {
    id: 'dados',
    name: 'Dados',
    sub: 'De 4 a 20 caras, hasta 6',
    kicker: 'Azar',
    clay: 'dado',
    color: palette.tomate,
    categoria: 'dados',
    href: '/dados',
  },
  {
    id: 'reloj',
    name: 'Reloj',
    sub: 'Turnos con cuenta regresiva',
    kicker: 'Turnos',
    clay: 'relojArena',
    color: palette.crema,
    categoria: 'tiempo',
    href: '/reloj',
  },
  {
    id: 'pulsador',
    name: 'Pulsador',
    sub: 'El primero que toca gana',
    kicker: 'Rapidez',
    clay: 'pulsador',
    color: palette.salvia,
    categoria: 'reaccion',
    href: '/pulsador',
  },
  {
    id: 'equipos',
    name: 'Equipos',
    sub: 'Repartir jugadores al azar',
    kicker: 'Organizar',
    clay: 'esferas',
    color: palette.rosa,
    categoria: 'organizar',
    href: '/equipos',
  },
];

export const toolById = (id: string): Tool | undefined => TOOLS.find((t) => t.id === id);

export const labelOf = (categoria: Categoria): string =>
  CATEGORIAS.find((c) => c.value === categoria)?.label ?? '';

/** Los que ya se pueden jugar: el único conjunto que cuenta para favoritos. */
export const jugables = TOOLS.filter((t) => !t.pronto);
