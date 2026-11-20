// Los dos enlaces públicos que lleva el correo, armados desde una sola base.
//
// Antes había un secret por URL. Con el botón de "marcar como recibido" eso
// eran dos URLs para mantener en sincronía, apuntando siempre al mismo
// proyecto: alcanza con la base de las funciones.
//
//   FUNCIONES_BASE_URL=https://TU_REF.supabase.co/functions/v1
//
// `AMIGO_PIXEL=off` apaga el pixel y deja sólo el botón, para quien no quiera
// ninguna señal automática.

const base = () => (Deno.env.get('FUNCIONES_BASE_URL') ?? '').replace(/\/+$/, '');

export const pixelActivo = () => Deno.env.get('AMIGO_PIXEL') !== 'off';

export function enlaces(token: string): { pixelUrl: string | null; recibidoUrl: string | null } {
  const b = base();
  if (!b) return { pixelUrl: null, recibidoUrl: null };
  const t = encodeURIComponent(token);
  return {
    pixelUrl: pixelActivo() ? `${b}/amigo-invisible-pixel?t=${t}` : null,
    recibidoUrl: `${b}/amigo-invisible-recibido?t=${t}`,
  };
}
