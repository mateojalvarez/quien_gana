# Catálogo de equipos FC

El generador de torneos sortea equipos por estrellas a partir de este catálogo
(nombre, liga, país, OVR/ATA/MED/DEF). Sale de las bases del juego que trae
[`eafc-db-kit`](https://www.npmjs.com/package/eafc-db-kit), que pesa ~200 MB y sólo
corre en Node: por eso vive acá, con su propio `package.json`, y **no** es
dependencia de la app.

## Actualizar los ratings

```sh
cd scripts/equipos-fc
npm install
npm update eafc-db-kit            # trae bases nuevas si las hay
SUPABASE_URL=… SUPABASE_SERVICE_ROLE_KEY=… node generar.mjs --publicar
```

La app revisa el catálogo publicado una vez por día (y con "Actualizar" en el
asistente). Si la versión cambió, lo baja y lo guarda; sin red usa el último que
bajó o, la primera vez, la copia de fábrica.

- `--version "FC 26"`: otra edición. Por defecto, la más nueva que soporte la librería.
- `--semilla`: además reescribe `src/features/torneo/equipos-fc.semilla.json`, la
  copia que viaja con la app. Conviene hacerlo antes de cada release.

Los torneos ya sorteados guardan una copia de sus equipos: actualizar el
catálogo no los cambia.

Los datos son de EA: este catálogo es para uso personal de la app.
