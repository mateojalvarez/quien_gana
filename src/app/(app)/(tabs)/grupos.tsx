import { router } from 'expo-router';
import { useState } from 'react';
import { Pressable, RefreshControl, ScrollView, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { Clay } from '@/components/clay';
import { Icon } from '@/components/icons';
import { useOverlay } from '@/components/overlay';
import { TAB_BAR_SPACE } from '@/components/tab-bar';
import { Avatar, Body, Button, Display, Label, Row, Spinner, Tag, Title } from '@/components/ui';
import { createGroup } from '@/features/grupos/api';
import { useGruposSync, useRefreshGrupos, useSetActiveGroup } from '@/features/grupos/use-grupos';
import { haptic } from '@/lib/haptics';
import { useAuth } from '@/providers/auth-provider';
import { useGrupos } from '@/store/grupos';
import { onPlayerColor, palette, playerColor, radius, space } from '@/theme/tokens';
import { useTheme } from '@/theme/use-theme';

const COLORES = [palette.mostaza, palette.salvia, palette.rosa, palette.tomate, palette.crema];

export default function Grupos() {
  const { c, scheme } = useTheme();
  const insets = useSafeAreaInsets();
  const overlay = useOverlay();
  const { session } = useAuth();
  const groups = useGrupos((s) => s.groups);
  const locals = useGrupos((s) => s.locals);
  const activeId = useGrupos((s) => s.activeId);
  const loading = useGrupos((s) => s.loading);
  const refresh = useRefreshGrupos();
  const setActive = useSetActiveGroup();
  const [creando, setCreando] = useState(false);

  useGruposSync();

  const esInvitado = !!session?.user.is_anonymous;

  async function crear() {
    if (esInvitado) {
      await overlay.notice({
        title: 'Primero vinculá una cuenta',
        message:
          'Como invitado, todo lo tuyo vive sólo en este teléfono y se pierde al cerrar sesión. ' +
          'Un grupo es compartido: vinculá Apple o Google desde Perfil y volvé.',
        okLabel: 'Ir a Perfil',
      });
      router.push('/perfil');
      return;
    }
    const nombre = await overlay.prompt({
      title: 'Nuevo grupo',
      message: 'Después vas a poder invitar por enlace o QR.',
      placeholder: 'Los del viernes',
      confirmLabel: 'Crear grupo',
    });
    if (!nombre) return;
    setCreando(true);
    try {
      const id = await createGroup(nombre);
      await refresh();
      setActive(id);
      router.push(`/grupos/${id}`);
    } catch {
      await overlay.notice({ title: 'No se pudo crear', message: 'Revisá la conexión y probá de nuevo.' });
    } finally {
      setCreando(false);
    }
  }

  return (
    <View style={{ flex: 1, backgroundColor: c.bg, paddingTop: insets.top }}>
      <ScrollView
        showsVerticalScrollIndicator={false}
        refreshControl={<RefreshControl refreshing={loading} onRefresh={refresh} tintColor={c.muted} />}
        contentContainerStyle={{
          paddingTop: space.lg,
          paddingHorizontal: space.xl,
          paddingBottom: insets.bottom + TAB_BAR_SPACE,
        }}
      >
        <Row style={{ justifyContent: 'space-between', alignItems: 'flex-end' }}>
          <View style={{ flex: 1, gap: 2 }}>
            <Label>Tus jugadores de siempre</Label>
            <Display>Grupos</Display>
          </View>
          {groups.length > 0 ? (
            <Button label="Crear" icon="plus" size="sm" loading={creando} onPress={crear} />
          ) : null}
        </Row>

        {groups.length === 0 ? (
          <View style={{ marginTop: space.huge, alignItems: 'center', gap: space.lg }}>
            <Clay name="composicion" size={200} />
            <Body color={c.muted} style={{ textAlign: 'center' }}>
              Un grupo guarda a los que juegan siempre.{'\n'}Al elegirlo, aparecen cargados en cada juego.
            </Body>
            <Button label="Crear grupo" icon="plus" loading={creando} onPress={crear} style={{ marginTop: space.sm }} />
          </View>
        ) : (
          <View style={{ marginTop: space.xl, gap: space.lg }}>
            {groups.map((g, i) => {
              const color = COLORES[i % COLORES.length];
              const sinCuenta = (locals[g.id] ?? []).length;
              const total = g.members.length + sinCuenta;
              const activo = g.id === activeId;
              return (
                <Pressable
                  key={g.id}
                  accessibilityRole="button"
                  accessibilityLabel={g.name}
                  onPress={() => {
                    haptic.tap();
                    router.push(`/grupos/${g.id}`);
                  }}
                  style={({ pressed }) => ({
                    borderRadius: radius.card,
                    backgroundColor: color,
                    padding: space.lg,
                    opacity: pressed ? 0.85 : 1,
                  })}
                >
                  <Row style={{ gap: space.sm }}>
                    <Title style={{ fontSize: 22, flexShrink: 1 }} color={onPlayerColor} numberOfLines={1}>
                      {g.name}
                    </Title>
                    {activo ? <Tag label="Activo" /> : null}
                  </Row>
                  <Label color={onPlayerColor} style={{ marginTop: 2 }}>
                    {total} {total === 1 ? 'integrante' : 'integrantes'}
                    {sinCuenta > 0 ? ` · ${sinCuenta} sin cuenta` : ''}
                  </Label>
                  <Row style={{ marginTop: space.md, justifyContent: 'space-between' }}>
                    <Row>
                      {g.members.slice(0, 5).map((m, j) => {
                        // un avatar del mismo color que su tarjeta se perdería
                        const col = playerColor(j, scheme);
                        return (
                          <Avatar
                            key={m.userId}
                            name={m.name}
                            color={col === color ? palette.marfil : col}
                            size={32}
                            ring={color}
                            style={{ marginRight: -7 }}
                          />
                        );
                      })}
                    </Row>
                    <Icon name="chevronRight" size={20} color={onPlayerColor} />
                  </Row>
                </Pressable>
              );
            })}
            {loading ? (
              <Row style={{ justifyContent: 'center', paddingVertical: space.md }}>
                <Spinner color={c.muted} />
              </Row>
            ) : null}
          </View>
        )}
      </ScrollView>
    </View>
  );
}
