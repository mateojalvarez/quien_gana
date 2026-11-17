import type { Session, User } from '@supabase/supabase-js';
import * as AppleAuthentication from 'expo-apple-authentication';
import * as Crypto from 'expo-crypto';
import * as Linking from 'expo-linking';
import * as WebBrowser from 'expo-web-browser';
import { Platform } from 'react-native';

import { useGames } from '@/store/games';

import { withLocalGamesPreserved } from './session-flags';
import { localSupabaseOverLan, supabase, supabaseUrl } from './supabase';
import { push } from './sync';

WebBrowser.maybeCompleteAuthSession();

export type OAuthProvider = 'google' | 'apple';

/** quiengana://auth-callback en builds; exp://…/--/auth-callback en Expo Go. */
export const authRedirectUri = () => Linking.createURL('auth-callback');

/* ───────────────────────── Apple (nativo, iOS) ───────────────────────── */

export async function isAppleNativeAvailable() {
  if (Platform.OS !== 'ios') return false;
  return AppleAuthentication.isAvailableAsync();
}

async function makeNonce() {
  const raw = Crypto.randomUUID();
  const hashed = await Crypto.digestStringAsync(Crypto.CryptoDigestAlgorithm.SHA256, raw);
  return { raw, hashed };
}

async function requestAppleCredential() {
  const nonce = await makeNonce();
  const credential = await AppleAuthentication.signInAsync({
    requestedScopes: [
      AppleAuthentication.AppleAuthenticationScope.FULL_NAME,
      AppleAuthentication.AppleAuthenticationScope.EMAIL,
    ],
    nonce: nonce.hashed, // Apple recibe el hash…
  });
  if (!credential.identityToken) throw new Error('Apple no devolvió identityToken');
  return { credential, rawNonce: nonce.raw }; // …Supabase recibe el nonce crudo.
}

/** Apple sólo entrega el nombre en el PRIMER login: lo guardamos en metadata. */
async function persistAppleName(credential: AppleAuthentication.AppleAuthenticationCredential) {
  const name = credential.fullName
    ? AppleAuthentication.formatFullName(credential.fullName)
    : '';
  if (name.trim()) {
    await supabase.auth.updateUser({ data: { full_name: name, name } });
  }
}

/** Devuelve el authorizationCode: sirve para revocar tokens si esa cuenta se elimina. */
export async function signInWithAppleNative(): Promise<string | null> {
  const { credential, rawNonce } = await requestAppleCredential();
  const { error } = await supabase.auth.signInWithIdToken({
    provider: 'apple',
    token: credential.identityToken!,
    nonce: rawNonce,
  });
  if (error) throw error;
  await persistAppleName(credential);
  return credential.authorizationCode;
}

/** Invitado → cuenta Apple, conservando el mismo user_id (y sus partidas). */
export async function linkAppleNative() {
  const { credential, rawNonce } = await requestAppleCredential();
  const { error } = await supabase.auth.linkIdentity({
    provider: 'apple',
    token: credential.identityToken!,
    nonce: rawNonce,
  });
  if (error) throw error;
  await persistAppleName(credential);
}

/** Código de autorización fresco, requerido para revocar tokens al borrar la cuenta. */
export async function getAppleAuthorizationCode(): Promise<string | null> {
  if (!(await isAppleNativeAvailable())) return null;
  const { credential } = await requestAppleCredential();
  return credential.authorizationCode;
}

/* ─────────────── OAuth vía navegador (Google en ambas, Apple en Android) ─────────────── */

/** Mensaje accionable en lugar de un navegador que muere en 127.0.0.1. */
function assertBrowserFlowPossible() {
  if (localSupabaseOverLan) {
    throw new Error(
      `El OAuth web no puede volver a la app usando el Supabase local (${supabaseUrl}): ` +
        'el callback del proveedor apunta a 127.0.0.1. Corré `npm run env:cloud` y reiniciá Metro con -c.',
    );
  }
}

async function runBrowserFlow(url: string) {
  const redirectTo = authRedirectUri();
  const result = await WebBrowser.openAuthSessionAsync(url, redirectTo);
  if (result.type !== 'success') return false; // cancelado por el usuario
  const { queryParams } = Linking.parse(result.url);
  const errorDescription = queryParams?.error_description;
  if (errorDescription) throw new Error(String(errorDescription));
  const code = queryParams?.code;
  if (typeof code !== 'string') throw new Error('No se recibió el código de autorización');
  const { error } = await supabase.auth.exchangeCodeForSession(code);
  if (error) throw error;
  return true;
}

export async function signInWithOAuth(provider: OAuthProvider) {
  assertBrowserFlowPossible();
  const { data, error } = await supabase.auth.signInWithOAuth({
    provider,
    options: {
      redirectTo: authRedirectUri(),
      skipBrowserRedirect: true,
      queryParams: provider === 'google' ? { prompt: 'select_account' } : undefined,
    },
  });
  if (error) throw error;
  return runBrowserFlow(data.url);
}

export async function linkOAuth(provider: OAuthProvider) {
  assertBrowserFlowPossible();
  const { data, error } = await supabase.auth.linkIdentity({
    provider,
    options: { redirectTo: authRedirectUri(), skipBrowserRedirect: true },
  });
  if (error) throw error;
  return runBrowserFlow(data.url);
}

/* ───────────────────────── Vincular vs. mergear ───────────────────────── */

/**
 * El proveedor elegido ya pertenece a otra cuenta (o su email ya está tomado),
 * así que `linkIdentity` no puede adjuntarlo al usuario actual.
 */
export function isIdentityConflict(e: unknown): boolean {
  const err = e as { code?: string; message?: string } | null;
  if (!err) return false;
  const code = err.code ?? '';
  if (['identity_already_exists', 'email_exists', 'user_already_exists'].includes(code)) return true;
  return /already (been )?(registered|exists|linked)|already in use/i.test(err.message ?? '');
}

/**
 * Invitado → cuenta que ya existía. No se puede "vincular": hay que entrar a esa
 * cuenta. Las partidas locales se conservan y se vuelven a subir bajo el nuevo
 * user_id, así que el invitado se las lleva consigo.
 *
 * La cuenta anónima queda huérfana (Supabase limpia los anónimos viejos); no la
 * borramos porque perderíamos la sesión antes de poder confirmar la subida.
 */
export async function signInMergingLocalGames(signIn: () => Promise<void>) {
  // Marcamos antes de soltar la sesión: si el login se cancela a mitad de camino,
  // las partidas siguen locales y pendientes de subir a la cuenta que elija.
  useGames.getState().markAllDirty();
  await withLocalGamesPreserved(async () => {
    await supabase.auth.signOut({ scope: 'local' });
    await signIn();
  });
  await push();
}

/**
 * Dos cuentas reales no se pueden vincular entre sí: hay que fusionarlas del
 * lado del servidor. Entramos un momento a la otra cuenta sólo para obtener un
 * access token que pruebe que también es tuya, volvemos a la actual y pedimos
 * el merge. La cuenta de origen se elimina; la actual se queda con todo.
 */
export async function mergeOtherAccountIntoCurrent(
  signInToOther: () => Promise<string | null | boolean | void>,
) {
  const keep = (await supabase.auth.getSession()).data.session;
  if (!keep) throw new Error('No hay una sesión activa.');

  let sourceAccessToken = '';
  let appleAuthorizationCode: string | null = null;

  await withLocalGamesPreserved(async () => {
    const result = await signInToOther();
    appleAuthorizationCode = typeof result === 'string' ? result : null;

    const other = (await supabase.auth.getSession()).data.session;
    if (!other || other.user.id === keep.user.id) {
      throw new Error('No se completó el ingreso a la otra cuenta.');
    }
    sourceAccessToken = other.access_token;

    // Volvemos a la cuenta que sobrevive: el merge lo pide ella.
    const { error } = await supabase.auth.setSession({
      access_token: keep.access_token,
      refresh_token: keep.refresh_token,
    });
    if (error) throw error;
  });

  const { error } = await supabase.functions.invoke('merge-accounts', {
    body: { sourceAccessToken, appleAuthorizationCode },
  });
  if (error) throw error;
}

/* ───────────────────────── Invitado ───────────────────────── */

export async function signInAsGuest() {
  const { error } = await supabase.auth.signInAnonymously();
  if (error) throw error;
}

/* ───────────────────────── Sesión ───────────────────────── */

export async function signOut() {
  const { error } = await supabase.auth.signOut();
  if (error) throw error;
}

export async function deleteAccount() {
  const user = (await supabase.auth.getUser()).data.user;
  const hasApple = user?.identities?.some((i) => i.provider === 'apple');
  // Guideline 5.1.1(v): si el usuario usó Sign in with Apple hay que revocar sus tokens.
  const appleAuthorizationCode = hasApple ? await getAppleAuthorizationCode() : null;
  const { error } = await supabase.functions.invoke('delete-account', {
    body: { appleAuthorizationCode },
  });
  if (error) throw error;
  await supabase.auth.signOut({ scope: 'local' });
}

/* ───────────────────────── Helpers ───────────────────────── */

export function displayName(user: User | null | undefined) {
  if (!user) return '';
  if (user.is_anonymous) return 'Invitado';
  const m = user.user_metadata ?? {};
  return (m.full_name || m.name || user.email || 'Jugador') as string;
}

export function providersOf(user: User | null | undefined): string[] {
  return (user?.identities ?? []).map((i) => i.provider);
}

export type { Session };
