// Pruebas del anotador de Calaveras y piratas.  npm test

import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import type { CalaverasRound } from '../types.ts';
import { bazasEsperadas, bonusActivos, emptyRound, roundScore, standings } from './rules.ts';

const BASE = { edicionNueva: false, expansion: false };
const NUEVA = { edicionNueva: true, expansion: false };
const TODO = { edicionNueva: true, expansion: true };

const r = (parcial: Partial<CalaverasRound>): CalaverasRound => ({ ...emptyRound(), ...parcial });

describe('pedido mayor a cero', () => {
  it('acertar paga 20 por baza', () => {
    assert.equal(roundScore(r({ bids: { a: 3 }, tricks: { a: 3 } }), 'a', 5, BASE), 60);
  });

  it('fallar resta 10 por baza de diferencia, para arriba o para abajo', () => {
    assert.equal(roundScore(r({ bids: { a: 3 }, tricks: { a: 1 } }), 'a', 5, BASE), -20);
    assert.equal(roundScore(r({ bids: { a: 1 }, tricks: { a: 4 } }), 'a', 5, BASE), -30);
  });
});

describe('pedido cero', () => {
  it('acertar paga 10 por carta de la ronda', () => {
    assert.equal(roundScore(r({ bids: { a: 0 }, tricks: { a: 0 } }), 'a', 7, BASE), 70);
  });

  it('fallar resta lo mismo, sin importar cuántas hizo', () => {
    assert.equal(roundScore(r({ bids: { a: 0 }, tricks: { a: 2 } }), 'a', 7, BASE), -70);
  });
});

describe('bonus', () => {
  it('se cobran sólo si acierta', () => {
    const bonus = { a: { catorceNegro: 1, reyPorSirena: 1 } };
    assert.equal(roundScore(r({ bids: { a: 2 }, tricks: { a: 2 }, bonus }), 'a', 4, BASE), 40 + 20 + 40);
    assert.equal(roundScore(r({ bids: { a: 2 }, tricks: { a: 3 }, bonus }), 'a', 4, BASE), -10);
  });

  it('los de otra edición no cuentan si no está activa', () => {
    const bonus = { a: { botin: 1, ocho: 2 } };
    assert.equal(roundScore(r({ bids: { a: 1 }, tricks: { a: 1 }, bonus }), 'a', 3, BASE), 20);
    assert.equal(roundScore(r({ bids: { a: 1 }, tricks: { a: 1 }, bonus }), 'a', 3, TODO), 20 + 20 + 10);
  });

  it('el 7 de la expansión resta', () => {
    const bonus = { a: { siete: 1 } };
    assert.equal(roundScore(r({ bids: { a: 1 }, tricks: { a: 1 }, bonus }), 'a', 3, TODO), 15);
  });

  it('cada conjunto suma sus bonus', () => {
    assert.equal(bonusActivos(BASE).length, 5);
    assert.equal(bonusActivos(NUEVA).length, 6);
    assert.equal(bonusActivos(TODO).length, 10);
  });
});

describe('edición nueva', () => {
  it('la apuesta suma al acertar y resta al fallar', () => {
    assert.equal(roundScore(r({ bids: { a: 1 }, tricks: { a: 1 }, apuesta: { a: 20 } }), 'a', 2, NUEVA), 40);
    assert.equal(roundScore(r({ bids: { a: 1 }, tricks: { a: 0 }, apuesta: { a: 10 } }), 'a', 2, NUEVA), -20);
  });

  it('sin la edición nueva la apuesta no cuenta', () => {
    assert.equal(roundScore(r({ bids: { a: 1 }, tricks: { a: 1 }, apuesta: { a: 20 } }), 'a', 2, BASE), 20);
  });

  it('con el Kraken las bazas suman una menos', () => {
    assert.equal(bazasEsperadas(5, false), 5);
    assert.equal(bazasEsperadas(5, true), 4);
  });
});

describe('posiciones', () => {
  it('suma todas las rondas', () => {
    const game = {
      players: [
        { id: 'a', name: 'Ana' },
        { id: 'b', name: 'Beto' },
      ],
      extras: BASE,
      rounds: [r({ bids: { a: 1, b: 0 }, tricks: { a: 1, b: 0 } }), r({ bids: { a: 0, b: 2 }, tricks: { a: 1, b: 1 } })],
    };
    // a: 20 − 20 = 0 · b: 10 − 10 = 0 → empate; b: 10 + (−10) = 0
    assert.deepEqual(
      standings(game).map((s) => s.total),
      [0, 0],
    );
  });
});
