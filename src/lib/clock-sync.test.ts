// Pruebas del ajuste de reloj entre teléfonos.  npm test
//
// De acá sale el `offset` con el que se traduce cada toque a la hora del
// anfitrión. Un error de signo o una mediana mal tomada no se ve en la
// pantalla: se ve como que ganó el que no tocó primero.

import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { ClockSync, quality, solve, type Sample } from './clock-sync.ts';

const S = (...pares: [number, number][]): Sample[] => pares.map(([rtt, offset]) => ({ rtt, offset }));

describe('estimación del offset', () => {
  it('sin muestras no inventa nada', () => {
    assert.equal(solve([]), null);
  });

  it('con una muestra usa esa', () => {
    const e = solve(S([40, 1000]))!;
    assert.equal(e.offset, 1000);
    assert.equal(e.samples, 1);
    assert.equal(e.uncertainty, 20);
  });

  it('descarta las muestras lentas, que son las que mienten', () => {
    // Las tres rápidas coinciden en 100. La lenta dice 900 y hay que ignorarla:
    // en un RTT de 800 ms el offset puede errarle por 400.
    const e = solve(S([20, 100], [24, 102], [28, 98], [800, 900]))!;
    assert.ok(Math.abs(e.offset - 100) <= 2, `offset arrastrado por la muestra lenta: ${e.offset}`);
  });

  it('la cota de error es la mitad del mejor RTT visto', () => {
    assert.equal(solve(S([100, 0], [30, 0], [60, 0]))!.uncertainty, 15);
  });

  it('informa cuántas muestras tiene, no cuántas usó', () => {
    assert.equal(solve(S([10, 0], [20, 0], [30, 0], [40, 0]))!.samples, 4);
  });

  it('un offset negativo sobrevive: el invitado puede ir adelantado', () => {
    assert.equal(solve(S([20, -5000]))!.offset, -5000);
  });
});

describe('calidad que se muestra en la sala', () => {
  const e = (uncertainty: number, samples = 8) => ({ offset: 0, rtt: 0, uncertainty, samples });

  it('sin estimación, midiendo', () => {
    assert.equal(quality(null), 'midiendo');
  });

  it('con menos de tres muestras todavía no se pronuncia', () => {
    assert.equal(quality(e(1, 2)), 'midiendo');
    assert.equal(quality(e(1, 3)), 'buena');
  });

  it('los escalones caen donde dicen', () => {
    assert.equal(quality(e(25)), 'buena');
    assert.equal(quality(e(26)), 'justa');
    assert.equal(quality(e(60)), 'justa');
    assert.equal(quality(e(61)), 'mala');
  });
});

describe('el ida y vuelta de los pings', () => {
  it('un pong de un id que no pedimos no entra', () => {
    const cs = new ClockSync(() => {});
    assert.equal(cs.onPong('fantasma', Date.now()), false);
    assert.equal(cs.estimate, null);
  });

  it('un pong repetido no cuenta dos veces', () => {
    let id = '';
    const cs = new ClockSync((p) => (id = p));
    cs.ping();
    assert.equal(cs.onPong(id, Date.now()), true);
    assert.equal(cs.onPong(id, Date.now()), false, 'el duplicado entró igual');
    assert.equal(cs.estimate!.samples, 1);
  });

  it('traduce a la hora del anfitrión sumando el offset', () => {
    let id = '';
    const cs = new ClockSync((p) => (id = p));
    cs.ping();
    // El anfitrión está un minuto adelantado: su reloj marca ahora + 60 s.
    cs.onPong(id, Date.now() + 60_000);
    const off = cs.estimate!.offset;
    assert.ok(Math.abs(off - 60_000) < 500, `offset esperado ~60000, vino ${off}`);
    assert.equal(cs.toHost(1_000), 1_000 + off);
  });

  it('sin medir todavía, traducir no mueve nada', () => {
    // Importa que sea la identidad y no un número raro: `tap` se apoya en que
    // el anfitrión (que nunca mide) pueda usar su propio reloj tal cual.
    const cs = new ClockSync(() => {});
    assert.equal(cs.toHost(1234), 1234);
  });

  it('volver de segundo plano borra lo medido', () => {
    let id = '';
    const cs = new ClockSync((p) => (id = p));
    cs.ping();
    cs.onPong(id, Date.now());
    assert.ok(cs.estimate);
    cs.reset();
    assert.equal(cs.estimate, null);
    assert.equal(cs.onPong(id, Date.now()), false, 'un pong viejo revivió después del reset');
  });
});
