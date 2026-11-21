// Pruebas del generador de torneos:  npm test

import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import {
  armarGrupos,
  cargarResultado,
  claveEmpate,
  contarPartidos,
  crearCuadro,
  crearDesempate,
  empatesPendientes,
  estrellasDe,
  filtrarCatalogo,
  ligasDelCatalogo,
  sortearParejas,
  iniciar,
  matchear,
  ordenSiembra,
  puedeResortearCruces,
  resortearCruces,
  sortearCruces,
  pidePenales,
  puedeEditar,
  resolverPorSorteo,
  resultadoLlave,
  roundRobin,
  sortearEquipos,
  tabla,
  tablaLiga,
  tablasDeGrupos,
  umbralesEstrellas,
  validarFormato,
  type Rng,
} from './rules.ts';
import type { DatosTorneo, EquipoFC, Formato, Participante, Partido } from './types.ts';

/** Azar reproducible. */
function semilla(s: number): Rng {
  return () => {
    s = (s * 1664525 + 1013904223) % 4294967296;
    return s / 4294967296;
  };
}

const gente = (n: number, bombos = 1): Participante[] =>
  Array.from({ length: n }, (_, i) => ({
    id: `p${i}`,
    nombre: `P${i}`,
    integrantes: [`p${i}`],
    bombo: Math.floor((i * bombos) / n),
  }));

const formato = (f: Partial<Formato>): Formato => ({
  tipo: 'liga',
  idaVuelta: false,
  playoffIdaVuelta: false,
  finalUnica: true,
  ...f,
});

const torneo = (n: number, f: Partial<Formato>, bombos = 1): DatosTorneo => ({
  deporte: 'futbol',
  modalidad: 'individual',
  participantes: gente(n, bombos),
  bombos: Array.from({ length: bombos }, (_, i) => ({ nombre: `Bombo ${i + 1}`, estrellas: 5 - i })),
  usaEquipos: false,
  origenEquipos: 'catalogo',
  filtroEquipos: 'clubes',
  formato: formato(f),
  fase: 'en-juego',
  partidos: [],
});

/** Juega todo lo pendiente (el local gana 1-0) y sortea los empates que frenen. */
function jugarTodo(d: DatosTorneo, rng: Rng = semilla(99)): DatosTorneo {
  for (let paso = 0; paso < 1000 && d.fase !== 'terminado'; paso++) {
    const p = d.partidos.find((x) => x.gl === null);
    if (p) {
      d = cargarResultado(d, p.id, 1, 0, pidePenales(p, 1, 0, d) ? { l: 4, v: 3 } : null);
      continue;
    }
    const empates = empatesPendientes(d);
    if (empates.length === 0) break;
    for (const e of empates) d = resolverPorSorteo(d, e, rng);
  }
  return d;
}

describe('todos contra todos', () => {
  for (const n of [2, 3, 4, 5, 8, 9]) {
    it(`${n}: cada par una vez y nadie juega dos veces en una fecha`, () => {
      const ids = Array.from({ length: n }, (_, i) => `p${i}`);
      const fechas = roundRobin(ids, false);
      const pares = new Set<string>();
      for (const f of fechas) {
        const enFecha = f.flat();
        assert.equal(new Set(enFecha).size, enFecha.length);
        for (const [a, b] of f) pares.add([a, b].sort().join('|'));
      }
      assert.equal(pares.size, (n * (n - 1)) / 2);
      assert.equal(fechas.flat().length, (n * (n - 1)) / 2);
    });
  }

  it('ida y vuelta: cada par dos veces, con la localía invertida', () => {
    const fechas = roundRobin(['a', 'b', 'c', 'd'], true);
    const todos = fechas.flat().map(([a, b]) => `${a}>${b}`);
    assert.equal(todos.length, 12);
    assert.equal(new Set(todos).size, 12);
  });
});

describe('cantidad de partidos', () => {
  it('liga', () => {
    assert.equal(contarPartidos(formato({ tipo: 'liga' }), 6).total, 15);
    assert.equal(contarPartidos(formato({ tipo: 'liga', idaVuelta: true }), 6).total, 30);
  });

  it('playoff con byes', () => {
    assert.equal(contarPartidos(formato({ tipo: 'playoff' }), 8).total, 7);
    assert.equal(contarPartidos(formato({ tipo: 'playoff' }), 6).total, 5);
    assert.equal(contarPartidos(formato({ tipo: 'playoff' }), 5).total, 4);
  });

  it('playoff ida y vuelta, final única o no', () => {
    assert.equal(contarPartidos(formato({ tipo: 'playoff', playoffIdaVuelta: true }), 8).total, 13);
    assert.equal(contarPartidos(formato({ tipo: 'playoff', playoffIdaVuelta: true, finalUnica: false }), 8).total, 14);
  });

  it('grupos + playoff', () => {
    const f = formato({ tipo: 'grupos', grupos: { cantidad: 2, clasificanPorGrupo: 2 }, playoffIdaVuelta: true });
    // 2 grupos de 4 → 6 + 6; semis ida y vuelta 4, final 1
    assert.equal(contarPartidos(f, 8).total, 17);
  });

  for (const f of [
    formato({ tipo: 'liga', idaVuelta: true }),
    formato({ tipo: 'playoff' }),
    formato({ tipo: 'playoff', playoffIdaVuelta: true }),
    formato({ tipo: 'playoff', playoffIdaVuelta: true, finalUnica: false }),
    formato({ tipo: 'grupos', grupos: { cantidad: 2, clasificanPorGrupo: 2 }, playoffIdaVuelta: true }),
    formato({ tipo: 'grupos', grupos: { cantidad: 3, clasificanPorGrupo: 2 } }),
  ]) {
    for (const n of [6, 7, 8, 10]) {
      it(`el conteo coincide con lo jugado: ${f.tipo} ${n}`, () => {
        if (validarFormato(f, n)) return;
        const esperado = contarPartidos(f, n).total;
        const fin = jugarTodo(iniciar(torneo(n, f, 2), semilla(n)));
        assert.equal(fin.fase, 'terminado');
        assert.equal(fin.partidos.length, esperado);
      });
    }
  }
});

describe('validación', () => {
  it('grupos que no alcanzan', () => {
    assert.ok(validarFormato(formato({ tipo: 'grupos', grupos: { cantidad: 4, clasificanPorGrupo: 1 } }), 6));
    assert.ok(validarFormato(formato({ tipo: 'grupos', grupos: { cantidad: 2, clasificanPorGrupo: 3 } }), 6));
    assert.equal(validarFormato(formato({ tipo: 'grupos', grupos: { cantidad: 2, clasificanPorGrupo: 2 } }), 6), null);
  });
});

describe('tabla', () => {
  const P = (local: string, visitante: string, gl: number, gv: number): Partido => ({
    id: `${local}${visitante}`,
    etapa: 'liga',
    ronda: 0,
    pierna: 1,
    local,
    visitante,
    gl,
    gv,
  });

  it('puntos, después diferencia de gol, después menos goles en contra', () => {
    // a y b: 3 pts, DG +1; a recibió menos
    const { filas, empates } = tabla(
      [P('a', 'c', 1, 0), P('b', 'c', 3, 2), P('a', 'b', 0, 0), P('c', 'd', 0, 0)],
      ['a', 'b', 'c', 'd'],
    );
    assert.deepEqual(
      filas.map((f) => f.id),
      ['a', 'b', 'd', 'c'],
    );
    assert.equal(filas[0].pts, 4);
    assert.equal(empates.length, 0);
  });

  it('empate absoluto queda pendiente y se resuelve con desempates', () => {
    const partidos = [P('a', 'b', 1, 1)];
    const { empates } = tabla(partidos, ['a', 'b']);
    assert.equal(empates.length, 1);
    assert.equal(empates[0].clave, claveEmpate('liga', ['a', 'b']));
    const { filas, empates: sin } = tabla(partidos, ['a', 'b'], { [empates[0].clave]: ['b', 'a'] });
    assert.equal(sin.length, 0);
    assert.equal(filas[0].id, 'b');
  });

  it('liga terminada con empate en el primer puesto: sorteo o desempate', () => {
    let d = iniciar(torneo(2, { tipo: 'liga' }), semilla(1));
    d = cargarResultado(d, d.partidos[0].id, 2, 2);
    assert.equal(d.fase, 'en-juego');
    const [empate] = empatesPendientes(d);
    assert.ok(empate);

    const conPartido = crearDesempate(d, empate);
    const desempate = conPartido.partidos.find((p) => p.etapa === 'desempate')!;
    assert.ok(pidePenales(desempate, 0, 0, conPartido));
    const fin = cargarResultado(conPartido, desempate.id, 0, 0, { l: 3, v: 2 });
    assert.equal(fin.fase, 'terminado');
    assert.equal(fin.campeon, desempate.local);

    const sorteado = resolverPorSorteo(d, empate, semilla(3));
    assert.equal(sorteado.fase, 'terminado');
    assert.equal(sorteado.campeon, tablaLiga(sorteado).filas[0].id);
  });
});

describe('playoff', () => {
  it('siembra: 1 y 2 sólo se cruzan en la final', () => {
    assert.deepEqual(ordenSiembra(8), [1, 8, 4, 5, 2, 7, 3, 6]);
  });

  it('con 6, los dos mejores pasan directo', () => {
    const llaves = crearCuadro(['s1', 's2', 's3', 's4', 's5', 's6']);
    const byes = llaves.filter((l) => l.bye).map((l) => l.a);
    assert.deepEqual(byes.sort(), ['s1', 's2']);
    assert.equal(llaves.filter((l) => l.ronda === 0).length, 4);
  });

  it('global empatado se define por penales en la vuelta, sin gol de visitante', () => {
    const f = formato({ tipo: 'playoff', playoffIdaVuelta: true, finalUnica: false });
    let d = iniciar(torneo(2, f), semilla(2));
    const [ida, vuelta] = d.partidos;
    d = cargarResultado(d, ida.id, 2, 1);
    assert.ok(pidePenales(vuelta, 2, 1, d));
    assert.ok(!pidePenales(vuelta, 0, 0, d));
    d = cargarResultado(d, vuelta.id, 2, 1);
    const llave = d.llaves![0];
    const r = resultadoLlave(llave, d.partidos);
    assert.deepEqual(r.global, [3, 3]);
    assert.ok(r.faltanPenales);
    assert.equal(d.fase, 'en-juego');
    d = cargarResultado(d, vuelta.id, 2, 1, { l: 4, v: 5 });
    assert.equal(d.campeon, vuelta.visitante);
  });

  it('primero todas las idas, después todas las vueltas', () => {
    const d = iniciar(torneo(8, { tipo: 'playoff', playoffIdaVuelta: true }), semilla(4));
    const ronda0 = d.partidos.filter((p) => p.ronda === 0);
    assert.equal(ronda0.filter((p) => p.pierna === 1).length, 4);
    assert.equal(ronda0.filter((p) => p.pierna === 2).length, 4);
  });

  it('no se puede corregir una llave si la siguiente ya se jugó', () => {
    let d = iniciar(torneo(4, { tipo: 'playoff' }), semilla(5));
    const semis = d.partidos.filter((p) => p.ronda === 0);
    for (const s of semis) d = cargarResultado(d, s.id, 1, 0);
    const final = d.partidos.find((p) => p.ronda === 1)!;
    assert.ok(puedeEditar(d, semis[0]));
    d = cargarResultado(d, final.id, 1, 0);
    assert.ok(!puedeEditar(d, semis[0]));
  });

  it('corregir una semi antes de la final cambia quién la juega', () => {
    let d = iniciar(torneo(4, { tipo: 'playoff' }), semilla(6));
    const semis = d.partidos.filter((p) => p.ronda === 0);
    for (const s of semis) d = cargarResultado(d, s.id, 1, 0);
    const antes = d.partidos.find((p) => p.ronda === 1)!;
    d = cargarResultado(d, semis[0].id, 0, 1);
    const despues = d.partidos.find((p) => p.ronda === 1)!;
    assert.notEqual(antes.local, despues.local);
    assert.equal(despues.local, semis[0].visitante);
  });
});

describe('grupos', () => {
  it('las cabezas de serie (bombo 1) quedan una por grupo', () => {
    const ps = gente(8, 2);
    for (let s = 1; s < 20; s++) {
      const { grupos, orden } = armarGrupos(ps, 4, semilla(s));
      assert.equal(orden.length, 8);
      for (const g of grupos) {
        assert.equal(g.length, 2);
        assert.equal(g.filter((id) => ps.find((p) => p.id === id)!.bombo === 0).length, 1);
      }
    }
  });

  it('el cuadro cruza 1° de un grupo con 2° de otro', () => {
    let d = iniciar(torneo(8, { tipo: 'grupos', grupos: { cantidad: 2, clasificanPorGrupo: 2 } }, 2), semilla(7));
    // goleadas distintas para que no haya empates
    d.partidos.forEach((p, i) => (d = cargarResultado(d, p.id, i + 1, 0)));
    assert.ok(d.llaves && d.llaves.length);
    const grupoDe = new Map(d.grupos!.flatMap((ids, g) => ids.map((id) => [id, g] as const)));
    for (const l of d.llaves!.filter((x) => x.ronda === 0)) {
      assert.notEqual(grupoDe.get(l.a!), grupoDe.get(l.b!));
    }
    const tablas = tablasDeGrupos(d);
    assert.ok(tablas.every((t) => t.empates.every((e) => e.desde >= 2)));
  });

  it('un empate en zona de clasificación frena el cuadro hasta resolverse', () => {
    let d = iniciar(torneo(6, { tipo: 'grupos', grupos: { cantidad: 2, clasificanPorGrupo: 1 } }), semilla(8));
    for (const p of d.partidos) d = cargarResultado(d, p.id, 0, 0);
    assert.ok(!(d.llaves && d.llaves.length));
    const pendientes = empatesPendientes(d);
    assert.equal(pendientes.length, 2);
    for (const e of pendientes) d = resolverPorSorteo(d, e, semilla(9));
    assert.equal(d.llaves!.length, 1);
    assert.ok(!puedeEditar(d, d.partidos.find((p) => p.etapa === 'grupo')!));
  });
});

describe('equipos por estrellas', () => {
  const catalogo: EquipoFC[] = Array.from({ length: 100 }, (_, i) => ({
    id: `e${i}`,
    nombre: `Equipo ${i}`,
    liga: 'L',
    pais: 'X',
    ovr: 50 + Math.floor(i / 3),
    ata: 0,
    med: 0,
    def: 0,
    esSeleccion: false,
  }));
  const umbrales = umbralesEstrellas(catalogo.map((e) => e.ovr));

  it('los mejores son 5★ y los peores 0.5★', () => {
    assert.equal(estrellasDe(83, umbrales), 5);
    assert.equal(estrellasDe(50, umbrales), 0.5);
  });

  it('sortea distintos, de la estrella pedida, sin repetir excluidos', () => {
    const { equipos, ampliado } = sortearEquipos(catalogo, umbrales, 3, 4, new Set(), semilla(1));
    assert.equal(equipos.length, 4);
    assert.equal(new Set(equipos.map((e) => e.id)).size, 4);
    assert.ok(equipos.every((e) => e.estrellas === 3));
    assert.ok(!ampliado);
  });

  it('si no alcanzan, amplía y avisa', () => {
    const { equipos, ampliado } = sortearEquipos(catalogo, umbrales, 5, 8, new Set(), semilla(2));
    assert.equal(equipos.length, 8);
    assert.ok(ampliado);
  });

  it('matchear empareja uno a uno', () => {
    const pares = matchear(['a', 'b', 'c'], ['x', 'y', 'z'], semilla(3));
    assert.deepEqual(pares.map((p) => p.participante).sort(), ['a', 'b', 'c']);
    assert.deepEqual(pares.map((p) => p.equipo).sort(), ['x', 'y', 'z']);
  });
});

describe('sorteo de cruces grupos → playoff', () => {
  /** k grupos con q clasificados cada uno: g{grupo}-{puesto}. */
  const armar = (k: number, q: number) => {
    const puestos = Array.from({ length: q }, (_, puesto) => Array.from({ length: k }, (_, g) => `g${g}-${puesto}`));
    const grupoDe = new Map(puestos.flat().map((id) => [id, Number(id.slice(1, id.indexOf('-')))] as const));
    return { puestos, grupoDe };
  };

  for (const [k, q] of [[2, 2], [3, 2], [4, 2], [5, 2], [6, 2], [8, 2], [4, 3], [3, 3], [2, 4], [8, 1]] as const) {
    it(`${k} grupos × ${q}: ningún 1° contra 1° y nadie contra su grupo`, () => {
      const { puestos, grupoDe } = armar(k, q);
      const primeros = new Set(puestos[0]);
      for (let s = 1; s <= 25; s++) {
        const llaves = sortearCruces(puestos, grupoDe, semilla(s));
        const primera = llaves.filter((l) => l.ronda === 0);
        const todos = primera.flatMap((l) => [l.a, l.b]).filter(Boolean);
        assert.equal(new Set(todos).size, k * q, 'cada clasificado una sola vez');
        for (const l of primera) {
          if (l.bye || !l.a || !l.b) continue;
          // Con un solo clasificado por grupo, 1° contra 1° es inevitable.
          if (q > 1) assert.ok(!(primeros.has(l.a) && primeros.has(l.b)), `1° vs 1°: ${l.a} ${l.b}`);
          assert.notEqual(grupoDe.get(l.a), grupoDe.get(l.b), `mismo grupo: ${l.a} ${l.b}`);
        }
      }
    });
  }

  it('los 1° quedan en mitades distintas y los byes son para ellos', () => {
    const { puestos, grupoDe } = armar(3, 2); // 6 → cuadro de 8, 2 byes
    for (let s = 1; s <= 20; s++) {
      const primera = sortearCruces(puestos, grupoDe, semilla(s)).filter((l) => l.ronda === 0);
      const byes = primera.filter((l) => l.bye);
      assert.equal(byes.length, 2);
      for (const l of byes) assert.ok(puestos[0].includes(l.a!));
      const posDe = (id: string) => primera.find((l) => l.a === id || l.b === id)!.pos;
      const enMitad = [0, 1].map((h) => puestos[0].filter((id) => (posDe(id) < 2 ? 0 : 1) === h).length);
      assert.ok(enMitad.every((n) => n >= 1), 'hay 1° en las dos mitades');
    }
  });

  it('misma semilla, mismo cuadro; otra semilla puede cambiarlo', () => {
    const { puestos, grupoDe } = armar(4, 2);
    assert.deepEqual(sortearCruces(puestos, grupoDe, semilla(3)), sortearCruces(puestos, grupoDe, semilla(3)));
    const distintos = new Set(
      Array.from({ length: 10 }, (_, s) => JSON.stringify(sortearCruces(puestos, grupoDe, semilla(s + 1)))),
    );
    assert.ok(distintos.size > 1);
  });

  it('se puede re-sortear hasta que se juega un partido del cuadro', () => {
    let d = iniciar(torneo(8, { tipo: 'grupos', grupos: { cantidad: 2, clasificanPorGrupo: 2 } }, 2), semilla(7));
    d.partidos.forEach((p, i) => (d = cargarResultado(d, p.id, i + 1, 0)));
    assert.ok(d.llaves?.length && d.semillaCruces != null);
    assert.ok(puedeResortearCruces(d));
    const otro = resortearCruces(d, 12345);
    assert.equal(otro.semillaCruces, 12345);
    assert.equal(otro.llaves!.filter((l) => l.ronda === 0).length, 2);
    const p = otro.partidos.find((x) => x.etapa === 'playoff')!;
    const jugado = cargarResultado(otro, p.id, 1, 0);
    assert.ok(!puedeResortearCruces(jugado));
    assert.equal(resortearCruces(jugado), jugado);
  });
});

// ─── Ligas ──────────────────────────────────────────────────────────────────

describe('filtrarCatalogo con ligas', () => {
  const eq = (id: string, liga: string, esSeleccion = false): EquipoFC => ({
    id, nombre: id, liga, pais: '', ovr: 80, ata: 80, med: 80, def: 80, esSeleccion,
  });
  const cat = [eq('boca', 'Argentina Primera División'), eq('city', 'England Premier League'), eq('arg', 'Selecciones', true)];

  it('sin ligas no recorta', () => {
    assert.deepEqual(filtrarCatalogo(cat, 'clubes').map((e) => e.id), ['boca', 'city']);
  });
  it('recorta clubes por liga', () => {
    assert.deepEqual(filtrarCatalogo(cat, 'clubes', ['England Premier League']).map((e) => e.id), ['city']);
  });
  it('con "todos" las selecciones siguen entrando', () => {
    assert.deepEqual(filtrarCatalogo(cat, 'todos', ['Argentina Primera División']).map((e) => e.id), ['boca', 'arg']);
  });
  it('lista las ligas con Argentina primero y sin selecciones', () => {
    assert.deepEqual(ligasDelCatalogo(cat).map((l) => l.liga), ['Argentina Primera División', 'England Premier League']);
  });
});

// ─── Parejas ────────────────────────────────────────────────────────────────

describe('sortearParejas', () => {
  const ids = ['a', 'b', 'c', 'd', 'e', 'f'];
  const juntos = (ps: [string, string][], x: string, y: string) => ps.some(([p, q]) => (p === x && q === y) || (p === y && q === x));

  it('sin reglas arma todas las parejas', () => {
    const r = sortearParejas(ids)!;
    assert.equal(r.parejas.length, 3);
    assert.equal(r.suelto, null);
    assert.equal(new Set(r.parejas.flat()).size, 6);
  });
  it('impar deja uno suelto', () => {
    const r = sortearParejas(['a', 'b', 'c'])!;
    assert.equal(r.parejas.length, 1);
    assert.ok(r.suelto);
  });
  it('respeta fijas y prohibidas', () => {
    for (let i = 0; i < 50; i++) {
      const r = sortearParejas(ids, { fijas: [['a', 'b']], prohibidas: [['c', 'd'], ['c', 'e']], cabezas: [] })!;
      assert.ok(juntos(r.parejas, 'a', 'b'));
      assert.ok(!juntos(r.parejas, 'c', 'd'));
      assert.ok(!juntos(r.parejas, 'c', 'e'));
      assert.ok(juntos(r.parejas, 'c', 'f'));
    }
  });
  it('cabezas van con no-cabezas', () => {
    for (let i = 0; i < 50; i++) {
      const r = sortearParejas(ids, { fijas: [], prohibidas: [], cabezas: ['a', 'b', 'c'] })!;
      for (const [x, y] of r.parejas) assert.notEqual(['a', 'b', 'c'].includes(x), ['a', 'b', 'c'].includes(y));
    }
  });
  it('si sobran cabezas, se juntan sólo las que sobran', () => {
    const r = sortearParejas(ids, { fijas: [], prohibidas: [], cabezas: ['a', 'b', 'c', 'd'] })!;
    const mixtas = r.parejas.filter(([x, y]) => ['a', 'b', 'c', 'd'].includes(x) !== ['a', 'b', 'c', 'd'].includes(y));
    assert.equal(mixtas.length, 2);
  });
  it('imposible devuelve null', () => {
    assert.equal(sortearParejas(['a', 'b'], { fijas: [], prohibidas: [['a', 'b']], cabezas: [] }), null);
    assert.equal(sortearParejas(['a', 'b'], { fijas: [['a', 'b']], prohibidas: [['b', 'a']], cabezas: [] }), null);
  });
});
