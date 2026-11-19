// Generala. Los puntajes viven acá y en ningún otro lado.

export type Categoria =
  | 'uno' | 'dos' | 'tres' | 'cuatro' | 'cinco' | 'seis'
  | 'escalera' | 'full' | 'poker' | 'generala' | 'doble';

/** Los cinco dados de una tirada. */
export type Dados = number[];

/**
 * `name` es el de la planilla, donde la columna es angosta y el número alcanza.
 * `largo` es el que se lee en las sugerencias: "Cincos" se entiende, "5" no.
 */
export const CATEGORIAS: { id: Categoria; name: string; largo: string; singular: string; hint: string }[] = [
  { id: 'uno', name: '1', largo: 'Unos', singular: 'uno', hint: '' },
  { id: 'dos', name: '2', largo: 'Doses', singular: 'dos', hint: '' },
  { id: 'tres', name: '3', largo: 'Treses', singular: 'tres', hint: '' },
  { id: 'cuatro', name: '4', largo: 'Cuatros', singular: 'cuatro', hint: '' },
  { id: 'cinco', name: '5', largo: 'Cincos', singular: 'cinco', hint: '' },
  { id: 'seis', name: '6', largo: 'Seises', singular: 'seis', hint: '' },
  { id: 'escalera', name: 'Escalera', largo: 'Escalera', singular: 'escalera', hint: '20/25' },
  { id: 'full', name: 'Full', largo: 'Full', singular: 'full', hint: '30/35' },
  { id: 'poker', name: 'Póker', largo: 'Póker', singular: 'póker', hint: '40/45' },
  { id: 'generala', name: 'Generala', largo: 'Generala', singular: 'generala', hint: '50' },
  { id: 'doble', name: 'Doble', largo: 'Doble generala', singular: 'doble', hint: '100' },
];

export const RULES = {
  dados: 5,
  caras: 6,
  tiros: 3,
  /** Sin servir / servida en el primer tiro. */
  escalera: [20, 25],
  full: [30, 35],
  poker: [40, 45],
  /** La generala vale lo mismo servida o no: servida gana la partida. */
  generala: 50,
  doble: 100,
} as const;

export const rondas = CATEGORIAS.length; // 11

const NUMEROS = { uno: 1, dos: 2, tres: 3, cuatro: 4, cinco: 5, seis: 6 } as const;
type CatNumero = keyof typeof NUMEROS;
/** Separar las de número deja el switch exhaustivo: si se suma una categoría, el compilador avisa. */
const esNumero = (c: Categoria): c is CatNumero => c in NUMEROS;

/** Cuántas veces salió cada cara. `cuentas([4,4,4,2,2])[4] === 3`. */
export function cuentas(dados: Dados): number[] {
  const c = new Array<number>(RULES.caras + 1).fill(0);
  for (const d of dados) if (d >= 1 && d <= RULES.caras) c[d]++;
  return c;
}

/**
 * Escaleras válidas en la generala argentina. La tercera lleva el 1 después
 * del 6, que es la que suele olvidarse.
 */
const ESCALERAS = [
  [1, 2, 3, 4, 5],
  [2, 3, 4, 5, 6],
  [3, 4, 5, 6, 1],
];

export const esEscalera = (dados: Dados): boolean => {
  const orden = [...dados].sort((a, b) => a - b).join(',');
  return ESCALERAS.some((e) => [...e].sort((a, b) => a - b).join(',') === orden);
};

export const esFull = (dados: Dados): boolean => {
  const c = cuentas(dados).filter((n) => n > 0).sort((a, b) => b - a);
  // cinco iguales también es full: sirve para no desperdiciar una generala
  return (c[0] === 3 && c[1] === 2) || c[0] === 5;
};

export const esPoker = (dados: Dados): boolean => cuentas(dados).some((n) => n >= 4);
export const esGenerala = (dados: Dados): boolean => cuentas(dados).some((n) => n === 5);

/**
 * Lo que vale anotar estos dados en esa categoría. Cero si no se cumple:
 * anotar igual es válido, vale cero y gasta la categoría.
 * `servida` = salió en el primer tiro, sin volver a tirar.
 */
export function puntaje(cat: Categoria, dados: Dados, servida: boolean): number {
  const i = servida ? 1 : 0;
  if (esNumero(cat)) {
    const cara = NUMEROS[cat];
    return cuentas(dados)[cara] * cara;
  }
  switch (cat) {
    case 'escalera':
      return esEscalera(dados) ? RULES.escalera[i] : 0;
    case 'full':
      return esFull(dados) ? RULES.full[i] : 0;
    case 'poker':
      return esPoker(dados) ? RULES.poker[i] : 0;
    case 'generala':
      return esGenerala(dados) ? RULES.generala : 0;
    case 'doble':
      return esGenerala(dados) ? RULES.doble : 0;
  }
}

/** Una celda de la planilla. `cruzada` es tachada a mano: vale cero. */
export type Anotacion = { puntos: number; servida: boolean; cruzada: boolean };
/** categoría → anotación, por jugador. */
export type Planilla = Partial<Record<Categoria, Anotacion>>;

export const usada = (p: Planilla, cat: Categoria) => p[cat] !== undefined;

export const total = (p: Planilla): number =>
  CATEGORIAS.reduce((suma, c) => suma + (p[c.id]?.puntos ?? 0), 0);

export const libres = (p: Planilla): Categoria[] => CATEGORIAS.filter((c) => !usada(p, c.id)).map((c) => c.id);

/**
 * La doble sólo se puede anotar si ya se hizo la generala: si no, se estaría
 * cobrando cien puntos por la primera.
 */
export function anotable(p: Planilla, cat: Categoria): boolean {
  if (usada(p, cat)) return false;
  if (cat === 'doble') return (p.generala?.puntos ?? 0) > 0;
  return true;
}

export type Sugerencia = {
  cat: Categoria;
  name: string;
  puntos: number;
  /** Por qué da eso, en una línea. */ 
  detalle: string;
  mejor: boolean;
};

const palabra = ['Ningún', 'Un', 'Dos', 'Tres', 'Cuatro', 'Cinco'];

function detalleDe(cat: Categoria, dados: Dados, servida: boolean, puntos: number): string {
  if (esNumero(cat)) {
    const n = cuentas(dados)[NUMEROS[cat]];
    const meta = CATEGORIAS.find((c) => c.id === cat)!;
    // "Tres cuatros", "Un seis", "Ningún dos"
    return `${palabra[n]} ${n === 1 || n === 0 ? meta.singular : meta.largo.toLowerCase()}`;
  }
  if (puntos === 0) return 'No se cumple: anotarla la tacha';
  // Si salió servida ya está cobrada; si no, decir cuánto se perdió.
  const sinServir = { escalera: RULES.escalera, full: RULES.full, poker: RULES.poker }[
    cat as 'escalera' | 'full' | 'poker'
  ];
  if (!sinServir) return servida ? 'Servida' : '';
  return servida ? 'Servida' : `Servida habría valido ${sinServir[1]}`;
}

/**
 * Qué conviene anotar con estos dados. Ordenadas de más a menos puntos, y
 * sin las categorías ya usadas. La primera se marca como la mejor.
 */
export function sugerencias(p: Planilla, dados: Dados, servida: boolean, limite = 3): Sugerencia[] {
  const posibles = CATEGORIAS.filter((c) => anotable(p, c.id)).map((c) => {
    const puntos = puntaje(c.id, dados, servida);
    return {
      cat: c.id,
      name: c.largo,
      puntos,
      detalle: detalleDe(c.id, dados, servida, puntos),
      mejor: false,
    };
  });

  const ordenadas = posibles.sort((a, b) => b.puntos - a.puntos);
  // Sólo se ofrecen las que suman: para las que no, está "Tachar".
  const conPuntos = ordenadas.filter((s) => s.puntos > 0).slice(0, limite);
  if (conPuntos.length > 0) conPuntos[0].mejor = true;
  return conPuntos;
}

/** Generala en el primer tiro: gana la partida ahí mismo. */
export const generalaServida = (dados: Dados, servida: boolean) => servida && esGenerala(dados);

/** Quién va ganando, de mayor a menor. */
export function posiciones(
  jugadores: { id: string; name: string }[],
  planillas: Record<string, Planilla>,
): { id: string; name: string; total: number }[] {
  return jugadores
    .map((j) => ({ id: j.id, name: j.name, total: total(planillas[j.id] ?? {}) }))
    .sort((a, b) => b.total - a.total);
}

/** La partida termina cuando todos llenaron las once categorías. */
export function terminada(jugadores: { id: string }[], planillas: Record<string, Planilla>): boolean {
  return jugadores.every((j) => libres(planillas[j.id] ?? {}).length === 0);
}

/** Tira los dados que no están fijos. */
export function tirar(dados: Dados, fijos: boolean[]): Dados {
  return Array.from({ length: RULES.dados }, (_, i) =>
    fijos[i] && dados[i] ? dados[i] : 1 + Math.floor(Math.random() * RULES.caras),
  );
}
