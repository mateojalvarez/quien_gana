// Chequeo previo de los secrets de envío.
//
// Sin esto, un secret que falta se descubre recién adentro del envío: el
// sorteo ya quedó cifrado y guardado, la fila termina en `error` y el
// anfitrión lee "non-2xx" sin saber que lo único que pasa es que al proyecto
// le falta una clave. Se corre ANTES de tocar el estado del sorteo.
//
// La lista completa de secrets está en supabase/functions/.env.example.

import { CLAVE_ACTUAL } from './cripto.ts';

export function secretsQueFaltan(): string[] {
  const hay = (k: string) => !!Deno.env.get(k)?.trim();
  const faltan: string[] = [];

  if (!hay(`AMIGO_CLAVE_V${CLAVE_ACTUAL}`)) faltan.push(`AMIGO_CLAVE_V${CLAVE_ACTUAL}`);
  if (!hay('MAIL_FROM')) faltan.push('MAIL_FROM');
  // Firma los tokens del pixel y del botón "ya me llegó".
  if (!hay('AMIGO_LINK_SECRET')) faltan.push('AMIGO_LINK_SECRET');
  // Sin la base no hay enlace de confirmación: el mail sale igual, pero
  // mudo, y el anfitrión se queda sin la única señal que vale.
  if (!hay('FUNCIONES_BASE_URL')) faltan.push('FUNCIONES_BASE_URL');

  if ((Deno.env.get('MAIL_PROVIDER') ?? 'resend') === 'smtp') {
    if (!hay('SMTP_HOST')) faltan.push('SMTP_HOST');
  } else if (!hay('RESEND_API_KEY')) {
    faltan.push('RESEND_API_KEY');
  }

  return faltan;
}
