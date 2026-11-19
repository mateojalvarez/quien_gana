// Generador de equipos con restricciones de "no pueden estar juntos".
//
// Repartir gente en k equipos sin que dos enemistados caigan juntos es colorear
// un grafo con k colores, con el agregado de que los equipos tienen que quedar
// parejos. Por eso NO se tira al azar y se reintenta: una combinación imposible
// haría girar la ruleta para siempre. Se hace una búsqueda con backtracking que
// recorre el espacio entero, así que cuando dice que no hay solución es porque
// la probó toda, no porque se cansó.

export type Persona = { id: string; name: string };
/** Par de ids que no pueden compartir equipo. */
export type Restriccion = { a: string; b: string };

export type Resultado =
  | { ok: true; equipos: Persona[][]; desbalanceado: boolean }
  | { ok: false; motivo: 'imposible'; detalle: string }
  | { ok: false; motivo: 'demasiado'; detalle: string };

/** Tope de nodos explorados. Con los tamaños de la app nunca se llega. */
const TOPE_NODOS = 2_000_000;

export const LIMITES = { minPersonas: 2, maxPersonas: 24, minEquipos: 2, maxEquipos: 6 } as const;

const clave = (a: string, b: string) => (a < b ? `${a}|${b}` : `${b}|${a}`);

/** Tamaños parejos: los primeros n%k equipos llevan uno más. */
export function tamanos(n: number, k: number): number[] {
  const base = Math.floor(n / k);
  const resto = n % k;
  return Array.from({ length: k }, (_, i) => base + (i < resto ? 1 : 0));
}

function mezclar<T>(xs: T[]): T[] {
  const out = xs.slice();
  for (let i = out.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [out[i], out[j]] = [out[j], out[i]];
  }
  return out;
}

/**
 * Busca una asignación válida. `cupos` fija cuántos entran en cada equipo;
 * si es null, los equipos pueden quedar de cualquier tamaño (pero no vacíos).
 * Devuelve null si no existe ninguna.
 */
function buscar(
  gente: Persona[],
  enemigos: Map<string, Set<string>>,
  k: number,
  cupos: number[] | null,
): { equipos: number[]; agotado: boolean } | null {
  const n = gente.length;
  const asignado = new Array<number>(n).fill(-1);
  const usados = new Array<number>(k).fill(0);
  const indice = new Map(gente.map((p, i) => [p.id, i]));
  let nodos = 0;
  let agotado = false;

  // Los más conflictivos primero: podan antes y achican el árbol.
  const orden = gente
    .map((p, i) => i)
    .sort((x, y) => (enemigos.get(gente[y].id)?.size ?? 0) - (enemigos.get(gente[x].id)?.size ?? 0));

  function cabe(i: number, equipo: number): boolean {
    if (cupos && usados[equipo] >= cupos[equipo]) return false;
    for (const enemigo of enemigos.get(gente[i].id) ?? []) {
      const j = indice.get(enemigo);
      if (j !== undefined && asignado[j] === equipo) return false;
    }
    return true;
  }

  function paso(pos: number): boolean {
    if (++nodos > TOPE_NODOS) {
      agotado = true;
      return false;
    }
    if (pos === n) return true;
    const i = orden[pos];

    // Los equipos VACÍOS del mismo cupo son intercambiables: mandar a alguien
    // a uno o a otro da el mismo reparto, así que con probar el primero alcanza.
    // Ojo: esto vale sólo entre vacíos. Dos equipos con la misma cantidad pero
    // distinta gente no son lo mismo, y podarlos se comía soluciones válidas.
    const vaciosProbados = new Set<number>();
    for (let equipo = 0; equipo < k; equipo++) {
      if (usados[equipo] === 0) {
        const cupo = cupos ? cupos[equipo] : -1;
        if (vaciosProbados.has(cupo)) continue;
        vaciosProbados.add(cupo);
      }
      if (!cabe(i, equipo)) continue;
      asignado[i] = equipo;
      usados[equipo]++;
      if (paso(pos + 1)) return true;
      usados[equipo]--;
      asignado[i] = -1;
      if (agotado) return false;
    }
    return false;
  }

  if (paso(0)) return { equipos: asignado, agotado: false };
  return agotado ? { equipos: [], agotado: true } : null;
}

/**
 * El grupo más grande de gente enemistada entre sí toda contra toda. Si es más
 * grande que la cantidad de equipos, no hay forma: sirve para explicar por qué.
 */
function camarilla(gente: Persona[], enemigos: Map<string, Set<string>>): Persona[] {
  let mejor: Persona[] = [];
  const candidatos = gente.filter((p) => (enemigos.get(p.id)?.size ?? 0) > 0);

  function crecer(actual: Persona[], resto: Persona[]) {
    if (actual.length > mejor.length) mejor = actual.slice();
    for (let i = 0; i < resto.length; i++) {
      if (actual.length + resto.length - i <= mejor.length) return;
      const p = resto[i];
      if (actual.every((q) => enemigos.get(q.id)?.has(p.id))) {
        crecer([...actual, p], resto.slice(i + 1));
      }
    }
  }
  crecer([], candidatos);
  return mejor;
}

const lista = (nombres: string[]) =>
  nombres.length <= 1
    ? (nombres[0] ?? '')
    : `${nombres.slice(0, -1).join(', ')} y ${nombres[nombres.length - 1]}`;

export function armar(gente: Persona[], restricciones: Restriccion[], k: number): Resultado {
  if (gente.length < k) {
    return { ok: false, motivo: 'imposible', detalle: `Hay ${gente.length} participantes para ${k} equipos: falta gente.` };
  }

  const enemigos = new Map<string, Set<string>>();
  const ids = new Set(gente.map((p) => p.id));
  const pares = new Set<string>();
  for (const r of restricciones) {
    if (!ids.has(r.a) || !ids.has(r.b) || r.a === r.b) continue;
    if (pares.has(clave(r.a, r.b))) continue;
    pares.add(clave(r.a, r.b));
    if (!enemigos.has(r.a)) enemigos.set(r.a, new Set());
    if (!enemigos.has(r.b)) enemigos.set(r.b, new Set());
    enemigos.get(r.a)!.add(r.b);
    enemigos.get(r.b)!.add(r.a);
  }

  // Mezclar antes de buscar: así "Mezclar de nuevo" da repartos distintos
  // sin dejar de ser una búsqueda exacta.
  const barajada = mezclar(gente);

  // 1) Lo normal: equipos parejos.
  const parejo = buscar(barajada, enemigos, k, tamanos(barajada.length, k));
  if (parejo && !parejo.agotado) return salida(barajada, parejo.equipos, k, false);

  // 2) Si las restricciones no dejan emparejar, se prueba con tamaños libres
  //    antes de decir que no se puede.
  const libre = buscar(barajada, enemigos, k, null);
  if (libre && !libre.agotado) {
    const vacios = new Set(libre.equipos).size < k;
    if (!vacios) return salida(barajada, libre.equipos, k, true);
  }

  if (parejo?.agotado || libre?.agotado) {
    return { ok: false, motivo: 'demasiado', detalle: 'Son demasiadas combinaciones. Probá con menos restricciones.' };
  }

  // 3) No existe. Explicar por qué, con nombres. Se ordenan como los cargó el
  //    usuario: la búsqueda baraja, pero el mensaje tiene que leerse igual siempre.
  const orden = new Map(gente.map((p, i) => [p.id, i]));
  const grupo = camarilla(barajada, enemigos).sort((x, y) => orden.get(x.id)! - orden.get(y.id)!);
  if (grupo.length > k) {
    return {
      ok: false,
      motivo: 'imposible',
      detalle: `${lista(grupo.map((p) => p.name))} no pueden estar juntos entre sí, y hay ${k} equipos. Harían falta ${grupo.length}.`,
    };
  }
  return {
    ok: false,
    motivo: 'imposible',
    detalle: `Con esas restricciones no hay forma de repartir ${gente.length} participantes en ${k} equipos.`,
  };
}

function salida(gente: Persona[], asignado: number[], k: number, desbalanceado: boolean): Resultado {
  const equipos: Persona[][] = Array.from({ length: k }, () => []);
  gente.forEach((p, i) => equipos[asignado[i]].push(p));
  return { ok: true, equipos, desbalanceado };
}

/** Si mover a alguien a otro equipo rompe una restricción, con quién. */
export function choca(persona: Persona, destino: Persona[], restricciones: Restriccion[]): Persona[] {
  const pares = new Set(restricciones.map((r) => clave(r.a, r.b)));
  return destino.filter((otro) => pares.has(clave(persona.id, otro.id)));
}
