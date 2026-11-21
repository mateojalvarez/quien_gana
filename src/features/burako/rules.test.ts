// Pruebas del anotador de Burako.  npm test

import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import type { BurakoRound } from '../types.ts';
import { armarParejas, ganador, ladoVacio, puntosLado, puntosRonda, standings } from './rules.ts';

const players = [
  { id: 'a', name: 'Ana' },
  { id: 'b', name: 'Beto' },
  { id: 'c', name: 'Caro' },
];

const ronda = (corto: string | null, lados: BurakoRound['lados']): BurakoRound => ({ corto, lados });

describe('puntos de una ronda', () => {
  it('suma canastas, corte y fichas', () => {
    // 1 pura + 2 impuras + corte + 85 de fichas
    assert.equal(puntosLado({ puras: 1, impuras: 2, fichas: 85, sinMuerto: false }, true), 200 + 200 + 100 + 85);
  });

  it('las fichas pueden dar negativo', () => {
    assert.equal(puntosLado({ puras: 0, impuras: 0, fichas: -120, sinMuerto: false }, false), -120);
  });

  it('no levantar el muerto resta 100', () => {
    assert.equal(puntosLado({ ...ladoVacio(), fichas: -40, sinMuerto: true }, false), -140);
  });

  it('sólo el lado que cortó cobra el corte', () => {
    const r = ronda('a', { a: ladoVacio(), b: ladoVacio() });
    assert.equal(puntosRonda(r, 'a'), 100);
    assert.equal(puntosRonda(r, 'b'), 0);
  });

  it('un lado sin cargar vale 0', () => {
    assert.equal(puntosRonda(ronda(null, {}), 'c'), 0);
  });
});

describe('ganador', () => {
  it('nadie gana antes de la meta', () => {
    const g = { players, target: 3000, rounds: [ronda('a', { a: { puras: 5, impuras: 0, fichas: 0, sinMuerto: false } })] };
    assert.equal(ganador(g), null);
    assert.deepEqual(
      standings(g).map((s) => s.player.id),
      ['a', 'b', 'c'],
    );
  });

  it('gana el de más puntos entre los que pasaron la meta', () => {
    const g = {
      players,
      target: 1000,
      rounds: [
        ronda('b', {
          a: { puras: 5, impuras: 0, fichas: 50, sinMuerto: false }, // 1050
          b: { puras: 5, impuras: 1, fichas: 0, sinMuerto: false }, // 1200
        }),
      ],
    };
    assert.equal(ganador(g)?.id, 'b');
  });

  it('con empate arriba se sigue jugando', () => {
    const g = {
      players,
      target: 1000,
      rounds: [
        ronda(null, {
          a: { puras: 5, impuras: 0, fichas: 0, sinMuerto: false },
          b: { puras: 5, impuras: 0, fichas: 0, sinMuerto: false },
        }),
      ],
    };
    assert.equal(ganador(g), null);
  });
});

describe('parejas', () => {
  it('se arman enfrentados: 1.º y 3.º contra 2.º y 4.º', () => {
    assert.deepEqual(armarParejas(['Ana', 'Beto', 'Caro', 'Dani']), [
      ['Ana', 'Caro'],
      ['Beto', 'Dani'],
    ]);
  });
});
