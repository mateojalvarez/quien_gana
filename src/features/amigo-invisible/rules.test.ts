import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { emailValido, LIMITES, validar, type Candidato } from './rules.ts';

const P = (pares: [string, string][]): Candidato[] =>
  pares.map(([name, email], i) => ({ id: String(i), name, email }));

const cuatro = P([
  ['Ana', 'ana@ejemplo.com'],
  ['Beto', 'beto@ejemplo.com'],
  ['Caro', 'caro@ejemplo.com'],
  ['Dani', 'dani@ejemplo.com'],
]);

describe('emailValido', () => {
  it('acepta los normales', () => {
    for (const m of ['a@b.co', 'ana.perez@gmail.com', 'ANA+navidad@ejemplo.com.ar']) {
      assert.ok(emailValido(m), m);
    }
  });

  it('rechaza los errores de tipeo que se ven a simple vista', () => {
    for (const m of ['', 'ana', 'ana@', '@ejemplo.com', 'ana@ejemplo', 'ana @ejemplo.com', 'a@b.c']) {
      assert.ok(!emailValido(m), m);
    }
  });
});

describe('validar', () => {
  it('pasa una lista sana', () => {
    assert.deepEqual(validar(cuatro), { ok: true });
  });

  it('exige el mínimo que hace que el secreto valga algo', () => {
    const r = validar(cuatro.slice(0, LIMITES.min - 1));
    assert.ok(!r.ok);
    assert.match(r.detalle, new RegExp(String(LIMITES.min)));
  });

  it('caza el mail repetido aunque cambie de mayúsculas', () => {
    const r = validar([...cuatro, { id: 'x', name: 'Eze', email: 'ANA@ejemplo.com' }]);
    assert.ok(!r.ok);
    assert.match(r.detalle, /dos veces/);
  });

  it('caza dos personas con el mismo nombre', () => {
    const r = validar([...cuatro, { id: 'x', name: 'ana', email: 'otra@ejemplo.com' }]);
    assert.ok(!r.ok);
    assert.match(r.detalle, /se llaman/i);
  });

  it('nombra a quién le falta arreglar el mail', () => {
    const r = validar([...cuatro.slice(0, 3), { id: 'x', name: 'Dani', email: 'dani@ejemplo' }]);
    assert.ok(!r.ok);
    assert.match(r.detalle, /Dani/);
  });

  it('no deja pasar a alguien sin nombre', () => {
    const r = validar([...cuatro.slice(0, 3), { id: 'x', name: '   ', email: 'x@ejemplo.com' }]);
    assert.ok(!r.ok);
    assert.match(r.detalle, /sin nombre/);
  });
});
