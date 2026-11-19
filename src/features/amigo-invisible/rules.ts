// Validación de la lista antes de sortear. Es puro: la misma cuenta la repite
// la Edge Function, porque el cliente no manda y el servidor no confía.

export type Candidato = { id: string; name: string; email: string };

export const LIMITES = {
  /**
   * Tres no alcanza: el anfitrión que sabe a quién le tocó a él deduce el
   * resto con certeza. Con cuatro ya hay dudas, y recién con cinco o seis el
   * secreto se sostiene de verdad.
   */
  min: 4,
  /** Lo que entra en los ~150 s que dura una Edge Function. */
  max: 60,
  /** Debajo de esto el reparto se adivina demasiado fácil: la UI avisa. */
  comodo: 6,
} as const;

/**
 * No se intenta validar un mail "de verdad" con una expresión: eso no existe.
 * Alcanza con descartar los errores de tipeo obvios — sin arroba, sin punto,
 * con espacios — y dejar que el rebote resuelva el resto.
 */
export const emailValido = (s: string): boolean => /^[^@\s]+@[^@\s]+\.[^@\s]{2,}$/.test(s.trim());

export const normalizarEmail = (s: string): string => s.trim().toLowerCase();

export type Problema = { ok: true } | { ok: false; detalle: string };

export function validar(gente: Candidato[]): Problema {
  if (gente.length < LIMITES.min) {
    return { ok: false, detalle: `Hacen falta al menos ${LIMITES.min} participantes.` };
  }
  if (gente.length > LIMITES.max) {
    return { ok: false, detalle: `Son demasiados: el máximo es ${LIMITES.max}.` };
  }

  const sinNombre = gente.find((p) => !p.name.trim());
  if (sinNombre) return { ok: false, detalle: 'Hay alguien sin nombre.' };

  const malo = gente.find((p) => !emailValido(p.email));
  if (malo) return { ok: false, detalle: `El correo de ${malo.name.trim()} no parece un correo.` };

  const mails = new Set<string>();
  for (const p of gente) {
    const m = normalizarEmail(p.email);
    if (mails.has(m)) return { ok: false, detalle: `${p.email.trim()} está cargado dos veces.` };
    mails.add(m);
  }

  const nombres = new Set<string>();
  for (const p of gente) {
    const n = p.name.trim().toLowerCase();
    // Dos "Juan" en la lista no rompen nada, pero el mail que reciben los
    // demás sería ambiguo y arruina el regalo.
    if (nombres.has(n)) return { ok: false, detalle: `Hay dos personas que se llaman ${p.name.trim()}.` };
    nombres.add(n);
  }

  return { ok: true };
}
