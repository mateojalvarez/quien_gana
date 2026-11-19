// Pruebas de la ruleta. Node 25 ejecuta TypeScript directo:  npm test
//
// Lo que se prueba acá no es decorado: el bug clásico de una ruleta es que el
// cartel cante un premio distinto al que quedó bajo la aguja. `premioEnAguja`
// es la lectura independiente del dibujo, y tiene que coincidir siempre con el
// ganador que eligió `sortear`.

import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { anguloDestino, normalizar, premioEnAguja, sectores, sortear } from './rules.ts';

/** Generador reproducible: las pruebas no pueden depender de Math.random. */
function rnd(semilla: number): () => number {
  let s = semilla >>> 0;
  return () => {
    s = (s * 1664525 + 1013904223) >>> 0;
    return s / 0x100000000;
  };
}

describe('sectores', () => {
  it('cubre los 360 grados sin huecos ni solapes', () => {
    for (const total of [2, 3, 5, 7, 12, 20]) {
      const s = sectores(total);
      assert.equal(s.length, total);
      assert.equal(s[0].desde, 0);
      assert.ok(Math.abs(s[total - 1].hasta - 360) < 1e-9, 'no cierra en 360');
      for (let i = 1; i < total; i++) {
        assert.ok(Math.abs(s[i].desde - s[i - 1].hasta) < 1e-9, `hueco en el sector ${i}`);
      }
    }
  });
});

describe('el ángulo de frenado deja arriba al ganador', () => {
  it('para cualquier cantidad de premios y cualquier ganador', () => {
    const r = rnd(7);
    for (const total of [2, 3, 4, 5, 6, 8, 11, 13, 20]) {
      for (let i = 0; i < total; i++) {
        const destino = anguloDestino(i, total, 0, r);
        assert.equal(premioEnAguja(destino, total), i, `total ${total}, ganador ${i}`);
      }
    }
  });

  it('también después de muchas tiradas encadenadas', () => {
    const r = rnd(99);
    const total = 9;
    let angulo = 0;
    for (let tirada = 0; tirada < 200; tirada++) {
      const ganador = sortear(total, r);
      const destino = anguloDestino(ganador, total, angulo, r);
      assert.equal(premioEnAguja(destino, total), ganador, `tirada ${tirada}`);
      angulo = destino;
    }
  });
});

describe('la rueda nunca gira para atrás', () => {
  it('el destino siempre supera al ángulo actual, y por varias vueltas', () => {
    const r = rnd(123);
    let angulo = 0;
    for (let i = 0; i < 300; i++) {
      const destino = anguloDestino(sortear(6, r), 6, angulo, r);
      assert.ok(destino > angulo, 'frenó antes de donde estaba');
      assert.ok(destino - angulo >= 4 * 360, 'giró menos de cuatro vueltas');
      angulo = destino;
    }
  });
});

describe('no frena pegada al borde entre dos premios', () => {
  it('deja al menos un margen dentro del sector', () => {
    const r = rnd(2024);
    const total = 10;
    const paso = 360 / total;
    for (let i = 0; i < 500; i++) {
      const ganador = sortear(total, r);
      const destino = anguloDestino(ganador, total, 0, r);
      const dentro = normalizar(-destino) - ganador * paso;
      assert.ok(dentro > 1 && dentro < paso - 1, `frenó a ${dentro}° del borde`);
    }
  });
});

describe('sortear', () => {
  it('siempre devuelve un índice válido y cubre todos los premios', () => {
    const r = rnd(5);
    const total = 8;
    const vistos = new Set<number>();
    for (let i = 0; i < 2000; i++) {
      const g = sortear(total, r);
      assert.ok(Number.isInteger(g) && g >= 0 && g < total, `índice fuera de rango: ${g}`);
      vistos.add(g);
    }
    assert.equal(vistos.size, total, 'hay premios que nunca salen');
  });

  it('no se pasa de rango aunque el generador devuelva 1', () => {
    assert.equal(sortear(5, () => 1), 4);
  });
});
