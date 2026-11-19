import { router, useFocusEffect, useLocalSearchParams } from 'expo-router';
import { useCallback, useState } from 'react';
import { Pressable, View } from 'react-native';

import { Icon } from '@/components/icons';
import { useOverlay } from '@/components/overlay';
import { Avatar, Body, Button, Label, Row, Screen, Spinner, Tag, Title } from '@/components/ui';
import {
  borrarSorteo,
  getSorteo,
  listParticipantes,
  reenviar as reenviarApi,
  verReparto,
} from '@/features/amigo-invisible/api';
import {
  ETIQUETA,
  EXPLICACION,
  estadoMail,
  fechaCorta,
  type EstadoMail,
  type Match,
  type Participante,
  type Sorteo,
} from '@/features/amigo-invisible/types';
import { haptic } from '@/lib/haptics';
import { palette, playerColor, space } from '@/theme/tokens';
import { useTheme } from '@/theme/use-theme';

export default function EstadoSorteo() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { c } = useTheme();
  const overlay = useOverlay();

  const [sorteo, setSorteo] = useState<Sorteo | null>(null);
  const [gente, setGente] = useState<Participante[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [ocupado, setOcupado] = useState(false);
  const [reparto, setReparto] = useState<Match[] | null>(null);

  const refrescar = useCallback(async () => {
    try {
      const [s, p] = await Promise.all([getSorteo(id), listParticipantes(id)]);
      setSorteo(s);
      setGente(p);
      setError(null);
    } catch (e) {
      setError(String((e as Error)?.message ?? e));
    }
  }, [id]);

  useFocusEffect(
    useCallback(() => {
      refrescar();
    }, [refrescar]),
  );

  const colorDe = (e: EstadoMail) =>
    e === 'fallo'
      ? { bg: c.bad, fg: c.onColor }
      : e === 'abierto'
        ? { bg: palette.salvia, fg: c.ink }
        : e === 'abierto-dudoso'
          ? { bg: palette.crema, fg: c.ink }
          : { bg: c.wash, fg: c.muted };

  async function reenviar(p: Participante) {
    setOcupado(true);
    try {
      const r = await reenviarApi(id, p.id);
      haptic.success();
      await refrescar();
      if (r.fallidos.length > 0) {
        await overlay.notice({ title: 'No salió', message: r.fallidos[0].error });
      }
    } catch (e) {
      haptic.warning();
      await overlay.notice({ title: 'No se pudo reenviar', message: String((e as Error)?.message ?? e) });
    } finally {
      setOcupado(false);
    }
  }

  async function abrirFila(p: Participante) {
    const e = estadoMail(p);
    const que = await overlay.pick<'reenviar'>(
      p.name,
      [{ label: p.sentAt ? 'Reenviar el correo' : 'Mandarlo ahora', value: 'reenviar' }],
      `${p.email}\n${EXPLICACION[e]}${p.sendError ? `\n\n${p.sendError}` : ''}`,
    );
    if (que === 'reenviar') reenviar(p);
  }

  async function mostrarReparto() {
    if (reparto) {
      setReparto(null);
      return;
    }
    setOcupado(true);
    try {
      setReparto(await verReparto(id));
    } catch (e) {
      await overlay.notice({ title: 'No se pudo abrir', message: String((e as Error)?.message ?? e) });
    } finally {
      setOcupado(false);
    }
  }

  async function borrar() {
    const ok = await overlay.confirm({
      title: '¿Borrar el sorteo?',
      message: 'Se borra la lista y el resultado cifrado. Los correos que ya salieron no se pueden deshacer.',
      confirmLabel: 'Borrar',
    });
    if (!ok) return;
    try {
      await borrarSorteo(id);
      haptic.warning();
      router.back();
    } catch (e) {
      await overlay.notice({ title: 'No se pudo borrar', message: String((e as Error)?.message ?? e) });
    }
  }

  const sinSalir = gente.filter((p) => !p.sentAt).length;

  return (
    <Screen
      title={sorteo?.name ?? 'Sorteo'}
      meta="Amigo invisible"
      footer={
        sinSalir > 0 ? (
          <Button
            label={`Reintentar los ${sinSalir} que faltan`}
            loading={ocupado}
            disabled={ocupado}
            onPress={async () => {
              setOcupado(true);
              try {
                await reenviarApi(id);
                await refrescar();
              } catch (e) {
                await overlay.notice({ title: 'No se pudo', message: String((e as Error)?.message ?? e) });
              } finally {
                setOcupado(false);
              }
            }}
          />
        ) : undefined
      }
    >
      {error ? (
        <Body color={c.bad} style={{ marginTop: space.xxl }}>
          {error}
        </Body>
      ) : !sorteo ? (
        <View style={{ marginTop: space.huge, alignItems: 'center' }}>
          <Spinner color={c.muted} />
        </View>
      ) : (
        <>
          <Body color={c.muted} style={{ marginTop: space.lg }}>
            {sorteo.status === 'drawn'
              ? sorteo.revelaAlAnfitrion
                ? `Sorteado el ${fechaCorta(sorteo.drawnAt)}. Es un sorteo a la vista: podés ver el reparto, y el correo de cada uno se lo dijo.`
                : `Sorteado el ${fechaCorta(sorteo.drawnAt)}. Cada uno recibió su nombre por correo; acá no está guardado en claro ni para vos.`
              : sorteo.status === 'error'
                ? 'El sorteo quedó a medias. Probá de nuevo desde la lista.'
                : 'Todavía no se sorteó.'}
          </Body>

          {sorteo.status === 'drawn' && sorteo.revelaAlAnfitrion ? (
            <>
              <Button
                label={reparto ? 'Ocultar el reparto' : 'Ver el reparto'}
                variant="outline"
                icon="sobre"
                disabled={ocupado}
                onPress={mostrarReparto}
                style={{ marginTop: space.lg }}
              />
              {reparto ? (
                <View style={{ marginTop: space.lg, gap: space.sm }}>
                  {reparto.map((m) => (
                    <Row key={m.de} style={{ gap: space.sm, minHeight: 32 }}>
                      <Label color={c.ink} style={{ fontSize: 15 }} numberOfLines={1}>
                        {m.de}
                      </Label>
                      <Icon name="arrowRight" size={14} color={c.muted} />
                      <Label color={c.ink} style={{ flex: 1, fontSize: 15 }} numberOfLines={1}>
                        {m.para}
                      </Label>
                    </Row>
                  ))}
                </View>
              ) : null}
            </>
          ) : null}

          <Row style={{ marginTop: space.xxl, justifyContent: 'space-between', alignItems: 'baseline' }}>
            <Title style={{ fontSize: 20 }}>Correos</Title>
            <Label style={{ fontVariant: ['tabular-nums'] }}>{gente.length}</Label>
          </Row>

          {/* Decirlo acá y no en letra chica: si no, el anfitrión le reclama a
              alguien que sí leyó el mail. */}
          <Body color={c.muted} style={{ marginTop: space.sm, fontSize: 14 }}>
            Estas marcas son orientativas. Algunos correos se marcan solos y otros nunca se marcan aunque los
            hayan leído. Ante la duda, reenviá.
          </Body>

          <View style={{ marginTop: space.lg, gap: space.sm }}>
            {gente.map((p, i) => {
              const e = estadoMail(p);
              const col = colorDe(e);
              return (
                <Row
                  key={p.id}
                  style={{ gap: space.md, minHeight: 56 }}
                  // La fila entera es el objetivo: el menú de reenviar está ahí.
                >
                  <Avatar name={p.name} color={playerColor(i)} />
                  <View style={{ flex: 1, gap: 1 }}>
                    <Row style={{ gap: space.sm }}>
                      <Label color={c.ink} style={{ fontSize: 15 }} numberOfLines={1}>
                        {p.name}
                      </Label>
                      {p.esElAnfitrion ? <Tag label="Vos" bg={palette.salvia} color={c.ink} /> : null}
                    </Row>
                    <Label color={c.muted} style={{ fontSize: 13 }} numberOfLines={1}>
                      {p.email}
                      {p.openedAt ? ` · ${fechaCorta(p.openedAt)}` : ''}
                    </Label>
                  </View>
                  <Tag label={ETIQUETA[e]} bg={col.bg} color={col.fg} />
                  <Pressable
                    accessibilityRole="button"
                    accessibilityLabel={`${ETIQUETA[e]}. Opciones del correo de ${p.name}`}
                    hitSlop={6}
                    disabled={ocupado}
                    onPress={() => abrirFila(p)}
                    style={({ pressed }) => ({
                      width: 36,
                      height: 36,
                      alignItems: 'center',
                      justifyContent: 'center',
                      opacity: ocupado ? 0.3 : pressed ? 0.5 : 1,
                    })}
                  >
                    <Icon name="sobre" size={18} color={c.muted} />
                  </Pressable>
                </Row>
              );
            })}
          </View>

          <Button label="Borrar el sorteo" variant="ghost" size="sm" onPress={borrar} style={{ marginTop: space.xxl }} />
        </>
      )}
    </Screen>
  );
}
