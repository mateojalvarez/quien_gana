// Cifrado de la asignación y token del pixel.
//
// Nada de esto sale nunca de la Edge Function: la app no conoce las claves y
// la base guarda sólo ciphertext y hashes.

const deB64 = (s: string) => Uint8Array.from(atob(s), (ch) => ch.charCodeAt(0));

export const aB64url = (b: Uint8Array) =>
  btoa(String.fromCharCode(...b)).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');

/** PostgREST devuelve los bytea como "\x414243" y los acepta igual. */
export const deHex = (hex: string): Uint8Array =>
  Uint8Array.from((hex.replace(/^\\x/, '').match(/../g) ?? []).map((h) => parseInt(h, 16)));

export const aHex = (b: Uint8Array): string =>
  '\\x' + [...b].map((x) => x.toString(16).padStart(2, '0')).join('');

const claves = new Map<number, Promise<CryptoKey>>();

/** Numeradas para poder rotar sin romper los sorteos viejos (`key_version`). */
function clave(version: number): Promise<CryptoKey> {
  let k = claves.get(version);
  if (!k) {
    const raw = Deno.env.get(`AMIGO_CLAVE_V${version}`);
    if (!raw) throw new Error(`falta el secret AMIGO_CLAVE_V${version}`);
    k = crypto.subtle.importKey('raw', deB64(raw), 'AES-GCM', false, ['encrypt', 'decrypt']);
    claves.set(version, k);
  }
  return k;
}

/** Ata el ciphertext a SU fila: copiarlo a otro participante lo rompe. */
const aad = (memberId: string) => new TextEncoder().encode(memberId);

export const CLAVE_ACTUAL = 1;

export async function cifrarDestino(memberId: string, destinoId: string) {
  const nonce = crypto.getRandomValues(new Uint8Array(12));
  const ct = await crypto.subtle.encrypt(
    { name: 'AES-GCM', iv: nonce, additionalData: aad(memberId) },
    await clave(CLAVE_ACTUAL),
    new TextEncoder().encode(destinoId),
  );
  return { nonce, cifrado: new Uint8Array(ct), version: CLAVE_ACTUAL };
}

export async function descifrarDestino(
  memberId: string,
  nonce: Uint8Array,
  cifrado: Uint8Array,
  version: number,
): Promise<string> {
  const pt = await crypto.subtle.decrypt(
    { name: 'AES-GCM', iv: nonce, additionalData: aad(memberId) },
    await clave(version),
    cifrado,
  );
  return new TextDecoder().decode(pt);
}

/**
 * Token del pixel: determinístico, así reenviar un mail no toca la base y la
 * señal de apertura sigue funcionando con el mismo token.
 */
export async function tokenPixel(drawId: string, memberId: string): Promise<string> {
  const secret = Deno.env.get('PIXEL_SECRET');
  if (!secret) throw new Error('falta el secret PIXEL_SECRET');
  const key = await crypto.subtle.importKey(
    'raw',
    deB64(secret),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign'],
  );
  const mac = await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(`${drawId}:${memberId}`));
  return aB64url(new Uint8Array(mac));
}

/** En la base queda sólo esto: con un dump no se fabrican aperturas falsas. */
export async function hashToken(token: string): Promise<Uint8Array> {
  return new Uint8Array(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(token)));
}
