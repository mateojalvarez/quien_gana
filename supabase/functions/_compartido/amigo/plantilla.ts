// El mail que recibe cada participante.
//
// Reglas de un mail que no se rompe: tablas en vez de flex, estilos inline en
// vez de <style>, 600px de ancho, y una parte de texto plano siempre.

const escapar = (s: string) =>
  s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

export type DatosMail = {
  sorteo: string;
  mensaje: string;
  fecha: string | null;
  presupuesto: string | null;
  /** A quién le regala. */
  destino: string;
  /** Quién lo recibe. */
  para: string;
  /** El anfitrión eligió un sorteo a la vista y puede ver el reparto entero. */
  anfitrionVe: boolean;
  pixelUrl: string | null;
};

/**
 * La línea que define de qué sorteo se trata. No es relleno: si el anfitrión
 * puede mirar el reparto, el participante tiene que enterarse ACÁ y no después.
 * Prometer secreto y dárselo vuelta una vez que todos leyeron el correo es
 * exactamente lo que esta línea evita.
 */
const promesa = (anfitrionVe: boolean) =>
  anfitrionVe
    ? 'Quien armó el sorteo puede ver el reparto completo. Nadie más lo ve.'
    : 'Nadie más recibió este nombre. Ni siquiera quien armó el sorteo sabe a quién le tocó cada uno.';

export const asunto = (sorteo: string) => `Tu amigo invisible de "${sorteo}"`;

export function texto(d: DatosMail): string {
  const extra = [
    d.fecha ? `Cuándo: ${d.fecha}` : null,
    d.presupuesto ? `Presupuesto: ${d.presupuesto}` : null,
    d.mensaje || null,
  ].filter(Boolean);

  return [
    `Hola ${d.para}:`,
    '',
    `En "${d.sorteo}" te tocó regalarle a:`,
    '',
    `    ${d.destino}`,
    '',
    ...extra,
    extra.length ? '' : null,
    promesa(d.anfitrionVe),
    '',
    '— ¿Quién gana?',
  ]
    .filter((l) => l !== null)
    .join('\n');
}

export function html(d: DatosMail): string {
  const extra = [
    d.fecha ? ['Cuándo', d.fecha] : null,
    d.presupuesto ? ['Presupuesto', d.presupuesto] : null,
  ].filter((x): x is [string, string] => x !== null);

  const filasExtra = extra
    .map(
      ([k, v]) => `
          <tr>
            <td style="padding:2px 0;font:13px/1.5 -apple-system,Segoe UI,Roboto,Arial,sans-serif;color:#8a8275">${escapar(k)}</td>
            <td style="padding:2px 0 2px 12px;font:13px/1.5 -apple-system,Segoe UI,Roboto,Arial,sans-serif;color:#2b2722">${escapar(v)}</td>
          </tr>`,
    )
    .join('');

  const pixel = d.pixelUrl
    ? `<img src="${escapar(d.pixelUrl)}" width="1" height="1" alt="" style="display:block;width:1px;height:1px;border:0;opacity:0" />`
    : '';

  return `<!doctype html>
<html lang="es">
<head><meta charset="utf-8"><meta name="viewport" content="width=device-width"></head>
<body style="margin:0;padding:0;background:#f6f3ec">
  <!-- Vista previa: NO puede nombrar al destinatario, o se lee en la bandeja
       de entrada sin abrir el mail y se arruina la sorpresa. -->
  <div style="display:none;max-height:0;overflow:hidden;opacity:0">Ya se sorteó. Abrí para ver a quién le regalás.</div>

  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="background:#f6f3ec">
    <tr><td align="center" style="padding:32px 16px">
      <table role="presentation" width="600" cellpadding="0" cellspacing="0" border="0" style="width:600px;max-width:100%;background:#fffdf8;border:2px solid #2b2722;border-radius:24px">
        <tr><td style="padding:32px 32px 8px">
          <p style="margin:0;font:600 13px/1.4 -apple-system,Segoe UI,Roboto,Arial,sans-serif;letter-spacing:.08em;text-transform:uppercase;color:#8a8275">Amigo invisible</p>
          <p style="margin:6px 0 0;font:700 24px/1.25 -apple-system,Segoe UI,Roboto,Arial,sans-serif;color:#2b2722">${escapar(d.sorteo)}</p>
        </td></tr>

        <tr><td style="padding:16px 32px 0">
          <p style="margin:0;font:16px/1.6 -apple-system,Segoe UI,Roboto,Arial,sans-serif;color:#2b2722">Hola ${escapar(d.para)}, te tocó regalarle a:</p>
        </td></tr>

        <tr><td style="padding:16px 32px 0">
          <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="background:#e8dcc0;border-radius:18px">
            <tr><td align="center" style="padding:28px 20px">
              <span style="font:700 30px/1.2 -apple-system,Segoe UI,Roboto,Arial,sans-serif;color:#2b2722">${escapar(d.destino)}</span>
            </td></tr>
          </table>
        </td></tr>

        ${
          d.mensaje
            ? `<tr><td style="padding:20px 32px 0">
          <p style="margin:0;font:15px/1.6 -apple-system,Segoe UI,Roboto,Arial,sans-serif;color:#2b2722;white-space:pre-wrap">${escapar(d.mensaje)}</p>
        </td></tr>`
            : ''
        }

        ${
          filasExtra
            ? `<tr><td style="padding:20px 32px 0">
          <table role="presentation" cellpadding="0" cellspacing="0" border="0">${filasExtra}
          </table>
        </td></tr>`
            : ''
        }

        <tr><td style="padding:24px 32px 32px">
          <p style="margin:0;font:13px/1.6 -apple-system,Segoe UI,Roboto,Arial,sans-serif;color:#8a8275">${escapar(promesa(d.anfitrionVe))}</p>
          <p style="margin:12px 0 0;font:13px/1.6 -apple-system,Segoe UI,Roboto,Arial,sans-serif;color:#8a8275">— ¿Quién gana?</p>
        </td></tr>
      </table>
      ${pixel}
    </td></tr>
  </table>
</body>
</html>`;
}
