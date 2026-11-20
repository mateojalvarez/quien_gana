// Los dos enlaces públicos que lleva el correo.
//
// El pixel es una función (lo pide el cliente de correo) y el botón de "marcar
// como recibido" es una página del sitio propio, no la función: el gateway de
// Supabase degrada a text/plain cualquier HTML que devuelva una Edge Function,
// así que la página vive en quien-gana.app y postea a la función. Ver
// sitio/README.md.
//
//   FUNCIONES_BASE_URL=https://TU_REF.supabase.co/functions/v1
//   SITIO_BASE_URL=https://quien-gana.app        (opcional, ese es el default)
//
// `AMIGO_PIXEL=off` apaga el pixel y deja sólo el botón, para quien no quiera
// ninguna señal automática.

const sinBarra = (s: string) => s.replace(/\/+$/, '');

const funciones = () => sinBarra(Deno.env.get('FUNCIONES_BASE_URL') ?? '');
const sitio = () => sinBarra(Deno.env.get('SITIO_BASE_URL') ?? 'https://quien-gana.app');

export const pixelActivo = () => Deno.env.get('AMIGO_PIXEL') !== 'off';

export function enlaces(token: string): { pixelUrl: string | null; recibidoUrl: string | null } {
  const f = funciones();
  const t = encodeURIComponent(token);
  return {
    pixelUrl: f && pixelActivo() ? `${f}/amigo-invisible-pixel?t=${t}` : null,
    // El botón no depende de FUNCIONES_BASE_URL para armarse, pero sin esa base
    // la función a la que postea no está publicada: el enlace sería un botón
    // que no hace nada, y eso es peor que no ofrecerlo.
    recibidoUrl: f ? `${sitio()}/recibido?t=${t}` : null,
  };
}
