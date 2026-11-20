import * as Clipboard from 'expo-clipboard';
import { useLocalSearchParams } from 'expo-router';
import { useEffect, useState } from 'react';
import { Share, View } from 'react-native';
import QRCode from 'react-native-qrcode-svg';

import { useOverlay } from '@/components/overlay';
import { Avatar, Body, Button, Label, Row, Rule, Screen, Spinner, Title } from '@/components/ui';
import { currentInvite } from '@/features/grupos/api';
import { useGruposAlEnfocar } from '@/features/grupos/use-grupos';
import { formatCode, inviteUrl, type Invite } from '@/features/grupos/types';
import { haptic } from '@/lib/haptics';
import { groupById, useGrupos } from '@/store/grupos';
import { border, fonts, palette, playerColor, radius, space } from '@/theme/tokens';
import { useTheme } from '@/theme/use-theme';

function diasRestantes(expiresAt: string): string {
  const ms = new Date(expiresAt).getTime() - Date.now();
  const dias = Math.ceil(ms / 86_400_000);
  if (dias <= 0) return 'Vencida';
  if (dias === 1) return 'Vence mañana';
  return `Vence en ${dias} días`;
}

export default function Invitar() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { c, scheme } = useTheme();
  const overlay = useOverlay();
  const groups = useGrupos((s) => s.groups);
  const addLocal = useGrupos((s) => s.addLocal);
  const group = groupById(groups, id);

  // Esta es LA pantalla donde se espera que alguien entre: mientras está
  // abierta se vuelve a pedir la lista cada pocos segundos.
  useGruposAlEnfocar(5000);

  const [invite, setInvite] = useState<Invite | null>(null);
  const [error, setError] = useState(false);
  const [copiado, setCopiado] = useState(false);

  useEffect(() => {
    let vivo = true;
    currentInvite(id)
      .then((i) => vivo && setInvite(i))
      .catch(() => vivo && setError(true));
    return () => {
      vivo = false;
    };
  }, [id]);

  const url = invite ? inviteUrl(invite.code) : '';

  async function copiar() {
    if (!invite) return;
    haptic.success();
    await Clipboard.setStringAsync(url);
    setCopiado(true);
    setTimeout(() => setCopiado(false), 1800);
  }

  async function compartir() {
    if (!invite || !group) return;
    // La hoja de compartir es del sistema por necesidad: es la única forma de
    // pasarle un enlace a otra app. No es UI nuestra que se pueda reemplazar.
    await Share.share({
      message: `Te invito a "${group.name}" en ¿Quién gana?\n${url}`,
      url,
    }).catch(() => {});
  }

  async function agregarSinCuenta() {
    const nombre = await overlay.prompt({
      title: 'Agregar sin cuenta',
      message: 'Queda guardado sólo en tu teléfono. Los demás del grupo no lo ven.',
      placeholder: 'Juan',
      confirmLabel: 'Agregar',
    });
    if (nombre) addLocal(id, nombre);
  }

  return (
    <Screen title="Invitar" meta={group?.name ?? 'Grupo'}>
      {error ? (
        <Body color={c.bad} style={{ marginTop: space.lg }}>
          No se pudo crear la invitación. Revisá la conexión y volvé a entrar.
        </Body>
      ) : !invite ? (
        <Row style={{ marginTop: space.huge, justifyContent: 'center' }}>
          <Spinner color={c.muted} />
        </Row>
      ) : (
        <>
          <Row style={{ marginTop: space.lg, gap: space.lg, alignItems: 'flex-start' }}>
            <View
              style={{
                width: 132,
                height: 132,
                borderRadius: radius.card,
                borderWidth: border,
                borderColor: c.lineStrong,
                alignItems: 'center',
                justifyContent: 'center',
                // el QR se dibuja siempre tinta sobre marfil: en oscuro, invertirlo
                // lo vuelve ilegible para muchas cámaras
                backgroundColor: palette.marfil,
              }}
            >
              <QRCode value={url} size={104} color={palette.tinta} backgroundColor={palette.marfil} />
            </View>
            <View style={{ flex: 1, gap: 6 }}>
              <Body style={{ fontSize: 14, lineHeight: 19 }}>
                Que lo escaneen o abran el enlace. Al unirse, aparecen solos en cada juego del grupo.
              </Body>
              <Label style={{ fontFamily: fonts.semibold }}>{diasRestantes(invite.expiresAt)}</Label>
            </View>
          </Row>

          <Row
            style={{
              marginTop: space.lg,
              minHeight: 52,
              borderRadius: radius.field,
              borderWidth: border,
              borderColor: c.lineStrong,
              paddingLeft: space.lg,
              paddingRight: 6,
              gap: space.sm,
            }}
          >
            <Title style={{ flex: 1, fontSize: 15, fontFamily: fonts.semibold }} numberOfLines={1}>
              {formatCode(invite.code)}
            </Title>
            <Button label={copiado ? 'Copiado' : 'Copiar'} size="sm" variant="color" color={c.wash} onPress={copiar} />
          </Row>
          <Label style={{ marginTop: space.sm }}>quien-gana.app/g/{invite.code}</Label>

          <Button label="Compartir enlace" icon="arrowRight" style={{ marginTop: space.xl }} onPress={compartir} />
          <Button
            label="Agregar a alguien sin cuenta"
            variant="outline"
            size="sm"
            style={{ marginTop: space.sm }}
            onPress={agregarSinCuenta}
          />
          <Label style={{ textAlign: 'center', marginTop: space.sm }}>
            Sin cuenta: queda guardado sólo en tu teléfono.
          </Label>

          {/* Se actualiza sola: el que entra por el enlace aparece acá */}
          <Row style={{ marginTop: space.xxl, justifyContent: 'space-between', alignItems: 'baseline' }}>
            <Title style={{ fontSize: 19 }}>Ya están adentro</Title>
            <Label style={{ fontVariant: ['tabular-nums'] }}>{group?.members.length ?? 0}</Label>
          </Row>
          <View style={{ marginTop: space.xs }}>
            {(group?.members ?? []).map((m, i) => (
              <View key={m.userId}>
                <Row style={{ minHeight: 54, gap: space.md }}>
                  <Avatar name={m.name} uri={m.avatarUrl} color={playerColor(i, scheme)} size={34} />
                  <Title style={{ flex: 1, fontSize: 16 }} numberOfLines={1}>
                    {m.name}
                  </Title>
                  {m.role === 'admin' ? <Label>Admin</Label> : null}
                </Row>
                <Rule />
              </View>
            ))}
          </View>
        </>
      )}
      <View style={{ height: space.huge }} />
    </Screen>
  );
}
