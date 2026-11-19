/**
 * Sincronización de reloj entre teléfonos, estilo NTP, sobre el canal de la sala.
 *
 * El reloj de referencia es el del anfitrión, no el del servidor: Realtime no
 * expone un sello de tiempo confiable por mensaje, y el anfitrión ya es el
 * árbitro de la ronda.
 *
 * Cada muestra sale de un ping/pong:
 *   t0    = salida   (reloj del invitado)
 *   tHost = recepción (reloj del anfitrión)
 *   t1    = vuelta   (reloj del invitado)
 *
 *   rtt    = t1 - t0
 *   offset = tHost - (t0 + t1) / 2
 *
 * El offset asume que la ida y la vuelta tardan lo mismo. Ese supuesto es el
 * que se rompe cuando la red está cargada, y el error que mete es a lo sumo la
 * mitad del RTT. Por eso descartamos las muestras lentas y nos quedamos con la
 * mediana de las buenas: el mejor RTT observado es nuestra cota de error.
 */

export type Sample = { offset: number; rtt: number };

export type Estimate = {
  /** Sumar al reloj local para obtener la hora del anfitrión. */
  offset: number;
  /** RTT representativo de las muestras buenas. */
  rtt: number;
  /** Cota de error del offset: la mitad del mejor RTT visto. */
  uncertainty: number;
  samples: number;
};

/** Muestras del handshake inicial. */
export const SAMPLE_GOAL = 8;
/** Ventana deslizante: las viejas se caen solas y absorben la deriva. */
const WINDOW = 12;
/** Una muestra sin respuesta se da por perdida. */
export const PING_TIMEOUT_MS = 3000;

const median = (xs: number[]): number => {
  const s = [...xs].sort((a, b) => a - b);
  const m = s.length >> 1;
  return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2;
};

/** Mediana del mejor 50% de las muestras por RTT. Puro, para poder probarlo. */
export function solve(samples: Sample[]): Estimate | null {
  if (!samples.length) return null;
  const byRtt = [...samples].sort((a, b) => a.rtt - b.rtt);
  const best = byRtt.slice(0, Math.max(1, Math.ceil(byRtt.length / 2)));
  return {
    offset: median(best.map((s) => s.offset)),
    rtt: median(best.map((s) => s.rtt)),
    uncertainty: byRtt[0].rtt / 2,
    samples: samples.length,
  };
}

/** Calidad legible para la pantalla de sala. */
export function quality(e: Estimate | null): 'midiendo' | 'buena' | 'justa' | 'mala' {
  if (!e || e.samples < 3) return 'midiendo';
  if (e.uncertainty <= 25) return 'buena';
  if (e.uncertainty <= 60) return 'justa';
  return 'mala';
}

/**
 * Lleva las muestras de un invitado contra el anfitrión.
 * No sabe nada de Realtime: recibe un `send` y le avisan los pong.
 */
export class ClockSync {
  private pending = new Map<string, number>();
  private samples: Sample[] = [];
  private seq = 0;
  // Campo explícito y no propiedad de parámetro: el `node --test` de las
  // pruebas sólo borra tipos, no transforma, y ahí `constructor(private …)`
  // no carga.
  private readonly send: (pingId: string) => void;
  estimate: Estimate | null = null;

  constructor(send: (pingId: string) => void) {
    this.send = send;
  }

  ping() {
    const id = `p${++this.seq}`;
    this.pending.set(id, Date.now());
    this.send(id);
    setTimeout(() => this.pending.delete(id), PING_TIMEOUT_MS);
  }

  /** Devuelve true si la muestra entró (sirve para encadenar el handshake). */
  onPong(id: string, tHost: number): boolean {
    const t0 = this.pending.get(id);
    if (t0 === undefined) return false;
    this.pending.delete(id);
    const t1 = Date.now();
    this.samples.push({ rtt: t1 - t0, offset: tHost - (t0 + t1) / 2 });
    if (this.samples.length > WINDOW) this.samples.shift();
    this.estimate = solve(this.samples);
    return true;
  }

  /** Hora del anfitrión según este teléfono. */
  toHost(localMs: number): number {
    return localMs + (this.estimate?.offset ?? 0);
  }

  /** Tras un rato en segundo plano el offset ya no vale: se mide de nuevo. */
  reset() {
    this.samples = [];
    this.pending.clear();
    this.estimate = null;
  }
}
