// El sorteo del amigo invisible.

export type Exclusion = { a: string; b: string };

/** Fisher-Yates con el CSPRNG: Math.random es predecible y acá eso importa. */
function mezclar<T>(xs: T[]): T[] {
  const a = [...xs];
  for (let i = a.length - 1; i > 0; i--) {
    const j = crypto.getRandomValues(new Uint32Array(1))[0] % (i + 1);
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

/**
 * Devuelve quién le regala a quién, respetando que nadie se saque a sí mismo
 * ni a alguien de su lista de exclusiones.
 *
 * Mezclar y rechazar: es uniforme sobre todos los repartos válidos (≈2,7
 * intentos de promedio sin exclusiones). Sattolo resolvería en una pasada sin
 * reintentos, pero sólo genera permutaciones cíclicas —no es uniforme— y no
 * sabe de exclusiones. Con los tamaños de la app, rechazar sale gratis.
 */
export function sortear(ids: string[], exclusiones: Exclusion[], maxIntentos = 5000): Map<string, string> {
  const prohibido = new Map<string, Set<string>>(ids.map((id) => [id, new Set([id])]));
  for (const { a, b } of exclusiones) {
    // Simétrico: se guarda una fila sola y acá se lee para los dos lados.
    prohibido.get(a)?.add(b);
    prohibido.get(b)?.add(a);
  }

  for (let intento = 0; intento < maxIntentos; intento++) {
    const destinos = mezclar(ids);
    if (ids.every((dador, i) => !prohibido.get(dador)!.has(destinos[i]))) {
      return new Map(ids.map((dador, i) => [dador, destinos[i]]));
    }
  }
  // Pasa de verdad: cuatro personas con dos parejas excluidas no tiene solución.
  throw new Error('sin_solucion');
}
