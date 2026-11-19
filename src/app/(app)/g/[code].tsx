// Pantalla de unirse. Llega por el enlace universal https://quien-gana.app/g/<code>
// o por el esquema quiengana://g/<code>.

import { router, useLocalSearchParams } from 'expo-router';
import { useEffect, useState } from 'react';
import { View } from 'react-native';

import { Clay } from '@/components/clay';
import { Body, Button, Card, Display, Label, Row, Screen, Spinner, Title } from '@/components/ui';
import { joinByCode, previewInvite } from '@/features/grupos/api';
import { codeFromInput, type InvitePreview } from '@/features/grupos/types';
import { useRefreshGrupos, useSetActiveGroup } from '@/features/grupos/use-grupos';
import { haptic } from '@/lib/haptics';
import { useAuth } from '@/providers/auth-provider';
import { onPlayerColor, palette, space } from '@/theme/tokens';
import { useTheme } from '@/theme/use-theme';

type Estado =
  | { paso: 'cargando' }
  | { paso: 'lista'; preview: InvitePreview }
  | { paso: 'uniendo' }
  | { paso: 'error'; titulo: string; detalle: string };

export default function Unirse() {
  const { code: raw } = useLocalSearchParams<{ code: string }>();
  const { c } = useTheme();
  const { session } = useAuth();
  const refresh = useRefreshGrupos();
  const setActive = useSetActiveGroup();
  const code = codeFromInput(raw ?? '');
  const esInvitado = !!session?.user.is_anonymous;

  const [estado, setEstado] = useState<Estado>(() =>
    code
      ? { paso: 'cargando' }
      : { paso: 'error', titulo: 'Enlace inválido', detalle: 'Ese enlace no tiene un código de invitación.' },
  );

  useEffect(() => {
    if (!code) return;
    let vivo = true;
    previewInvite(code)
      .then((p) => {
        if (!vivo) return;
        setEstado(
          p
            ? { paso: 'lista', preview: p }
            : {
                paso: 'error',
                titulo: 'La invitación venció',
                detalle: 'Las invitaciones duran 7 días. Pedile al grupo que te mande una nueva.',
              },
        );
      })
      .catch(() => {
        if (vivo)
          setEstado({ paso: 'error', titulo: 'No se pudo abrir', detalle: 'Revisá la conexión y probá de nuevo.' });
      });
    return () => {
      vivo = false;
    };
  }, [code]);

  async function unirse() {
    if (!code) return;
    setEstado({ paso: 'uniendo' });
    const r = await joinByCode(code);
    if ('error' in r) {
      const textos: Record<typeof r.error, { titulo: string; detalle: string }> = {
        necesita_cuenta: {
          titulo: 'Primero vinculá una cuenta',
          detalle: 'Como invitado todo vive sólo en este teléfono. Vinculá Apple o Google desde Perfil y volvé a abrir el enlace.',
        },
        invitacion_invalida: {
          titulo: 'La invitación venció',
          detalle: 'Las invitaciones duran 7 días. Pedile al grupo que te mande una nueva.',
        },
        desconocido: { titulo: 'No se pudo entrar', detalle: 'Revisá la conexión y probá de nuevo.' },
      };
      setEstado({ paso: 'error', ...textos[r.error] });
      return;
    }
    haptic.success();
    await refresh();
    setActive(r.groupId);
    router.replace(`/grupos/${r.groupId}`);
  }

  return (
    <Screen title="Invitación" back>
      {estado.paso === 'cargando' ? (
        <Row style={{ marginTop: space.huge, justifyContent: 'center' }}>
          <Spinner color={c.muted} />
        </Row>
      ) : estado.paso === 'error' ? (
        <View style={{ marginTop: space.xl, alignItems: 'center', gap: space.lg }}>
          <Clay name="asteriscoTomate" size={120} />
          <Title style={{ fontSize: 22, textAlign: 'center' }}>{estado.titulo}</Title>
          <Body color={c.muted} style={{ textAlign: 'center' }}>
            {estado.detalle}
          </Body>
          <Button
            label={estado.titulo.includes('cuenta') ? 'Ir a Perfil' : 'Volver al inicio'}
            style={{ marginTop: space.sm }}
            onPress={() => router.replace(estado.titulo.includes('cuenta') ? '/perfil' : '/')}
          />
        </View>
      ) : (
        <>
          <Card color={palette.mostaza} style={{ marginTop: space.lg, paddingRight: 90 }}>
            <Clay name="composicion" size={96} style={{ position: 'absolute', right: -10, top: -22 }} />
            <View style={{ padding: space.xl, gap: 2 }}>
              <Label color={onPlayerColor}>
                {estado.paso === 'lista' && estado.preview.inviter
                  ? `${estado.preview.inviter} te invitó a`
                  : 'Te invitaron a'}
              </Label>
              <Display style={{ fontSize: 30, lineHeight: 36 }} color={onPlayerColor} numberOfLines={2}>
                {estado.paso === 'lista' ? estado.preview.groupName : ''}
              </Display>
              <Label color={onPlayerColor} style={{ marginTop: 2 }}>
                {estado.paso === 'lista'
                  ? `${estado.preview.members} ${estado.preview.members === 1 ? 'integrante' : 'integrantes'}`
                  : ''}
              </Label>
            </View>
          </Card>

          <Body color={c.muted} style={{ marginTop: space.xl }}>
            Al entrar, los integrantes del grupo aparecen cargados cada vez que empezás una partida.
          </Body>

          {esInvitado ? (
            <Body color={c.bad} style={{ marginTop: space.md, fontSize: 14 }}>
              Estás como invitado. Vinculá una cuenta desde Perfil para poder entrar a un grupo.
            </Body>
          ) : null}

          <Button
            label="Entrar al grupo"
            style={{ marginTop: space.xl }}
            loading={estado.paso === 'uniendo'}
            onPress={unirse}
          />
          <Button label="Ahora no" variant="ghost" style={{ marginTop: space.xs }} onPress={() => router.replace('/')} />
        </>
      )}
    </Screen>
  );
}
