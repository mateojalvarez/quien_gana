// Pruebas del generador de equipos. Node 25 ejecuta TypeScript directo, así que
// corren sin instalar nada:  npm test
//
// Esto no es decorado: la poda por simetría de la búsqueda tuvo un error que
// descartaba repartos válidos y hacía decir "imposible" sobre casos que sí
// tenían solución. Lo encontraron estas pruebas, no la pantalla.

import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { armar, choca, tamanos, type Persona, type Restriccion } from './rules.ts';

const P = (nombres: string[]): Persona[] => nombres.map((name) => ({ id: name.toLowerCase(), name }));
const R = (...pares: [string, string][]): Restriccion[] =>
  pares.map(([a, b]) => ({ a: a.toLowerCase(), b: b.toLowerCase() }));

/** Nadie comparte equipo con un enemigo y todos aparecen exactamente una vez. */
function valida(res: ReturnType<typeof armar>, gente: Persona[], restr: Restriccion[]) {
  assert.ok(res.ok, 'esperaba una solución');
  const todos = res.equipos.flat().map((p) => p.id);
  assert.equal(todos.length, gente.length, 'falta o sobra gente');
  assert.equal(new Set(todos).size, gente.length, 'alguien repetido');
  for (const eq of res.equipos) {
    for (const r of restr) {
      const juntos = eq.some((p) => p.id === r.a) && eq.some((p) => p.id === r.b);
      assert.ok(!juntos, `${r.a} y ${r.b} quedaron juntos`);
    }
  }
}

describe('tamaños parejos', () => {
  it('reparte el resto entre los primeros', () => {
    assert.deepEqual(tamanos(8, 2), [4, 4]);
    assert.deepEqual(tamanos(7, 2), [4, 3]);
    assert.deepEqual(tamanos(10, 3), [4, 3, 3]);
  });
});

describe('cuando hay solución, la encuentra', () => {
  it('ocho sin restricciones en dos equipos', () => {
    const g = P(['Teo', 'Lu', 'Santi', 'Caro', 'Juan', 'Flor', 'Nico', 'Pau']);
    const res = armar(g, [], 2);
    valida(res, g, []);
    assert.ok(res.ok && !res.desbalanceado);
    assert.ok(res.ok && res.equipos.every((e) => e.length === 4));
  });

  it('el caso del diseño: ocho, dos restricciones, dos equipos', () => {
    const g = P(['Teo', 'Lu', 'Santi', 'Caro', 'Juan', 'Flor', 'Nico', 'Pau']);
    const r = R(['Teo', 'Lu'], ['Santi', 'Caro']);
    valida(armar(g, r, 2), g, r);
  });

  it('un triángulo entra justo en tres equipos', () => {
    const g = P(['A', 'B', 'C', 'D', 'E', 'F']);
    const r = R(['A', 'B'], ['B', 'C'], ['A', 'C']);
    valida(armar(g, r, 3), g, r);
  });

  it('veinte personas, seis equipos, doce restricciones', () => {
    const g = P(Array.from({ length: 20 }, (_, i) => `P${i}`));
    const r = R(...Array.from({ length: 12 }, (_, i): [string, string] => [`P${i}`, `P${(i + 7) % 20}`]));
    valida(armar(g, r, 6), g, r);
  });
});

describe('cuando no hay solución, avisa en vez de seguir buscando', () => {
  it('un triángulo en dos equipos es imposible, y lo explica con nombres', () => {
    const g = P(['A', 'B', 'C', 'D']);
    const r = R(['A', 'B'], ['B', 'C'], ['A', 'C']);
    const res = armar(g, r, 2);
    assert.ok(!res.ok && res.motivo === 'imposible');
    assert.match(res.detalle, /A, B y C/);
    assert.match(res.detalle, /Harían falta 3/);
  });

  it('todos contra todos no entra en menos equipos que gente', () => {
    const g = P(['A', 'B', 'C', 'D', 'E']);
    const r: Restriccion[] = [];
    for (const a of g) for (const b of g) if (a.id < b.id) r.push({ a: a.id, b: b.id });
    const res = armar(g, r, 4);
    assert.ok(!res.ok && res.motivo === 'imposible');
  });

  it('con menos gente que equipos lo dice derecho', () => {
    const res = armar(P(['A', 'B']), [], 4);
    assert.ok(!res.ok);
    assert.match(res.detalle, /falta gente/);
  });
});

describe('antes de rendirse, prueba con equipos desparejos', () => {
  it('deja solo al que no puede estar con nadie', () => {
    const g = P(['A', 'B', 'C', 'D']);
    const r = R(['A', 'B'], ['A', 'C'], ['A', 'D']);
    const res = armar(g, r, 2);
    valida(res, g, r);
    assert.ok(res.ok && res.desbalanceado, 'tiene que marcarse desbalanceado');
    const solo = res.ok ? res.equipos.find((e) => e.length === 1) : undefined;
    assert.equal(solo?.[0]?.id, 'a');
  });
});

describe('mover a mano', () => {
  it('avisa con quién choca antes de moverlo', () => {
    const g = P(['A', 'B', 'C']);
    const ch = choca(g[0], [g[1], g[2]], R(['A', 'B']));
    assert.deepEqual(ch.map((p) => p.id), ['b']);
  });
});

describe('termina siempre', () => {
  it('doscientas corridas de un caso feo no se cuelgan', () => {
    const g = P(Array.from({ length: 16 }, (_, i) => `P${i}`));
    const r = R(
      ...Array.from({ length: 30 }, (_, i): [string, string] => [`P${i % 16}`, `P${(i * 5 + 3) % 16}`]).filter(
        ([a, b]) => a !== b,
      ),
    );
    const t0 = Date.now();
    for (let i = 0; i < 200; i++) armar(g, r, 4);
    assert.ok(Date.now() - t0 < 4000, 'tardó demasiado');
  });
});
