import Constants from 'expo-constants';
import { useEffect, useState } from 'react';
import { Platform, Pressable, View } from 'react-native';

import { AppleButton, GoogleButton } from '@/components/auth-buttons';
import { Icon } from '@/components/icons';
import { useOverlay } from '@/components/overlay';
import { TAB_BAR_SPACE } from '@/components/tab-bar';
import {
  Avatar,
  Body,
  Button,
  Card,
  Label,
  Row,
  Screen,
  SectionHead,
  Segmented,
  Num,
  Tag,
  Title,
  Toggle,
} from '@/components/ui';
import {
  deleteAccount,
  displayName,
  isAppleNativeAvailable,
  isIdentityConflict,
  linkAppleNative,
  linkOAuth,
  mergeOtherAccountIntoCurrent,
  providersOf,
  signInMergingLocalGames,
  signInWithAppleNative,
  signInWithOAuth,
  signOut,
} from '@/lib/auth';
import {
  avatarUrlOf,
  customAvatarUrl,
  pickAndUploadAvatar,
  providerAvatarUrl,
  removeCustomAvatar,
} from '@/lib/avatar';
import { APODO_MAX, useApodo } from '@/features/perfil/apodo';
import { haptic } from '@/lib/haptics';
import { pull } from '@/lib/sync';
import { useAuth } from '@/providers/auth-provider';
import { useGames } from '@/store/games';
import { useSettings, type ThemePref } from '@/store/settings';
import { border, fonts, palette, radius, space } from '@/theme/tokens';
import { useTheme } from '@/theme/use-theme';

const PROVIDER_LABEL = { apple: 'Apple', google: 'Google' } as const;

export default function Ajustes() {
  const { c } = useTheme();
  const { session } = useAuth();
  const overlay = useOverlay();
  const user = session?.user;
  const theme = useSettings((s) => s.theme);
  const setTheme = useSettings((s) => s.setTheme);
  const haptics = useSettings((s) => s.haptics);
  const sonidos = useSettings((s) => s.sonidos);
  const setHaptics = useSettings((s) => s.setHaptics);
  const setSonidos = useSettings((s) => s.setSonidos);
  const liveActivities = useSettings((s) => s.liveActivities);
  const setLiveActivities = useSettings((s) => s.setLiveActivities);
  const [appleNative, setAppleNative] = useState(false);
  const [busy, setBusy] = useState<string | null>(null);

  useEffect(() => {
    isAppleNativeAvailable().then(setAppleNative);
  }, []);

  const games = useGames((s) => s.games);
  const partidas = Object.values(games);
  const stats = [
    { v: String(partidas.length), l: 'Partidas' },
    { v: String(partidas.filter((g) => g.finishedAt).length), l: 'Terminadas' },
    // Los grupos llegan en la próxima actualización: hasta entonces no hay ninguno.
    { v: '0', l: 'Grupos' },
  ];

  const isGuest = !!user?.is_anonymous;
  const providers = providersOf(user);
  const nickname = useApodo((s) => s.nickname);
  const nombre = displayName(user, nickname);

  useEffect(() => {
    if (user && !user.is_anonymous) useApodo.getState().cargar(user.id).catch(() => {});
  }, [user]);

  async function editarApodo() {
    if (!user) return;
    const valor = await overlay.prompt({
      title: 'Tu apodo',
      message: 'Es el nombre que ven en tus grupos. Dejalo vacío para usar el de tu cuenta.',
      placeholder: displayName(user),
      initial: nickname ?? '',
      confirmLabel: 'Guardar',
      maxLength: APODO_MAX,
    });
    if (valor === null) return;
    await run('apodo', async () => {
      await useApodo.getState().guardar(user.id, valor);
      haptic.success();
    });
  }
  const avatar = avatarUrlOf(user);
  const tieneFotoPropia = !!customAvatarUrl(user);
  const fotoDeLaCuenta = !!providerAvatarUrl(user);
  // Google manda foto; Apple no. Con las dos vinculadas, la que vuelve es la de Google.
  const cuentaConFoto = providers.includes('google') ? 'Google' : 'Apple';

  async function run(key: string, fn: () => Promise<unknown>) {
    setBusy(key);
    try {
      await fn();
    } catch (e: unknown) {
      const err = e as { code?: string; message?: string };
      if (err.code !== 'ERR_REQUEST_CANCELED') {
        await overlay.notice({ title: 'Algo salió mal', message: err.message ?? 'Probá de nuevo.' });
      }
    } finally {
      setBusy(null);
    }
  }

  /**
   * Tocar el avatar: elegir foto, sacarla con la cámara o volver a la de la
   * cuenta vinculada (si no hay ninguna, queda la inicial).
   */
  async function editarAvatar() {
    const quitar = tieneFotoPropia
      ? [{ label: fotoDeLaCuenta ? `Usar la foto de ${cuentaConFoto}` : 'Quitar la foto', value: 'quitar' as const }]
      : [];
    const elegido = await overlay.pick<'galeria' | 'camara' | 'quitar'>(
      'Foto de perfil',
      [
        { label: 'Elegir de mis fotos', value: 'galeria' },
        { label: 'Sacar una foto', value: 'camara' },
        ...quitar,
      ],
      tieneFotoPropia || !fotoDeLaCuenta
        ? undefined
        : `Ahora se usa la de ${cuentaConFoto}.`,
    );
    if (!elegido) return;

    await run('avatar', async () => {
      if (elegido === 'quitar') await removeCustomAvatar();
      else await pickAndUploadAvatar(elegido === 'camara' ? 'camera' : 'library');
    });
  }

  /**
   * Vincular falla si ese Apple/Google ya tiene cuenta propia. Según quién lo
   * intente, hay dos salidas distintas:
   *  · invitado  → entra a esa cuenta llevándose sus partidas locales;
   *  · con cuenta → se fusionan las dos en el servidor (la otra se elimina).
   */
  async function linkOrMerge(provider: 'apple' | 'google') {
    const link = provider === 'apple' ? linkAppleNative : () => linkOAuth('google');
    const signIn = provider === 'apple' ? signInWithAppleNative : () => signInWithOAuth('google');
    const label = PROVIDER_LABEL[provider];

    try {
      await link();
      return;
    } catch (e) {
      if (!isIdentityConflict(e)) throw e;
    }

    if (isGuest) {
      const ok = await overlay.confirm({
        title: `Ya hay una cuenta con ese ${label}`,
        message: 'Podemos entrar a esa cuenta y llevar tus partidas de invitado. Se combinan con las que ya tenga.',
        confirmLabel: 'Entrar y combinar',
      });
      if (!ok) return;
      await signInMergingLocalGames(async () => {
        await signIn();
      });
      return;
    }

    const ok = await overlay.confirm({
      title: `Ese ${label} ya tiene su propia cuenta`,
      message:
        `Las combinamos en la que estás usando ahora: vas a entrar con ${label} una vez para confirmar que es tuya, ` +
        'sus partidas pasan acá y esa cuenta se elimina. No se puede deshacer.',
      confirmLabel: 'Combinar cuentas',
      destructive: true,
    });
    if (!ok) return;
    await mergeOtherAccountIntoCurrent(signIn);
    await link(); // el proveedor quedó libre al eliminarse la otra cuenta
    await pull(); // traer las partidas que se movieron
  }

  async function confirmSignOut() {
    const ok = await overlay.confirm({
      title: 'Cerrar sesión',
      message: isGuest
        ? 'Sos invitado: si cerrás sesión vas a perder tus partidas. Vinculá una cuenta para conservarlas.'
        : 'Tus partidas quedan guardadas en tu cuenta.',
      confirmLabel: 'Cerrar sesión',
      destructive: isGuest,
    });
    if (ok) run('out', signOut);
  }

  async function confirmDelete() {
    const ok = await overlay.confirm({
      title: 'Eliminar cuenta',
      message: 'Se borran tu cuenta y todas tus partidas. No se puede deshacer.',
      confirmLabel: 'Eliminar cuenta',
      destructive: true,
    });
    if (ok) run('delete', deleteAccount);
  }

  return (
    <Screen title="Perfil" meta="Cuenta y preferencias" back={false}>
      {/* Cuenta */}
      <Card color={palette.salvia} style={{ marginTop: space.lg, padding: space.xl }}>
        <Row style={{ gap: space.lg }}>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Cambiar la foto de perfil"
            onPress={editarAvatar}
            disabled={busy === 'avatar'}
            style={({ pressed }) => ({ opacity: pressed || busy === 'avatar' ? 0.6 : 1 })}
          >
            <Avatar name={nombre} color={palette.marfil} size={54} uri={avatar} />
            {/* Chapita de cámara: avisa que el avatar se toca. */}
            <View
              style={{
                position: 'absolute',
                right: -2,
                bottom: -2,
                width: 22,
                height: 22,
                borderRadius: 11,
                backgroundColor: palette.tinta,
                borderWidth: 2,
                borderColor: palette.salvia,
                alignItems: 'center',
                justifyContent: 'center',
              }}
            >
              <Icon name="camera" size={11} color={palette.marfil} strokeWidth={2.6} />
            </View>
          </Pressable>
          <View style={{ flex: 1, gap: 2 }}>
            <Title style={{ fontSize: 22 }} color={palette.tinta} numberOfLines={1}>
              {nombre}
            </Title>
            <Label color={palette.tinta} style={{ fontSize: 13.5 }} numberOfLines={1}>
              {isGuest ? 'Invitado · solo en este teléfono' : user?.email || providers.join(' · ') || 'Cuenta'}
            </Label>
          </View>
          {!isGuest && providers.length ? <Tag label={providers.map((p) => PROVIDER_LABEL[p as 'apple' | 'google'] ?? p).join(' · ')} /> : null}
        </Row>
      </Card>

      {/* Apodo: el nombre que ven los grupos */}
      {!isGuest ? (
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Cambiar el apodo"
          onPress={editarApodo}
          disabled={busy === 'apodo'}
          style={({ pressed }) => ({
            marginTop: space.md,
            minHeight: 56,
            borderRadius: radius.field,
            borderWidth: border,
            borderColor: c.lineStrong,
            paddingHorizontal: space.lg,
            flexDirection: 'row',
            alignItems: 'center',
            gap: space.md,
            opacity: pressed || busy === 'apodo' ? 0.6 : 1,
          })}
        >
          <View style={{ flex: 1, gap: 1 }}>
            <Label>Apodo · lo ven tus grupos</Label>
            <Title style={{ fontSize: 17 }} color={nickname ? c.ink : c.muted} numberOfLines={1}>
              {nickname || 'Elegí cómo te ven'}
            </Title>
          </View>
          <Icon name="chevronRight" size={18} color={c.muted} />
        </Pressable>
      ) : null}

      {/* Estadísticas */}
      <Row style={{ marginTop: space.md, gap: space.sm }}>
        {stats.map((s) => (
          <View
            key={s.l}
            style={{
              flex: 1,
              borderRadius: radius.field,
              borderWidth: border,
              borderColor: c.lineStrong,
              paddingHorizontal: space.md,
              paddingVertical: 10,
            }}
          >
            <Num style={{ fontSize: 24 }}>{s.v}</Num>
            <Label style={{ fontFamily: fonts.semibold, fontSize: 12.5 }}>{s.l}</Label>
          </View>
        ))}
      </Row>

      {isGuest ? (
        <View style={{ gap: space.sm, marginTop: space.lg }}>
          <Body color={c.muted} style={{ fontSize: 14 }}>
            Vinculá una cuenta para guardar tus partidas y usarlas en otro dispositivo.
          </Body>
          {appleNative ? (
            <AppleButton label="Vincular con Apple" loading={busy === 'apple'} onPress={() => run('apple', () => linkOrMerge('apple'))} />
          ) : null}
          <GoogleButton label="Vincular con Google" loading={busy === 'google'} onPress={() => run('google', () => linkOrMerge('google'))} />
        </View>
      ) : null}

      {/* Preferencias */}
      <View style={{ marginTop: space.huge }}>
        <SectionHead title="Preferencias" />
        <Label style={{ marginBottom: space.sm }}>Tema</Label>
        <Segmented<ThemePref>
          options={[
            { value: 'system', label: 'Por defecto' },
            { value: 'light', label: 'Claro' },
            { value: 'dark', label: 'Oscuro' },
          ]}
          value={theme}
          onChange={setTheme}
        />

        {Platform.OS !== 'web' ? (
          <Row style={{ justifyContent: 'space-between', marginTop: space.lg, minHeight: 56 }}>
            <View style={{ flex: 1, gap: 2 }}>
              <Title style={{ fontSize: 17 }}>Vibración</Title>
              <Label>Respuesta al tocar botones y cerrar rondas</Label>
            </View>
            <Toggle value={haptics} onChange={setHaptics} label="Vibración" />
          </Row>
        ) : null}

        {Platform.OS !== 'web' ? (
          <Row style={{ justifyContent: 'space-between', marginTop: space.lg, minHeight: 56 }}>
            <View style={{ flex: 1, gap: 2 }}>
              <Title style={{ fontSize: 17 }}>Sonido</Title>
              <Label>Avisos del reloj y del pulsador. Respeta el silencio del teléfono</Label>
            </View>
            <Toggle value={sonidos} onChange={setSonidos} label="Sonido" />
          </Row>
        ) : null}

        {Platform.OS === 'ios' ? (
          <Row style={{ justifyContent: 'space-between', marginTop: space.lg, minHeight: 56 }}>
            <View style={{ flex: 1, gap: 2 }}>
              <Title style={{ fontSize: 17 }}>Pantalla bloqueada</Title>
              <Label>Ver la partida y anotar sin abrir la app</Label>
            </View>
            <Toggle value={liveActivities} onChange={setLiveActivities} label="Pantalla bloqueada" />
          </Row>
        ) : null}
      </View>

      {/* Sesión */}
      <View style={{ gap: space.sm, marginTop: space.huge }}>
        <Button label="Cerrar sesión" variant="outline" loading={busy === 'out'} onPress={confirmSignOut} />
        <Pressable
          accessibilityRole="button"
          onPress={confirmDelete}
          style={({ pressed }) => ({ height: 50, alignItems: 'center', justifyContent: 'center', opacity: pressed ? 0.6 : 1 })}
        >
          <Label color={c.bad} style={{ fontSize: 15 }}>
            {busy === 'delete' ? 'Eliminando…' : 'Eliminar cuenta'}
          </Label>
        </Pressable>
      </View>

      <Label style={{ textAlign: 'center', marginTop: space.lg }}>
        ¿Quién gana? · v{Constants.expoConfig?.version ?? '1.0.0'}
      </Label>

      {/* La barra de pestañas flota encima del scroll: este aire la deja pasar. */}
      <View style={{ height: TAB_BAR_SPACE }} />
    </Screen>
  );
}
