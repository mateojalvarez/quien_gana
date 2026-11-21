// Catálogo único de juegos: antes vivía como un array local en el hub.
// Lo comparten Inicio (favoritos y frecuentes) y la pestaña Juegos.
// Los ids son claves estables: los favoritos y el conteo de aperturas se guardan por id.

import type { Href } from 'expo-router';

import type { ClayName } from '@/components/clay';
import { palette } from '@/theme/tokens';

export type Categoria = 'anotadores' | 'torneos' | 'dados' | 'tiempo' | 'reaccion' | 'sorteos';

export type Tool = {
  id: string;
  name: string;
  /** Una línea para la fila del catálogo. */
  sub: string;
  /** Palabra corta para la tarjeta de favoritos. */
  kicker: string;
  /** Lo que hace el botón de su fila: en Equipos no se "juega", se genera. */
  cta: string;
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
  { value: 'torneos', label: 'Torneos' },
  { value: 'dados', label: 'Dados y azar' },
  { value: 'tiempo', label: 'Tiempo' },
  { value: 'reaccion', label: 'Reacción' },
  { value: 'sorteos', label: 'Sorteos' },
];

export const TOOLS: Tool[] = [
  {
    id: 'corazones',
    name: 'Corazones',
    sub: 'Pedidos, bazas y bonus',
    kicker: 'Anotador',
    cta: 'Anotar',
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
    cta: 'Anotar',
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
    cta: 'Anotar',
    clay: 'generala',
    color: palette.crema,
    categoria: 'anotadores',
    href: '/nueva?kind=generala',
  },
  {
    id: 'burako',
    name: 'Burako',
    sub: 'Canastas, corte y fichas, a 3000',
    kicker: 'Anotador',
    cta: 'Anotar',
    clay: 'esferas',
    color: palette.tomate,
    categoria: 'anotadores',
    href: '/nueva?kind=burako',
  },
  {
    id: 'calaveras',
    name: 'Calaveras y piratas',
    sub: 'Pedidos, bazas y bonus piratas',
    kicker: 'Anotador',
    cta: 'Anotar',
    clay: 'abanicoCartas',
    color: palette.salvia,
    categoria: 'anotadores',
    href: '/nueva?kind=calaveras',
  },
  {
    id: 'anotador',
    name: 'Anotador libre',
    sub: 'Puntos por ronda, cualquier juego',
    kicker: 'Libre',
    cta: 'Anotar',
    clay: 'lapiz',
    color: palette.rosa,
    categoria: 'anotadores',
    href: '/nueva?kind=anotador',
  },
  {
    id: 'torneo',
    name: 'Torneo',
    sub: 'Liga, grupos o playoff, con bombos',
    kicker: 'Torneo',
    cta: 'Armar',
    clay: 'trofeo',
    color: palette.mostaza,
    categoria: 'torneos',
    href: '/torneo/nuevo',
  },
  {
    id: 'dados',
    name: 'Dados',
    sub: 'De 4 a 20 caras, hasta 6',
    kicker: 'Azar',
    cta: 'Tirar',
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
    cta: 'Arrancar',
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
    cta: 'Jugar',
    clay: 'pulsador',
    color: palette.salvia,
    categoria: 'reaccion',
    href: '/pulsador',
  },
  {
    id: 'equipos',
    name: 'Equipos',
    sub: 'Generar equipos al azar',
    kicker: 'Sorteo',
    cta: 'Generar',
    clay: 'esferas',
    color: palette.rosa,
    categoria: 'sorteos',
    href: '/equipos',
  },
  {
    id: 'ruleta',
    name: 'Ruleta',
    sub: 'Cargá premios y girá',
    kicker: 'Sorteo',
    cta: 'Girar',
    clay: 'destello',
    color: palette.tomate,
    categoria: 'sorteos',
    href: '/ruleta',
  },
  {
    id: 'amigo-invisible',
    name: 'Amigo invisible',
    sub: 'Por correo, secreto hasta para vos',
    kicker: 'Sorteo',
    cta: 'Sortear',
    clay: 'regalo',
    color: palette.salvia,
    categoria: 'sorteos',
    href: '/amigo-invisible',
  },
];

export const toolById = (id: string): Tool | undefined => TOOLS.find((t) => t.id === id);

export const labelOf = (categoria: Categoria): string =>
  CATEGORIAS.find((c) => c.value === categoria)?.label ?? '';

/** Los que ya se pueden jugar: el único conjunto que cuenta para favoritos. */
export const jugables = TOOLS.filter((t) => !t.pronto);
