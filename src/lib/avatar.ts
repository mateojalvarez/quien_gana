import type { User } from '@supabase/supabase-js';
import * as ImagePicker from 'expo-image-picker';

import { uid } from './id';
import { supabase } from './supabase';

/**
 * Dos avatares conviven:
 *  · el del proveedor  → lo manda Google al entrar (Apple no manda ninguno);
 *  · el propio         → la foto que el usuario elige, en el bucket `avatars`.
 *
 * El propio gana; si se saca, vuelve solo el del proveedor; si tampoco hay,
 * la UI dibuja la inicial. `profiles.avatar_url` guarda el efectivo (lo ve el
 * grupo) y lo mantiene el trigger de supabase/migrations/20261121000000_avatares.sql.
 */

const BUCKET = 'avatars';

/** Google guarda la foto en `avatar_url` o `picture`, según el flujo. */
export function providerAvatarUrl(user: User | null | undefined): string | null {
  if (!user) return null;
  for (const identity of user.identities ?? []) {
    const d = (identity.identity_data ?? {}) as Record<string, unknown>;
    const url = d.avatar_url ?? d.picture;
    if (typeof url === 'string' && url) return url;
  }
  const m = (user.user_metadata ?? {}) as Record<string, unknown>;
  const url = m.avatar_url ?? m.picture;
  return typeof url === 'string' && url ? url : null;
}

/** La foto que subió el usuario, si hay. */
export function customAvatarUrl(user: User | null | undefined): string | null {
  const url = (user?.user_metadata ?? {}).custom_avatar_url;
  return typeof url === 'string' && url ? url : null;
}

/** El avatar que corresponde mostrar: la foto propia, si no la de la cuenta. */
export function avatarUrlOf(user: User | null | undefined): string | null {
  return customAvatarUrl(user) ?? providerAvatarUrl(user);
}

export type PickSource = 'library' | 'camera';

/**
 * Abre la galería (o la cámara) con recorte cuadrado. Devuelve null si el
 * usuario cerró el selector; lanza si negó el permiso.
 */
async function pickImage(source: PickSource): Promise<ImagePicker.ImagePickerAsset | null> {
  const permiso =
    source === 'camera'
      ? await ImagePicker.requestCameraPermissionsAsync()
      : await ImagePicker.requestMediaLibraryPermissionsAsync();
  if (!permiso.granted) {
    throw new Error(
      source === 'camera'
        ? 'Necesitamos permiso para usar la cámara. Podés darlo desde Ajustes.'
        : 'Necesitamos permiso para ver tus fotos. Podés darlo desde Ajustes.',
    );
  }

  const opciones: ImagePicker.ImagePickerOptions = {
    mediaTypes: ['images'],
    allowsEditing: true,
    aspect: [1, 1],
    quality: 0.8,
  };
  const r = source === 'camera' ? await ImagePicker.launchCameraAsync(opciones) : await ImagePicker.launchImageLibraryAsync(opciones);
  if (r.canceled || !r.assets?.length) return null;
  return r.assets[0];
}

const EXT: Record<string, string> = { 'image/png': 'png', 'image/webp': 'webp', 'image/jpeg': 'jpg' };

/** El bucket sólo acepta jpeg/png/webp: cualquier otra cosa viaja como jpeg. */
function tipoYExtension(asset: ImagePicker.ImagePickerAsset) {
  const mime = asset.mimeType && EXT[asset.mimeType] ? asset.mimeType : 'image/jpeg';
  return { mime, ext: EXT[mime] };
}

/** `https://…/storage/v1/object/public/avatars/<uid>/<archivo>` → `<uid>/<archivo>`. */
function pathDesdeUrl(url: string): string | null {
  const marca = `/storage/v1/object/public/${BUCKET}/`;
  const i = url.indexOf(marca);
  if (i < 0) return null;
  return decodeURIComponent(url.slice(i + marca.length).split('?')[0]);
}

/** Borra la foto anterior: si falla, no importa, es sólo limpieza. */
async function borrarArchivo(url: string | null) {
  const path = url && pathDesdeUrl(url);
  if (!path) return;
  await supabase.storage.from(BUCKET).remove([path]).catch(() => {});
}

/**
 * Elegir foto → subirla → dejarla como avatar. Devuelve la URL nueva, o null
 * si el usuario cerró el selector sin elegir nada.
 */
export async function pickAndUploadAvatar(source: PickSource = 'library'): Promise<string | null> {
  const asset = await pickImage(source);
  if (!asset) return null;

  const { data: userData } = await supabase.auth.getUser();
  const user = userData.user;
  if (!user) throw new Error('No hay una sesión activa.');

  const { mime, ext } = tipoYExtension(asset);
  // Nombre nuevo en cada subida: las URLs públicas se cachean fuerte.
  const path = `${user.id}/${uid()}.${ext}`;

  // En React Native fetch(file://) + arrayBuffer es la forma soportada de leer
  // el archivo; mandar el objeto {uri} sube 0 bytes.
  const res = await fetch(asset.uri);
  const bytes = await res.arrayBuffer();
  if (!bytes.byteLength) throw new Error('No pudimos leer esa imagen.');

  const { error } = await supabase.storage.from(BUCKET).upload(path, bytes, {
    contentType: mime,
    upsert: true,
  });
  if (error) throw error;

  const { data } = supabase.storage.from(BUCKET).getPublicUrl(path);
  const publicUrl = data.publicUrl;

  const anterior = customAvatarUrl(user);
  const { error: updateError } = await supabase.auth.updateUser({ data: { custom_avatar_url: publicUrl } });
  if (updateError) {
    await borrarArchivo(publicUrl); // no quedó aplicada: no dejamos basura
    throw updateError;
  }
  await borrarArchivo(anterior);
  return publicUrl;
}

/** Saca la foto propia: queda la de Apple/Google, o la inicial si no hay. */
export async function removeCustomAvatar(): Promise<void> {
  const { data } = await supabase.auth.getUser();
  const anterior = customAvatarUrl(data.user);
  const { error } = await supabase.auth.updateUser({ data: { custom_avatar_url: null } });
  if (error) throw error;
  await borrarArchivo(anterior);
}
