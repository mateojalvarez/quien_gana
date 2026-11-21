// El mail que recibe cada participante.
//
// Reglas de un mail que no se rompe: tablas en vez de flex, estilos inline (el
// <style> sólo agrega mejoras), 600px de ancho, y una parte de texto plano siempre.

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
  /** Botón "ya me llegó": la única señal que de verdad dice que lo vio una persona. */
  recibidoUrl: string | null;
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
    ...(d.recibidoUrl
      ? [`Avisale a quien armó el sorteo que te llegó:`, d.recibidoUrl, '']
      : []),
    promesa(d.anfitrionVe),
    '',
    '— ¿Quién gana?',
  ]
    .filter((l) => l !== null)
    .join('\n');
}

// Misma paleta que la app (src/theme/tokens.ts). El correo se declara sólo
// claro: el modo oscuro automático de Gmail/Outlook invierte el fondo pero no
// la tarjeta mostaza, y el nombre queda ilegible.
const C = {
  marfil: '#FBF8F2',
  tinta: '#151110',
  tierra: '#5A4A40',
  mostaza: '#F4B740',
  salvia: '#86C1B7',
  crema: '#EFE6D8',
  arena: '#D9CDBE',
} as const;

/** Jost carga en Apple Mail / iOS; el resto cae al stack del sistema. */
const FUENTE = `Jost,-apple-system,'Segoe UI',Roboto,Arial,sans-serif`;
const f = (peso: number, tam: number, alto: number | string) => `font:${peso} ${tam}px/${alto} ${FUENTE}`;

/**
 * PNG y no webp: Outlook de escritorio no muestra webp. Tiene que estar
 * publicada en quien-gana.app (repo quien-gana-web, public/assets/img/clay/).
 */
const IMG_REGALO = 'https://quien-gana.app/assets/img/clay/regalo.png';

/** Título de la tarjeta de la promesa: acompaña a `promesa()`, no la reemplaza. */
const tituloPromesa = (anfitrionVe: boolean) => (anfitrionVe ? '👀 Sorteo a la vista' : '🤫 Es un secreto');

function dato(etiqueta: string, valor: string, lado: 'izq' | 'der' | 'solo') {
  const pad = lado === 'izq' ? '0 5px 0 0' : lado === 'der' ? '0 0 0 5px' : '0';
  return `<td class="celda" ${lado === 'solo' ? '' : 'width="50%" '}valign="top" style="padding:${pad}">
                <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="background:${C.crema};border-radius:18px">
                  <tr><td style="padding:14px 18px">
                    <p style="margin:0;${f(500, 13, 1.3)};color:${C.tierra}">${escapar(etiqueta)}</p>
                    <p style="margin:4px 0 0;${f(700, 20, 1.2)};font-variant-numeric:tabular-nums;color:${C.tinta}">${escapar(valor)}</p>
                  </td></tr>
                </table>
              </td>`;
}

export function html(d: DatosMail): string {
  const extra = [
    d.fecha ? ['Cuándo', d.fecha] : null,
    d.presupuesto ? ['Presupuesto', d.presupuesto] : null,
  ].filter((x): x is [string, string] => x !== null);

  const celdas =
    extra.length === 2
      ? dato(extra[0][0], extra[0][1], 'izq') + dato(extra[1][0], extra[1][1], 'der')
      : extra.map(([k, v]) => dato(k, v, 'solo')).join('');

  const pixel = d.pixelUrl
    ? `<img src="${escapar(d.pixelUrl)}" width="1" height="1" alt="" style="display:block;width:1px;height:1px;border:0;opacity:0" />`
    : '';

  return `<!doctype html>
<html lang="es">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="color-scheme" content="light only">
<meta name="supported-color-schemes" content="light only">
<title>${escapar(asunto(d.sorteo))}</title>
<link href="https://fonts.googleapis.com/css2?family=Jost:wght@400;500;600;700;800&display=swap" rel="stylesheet">
<style>
  /* Sólo mejoras: todo lo esencial va inline. */
  :root { color-scheme: light only; }
  @media (max-width: 620px) {
    .px { padding-left: 20px !important; padding-right: 20px !important; }
    .titulo { font-size: 26px !important; }
    .nombre { font-size: 40px !important; }
    .celda { display: block !important; width: 100% !important; padding: 0 0 10px 0 !important; }
  }
</style>
</head>
<body style="margin:0;padding:0;background:${C.crema};-webkit-font-smoothing:antialiased">
  <!-- Vista previa: NO puede nombrar al destinatario, o se lee en la bandeja
       de entrada sin abrir el mail y se arruina la sorpresa. -->
  <div style="display:none;max-height:0;overflow:hidden;opacity:0">Ya se sorteó. Abrí para ver a quién le regalás.&#847;&zwnj;&nbsp;&#847;&zwnj;&nbsp;&#847;&zwnj;&nbsp;</div>

  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="background:${C.crema}">
    <tr><td align="center" style="padding:28px 12px 40px">
      <!-- Outlook de escritorio ignora max-width: ahí el ancho lo fija esta tabla. -->
      <!--[if mso]><table role="presentation" width="600" cellpadding="0" cellspacing="0" border="0"><tr><td><![endif]-->

      <table role="presentation" width="600" cellpadding="0" cellspacing="0" border="0" style="width:100%;max-width:600px">
        <tr>
          <td class="px" style="padding:0 8px 14px;${f(800, 19, 1)};letter-spacing:-0.02em;color:${C.tinta}">¿Quién gana?</td>
          <td class="px" align="right" style="padding:0 8px 14px">
            <span style="display:inline-block;padding:6px 12px;border:1.5px solid ${C.tinta};border-radius:999px;${f(600, 12, 1)};color:${C.tinta}">Amigo invisible</span>
          </td>
        </tr>
      </table>

      <table role="presentation" width="600" cellpadding="0" cellspacing="0" border="0" style="width:100%;max-width:600px;background:${C.marfil};border:1.5px solid ${C.tinta};border-radius:32px">

        <tr><td class="px" style="padding:32px 32px 0">
          <p style="margin:0;${f(600, 13, 1.4)};color:${C.tierra}">Ya se sorteó</p>
          <h1 class="titulo" style="margin:6px 0 0;${f(800, 32, 1.1)};letter-spacing:-0.02em;color:${C.tinta}">${escapar(d.sorteo)}</h1>
          <p style="margin:14px 0 0;${f(400, 17, 1.55)};color:${C.tinta}">Hola ${escapar(d.para)}, te toca regalarle a…</p>
        </td></tr>

        <tr><td class="px" style="padding:20px 32px 0">
          <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" bgcolor="${C.mostaza}" style="background:${C.mostaza};border-radius:24px">
            <tr><td align="center" style="padding:24px 20px 30px">
              <img src="${IMG_REGALO}" width="132" height="132" alt="" style="display:block;width:132px;height:132px;border:0;margin:0 auto">
              <p style="margin:10px 0 0;${f(600, 12, 1)};letter-spacing:0.08em;text-transform:uppercase;color:${C.tierra}">Tu amigo invisible</p>
              <p class="nombre" style="margin:8px 0 0;${f(800, 52, 1.05)};letter-spacing:-0.03em;color:${C.tinta}">${escapar(d.destino)}</p>
            </td></tr>
          </table>
        </td></tr>

        ${
          celdas
            ? `<tr><td class="px" style="padding:12px 32px 0">
          <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0">
            <tr>${celdas}</tr>
          </table>
        </td></tr>`
            : ''
        }

        ${
          d.mensaje
            ? `<tr><td class="px" style="padding:12px 32px 0">
          <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="border:1.5px solid ${C.arena};border-radius:18px">
            <tr><td style="padding:16px 18px">
              <p style="margin:0;${f(500, 13, 1.3)};color:${C.tierra}">Mensaje de quien armó el sorteo</p>
              <p style="margin:6px 0 0;${f(400, 16, 1.55)};color:${C.tinta};white-space:pre-wrap">${escapar(d.mensaje)}</p>
            </td></tr>
          </table>
        </td></tr>`
            : ''
        }

        ${
          d.recibidoUrl
            ? `<tr><td class="px" align="center" style="padding:28px 32px 0">
          <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0">
            <tr><td align="center" bgcolor="${C.tinta}" style="border-radius:999px">
              <a href="${escapar(d.recibidoUrl)}" style="display:block;padding:17px 28px;${f(600, 17, 1)};color:${C.marfil};text-decoration:none;border-radius:999px">Marcar como recibido</a>
            </td></tr>
          </table>
          <p style="margin:10px 0 0;${f(400, 13, 1.5)};color:${C.tierra}">Le avisa a quien armó el sorteo que te llegó. No muestra a quién te tocó.</p>
        </td></tr>`
            : ''
        }

        <tr><td class="px" style="padding:24px 32px 32px">
          <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" bgcolor="${C.salvia}" style="background:${C.salvia};border-radius:18px">
            <tr><td style="padding:16px 18px">
              <p style="margin:0;${f(700, 15, 1.3)};color:${C.tinta}">${tituloPromesa(d.anfitrionVe)}</p>
              <p style="margin:4px 0 0;${f(400, 14, 1.5)};color:${C.tinta}">${escapar(promesa(d.anfitrionVe))}</p>
            </td></tr>
          </table>
        </td></tr>
      </table>

      <table role="presentation" width="600" cellpadding="0" cellspacing="0" border="0" style="width:100%;max-width:600px">
        <tr><td class="px" align="center" style="padding:18px 24px 0;${f(400, 12, 1.6)};color:${C.tierra}">
          Te llegó porque te sumaron a un sorteo en ¿Quién gana?<br>
          <a href="https://quien-gana.app" style="color:${C.tinta};text-underline-offset:3px">quien-gana.app</a>
        </td></tr>
      </table>
      <!--[if mso]></td></tr></table><![endif]-->
      ${pixel}
    </td></tr>
  </table>
</body>
</html>`;
}
