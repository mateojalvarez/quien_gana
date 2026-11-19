// Pruebas de los puntajes de Generala.  npm test

import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import {
  anotable,
  esEscalera,
  esFull,
  esGenerala,
  esPoker,
  generalaServida,
  libres,
  puntaje,
  sugerencias,
  terminada,
  total,
  type Planilla,
} from './rules.ts';

const SIN_SERVIR = false;
const SERVIDA = true;

describe('números', () => {
  it('suman la cara, no la cantidad', () => {
    assert.equal(puntaje('cuatro', [4, 4, 4, 2, 2], SIN_SERVIR), 12);
    assert.equal(puntaje('dos', [4, 4, 4, 2, 2], SIN_SERVIR), 4);
    assert.equal(puntaje('cinco', [5, 5, 5, 5, 1], SIN_SERVIR), 20);
  });

  it('cero si no salió ninguno', () => {
    assert.equal(puntaje('seis', [1, 2, 3, 4, 5], SIN_SERVIR), 0);
  });

  it('servida no cambia los números', () => {
    assert.equal(puntaje('tres', [3, 3, 1, 1, 1], SERVIDA), 6);
  });
});

describe('escalera', () => {
  it('reconoce las tres válidas, incluida la que lleva el 1 después del 6', () => {
    assert.ok(esEscalera([1, 2, 3, 4, 5]));
    assert.ok(esEscalera([2, 3, 4, 5, 6]));
    assert.ok(esEscalera([3, 4, 5, 6, 1]));
  });

  it('no se deja engañar por el desorden', () => {
    assert.ok(esEscalera([5, 3, 1, 4, 2]));
  });

  it('rechaza las que no son', () => {
    assert.ok(!esEscalera([1, 2, 3, 4, 6]));
    assert.ok(!esEscalera([2, 3, 4, 5, 5]));
    assert.ok(!esEscalera([1, 2, 4, 5, 6]));
  });

  it('vale 20, y 25 servida', () => {
    assert.equal(puntaje('escalera', [1, 2, 3, 4, 5], SIN_SERVIR), 20);
    assert.equal(puntaje('escalera', [1, 2, 3, 4, 5], SERVIDA), 25);
    assert.equal(puntaje('escalera', [1, 1, 3, 4, 5], SERVIDA), 0);
  });
});

describe('full', () => {
  it('tres más dos', () => {
    assert.ok(esFull([4, 4, 4, 2, 2]));
    assert.ok(!esFull([4, 4, 4, 2, 3]));
    assert.ok(!esFull([4, 4, 2, 2, 3]));
  });

  it('cinco iguales también sirve como full', () => {
    assert.ok(esFull([6, 6, 6, 6, 6]));
  });

  it('vale 30, y 35 servido', () => {
    assert.equal(puntaje('full', [4, 4, 4, 2, 2], SIN_SERVIR), 30);
    assert.equal(puntaje('full', [4, 4, 4, 2, 2], SERVIDA), 35);
  });
});

describe('póker, generala y doble', () => {
  it('póker son cuatro iguales, y cinco también lo cumplen', () => {
    assert.ok(esPoker([3, 3, 3, 3, 1]));
    assert.ok(esPoker([3, 3, 3, 3, 3]));
    assert.ok(!esPoker([3, 3, 3, 1, 1]));
    assert.equal(puntaje('poker', [3, 3, 3, 3, 1], SIN_SERVIR), 40);
    assert.equal(puntaje('poker', [3, 3, 3, 3, 1], SERVIDA), 45);
  });

  it('generala son cinco iguales y vale 50, servida o no', () => {
    assert.ok(esGenerala([2, 2, 2, 2, 2]));
    assert.equal(puntaje('generala', [2, 2, 2, 2, 2], SIN_SERVIR), 50);
    assert.equal(puntaje('generala', [2, 2, 2, 2, 2], SERVIDA), 50);
  });

  it('la doble vale 100', () => {
    assert.equal(puntaje('doble', [6, 6, 6, 6, 6], SIN_SERVIR), 100);
  });

  it('la doble no se puede anotar sin haber hecho la generala', () => {
    const vacia: Planilla = {};
    assert.ok(!anotable(vacia, 'doble'));
    const conGenerala: Planilla = { generala: { puntos: 50, servida: false, cruzada: false } };
    assert.ok(anotable(conGenerala, 'doble'));
    // una generala tachada no habilita la doble
    const tachada: Planilla = { generala: { puntos: 0, servida: false, cruzada: true } };
    assert.ok(!anotable(tachada, 'doble'));
  });
});

describe('generala servida gana la partida', () => {
  it('sólo cuenta en el primer tiro', () => {
    assert.ok(generalaServida([5, 5, 5, 5, 5], SERVIDA));
    assert.ok(!generalaServida([5, 5, 5, 5, 5], SIN_SERVIR));
    assert.ok(!generalaServida([5, 5, 5, 5, 1], SERVIDA));
  });
});

describe('sugerencias', () => {
  it('pone primero la que más suma y la marca como mejor', () => {
    const s = sugerencias({}, [4, 4, 4, 2, 2], SIN_SERVIR);
    assert.equal(s[0].cat, 'full');
    assert.equal(s[0].puntos, 30);
    assert.ok(s[0].mejor);
    assert.ok(s.slice(1).every((x) => !x.mejor));
  });

  it('avisa cuánto se perdió por no venir servida', () => {
    const s = sugerencias({}, [4, 4, 4, 2, 2], SIN_SERVIR);
    assert.match(s[0].detalle, /Servida habría valido 35/);
  });

  it('no ofrece categorías ya usadas', () => {
    const p: Planilla = { full: { puntos: 30, servida: false, cruzada: false } };
    const s = sugerencias(p, [4, 4, 4, 2, 2], SIN_SERVIR);
    assert.ok(!s.some((x) => x.cat === 'full'));
    assert.equal(s[0].cat, 'cuatro');
  });

  it('no ofrece nada que valga cero', () => {
    const s = sugerencias({}, [1, 3, 5, 2, 6], SIN_SERVIR);
    assert.ok(s.every((x) => x.puntos > 0));
  });

  it('con dados que no sirven para nada, la lista queda vacía', () => {
    // todas las de número usadas y los dados no arman ninguna figura
    const p: Planilla = {};
    for (const c of ['uno', 'dos', 'tres', 'cuatro', 'cinco', 'seis'] as const) {
      p[c] = { puntos: 0, servida: false, cruzada: true };
    }
    assert.deepEqual(sugerencias(p, [1, 2, 3, 4, 6], SIN_SERVIR), []);
  });
});

describe('planilla', () => {
  it('el total suma lo anotado y no cuenta lo tachado', () => {
    const p: Planilla = {
      cuatro: { puntos: 12, servida: false, cruzada: false },
      full: { puntos: 35, servida: true, cruzada: false },
      generala: { puntos: 0, servida: false, cruzada: true },
    };
    assert.equal(total(p), 47);
  });

  it('quedan libres las once menos las usadas', () => {
    const p: Planilla = { uno: { puntos: 2, servida: false, cruzada: false } };
    assert.equal(libres(p).length, 10);
  });

  it('la partida termina cuando todos llenaron las once', () => {
    const llena: Planilla = {};
    for (const c of ['uno','dos','tres','cuatro','cinco','seis','escalera','full','poker','generala','doble'] as const) {
      llena[c] = { puntos: 0, servida: false, cruzada: true };
    }
    const jugadores = [{ id: 'a' }, { id: 'b' }];
    assert.ok(!terminada(jugadores, { a: llena, b: {} }));
    assert.ok(terminada(jugadores, { a: llena, b: llena }));
  });
});
