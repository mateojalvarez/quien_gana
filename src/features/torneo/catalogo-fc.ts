// Catálogo de equipos FC: remoto con caché local y copia de fábrica.
//
// scripts/equipos-fc lo publica en el bucket público `datos`. Al abrir el
// asistente se revisa como mucho una vez por día (con ETag, así que si no
// cambió no baja nada). Sin red sigue andando con lo último que se bajó o,
// la primera vez, con la copia que viaja con la app.

import { useCallback, useEffect, useMemo, useState } from 'react';

import { isSupabaseConfigured, supabaseUrl } from '@/lib/supabase';
import { useEquiposFC } from '@/store/equipos-fc';
import { umbralesEstrellas } from './rules';
import semilla from './equipos-fc.semilla.json';
import type { CatalogoFC } from './types';

const URL_CATALOGO = `${supabaseUrl}/storage/v1/object/public/datos/equipos-fc.json`;
const CADA = 24 * 60 * 60 * 1000;

const esCatalogo = (x: unknown): x is CatalogoFC =>
  !!x && typeof x === 'object' && Array.isArray((x as CatalogoFC).equipos) && typeof (x as CatalogoFC).version === 'string';

let enCurso: Promise<void> | null = null;

/** Pregunta al servidor si hay un catálogo nuevo. Nunca tira: sin red, no pasa nada. */
export function revisarCatalogo(forzar = false): Promise<void> {
  if (!isSupabaseConfigured) return Promise.resolve();
  const { revisado, etag, catalogo, guardar, marcarRevisado } = useEquiposFC.getState();
  if (!forzar && revisado && Date.now() - new Date(revisado).getTime() < CADA) return Promise.resolve();
  if (enCurso) return enCurso;

  enCurso = (async () => {
    try {
      const res = await fetch(URL_CATALOGO, {
        headers: etag && catalogo && !forzar ? { 'If-None-Match': etag } : {},
      });
      if (res.status === 304) return marcarRevisado();
      if (!res.ok) return; // 404 si todavía no se publicó: se reintenta la próxima vez
      const json: unknown = await res.json();
      if (!esCatalogo(json)) return;
      const actual = catalogo ?? (semilla as CatalogoFC);
      guardar(json.version === actual.version ? null : json, res.headers.get('etag'));
    } catch {
      // sin red: queda lo que había
    } finally {
      enCurso = null;
    }
  })();
  return enCurso;
}

export function useCatalogoFC() {
  const guardado = useEquiposFC((s) => s.catalogo);
  const revisado = useEquiposFC((s) => s.revisado);
  const catalogo = guardado ?? (semilla as CatalogoFC);
  const umbrales = useMemo(() => umbralesEstrellas(catalogo.equipos.map((e) => e.ovr)), [catalogo]);
  const [actualizando, setActualizando] = useState(false);

  useEffect(() => {
    revisarCatalogo();
  }, []);

  const actualizar = useCallback(async () => {
    setActualizando(true);
    await revisarCatalogo(true);
    setActualizando(false);
  }, []);

  return { catalogo, umbrales, revisado, actualizando, actualizar };
}
