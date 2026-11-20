import { router, useLocalSearchParams } from 'expo-router';
import { useMemo } from 'react';
import { Pressable, View } from 'react-native';

import { Clay } from '@/components/clay';
import { Icon } from '@/components/icons';
import { useOverlay } from '@/components/overlay';
import { Avatar, Body, Button, Card, IconButton, Label, Row, Rule, Screen, Tag, Title } from '@/components/ui';
import { deleteGroup, removeMember, renameGroup } from '@/features/grupos/api';
import { useGruposAlEnfocar, useRefreshGrupos, useSetActiveGroup } from '@/features/grupos/use-grupos';
import { haptic } from '@/lib/haptics';
import { useAuth } from '@/providers/auth-provider';
import { groupById, memberRows, SIN_LOCALES, useGrupos } from '@/store/grupos';
import { border, fonts, onPlayerColor, palette, playerColor, space } from '@/theme/tokens';
import { useTheme } from '@/theme/use-theme';

export default function GrupoDetalle() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { c, scheme } = useTheme();
  const overlay = useOverlay();
  const { session } = useAuth();
  const groups = useGrupos((s) => s.groups);
  const locals = useGrupos((s) => s.locals[id] ?? SIN_LOCALES);
  const activeId = useGrupos((s) => s.activeId);
  const loading = useGrupos((s) => s.loading);
  const addLocal = useGrupos((s) => s.addLocal);
  const renameLocal = useGrupos((s) => s.renameLocal);
  const removeLocal = useGrupos((s) => s.removeLocal);
  const refresh = useRefreshGrupos();
  const setActive = useSetActiveGroup();

  // Al entrar siempre se pide la lista de nuevo: si alguien se sumó por el
  // enlace mientras la pantalla estaba abierta en otra pestaña, acá aparece.
  useGruposAlEnfocar();

  const group = groupById(groups, id);
  const meId = session?.user.id;
  const rows = useMemo(() => (group ? memberRows(group, locals, meId) : []), [group, locals, meId]);

  if (!group) {
    return (
      <Screen title="Grupo">
        <Body color={c.muted}>Este grupo ya no está disponible.</Body>
      </Screen>
    );
  }

  const soyAdmin = group.members.some((m) => m.userId === meId && m.role === 'admin');
  const soyDueño = group.ownerId === meId;
  const activo = group.id === activeId;

  async function editar() {
    await overlay.menu({
      title: group!.name,
      items: [
        ...(soyAdmin
          ? [
              {
                label: 'Cambiar el nombre',
                icon: 'flag' as const,
                onPress: async () => {
                  const nombre = await overlay.prompt({ title: 'Nombre del grupo', initial: group!.name });
                  if (!nombre) return;
                  await renameGroup(group!.id, nombre).catch(() => {});
                  refresh();
                },
              },
            ]
          : []),
        soyDueño
          ? {
              label: 'Eliminar el grupo',
              icon: 'trash' as const,
              destructive: true,
              onPress: async () => {
                const ok = await overlay.confirm({
                  title: 'Eliminar el grupo',
                  message: 'Se elimina para todos los integrantes. No se puede deshacer.',
                  confirmLabel: 'Eliminar',
                  destructive: true,
                });
                if (!ok) return;
                await deleteGroup(group!.id).catch(() => {});
                await refresh();
                router.back();
              },
            }
          : {
              label: 'Salir del grupo',
              icon: 'undo' as const,
              destructive: true,
              onPress: async () => {
                const ok = await overlay.confirm({
                  title: 'Salir del grupo',
                  message: 'Dejás de verlo. Podés volver con una invitación nueva.',
                  confirmLabel: 'Salir',
                  destructive: true,
                });
                if (!ok || !meId) return;
                await removeMember(group!.id, meId).catch(() => {});
                await refresh();
                router.back();
              },
            },
      ],
    });
  }

  async function tocarIntegrante(row: (typeof rows)[number]) {
    if (row.kind === 'local') {
      await overlay.menu({
        title: row.name,
        message: 'Sin cuenta: sólo vos lo ves, y vive en este teléfono.',
        items: [
          {
            label: 'Cambiar el nombre',
            onPress: async () => {
              const nombre = await overlay.prompt({ title: 'Nombre', initial: row.name });
              if (nombre) renameLocal(group!.id, row.id, nombre);
            },
          },
          { label: 'Quitar', destructive: true, onPress: () => removeLocal(group!.id, row.id) },
        ],
      });
      return;
    }
    if (row.isMe || !soyAdmin || row.id === group!.ownerId) return;
    await overlay.menu({
      title: row.name,
      items: [
        {
          label: 'Sacar del grupo',
          icon: 'trash',
          destructive: true,
          onPress: async () => {
            await removeMember(group!.id, row.id).catch(() => {});
            refresh();
          },
        },
      ],
    });
  }

  async function agregarSinCuenta() {
    const nombre = await overlay.prompt({
      title: 'Agregar sin cuenta',
      message: 'Queda guardado sólo en tu teléfono. Los demás del grupo no lo ven.',
      placeholder: 'Juan',
      confirmLabel: 'Agregar',
    });
    if (nombre) addLocal(group!.id, nombre);
  }

  return (
    <Screen
      title={group.name}
      meta={soyAdmin ? 'Grupo · lo administrás vos' : 'Grupo'}
      onRefresh={refresh}
      refreshing={loading}
      right={<IconButton name="sliders" label="Opciones del grupo" onPress={editar} />}
      footer={
        <Button
          label="Elegir juego para este grupo"
          trailingIcon="arrowRight"
          onPress={() => {
            setActive(group.id);
            router.push('/juegos');
          }}
        />
      }
    >
      {/* Grupo activo */}
      {activo ? (
        <Card color={palette.mostaza} style={{ marginTop: space.lg, paddingRight: 96 }}>
          <Clay name="corona" size={82} style={{ position: 'absolute', right: 6, top: -18 }} />
          <View style={{ padding: space.lg }}>
            <Body color={onPlayerColor} style={{ fontSize: 14, lineHeight: 19, fontFamily: fonts.semibold }}>
              Grupo activo: al abrir cualquier juego, sus integrantes ya aparecen cargados.
            </Body>
          </View>
        </Card>
      ) : (
        <Button
          label="Usar como grupo activo"
          variant="outline"
          style={{ marginTop: space.lg }}
          onPress={() => {
            haptic.success();
            setActive(group.id);
          }}
        />
      )}

      {/* Integrantes */}
      <Row style={{ marginTop: space.xxl, justifyContent: 'space-between' }}>
        <Row style={{ gap: 6 }}>
          <Title style={{ fontSize: 20 }}>Integrantes</Title>
          <Label style={{ fontFamily: fonts.semibold, fontSize: 15 }}>· {rows.length}</Label>
        </Row>
        <Button label="Invitar" icon="plus" size="sm" variant="outline" onPress={() => router.push(`/grupos/${group.id}/invitar`)} />
      </Row>

      <View style={{ marginTop: space.xs }}>
        {rows.map((row, i) => (
          <View key={row.kind + row.id}>
            <Pressable
              accessibilityRole="button"
              accessibilityLabel={row.name}
              onPress={() => {
                haptic.tap();
                tocarIntegrante(row);
              }}
              style={({ pressed }) => ({
                minHeight: 58,
                flexDirection: 'row',
                alignItems: 'center',
                gap: space.md,
                opacity: pressed ? 0.7 : 1,
              })}
            >
              {row.kind === 'local' ? (
                // borde punteado: no es una cuenta, es una ficha de este teléfono
                <View
                  style={{
                    width: 38,
                    height: 38,
                    borderRadius: 19,
                    borderWidth: border,
                    borderStyle: 'dashed',
                    borderColor: c.lineStrong,
                    alignItems: 'center',
                    justifyContent: 'center',
                  }}
                >
                  <Label color={c.ink} style={{ fontSize: 15 }}>
                    {row.name.slice(0, 1).toUpperCase()}
                  </Label>
                </View>
              ) : (
                <Avatar name={row.name} color={playerColor(i, scheme)} size={38} uri={row.avatarUrl} />
              )}

              <View style={{ flex: 1, gap: 1 }}>
                <Title style={{ fontSize: 16 }} numberOfLines={1}>
                  {row.name}
                </Title>
                <Label numberOfLines={1}>
                  {row.kind === 'local'
                    ? 'Sin cuenta · sólo en este teléfono'
                    : row.isMe
                      ? 'Vos'
                      : 'Con cuenta'}
                </Label>
              </View>

              {row.kind === 'local' ? (
                <Tag label="Local" bg="transparent" color={c.muted} />
              ) : row.isAdmin ? (
                <Tag label="Admin" />
              ) : null}
            </Pressable>
            <Rule />
          </View>
        ))}
      </View>

      <Pressable
        accessibilityRole="button"
        onPress={() => {
          haptic.tap();
          agregarSinCuenta();
        }}
        style={({ pressed }) => ({
          minHeight: 58,
          flexDirection: 'row',
          alignItems: 'center',
          gap: space.md,
          opacity: pressed ? 0.7 : 1,
        })}
      >
        <View
          style={{
            width: 38,
            height: 38,
            borderRadius: 19,
            borderWidth: border,
            borderStyle: 'dashed',
            borderColor: c.line,
            alignItems: 'center',
            justifyContent: 'center',
          }}
        >
          <Icon name="plus" size={18} color={c.muted} />
        </View>
        <Label color={c.ink} style={{ fontSize: 16, fontFamily: fonts.semibold }}>
          Agregar a alguien sin cuenta
        </Label>
      </Pressable>

      <View style={{ height: space.huge }} />
    </Screen>
  );
}
