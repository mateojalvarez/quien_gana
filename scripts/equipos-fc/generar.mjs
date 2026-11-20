// Genera el catálogo de equipos FC que usa el generador de torneos.
//
//   cd scripts/equipos-fc && npm install
//   node generar.mjs                      → salida/equipos-fc.json
//   node generar.mjs --version "FC 26"    → otra edición (por defecto, la más nueva que soporte eafc-db-kit)
//   node generar.mjs --semilla            → además copia a la app (la copia de fábrica, sin red)
//   node generar.mjs --publicar           → además sube a Supabase Storage (bucket `datos`)
//
// `--publicar` necesita SUPABASE_URL y SUPABASE_SERVICE_ROLE_KEY en el entorno: la clave
// secreta (sb_secret_…) o la service_role vieja, de Project Settings → API Keys.
// La service role NUNCA va a la app: sólo vive en la máquina que corre esto.
//
// eafc-db-kit lee las bases que trae el juego, así que para tener ratings
// nuevos alcanza con `npm update eafc-db-kit` y volver a correr esto.

import { createHash } from 'node:crypto';
import { mkdir, writeFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { parseArgs } from 'node:util';

import { readTemplateDatabase, SUPPORTED_VERSIONS } from 'eafc-db-kit';

const aqui = dirname(fileURLToPath(import.meta.url));
const SEMILLA = join(aqui, '../../src/features/torneo/equipos-fc.semilla.json');
const SALIDA = join(aqui, 'salida/equipos-fc.json');
const BUCKET = 'datos';
const OBJETO = 'equipos-fc.json';

const { values: args } = parseArgs({
  options: {
    version: { type: 'string', default: SUPPORTED_VERSIONS[SUPPORTED_VERSIONS.length - 1] },
    semilla: { type: 'boolean', default: false },
    publicar: { type: 'boolean', default: false },
  },
});

// Ligas que no son equipos jugables: genéricos, agentes libres, creados, clásicos, etc.
const LIGAS_EXCLUIDAS = new Set([111, 382, 383, 2000, 2028, 2092, 2240, 2255, 2260, 2261, 2262, 2263]);
// "Liga internacional" = selecciones.
const esLigaDeSelecciones = (liga) => liga.isinternationalleague === 1;

const limpiarLiga = (nombre) => nombre.replace(/\s*\(\d+\)\s*$/, '').trim();
const limpiarEquipo = (nombre) => nombre.replace(/\s*\(National team\)\s*$/i, '').trim();

const db = await readTemplateDatabase({
  version: args.version,
  tables: ['teams', 'leagues', 'leagueteamlinks', 'nations', 'teamnationlinks'],
});
const T = Object.fromEntries(db.databases[0].tables.map((t) => [t.name, t.records]));

const ligas = new Map(T.leagues.map((l) => [l.leagueid, l]));
const naciones = new Map(T.nations.map((n) => [n.nationid, n.nationname]));
const ligaDe = new Map(T.leagueteamlinks.map((x) => [x.teamid, x.leagueid]));
const nacionDe = new Map(T.teamnationlinks.map((x) => [x.teamid, x.nationid]));

const equipos = [];
for (const t of T.teams) {
  const liga = ligas.get(ligaDe.get(t.teamid));
  if (!liga) continue;
  if (LIGAS_EXCLUIDAS.has(liga.leagueid)) continue;
  if (liga.iswomencompetition) continue;
  if (!t.overallrating || t.overallrating <= 0) continue;

  const esSeleccion = esLigaDeSelecciones(liga);
  const pais = naciones.get(nacionDe.get(t.teamid)) ?? naciones.get(liga.countryid) ?? '';
  equipos.push({
    id: String(t.teamid),
    nombre: limpiarEquipo(t.teamname),
    liga: esSeleccion ? 'Selecciones' : limpiarLiga(liga.leaguename),
    pais: esSeleccion ? limpiarEquipo(t.teamname) : pais,
    ovr: t.overallrating,
    ata: t.attackrating,
    med: t.midfieldrating,
    def: t.defenserating,
    esSeleccion,
  });
}
equipos.sort((a, b) => b.ovr - a.ovr || a.nombre.localeCompare(b.nombre));

const version = createHash('sha256').update(JSON.stringify(equipos)).digest('hex').slice(0, 12);
const catalogo = { edicion: args.version, generado: new Date().toISOString(), version, equipos };
const json = JSON.stringify(catalogo);

await mkdir(dirname(SALIDA), { recursive: true });
await writeFile(SALIDA, json);
const clubes = equipos.filter((e) => !e.esSeleccion).length;
console.log(
  `${args.version}: ${equipos.length} equipos (${clubes} clubes, ${equipos.length - clubes} selecciones), ` +
    `${(json.length / 1024).toFixed(0)} KB, versión ${version}`,
);
console.log(`→ ${SALIDA}`);

if (args.semilla) {
  await writeFile(SEMILLA, json + '\n');
  console.log(`→ ${SEMILLA}`);
}

if (args.publicar) {
  const url = process.env.SUPABASE_URL;
  const clave = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !clave) {
    console.error('Faltan SUPABASE_URL y SUPABASE_SERVICE_ROLE_KEY para publicar.');
    process.exit(1);
  }
  const res = await fetch(`${url}/storage/v1/object/${BUCKET}/${OBJETO}`, {
    method: 'POST',
    headers: {
      // Las claves nuevas (sb_secret_…) van en `apikey` y no son un JWT; la
      // service_role vieja sí lo es y además va en Authorization.
      apikey: clave,
      ...(clave.startsWith('sb_') ? {} : { Authorization: `Bearer ${clave}` }),
      'Content-Type': 'application/json',
      'x-upsert': 'true',
      // La app revisa una vez por día; una hora de caché en el CDN alcanza.
      'Cache-Control': 'max-age=3600',
    },
    body: json,
  });
  if (!res.ok) {
    console.error(`No se pudo publicar: ${res.status} ${await res.text()}`);
    process.exit(1);
  }
  console.log(`→ ${url}/storage/v1/object/public/${BUCKET}/${OBJETO}`);
}
