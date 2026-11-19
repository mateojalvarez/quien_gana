// Ruleta de premios: todo lo que no es dibujo ni animación.
//
// La regla de oro de una ruleta es que el premio que canta el cartel sea el
// que quedó bajo la aguja. Por eso acá va al revés de lo intuitivo: PRIMERO se
// elige el ganador y DESPUÉS se calcula a qué ángulo tiene que frenar la rueda
// para que ese sector quede arriba. Girar al azar y después leer dónde cayó
// parece lo mismo, pero deja la puerta abierta a que un redondeo pinte un
// premio y cante otro — justo cuando todos están mirando.

export type Premio = { id: string; name: string };

export const LIMITES = { minPremios: 2, maxPremios: 20 } as const;

/** Vueltas enteras antes de frenar: menos de cuatro no se siente una ruleta. */
const VUELTAS = { min: 4, max: 6 } as const;

/** 0 grados es arriba (las 12), donde está la aguja, y se crece en sentido horario. */
export const normalizar = (grados: number): number => ((grados % 360) + 360) % 360;

/** Arranque y fin de cada sector en la rueda sin rotar. */
export function sectores(total: number): { desde: number; hasta: number }[] {
  const paso = 360 / total;
  return Array.from({ length: total }, (_, i) => ({ desde: i * paso, hasta: (i + 1) * paso }));
}

/** El ganador. Separado para poder fijarlo en las pruebas. */
export function sortear(total: number, rnd: () => number = Math.random): number {
  return Math.min(total - 1, Math.floor(rnd() * total));
}

/**
 * Ángulo (en grados, acumulado) al que tiene que llegar la rueda para que el
 * sector `i` quede bajo la aguja. `desde` es el ángulo actual: el resultado
 * siempre es mayor, así la rueda nunca pega el volantazo para atrás entre una
 * tirada y la siguiente.
 */
export function anguloDestino(i: number, total: number, desde: number, rnd: () => number = Math.random): number {
  const paso = 360 / total;
  // Un respiro contra los bordes: frenar justo en la línea entre dos premios
  // se ve como un error aunque no lo sea.
  const margen = Math.min(paso * 0.2, 6);
  const dentro = margen + rnd() * (paso - 2 * margen);
  const objetivo = normalizar(-(i * paso + dentro));
  const vueltas = VUELTAS.min + Math.floor(rnd() * (VUELTAS.max - VUELTAS.min + 1));
  // Primer ángulo ≥ `desde` que deja el sector arriba, más las vueltas de gracia.
  const base = Math.ceil((desde - objetivo) / 360) * 360 + objetivo;
  return base + vueltas * 360;
}

/** Qué sector quedó bajo la aguja con la rueda rotada `angulo`. Inversa de la de arriba. */
export function premioEnAguja(angulo: number, total: number): number {
  const paso = 360 / total;
  return Math.min(total - 1, Math.floor(normalizar(-angulo) / paso));
}
