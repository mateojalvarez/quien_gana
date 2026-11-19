// Pruebas de la resolución de una ronda del pulsador.  npm test
//
// Esto decide quién gana, que es todo el juego, y se ejecuta con datos que en
// la cancha no se pueden reproducir: dos toques separados por 9 ms no se
// repiten a mano. Si algo acá se rompe, en la pantalla se ve como una
// injusticia y no como un error.

import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { marginMs, rank, resolveRound, TIE_MS, type Tap } from './logic.ts';

const T = (...pares: [string, number][]): Tap[] => pares.map(([playerId, t]) => ({ playerId, t }));
/** La cola como texto, para poder compararla de un vistazo: 'a|b c' = a, después b y c empatados. */
const cola = (q: ReturnType<typeof rank>) => q.map((g) => g.playerIds.join(' ')).join('|');

describe('orden de los toques', () => {
  it('ordena por hora y no por orden de llegada', () => {
    // Llegan al revés de como se tocaron: es exactamente lo que pasa cuando
    // uno tiene peor señal que el otro.
    assert.equal(cola(rank(T(['lu', 500], ['teo', 100], ['caro', 300]))), 'teo|caro|lu');
  });

  it('a cada jugador le vale su primer toque', () => {
    // Apretar como un demente no mejora ni empeora: cuenta el primero.
    assert.equal(cola(rank(T(['teo', 200], ['teo', 100], ['teo', 150], ['lu', 180]))), 'teo|lu');
  });

  it('agrupa como empate lo que cae dentro de la ventana', () => {
    assert.equal(cola(rank(T(['teo', 0], ['lu', TIE_MS - 1]))), 'teo lu');
    assert.equal(cola(rank(T(['teo', 0], ['lu', TIE_MS]))), 'teo lu', 'el borde empata');
    assert.equal(cola(rank(T(['teo', 0], ['lu', TIE_MS + 1]))), 'teo|lu');
  });

  it('una fila de toques cercanos no encadena a todos en un empate único', () => {
    // Cada uno está a 20 ms del anterior, pero el último está a 60 del primero.
    // Comparar contra el anterior haría un solo empate de cuatro, que es falso.
    assert.equal(cola(rank(T(['a', 0], ['b', 20], ['c', 40], ['d', 60]))), 'a b|c d');
  });

  it('sin toques, cola vacía', () => {
    assert.deepEqual(rank([]), []);
  });
});

describe('modo libre', () => {
  it('no descalifica a nadie, no hay señal que adelantar', () => {
    const res = resolveRound('r1', T(['teo', 100], ['lu', 900]), { mode: 'libre', goAt: 500 });
    assert.deepEqual(res.fouls, []);
    assert.equal(cola(res.queue), 'teo|lu');
    assert.equal(res.roundId, 'r1');
  });
});

describe('modo con señal', () => {
  const goAt = 1000;

  it('el que se adelanta queda afuera', () => {
    const res = resolveRound('r1', T(['teo', 980], ['lu', 1100]), { mode: 'senal', goAt });
    assert.deepEqual(res.fouls, ['teo']);
    assert.equal(cola(res.queue), 'lu');
  });

  it('adelantarse descalifica la ronda entera, aunque después toque bien', () => {
    // Si el segundo toque valiera, adelantarse sería gratis: tocás por las
    // dudas y si te pasás, tocás de nuevo.
    const res = resolveRound('r1', T(['teo', 900], ['teo', 1010], ['lu', 1100]), { mode: 'senal', goAt });
    assert.deepEqual(res.fouls, ['teo']);
    assert.equal(cola(res.queue), 'lu');
  });

  it('el toque exacto en la señal es válido', () => {
    const res = resolveRound('r1', T(['teo', goAt]), { mode: 'senal', goAt });
    assert.deepEqual(res.fouls, []);
    assert.equal(cola(res.queue), 'teo');
  });

  it('si se adelantaron todos, nadie gana', () => {
    const res = resolveRound('r1', T(['teo', 800], ['lu', 900]), { mode: 'senal', goAt });
    assert.deepEqual(res.fouls.sort(), ['lu', 'teo']);
    assert.deepEqual(res.queue, []);
  });

  it('sin goAt se comporta como libre', () => {
    const res = resolveRound('r1', T(['teo', 100]), { mode: 'senal', goAt: null });
    assert.deepEqual(res.fouls, []);
    assert.equal(cola(res.queue), 'teo');
  });
});

describe('ventaja del ganador', () => {
  it('es la distancia al escalón siguiente, no al toque siguiente', () => {
    assert.equal(marginMs(rank(T(['teo', 0], ['lu', 10], ['caro', 400]))), 400);
  });

  it('redondea a milisegundos enteros', () => {
    assert.equal(marginMs(rank(T(['teo', 0], ['lu', 100.4]))), 100);
  });

  it('con un solo escalón no hay ventaja que mostrar', () => {
    assert.equal(marginMs(rank(T(['teo', 0], ['lu', 5]))), null);
    assert.equal(marginMs([]), null);
  });
});
