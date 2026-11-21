// Lógica pura del generador de torneos: sorteo de equipos por estrellas,
// fixture todos contra todos, grupos con cabezas de serie, cuadro de playoff
// (con byes e ida y vuelta), tablas con desempates y el avance del torneo.
//
// Sin imports de runtime: las pruebas corren con `node --test` directo sobre
// este archivo. El azar entra por parámetro (`rng`) para poder fijarlo.

import type {
  DatosTorneo,
  EquipoAsignado,
  EquipoFC,
  FiltroEquipos,
  Formato,
  Llave,
  Partido,
  Participante,
} from './types';

export type Rng = () => number;

export const LIMITES = { minParticipantes: 2, maxParticipantes: 64, maxBombos: 6, maxGrupos: 16 } as const;

/** Azar reproducible a partir de una semilla (LCG): mismo número, mismo sorteo. */
export function rngDeSemilla(semilla: number): Rng {
  let s = semilla >>> 0;
  return () => {
    s = (Math.imul(s, 1664525) + 1013904223) >>> 0;
    return s / 4294967296;
  };
}

export const nuevaSemilla = () => Math.floor(Math.random() * 4294967296);

export function mezclar<T>(xs: readonly T[], rng: Rng = Math.random): T[] {
  const out = xs.slice();
  for (let i = out.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [out[i], out[j]] = [out[j], out[i]];
  }
  return out;
}

/** Tamaños parejos: los primeros n%k llevan uno más. */
export function tamanos(n: number, k: number): number[] {
  const base = Math.floor(n / k);
  const resto = n % k;
  return Array.from({ length: k }, (_, i) => base + (i < resto ? 1 : 0));
}

// ─── Estrellas ────────────────────────────────────────────────────────────────

/**
 * Las estrellas se calculan por percentil sobre el catálogo vigente, no con
 * cortes de OVR fijos: si EA corre la escala entre ediciones, la proporción
 * de equipos 5★, 4.5★, … se mantiene.
 */
const CORTES: [estrellas: number, acumulado: number][] = [
  [5, 0.03],
  [4.5, 0.08],
  [4, 0.16],
  [3.5, 0.28],
  [3, 0.42],
  [2.5, 0.58],
  [2, 0.74],
  [1.5, 0.86],
  [1, 0.95],
  [0.5, 1],
];

export type Umbral = { estrellas: number; minOvr: number };

export function umbralesEstrellas(ovrs: number[]): Umbral[] {
  if (ovrs.length === 0) return [];
  const orden = ovrs.slice().sort((a, b) => b - a);
  return CORTES.map(([estrellas, acumulado]) => {
    const i = Math.max(0, Math.min(orden.length - 1, Math.ceil(acumulado * orden.length) - 1));
    return { estrellas, minOvr: orden[i] };
  });
}

export function estrellasDe(ovr: number, umbrales: Umbral[]): number {
  for (const u of umbrales) if (ovr >= u.minOvr) return u.estrellas;
  return 0.5;
}

export const ESTRELLAS_POSIBLES = CORTES.map(([e]) => e);

/**
 * `ligas` sólo recorta clubes: las selecciones no tienen liga real, así que
 * con "Todos" siguen entrando aunque se elijan ligas.
 */
export function filtrarCatalogo(equipos: EquipoFC[], filtro: FiltroEquipos, ligas?: readonly string[] | null): EquipoFC[] {
  const conLiga = ligas ? new Set(ligas) : null;
  return equipos.filter((e) => {
    if (filtro === 'selecciones' && !e.esSeleccion) return false;
    if (filtro === 'clubes' && e.esSeleccion) return false;
    if (conLiga && !e.esSeleccion && !conLiga.has(e.liga)) return false;
    return true;
  });
}

/** Ligas de clubes del catálogo con su cantidad de equipos: Argentina primero, después las más grandes. */
export function ligasDelCatalogo(equipos: EquipoFC[]): { liga: string; equipos: number }[] {
  const cuenta = new Map<string, number>();
  for (const e of equipos) if (!e.esSeleccion) cuenta.set(e.liga, (cuenta.get(e.liga) ?? 0) + 1);
  const peso = (l: string) => (l.startsWith('Argentina') ? 0 : l.startsWith('CONMEBOL') ? 1 : 2);
  return [...cuenta]
    .map(([liga, n]) => ({ liga, equipos: n }))
    .sort((a, b) => peso(a.liga) - peso(b.liga) || b.equipos - a.equipos || a.liga.localeCompare(b.liga));
}

/**
 * Saca `cantidad` equipos distintos con esas estrellas. Si no alcanzan, abre
 * de a media estrella para arriba y para abajo y avisa con `ampliado`.
 */
export function sortearEquipos(
  catalogo: EquipoFC[],
  umbrales: Umbral[],
  estrellas: number,
  cantidad: number,
  excluir: ReadonlySet<string> = new Set(),
  rng: Rng = Math.random,
): { equipos: EquipoAsignado[]; ampliado: boolean } {
  const disponibles = catalogo
    .filter((e) => !excluir.has(e.id))
    .map((e) => ({ e, estrellas: estrellasDe(e.ovr, umbrales) }));

  let delta = 0;
  let pool = disponibles.filter((x) => x.estrellas === estrellas);
  while (pool.length < cantidad && delta < 5) {
    delta += 0.5;
    pool = disponibles.filter((x) => Math.abs(x.estrellas - estrellas) <= delta);
  }
  // Los de la estrella pedida primero; el resto sólo completa.
  const exactos = mezclar(pool.filter((x) => x.estrellas === estrellas), rng);
  const cercanos = mezclar(pool.filter((x) => x.estrellas !== estrellas), rng).sort(
    (a, b) => Math.abs(a.estrellas - estrellas) - Math.abs(b.estrellas - estrellas),
  );
  const elegidos = [...exactos, ...cercanos].slice(0, cantidad);
  return {
    equipos: elegidos.map(({ e, estrellas: s }) => ({ id: e.id, nombre: e.nombre, ovr: e.ovr, estrellas: s })),
    ampliado: delta > 0,
  };
}

/** Empareja al azar participantes con equipos. El orden de salida es el orden del sorteo. */
export function matchear<T>(participantes: string[], equipos: T[], rng: Rng = Math.random): { participante: string; equipo: T }[] {
  const ps = mezclar(participantes, rng);
  const es = mezclar(equipos, rng);
  return ps.slice(0, es.length).map((participante, i) => ({ participante, equipo: es[i] }));
}

// ─── Parejas ────────────────────────────────────────────────────────────────

export type ReglasParejas = {
  /** Van juntos sí o sí. */
  fijas: [string, string][];
  /** No pueden quedar juntos. */
  prohibidas: [string, string][];
  /** Los fuertes: cada pareja lleva uno, mientras alcancen los no-cabeza. */
  cabezas: string[];
};

export const SIN_REGLAS: ReglasParejas = { fijas: [], prohibidas: [], cabezas: [] };

const clavePar = (a: string, b: string) => (a < b ? `${a}|${b}` : `${b}|${a}`);

/**
 * Arma parejas al azar respetando las reglas. Con cantidad impar queda uno
 * `suelto`. Devuelve null si las reglas no tienen solución (o si la búsqueda
 * se pasa de un tope: con 64 personas y reglas absurdas no vale colgar la app).
 *
 * Cabezas: se mezclan cabeza con no-cabeza todo lo posible; si sobran de un
 * lado, esos se juntan entre sí.
 */
export function sortearParejas(
  ids: readonly string[],
  reglas: ReglasParejas = SIN_REGLAS,
  rng: Rng = Math.random,
): { parejas: [string, string][]; suelto: string | null } | null {
  const presentes = new Set(ids);
  const usados = new Set<string>();
  const fijas: [string, string][] = [];
  for (const [a, b] of reglas.fijas) {
    if (a === b || !presentes.has(a) || !presentes.has(b) || usados.has(a) || usados.has(b)) continue;
    fijas.push([a, b]);
    usados.add(a).add(b);
  }
  const prohibidas = new Set(reglas.prohibidas.map(([a, b]) => clavePar(a, b)));
  if (fijas.some(([a, b]) => prohibidas.has(clavePar(a, b)))) return null;

  const cabezas = new Set(reglas.cabezas);
  const resto = mezclar(
    ids.filter((id) => !usados.has(id)),
    rng,
  );
  const libres = new Set(resto);
  const parejas: [string, string][] = [];
  let suelto: string | null = null;
  let pasos = 0;
  const TOPE = 50_000;

  const contar = () => {
    let cab = 0;
    for (const id of libres) if (cabezas.has(id)) cab++;
    return { cab, non: libres.size - cab };
  };

  const buscar = (): boolean => {
    if (++pasos > TOPE) return false;
    if (libres.size === 0) return true;
    // El más difícil primero: el que menos compañeros posibles tiene.
    const { cab, non } = contar();
    const vale = (x: string, y: string) => {
      if (prohibidas.has(clavePar(x, y))) return false;
      if (cabezas.size === 0) return true;
      const cx = cabezas.has(x);
      const cy = cabezas.has(y);
      if (cx !== cy) return true;
      return cx ? cab > non : non > cab;
    };
    let x: string | null = null;
    let opciones: string[] = [];
    for (const id of libres) {
      const ops = [...libres].filter((y) => y !== id && vale(id, y));
      if (x === null || ops.length < opciones.length) {
        x = id;
        opciones = ops;
      }
    }
    if (x === null) return true;
    libres.delete(x);
    for (const y of mezclar(opciones, rng)) {
      libres.delete(y);
      parejas.push([x, y]);
      if (buscar()) return true;
      parejas.pop();
      libres.add(y);
    }
    // Impar: uno se queda sin pareja (sólo uno).
    if (suelto === null && libres.size % 2 === 0) {
      suelto = x;
      if (buscar()) return true;
      suelto = null;
    }
    libres.add(x);
    return false;
  };

  if (!buscar()) return null;
  return { parejas: [...fijas, ...parejas], suelto };
}

// ─── Todos contra todos ─────────────────────────────────────────────────────

/**
 * Método del círculo: n-1 fechas (n si es impar, con uno libre por fecha),
 * cada par se cruza una vez. A dos ruedas, la segunda espeja la primera.
 */
export function roundRobin(ids: string[], idaVuelta: boolean): [string, string][][] {
  if (ids.length < 2) return [];
  const lista: (string | null)[] = ids.length % 2 === 0 ? ids.slice() : [...ids, null];
  const n = lista.length;
  const fechas: [string, string][][] = [];
  for (let r = 0; r < n - 1; r++) {
    const fecha: [string, string][] = [];
    for (let i = 0; i < n / 2; i++) {
      const a = lista[i];
      const b = lista[n - 1 - i];
      if (a === null || b === null) continue;
      // Alternar la localía del fijo para que nadie sea siempre local.
      fecha.push(i === 0 && r % 2 === 1 ? [b, a] : [a, b]);
    }
    fechas.push(fecha);
    // rotar todos menos el primero
    lista.splice(1, 0, lista.pop()!);
  }
  if (!idaVuelta) return fechas;
  return [...fechas, ...fechas.map((f) => f.map(([a, b]) => [b, a] as [string, string]))];
}

function partidosRoundRobin(
  ids: string[],
  idaVuelta: boolean,
  etapa: 'liga' | 'grupo',
  grupo?: number,
): Partido[] {
  const fechas = roundRobin(ids, idaVuelta);
  const mitad = idaVuelta ? fechas.length / 2 : fechas.length;
  const prefijo = etapa === 'liga' ? 'L' : `G${grupo}`;
  return fechas.flatMap((fecha, ronda) =>
    fecha.map(([local, visitante], k) => ({
      id: `${prefijo}-${ronda}-${k}`,
      etapa,
      ...(grupo !== undefined ? { grupo } : {}),
      ronda,
      pierna: (ronda < mitad ? 1 : 2) as 1 | 2,
      local,
      visitante,
      gl: null,
      gv: null,
    })),
  );
}

// ─── Grupos ─────────────────────────────────────────────────────────────────

/** Ordena por bombo (1 primero) y mezcla dentro de cada bombo. */
export function ordenPorBombo(participantes: Participante[], rng: Rng = Math.random): Participante[] {
  const bombos = [...new Set(participantes.map((p) => p.bombo))].sort((a, b) => a - b);
  return bombos.flatMap((b) => mezclar(participantes.filter((p) => p.bombo === b), rng));
}

/**
 * Bombo por bombo, a cada grupo le toca uno: el bombo 1 pone las cabezas de
 * serie. `orden` es la secuencia del sorteo, para mostrarlo de a uno.
 */
export function armarGrupos(
  participantes: Participante[],
  cantidad: number,
  rng: Rng = Math.random,
): { grupos: string[][]; orden: { participante: string; grupo: number }[] } {
  const grupos: string[][] = Array.from({ length: cantidad }, () => []);
  const orden: { participante: string; grupo: number }[] = [];
  const lista = ordenPorBombo(participantes, rng);
  for (let i = 0; i < lista.length; i += cantidad) {
    const fila = lista.slice(i, i + cantidad);
    const destinos = mezclar(
      grupos.map((_, g) => g),
      rng,
    )
      .sort((a, b) => grupos[a].length - grupos[b].length)
      .slice(0, fila.length);
    fila.forEach((p, k) => {
      grupos[destinos[k]].push(p.id);
      orden.push({ participante: p.id, grupo: destinos[k] });
    });
  }
  return { grupos, orden };
}

export const letraGrupo = (g: number) => String.fromCharCode(65 + g);

// ─── Playoff ────────────────────────────────────────────────────────────────

const potencia = (n: number) => {
  let p = 1;
  while (p < n) p *= 2;
  return p;
};

/** Posiciones de siembra: 1 y 2 sólo se cruzan en la final. Para 8: 1,8,4,5,2,7,3,6. */
export function ordenSiembra(p: number): number[] {
  let orden = [1];
  while (orden.length < p) {
    const m = orden.length * 2;
    orden = orden.flatMap((x) => [x, m + 1 - x]);
  }
  return orden;
}

export function rondasPlayoff(m: number): number {
  return m < 2 ? 0 : Math.log2(potencia(m));
}

export function nombreRonda(ronda: number, total: number): string {
  const faltan = total - 1 - ronda;
  return ['Final', 'Semifinal', 'Cuartos de final', 'Octavos de final', '16avos de final'][faltan] ?? `Ronda ${ronda + 1}`;
}

/** Cuántos partidos se juegan en una ronda del cuadro (las llaves por bye no juegan). */
export function piernasDeRonda(formato: Formato, ronda: number, total: number): 1 | 2 {
  if (!formato.playoffIdaVuelta) return 1;
  return ronda === total - 1 && formato.finalUnica ? 1 : 2;
}

/**
 * Arma todas las llaves del cuadro. `sembrados` va del mejor al peor; si
 * sobran lugares, los mejores pasan directo. `grupoDe` evita, si se puede,
 * que dos del mismo grupo se crucen en la primera ronda.
 */
export function crearCuadro(sembrados: string[], grupoDe?: Map<string, number>): Llave[] {
  const m = sembrados.length;
  if (m < 2) return [];
  const p = potencia(m);
  const orden = ordenSiembra(p);
  const llaves: Llave[] = [];

  const primera: Llave[] = [];
  for (let pos = 0; pos < p / 2; pos++) {
    const s1 = orden[2 * pos];
    const s2 = orden[2 * pos + 1];
    const [mejor, peor] = s1 < s2 ? [s1, s2] : [s2, s1];
    const a = sembrados[mejor - 1];
    const b = peor <= m ? sembrados[peor - 1] : null;
    primera.push({ id: `P-0-${pos}`, ronda: 0, pos, a, b, bye: b === null });
  }

  if (grupoDe) {
    const choca = (l: Llave) => l.b !== null && l.a !== null && grupoDe.get(l.a) === grupoDe.get(l.b);
    for (const l of primera) {
      if (!choca(l)) continue;
      const otra = primera.find(
        (o) =>
          o !== l &&
          !o.bye &&
          grupoDe.get(l.a!) !== grupoDe.get(o.b!) &&
          grupoDe.get(o.a!) !== grupoDe.get(l.b!),
      );
      if (otra) [l.b, otra.b] = [otra.b, l.b];
    }
  }
  llaves.push(...primera, ...rondasSiguientes(p));
  return llaves;
}

/** Las llaves vacías de la segunda ronda en adelante. */
function rondasSiguientes(p: number): Llave[] {
  const llaves: Llave[] = [];
  const total = Math.log2(p);
  for (let ronda = 1; ronda < total; ronda++) {
    const cantidad = p / 2 ** (ronda + 1);
    for (let pos = 0; pos < cantidad; pos++) {
      llaves.push({ id: `P-${ronda}-${pos}`, ronda, pos, a: null, b: null, bye: false });
    }
  }
  return llaves;
}

/**
 * Sorteo de cruces al pasar de grupos a playoff.
 *
 * `puestos[0]` son los 1° de cada grupo, `puestos[1]` los 2°, etc.
 *  · Un 1° nunca se cruza con otro 1° (salvo que haya más 1° que llaves).
 *  · Los 1° se reparten por el cuadro como cabezas de serie (siembra
 *    estándar): quedan en mitades y cuartos distintos, así no se cruzan
 *    entre ellos hasta lo más tarde posible.
 *  · Si sobran lugares, los byes son para los 1°.
 *  · En la primera ronda nadie se cruza con alguien de su propio grupo,
 *    siempre que exista una forma de lograrlo.
 * Dentro de esas reglas, todo es al azar.
 */
export function sortearCruces(puestos: string[][], grupoDe: Map<string, number>, rng: Rng = Math.random): Llave[] {
  const m = puestos.reduce((n, x) => n + x.length, 0);
  if (m < 2) return [];
  const p = potencia(m);
  const slots = p / 2;
  const orden = ordenSiembra(p);
  const byes = p - m;

  // Llave que encabeza cada cabeza de serie (1..slots), según la siembra estándar.
  const llaveDeSiembra: number[] = [];
  for (let pos = 0; pos < slots; pos++) llaveDeSiembra[Math.min(orden[2 * pos], orden[2 * pos + 1])] = pos;

  const primeros = mezclar(puestos[0] ?? [], rng);
  const cabezas = primeros.slice(0, slots);
  // Más 1° que llaves: los que sobran juegan como uno más (inevitable).
  const resto = [...primeros.slice(slots), ...puestos.slice(1).flatMap((x) => mezclar(x, rng))];

  const mismoGrupo = (a: string, b: string) => grupoDe.get(a) === grupoDe.get(b);

  const intentar = (respetarGrupos: boolean): Llave[] | null => {
    for (let intento = 0; intento < 60; intento++) {
      // Cabezas de lado A en las llaves de las siembras 1..k; los byes van a las mejores siembras.
      const a: (string | null)[] = Array(slots).fill(null);
      cabezas.forEach((id, i) => (a[llaveDeSiembra[i + 1]] = id));
      // El resto de los lados A: los de mejor puesto primero (resto ya viene por puesto),
      // con un poco de azar para que el cuadro no sea siempre igual.
      const pool = intento === 0 ? resto.slice() : mezclarPorPuesto(resto, puestos, rng);
      for (let siembra = cabezas.length + 1; siembra <= slots; siembra++) a[llaveDeSiembra[siembra]] = pool.shift() ?? null;

      const conBye = new Set<number>();
      for (let siembra = 1; siembra <= byes; siembra++) conBye.add(llaveDeSiembra[siembra]);

      const huecos = [...Array(slots).keys()].filter((pos) => !conBye.has(pos));
      const rivales = mezclar(pool, rng);
      const b: (string | null)[] = Array(slots).fill(null);

      // Backtracking: cada hueco toma un rival que no sea 1° contra 1° ni de su grupo.
      const usados = new Set<number>();
      const cabezaSet = new Set(cabezas);
      const ok = (pos: number, rival: string) => {
        const local = a[pos];
        if (!local) return true;
        if (cabezaSet.has(local) && cabezaSet.has(rival)) return false;
        return !respetarGrupos || !mismoGrupo(local, rival);
      };
      const llenar = (i: number): boolean => {
        if (i === huecos.length) return true;
        for (let j = 0; j < rivales.length; j++) {
          if (usados.has(j) || !ok(huecos[i], rivales[j])) continue;
          usados.add(j);
          b[huecos[i]] = rivales[j];
          if (llenar(i + 1)) return true;
          usados.delete(j);
        }
        return false;
      };
      if (!llenar(0)) continue;

      return a.map<Llave>((id, pos) => ({
        id: `P-0-${pos}`,
        ronda: 0,
        pos,
        a: id,
        b: b[pos],
        bye: b[pos] === null,
      }));
    }
    return null;
  };

  const primera = intentar(true) ?? intentar(false) ?? [];
  return [...primera, ...rondasSiguientes(p)];
}

/** Mezcla manteniendo el orden por puesto: todos los 2° (al azar) antes que los 3°, etc. */
function mezclarPorPuesto(ids: string[], puestos: string[][], rng: Rng): string[] {
  const puestoDe = new Map(puestos.flatMap((xs, i) => xs.map((id) => [id, i] as const)));
  const grupos = new Map<number, string[]>();
  for (const id of ids) {
    const k = puestoDe.get(id) ?? 99;
    grupos.set(k, [...(grupos.get(k) ?? []), id]);
  }
  return [...grupos.keys()].sort((x, y) => x - y).flatMap((k) => mezclar(grupos.get(k)!, rng));
}

function partidosDeLlave(l: Llave, piernas: 1 | 2): Partido[] {
  if (l.bye || !l.a || !l.b) return [];
  const ida: Partido = {
    id: `${l.id}-1`,
    etapa: 'playoff',
    ronda: l.ronda,
    llave: l.id,
    pierna: 1,
    local: l.a,
    visitante: l.b,
    gl: null,
    gv: null,
  };
  if (piernas === 1) return [ida];
  return [ida, { ...ida, id: `${l.id}-2`, pierna: 2, local: l.b, visitante: l.a }];
}

export const jugado = (p: Partido) => p.gl !== null && p.gv !== null;

/** Ganador de un partido suelto (desempate), con penales si empató. */
export function ganadorPartido(p: Partido): string | null {
  if (!jugado(p)) return null;
  if (p.gl! > p.gv!) return p.local;
  if (p.gv! > p.gl!) return p.visitante;
  if (p.penales && p.penales.l !== p.penales.v) return p.penales.l > p.penales.v ? p.local : p.visitante;
  return null;
}

export type ResultadoLlave = {
  ganador: string | null;
  /** Global de a y de b. */
  global: [number, number];
  /** Todos los partidos jugados y el global empatado: hacen falta penales. */
  faltanPenales: boolean;
  completa: boolean;
};

/** Global de la llave; si empata, la definen los penales del último partido. Sin gol de visitante. */
export function resultadoLlave(l: Llave, partidos: Partido[]): ResultadoLlave {
  if (l.bye) return { ganador: l.a, global: [0, 0], faltanPenales: false, completa: true };
  const propios = partidos.filter((p) => p.llave === l.id).sort((x, y) => x.pierna - y.pierna);
  if (!l.a || !l.b || propios.length === 0) return { ganador: null, global: [0, 0], faltanPenales: false, completa: false };
  let ga = 0;
  let gb = 0;
  for (const p of propios) {
    if (!jugado(p)) continue;
    ga += p.local === l.a ? p.gl! : p.gv!;
    gb += p.local === l.b ? p.gl! : p.gv!;
  }
  const completa = propios.every(jugado);
  if (!completa) return { ganador: null, global: [ga, gb], faltanPenales: false, completa };
  if (ga !== gb) return { ganador: ga > gb ? l.a : l.b, global: [ga, gb], faltanPenales: false, completa };
  const ultimo = propios[propios.length - 1];
  if (ultimo.penales && ultimo.penales.l !== ultimo.penales.v) {
    const ganaLocal = ultimo.penales.l > ultimo.penales.v;
    return { ganador: ganaLocal ? ultimo.local : ultimo.visitante, global: [ga, gb], faltanPenales: false, completa };
  }
  return { ganador: null, global: [ga, gb], faltanPenales: true, completa };
}

/** El partido que, al cargarse empatado, define la llave por penales. */
export function esUltimoDeLlave(p: Partido, partidos: Partido[]): boolean {
  if (p.etapa !== 'playoff') return p.etapa === 'desempate';
  const maxPierna = Math.max(...partidos.filter((q) => q.llave === p.llave).map((q) => q.pierna));
  return p.pierna === maxPierna;
}

/**
 * Si cargar `gl`-`gv` en `p` deja la llave empatada en el global (o el
 * desempate empatado), hay que pedir penales.
 */
export function pidePenales(p: Partido, gl: number, gv: number, datos: DatosTorneo): boolean {
  if (p.etapa === 'desempate') return gl === gv;
  if (p.etapa !== 'playoff' || !esUltimoDeLlave(p, datos.partidos)) return false;
  const llave = datos.llaves?.find((l) => l.id === p.llave);
  if (!llave) return false;
  const simulados = datos.partidos.map((q) => (q.id === p.id ? { ...q, gl, gv, penales: null } : q));
  return resultadoLlave(llave, simulados).faltanPenales;
}

// ─── Cantidad de partidos ───────────────────────────────────────────────────

export type Conteo = { total: number; detalle: { etiqueta: string; partidos: number }[] };

const rr = (k: number, idaVuelta: boolean) => ((k * (k - 1)) / 2) * (idaVuelta ? 2 : 1);

function conteoPlayoff(formato: Formato, m: number): Conteo['detalle'] {
  if (m < 2) return [];
  const p = potencia(m);
  const total = Math.log2(p);
  const detalle: Conteo['detalle'] = [];
  for (let ronda = 0; ronda < total; ronda++) {
    const llaves = ronda === 0 ? m - p / 2 : p / 2 ** (ronda + 1);
    const piernas = piernasDeRonda(formato, ronda, total);
    detalle.push({ etiqueta: nombreRonda(ronda, total) + (piernas === 2 ? ' (ida y vuelta)' : ''), partidos: llaves * piernas });
  }
  return detalle;
}

/** Se muestra antes de empezar: cuántos partidos va a tener el torneo. */
export function contarPartidos(formato: Formato, n: number): Conteo {
  let detalle: Conteo['detalle'] = [];
  if (formato.tipo === 'liga') {
    detalle = [{ etiqueta: formato.idaVuelta ? 'Liga (ida y vuelta)' : 'Liga', partidos: rr(n, formato.idaVuelta) }];
  } else if (formato.tipo === 'grupos') {
    const g = formato.grupos?.cantidad ?? 2;
    const q = formato.grupos?.clasificanPorGrupo ?? 2;
    const grupos = tamanos(n, g).reduce((s, k) => s + rr(k, formato.idaVuelta), 0);
    detalle = [
      { etiqueta: `Fase de grupos (${g} grupos${formato.idaVuelta ? ', ida y vuelta' : ''})`, partidos: grupos },
      ...conteoPlayoff(formato, g * q),
    ];
  } else {
    detalle = conteoPlayoff(formato, n);
  }
  detalle = detalle.filter((d) => d.partidos > 0);
  return { total: detalle.reduce((s, d) => s + d.partidos, 0), detalle };
}

/** null si el formato se puede jugar con n participantes; si no, por qué. */
export function validarFormato(formato: Formato, n: number): string | null {
  if (n < 2) return 'Hacen falta al menos 2 participantes.';
  if (formato.tipo !== 'grupos') return null;
  const g = formato.grupos?.cantidad ?? 0;
  const q = formato.grupos?.clasificanPorGrupo ?? 0;
  if (g < 2) return 'Hacen falta al menos 2 grupos.';
  const minimo = Math.min(...tamanos(n, g));
  if (minimo < 2) return `Con ${n} participantes no alcanza para ${g} grupos.`;
  if (q < 1) return 'Tiene que clasificar al menos 1 por grupo.';
  if (q >= minimo) return `Si clasifican ${q} por grupo, en los grupos de ${minimo} pasan todos.`;
  return null;
}

// ─── Tabla ──────────────────────────────────────────────────────────────────

export type Fila = {
  id: string;
  pj: number;
  g: number;
  e: number;
  p: number;
  gf: number;
  gc: number;
  dg: number;
  pts: number;
};

export type Empate = {
  /** `ambito:id1,id2,…` con ids ordenados: estable aunque cambie el orden de la tabla. */
  clave: string;
  ids: string[];
  /** Posición (desde 0) que ocupa el primero de los empatados. */
  desde: number;
  /** Grupo, si el empate es dentro de uno. */
  grupo?: number;
};

export const claveEmpate = (ambito: string, ids: string[]) => `${ambito}:${ids.slice().sort().join(',')}`;

/**
 * Puntos (3/1/0) → diferencia de gol → menos goles en contra. Si sigue igual,
 * vale lo que diga `desempates` (sorteo o partido desempate); si no hay nada,
 * queda en `empates` para que la pantalla ofrezca resolverlo.
 */
export function tabla(
  partidos: Partido[],
  ids: string[],
  desempates: Record<string, string[]> = {},
  ambito = 'liga',
  grupo?: number,
): { filas: Fila[]; empates: Empate[] } {
  const filas = new Map<string, Fila>(
    ids.map((id) => [id, { id, pj: 0, g: 0, e: 0, p: 0, gf: 0, gc: 0, dg: 0, pts: 0 }]),
  );
  for (const p of partidos) {
    if (!jugado(p)) continue;
    const l = filas.get(p.local);
    const v = filas.get(p.visitante);
    if (!l || !v) continue;
    l.pj++;
    v.pj++;
    l.gf += p.gl!;
    l.gc += p.gv!;
    v.gf += p.gv!;
    v.gc += p.gl!;
    if (p.gl! > p.gv!) {
      l.g++;
      v.p++;
      l.pts += 3;
    } else if (p.gl! < p.gv!) {
      v.g++;
      l.p++;
      v.pts += 3;
    } else {
      l.e++;
      v.e++;
      l.pts++;
      v.pts++;
    }
  }
  for (const f of filas.values()) f.dg = f.gf - f.gc;

  const igual = (a: Fila, b: Fila) => a.pts === b.pts && a.dg === b.dg && a.gc === b.gc;
  const base = [...filas.values()].sort(
    (a, b) => b.pts - a.pts || b.dg - a.dg || a.gc - b.gc || ids.indexOf(a.id) - ids.indexOf(b.id),
  );

  const salida: Fila[] = [];
  const empates: Empate[] = [];
  for (let i = 0; i < base.length; ) {
    let j = i + 1;
    while (j < base.length && igual(base[i], base[j])) j++;
    const bloque = base.slice(i, j);
    if (bloque.length > 1) {
      const clave = claveEmpate(ambito, bloque.map((f) => f.id));
      const orden = desempates[clave];
      if (orden) {
        bloque.sort((a, b) => orden.indexOf(a.id) - orden.indexOf(b.id));
      } else {
        empates.push({ clave, ids: bloque.map((f) => f.id), desde: i, ...(grupo !== undefined ? { grupo } : {}) });
      }
    }
    salida.push(...bloque);
    i = j;
  }
  return { filas: salida, empates };
}

// ─── Avance del torneo ──────────────────────────────────────────────────────

const etapaCompleta = (partidos: Partido[], etapa: 'liga' | 'grupo') =>
  partidos.filter((p) => p.etapa === etapa).every(jugado);

function tablaDeGrupo(datos: DatosTorneo, g: number) {
  const ids = datos.grupos?.[g] ?? [];
  return tabla(
    datos.partidos.filter((p) => p.etapa === 'grupo' && p.grupo === g),
    ids,
    datos.desempates,
    `g${g}`,
    g,
  );
}

export function tablaLiga(datos: DatosTorneo) {
  return tabla(
    datos.partidos.filter((p) => p.etapa === 'liga'),
    datos.participantes.map((p) => p.id),
    datos.desempates,
    'liga',
  );
}

export function tablasDeGrupos(datos: DatosTorneo) {
  return (datos.grupos ?? []).map((_, g) => tablaDeGrupo(datos, g));
}

/**
 * Empates que hay que resolver para seguir: sólo cuando la etapa terminó y el
 * empate importa (el primer puesto en liga; un puesto clasificatorio en grupos).
 */
export function empatesPendientes(datos: DatosTorneo): Empate[] {
  if (datos.formato.tipo === 'liga') {
    if (!etapaCompleta(datos.partidos, 'liga')) return [];
    return tablaLiga(datos).empates.filter((e) => e.desde === 0);
  }
  if (datos.formato.tipo === 'grupos' && !(datos.llaves && datos.llaves.length)) {
    if (!etapaCompleta(datos.partidos, 'grupo')) return [];
    const q = datos.formato.grupos?.clasificanPorGrupo ?? 2;
    return tablasDeGrupos(datos).flatMap((t) => t.empates.filter((e) => e.desde < q));
  }
  return [];
}

/** Clasificados por puesto: `puestos[0]` los 1° de cada grupo, `puestos[1]` los 2°, … */
function clasificados(datos: DatosTorneo): { puestos: string[][]; grupoDe: Map<string, number> } {
  const q = datos.formato.grupos?.clasificanPorGrupo ?? 2;
  const tablas = tablasDeGrupos(datos);
  const puestos: string[][] = [];
  const grupoDe = new Map<string, number>();
  for (let puesto = 0; puesto < q; puesto++) {
    puestos[puesto] = [];
    tablas.forEach((t, g) => {
      const f = t.filas[puesto];
      if (!f) return;
      puestos[puesto].push(f.id);
      grupoDe.set(f.id, g);
    });
  }
  return { puestos, grupoDe };
}

/** Los cruces de grupos → playoff se pueden volver a sortear hasta que se juegue algo del cuadro. */
export function puedeResortearCruces(datos: DatosTorneo): boolean {
  return (
    datos.formato.tipo === 'grupos' &&
    !!datos.llaves?.length &&
    !datos.partidos.some((p) => p.etapa === 'playoff' && jugado(p))
  );
}

export function resortearCruces<T extends DatosTorneo>(datos: T, semilla: number = nuevaSemilla()): T {
  if (!puedeResortearCruces(datos)) return datos;
  return avanzar({
    ...datos,
    llaves: [],
    partidos: datos.partidos.filter((p) => p.etapa !== 'playoff'),
    semillaCruces: semilla,
  });
}

/** Rellena las llaves con los ganadores de la ronda anterior y crea sus partidos. */
function propagar<T extends DatosTorneo>(datos: T): T {
  const llaves = (datos.llaves ?? []).map((l) => ({ ...l }));
  if (llaves.length === 0) return datos;
  let partidos = datos.partidos.slice();
  const total = Math.max(...llaves.map((l) => l.ronda)) + 1;

  // Primera ronda: los partidos se crean una sola vez.
  for (const l of llaves) {
    if (l.ronda !== 0) continue;
    if (!partidos.some((p) => p.llave === l.id)) partidos.push(...partidosDeLlave(l, piernasDeRonda(datos.formato, 0, total)));
  }

  for (let ronda = 1; ronda < total; ronda++) {
    for (const l of llaves.filter((x) => x.ronda === ronda)) {
      const previa = (pos: number) => llaves.find((x) => x.ronda === ronda - 1 && x.pos === pos)!;
      const a = resultadoLlave(previa(2 * l.pos), partidos).ganador;
      const b = resultadoLlave(previa(2 * l.pos + 1), partidos).ganador;
      if (a === l.a && b === l.b) {
        if (a && b && !partidos.some((p) => p.llave === l.id)) {
          partidos.push(...partidosDeLlave(l, piernasDeRonda(datos.formato, ronda, total)));
        }
        continue;
      }
      // Cambió quién llega (se corrigió un resultado): se rehacen sus partidos
      // si todavía no se jugaron. Si ya se jugaron, la pantalla no deja editar.
      const propios = partidos.filter((p) => p.llave === l.id);
      if (propios.some(jugado)) continue;
      partidos = partidos.filter((p) => p.llave !== l.id);
      l.a = a;
      l.b = b;
      if (a && b) partidos.push(...partidosDeLlave(l, piernasDeRonda(datos.formato, ronda, total)));
    }
  }
  return { ...datos, llaves, partidos };
}

function campeonDe(datos: DatosTorneo): string | null {
  if (datos.formato.tipo === 'liga') {
    if (!etapaCompleta(datos.partidos, 'liga') || empatesPendientes(datos).length) return null;
    return tablaLiga(datos).filas[0]?.id ?? null;
  }
  const llaves = datos.llaves ?? [];
  if (llaves.length === 0) return null;
  const total = Math.max(...llaves.map((l) => l.ronda));
  const final = llaves.find((l) => l.ronda === total && l.pos === 0)!;
  return resultadoLlave(final, datos.partidos).ganador;
}

/**
 * Se llama después de cada cambio: aplica los desempates jugados, arma el
 * playoff cuando terminan los grupos, avanza el cuadro y marca el campeón.
 */
export function avanzar<T extends DatosTorneo>(datos: T): T {
  let d: T = { ...datos, desempates: { ...(datos.desempates ?? {}) } };

  // 1) Desempates jugados → orden.
  for (const p of d.partidos) {
    if (p.etapa !== 'desempate' || !p.clave) continue;
    const ganador = ganadorPartido(p);
    if (ganador) d.desempates![p.clave] = [ganador, ganador === p.local ? p.visitante : p.local];
    else delete d.desempates![p.clave];
  }

  // 2) Fin de la fase de grupos → cuadro.
  if (
    d.formato.tipo === 'grupos' &&
    !(d.llaves && d.llaves.length) &&
    d.partidos.some((p) => p.etapa === 'grupo') &&
    etapaCompleta(d.partidos, 'grupo') &&
    empatesPendientes(d).length === 0
  ) {
    // Sorteo de cruces. La semilla queda guardada: el cuadro es el mismo en
    // todos los dispositivos y no cambia al recalcular.
    const semilla = d.semillaCruces ?? nuevaSemilla();
    const { puestos, grupoDe } = clasificados(d);
    d = { ...d, semillaCruces: semilla, llaves: sortearCruces(puestos, grupoDe, rngDeSemilla(semilla)) };
  }

  // 3) Cuadro.
  d = propagar(d);

  // 4) Campeón.
  if (d.fase !== 'sorteo') {
    const campeon = campeonDe(d);
    d = { ...d, campeon, fase: campeon ? 'terminado' : 'en-juego' };
  }
  return d;
}

/** Arma el fixture una vez hechos los sorteos. */
export function iniciar<T extends DatosTorneo>(datos: T, rng: Rng = Math.random): T {
  const d: T = { ...datos, partidos: [], llaves: [], desempates: {}, campeon: null, semillaCruces: null, fase: 'en-juego' };
  const { formato } = d;
  if (formato.tipo === 'liga') {
    d.partidos = partidosRoundRobin(mezclar(d.participantes.map((p) => p.id), rng), formato.idaVuelta, 'liga');
  } else if (formato.tipo === 'grupos') {
    const grupos = d.grupos ?? armarGrupos(d.participantes, formato.grupos?.cantidad ?? 2, rng).grupos;
    d.grupos = grupos;
    d.partidos = grupos.flatMap((ids, g) => partidosRoundRobin(mezclar(ids, rng), formato.idaVuelta, 'grupo', g));
  } else {
    d.llaves = crearCuadro(ordenPorBombo(d.participantes, rng).map((p) => p.id));
  }
  return avanzar(d);
}

/** Se puede cargar o corregir el resultado sin romper lo que vino después. */
export function puedeEditar(datos: DatosTorneo, p: Partido): boolean {
  const hayCuadro = !!(datos.llaves && datos.llaves.length);
  if (p.etapa === 'grupo') return !(datos.formato.tipo === 'grupos' && hayCuadro);
  if (p.etapa === 'desempate') return !(p.grupo !== undefined && hayCuadro);
  if (p.etapa === 'liga') return true;
  const llave = datos.llaves?.find((l) => l.id === p.llave);
  if (!llave) return false;
  const siguiente = datos.llaves?.find((l) => l.ronda === llave.ronda + 1 && l.pos === llave.pos >> 1);
  if (!siguiente) return true;
  return !datos.partidos.some((q) => q.llave === siguiente.id && jugado(q));
}

/** Carga (o borra, con null) un resultado y avanza. */
export function cargarResultado<T extends DatosTorneo>(
  datos: T,
  partidoId: string,
  gl: number | null,
  gv: number | null,
  penales: { l: number; v: number } | null = null,
): T {
  const partidos = datos.partidos.map((p) => (p.id === partidoId ? { ...p, gl, gv, penales } : p));
  return avanzar({ ...datos, partidos });
}

export function resolverPorSorteo<T extends DatosTorneo>(datos: T, empate: Empate, rng: Rng = Math.random): T {
  const partidos = datos.partidos.filter((p) => !(p.etapa === 'desempate' && p.clave === empate.clave && !jugado(p)));
  return avanzar({
    ...datos,
    partidos,
    desempates: { ...(datos.desempates ?? {}), [empate.clave]: mezclar(empate.ids, rng) },
  });
}

/** Partido desempate: sólo entre dos. */
export function crearDesempate<T extends DatosTorneo>(datos: T, empate: Empate): T {
  if (empate.ids.length !== 2) return datos;
  if (datos.partidos.some((p) => p.etapa === 'desempate' && p.clave === empate.clave)) return datos;
  const partido: Partido = {
    id: `D-${empate.clave}`,
    etapa: 'desempate',
    ...(empate.grupo !== undefined ? { grupo: empate.grupo } : {}),
    ronda: 0,
    clave: empate.clave,
    pierna: 1,
    local: empate.ids[0],
    visitante: empate.ids[1],
    gl: null,
    gv: null,
  };
  return { ...datos, partidos: [...datos.partidos, partido] };
}

/** Para la tarjeta de Inicio: en qué anda el torneo. */
export function resumen(datos: DatosTorneo): { etapa: string; jugados: number; total: number } {
  const total = datos.partidos.length;
  const jugados = datos.partidos.filter(jugado).length;
  if (datos.fase === 'sorteo') return { etapa: 'Sorteo', jugados, total };
  if (datos.fase === 'terminado') return { etapa: 'Terminado', jugados, total };
  if (datos.llaves && datos.llaves.length) {
    const rondas = Math.max(...datos.llaves.map((l) => l.ronda)) + 1;
    const pendiente = datos.partidos.find((p) => p.etapa === 'playoff' && !jugado(p));
    return { etapa: pendiente ? nombreRonda(pendiente.ronda, rondas) : 'Playoff', jugados, total };
  }
  return { etapa: datos.formato.tipo === 'grupos' ? 'Fase de grupos' : 'Liga', jugados, total };
}

/** Nombre a mostrar de un participante, con su equipo si tiene. */
export function nombreDe(datos: DatosTorneo, id: string | null): string {
  if (!id) return 'A definir';
  return datos.participantes.find((p) => p.id === id)?.nombre ?? '—';
}
