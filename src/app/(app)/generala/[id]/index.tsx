import { router, useLocalSearchParams } from 'expo-router';
import { useState } from 'react';
import { Pressable, ScrollView, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { Clay } from '@/components/clay';
import { Dado } from '@/components/dado';
import { GameMenu } from '@/components/game-parts';
import { useOverlay } from '@/components/overlay';
import { Body, Button, Display, IconButton, Label, Num, Row, Title } from '@/components/ui';
import {
  CATEGORIAS,
  generalaServida,
  libres,
  posiciones,
  puntaje,
  rondas,
  RULES,
  sugerencias,
  tirar,
  type Categoria,
  type Planilla,
} from '@/features/generala/rules';
import type { GeneralaGame } from '@/features/types';
import { haptic } from '@/lib/haptics';
import { useGames } from '@/store/games';
import { border, fonts, onPlayerColor, palette, radius, space } from '@/theme/tokens';
import { useTheme } from '@/theme/use-theme';

export default function GeneralaPartida() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { c } = useTheme();
  const insets = useSafeAreaInsets();
  const overlay = useOverlay();
  const juego = useGames((s) => s.games[id]);
  const anotar = useGames((s) => s.anotarGenerala);

  // La tirada es estado de pantalla: al salir del turno se pierde, como el
  // borrador de una ronda de Corazones.
  const [dados, setDados] = useState<number[]>([]);
  const [fijos, setFijos] = useState<boolean[]>(Array(RULES.dados).fill(false));
  const [tiro, setTiro] = useState(0);

  if (!juego || juego.kind !== 'generala') {
    return (
      <View style={{ flex: 1, backgroundColor: c.bg, paddingTop: insets.top + space.huge, paddingHorizontal: space.xl }}>
        <Body color={c.muted}>Esta partida ya no está.</Body>
      </View>
    );
  }

  const game: GeneralaGame = juego;
  const jugador = game.players[game.turn] ?? game.players[0];
  const planilla = (game.sheets[jugador.id] ?? {}) as Planilla;
  const servida = tiro === 1;
  const tirados = tiro > 0;
  const sugeridas = tirados ? sugerencias(planilla, dados, servida) : [];
  const quedan = RULES.tiros - tiro;
  const aTirar = fijos.filter((f) => !f).length;
  const anotadas = Math.min(...game.players.map((p) => Object.keys(game.sheets[p.id] ?? {}).length));
  const ronda = Math.min(anotadas + 1, rondas);

  function nuevoTurno() {
    setDados([]);
    setFijos(Array(RULES.dados).fill(false));
    setTiro(0);
  }

  function lanzar() {
    if (quedan <= 0) return;
    haptic.heavy();
    setDados(tirar(dados, tiro === 0 ? Array(RULES.dados).fill(false) : fijos));
    setTiro(tiro + 1);
  }

  async function usar(cat: Categoria, cruzada: boolean) {
    const puntos = cruzada ? 0 : puntaje(cat, dados, servida);
    const gana = !cruzada && cat === 'generala' && generalaServida(dados, servida);

    if (cruzada) {
      const nombre = CATEGORIAS.find((x) => x.id === cat)!.name;
      const ok = await overlay.confirm({
        title: `¿Tachar ${nombre}?`,
        message: 'Queda en cero y no se puede volver a usar en toda la partida.',
        confirmLabel: 'Tachar',
        destructive: true,
      });
      if (!ok) return;
    }

    haptic.success();
    anotar(game.id, jugador.id, cat, { puntos, servida: servida && puntos > 0, cruzada }, gana);
    nuevoTurno();

    if (gana) {
      await overlay.notice({
        title: '¡Generala servida!',
        message: `${jugador.name} la sacó en el primer tiro y gana la partida.`,
        okLabel: 'Ver la planilla',
      });
      router.push(`/generala/${game.id}/planilla`);
    }
  }

  async function tachar() {
    const opciones = libres(planilla).map((cat) => ({
      label: CATEGORIAS.find((x) => x.id === cat)!.name,
      value: cat,
    }));
    if (opciones.length === 0) return;
    const cat = await overlay.pick<Categoria>('¿Cuál tachás?', opciones, 'Queda en cero para el resto de la partida.');
    if (cat) usar(cat, true);
  }

  const terminada = !!game.finishedAt;

  return (
    <View style={{ flex: 1, backgroundColor: c.bg, paddingTop: insets.top + space.sm }}>
      <ScrollView
        showsVerticalScrollIndicator={false}
        contentContainerStyle={{ paddingHorizontal: space.xl, paddingBottom: insets.bottom + 100 }}
      >
        <Row style={{ justifyContent: 'space-between' }}>
          <IconButton
            name="chevronLeft"
            label="Volver"
            onPress={() => (router.canGoBack() ? router.back() : router.replace('/'))}
          />
          <Row style={{ gap: space.sm }}>
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="Ver la planilla"
              onPress={() => router.push(`/generala/${game.id}/planilla`)}
              style={({ pressed }) => ({
                height: 44,
                paddingHorizontal: space.lg,
                borderRadius: radius.pill,
                borderWidth: border,
                borderColor: c.lineStrong,
                justifyContent: 'center',
                opacity: pressed ? 0.7 : 1,
              })}
            >
              <Label color={c.ink} style={{ fontSize: 15 }}>
                Planilla
              </Label>
            </Pressable>
            <GameMenu game={game} />
          </Row>
        </Row>

        <View style={{ marginTop: space.md, gap: 2 }}>
          <Label style={{ fontVariant: ['tabular-nums'] }}>
            Generala · ronda {ronda} de {rondas}
          </Label>
          <Display style={{ fontSize: 32, lineHeight: 38 }} numberOfLines={1}>
            {terminada ? 'Partida terminada' : `Turno de ${jugador.name}`}
          </Display>
        </View>

        {/* Tanteador */}
        <Row style={{ marginTop: space.md, flexWrap: 'wrap', gap: space.sm }}>
          {posiciones(game.players, game.sheets as Record<string, Planilla>).map((p) => {
            const activo = p.id === jugador.id && !terminada;
            return (
              <Row
                key={p.id}
                style={{
                  height: 36,
                  paddingHorizontal: space.md + 2,
                  borderRadius: radius.pill,
                  borderWidth: border,
                  borderColor: c.lineStrong,
                  backgroundColor: activo ? c.inverseBg : 'transparent',
                  gap: 6,
                }}
              >
                <Label color={activo ? c.inverseInk : c.ink} style={{ fontSize: 14 }}>
                  {p.name}
                </Label>
                <Num color={activo ? c.inverseInk : c.ink} style={{ fontSize: 14 }}>
                  {p.total}
                </Num>
              </Row>
            );
          })}
        </Row>

        {terminada ? (
          <View style={{ marginTop: space.huge, alignItems: 'center', gap: space.md }}>
            <Clay name="trofeo" size={120} />
            <Display style={{ fontSize: 26, lineHeight: 32, textAlign: 'center' }}>
              Ganó {posiciones(game.players, game.sheets as Record<string, Planilla>)[0]?.name}
            </Display>
            {game.servedWinner ? <Body color={c.muted}>Con generala servida.</Body> : null}
            <Button
              label="Ver la planilla"
              style={{ marginTop: space.sm }}
              onPress={() => router.push(`/generala/${game.id}/planilla`)}
            />
          </View>
        ) : (
          <>
            {/* Dados */}
            <Row style={{ marginTop: space.huge, justifyContent: 'space-between' }}>
              {Array.from({ length: RULES.dados }, (_, i) => (
                <View key={i} style={{ alignItems: 'center', gap: 6 }}>
                  <Dado
                    valor={dados[i] ?? 0}
                    fijo={fijos[i]}
                    color={i % 2 === 0 ? palette.mostaza : palette.tomate}
                    tinta={palette.tinta}
                    borde={c.lineStrong}
                    label={
                      tirados
                        ? `Dado ${dados[i]}, ${fijos[i] ? 'fijo' : 'libre'}. Tocá para ${fijos[i] ? 'soltarlo' : 'fijarlo'}`
                        : 'Todavía no tiraste'
                    }
                    onPress={
                      tirados && quedan > 0
                        ? () => {
                            haptic.light();
                            setFijos((f) => f.map((v, j) => (j === i ? !v : v)));
                          }
                        : undefined
                    }
                  />
                  <Label style={{ fontSize: 11, height: 14 }}>{fijos[i] ? 'fijo' : ''}</Label>
                </View>
              ))}
            </Row>

            {/* Tiros */}
            <Row style={{ marginTop: space.md, gap: space.md }}>
              <Row style={{ gap: 4 }}>
                {Array.from({ length: RULES.tiros }, (_, i) => (
                  <View
                    key={i}
                    style={{
                      width: 22,
                      height: 6,
                      borderRadius: 3,
                      borderWidth: border,
                      borderColor: c.lineStrong,
                      backgroundColor: i < tiro ? c.lineStrong : 'transparent',
                    }}
                  />
                ))}
              </Row>
              <Label style={{ flex: 1, fontVariant: ['tabular-nums'] }}>
                {tiro === 0
                  ? 'Tirá los cinco dados'
                  : `Tiro ${tiro} de ${RULES.tiros}${quedan > 0 ? ' · tocá un dado para fijarlo' : ' · último'}`}
              </Label>
            </Row>

            {/* Anotar */}
            {tirados ? (
              <>
                <Row style={{ marginTop: space.xxl, justifyContent: 'space-between', alignItems: 'baseline' }}>
                  <Title style={{ fontSize: 20 }}>Anotar</Title>
                  <Label>según estos dados</Label>
                </Row>

                <View style={{ marginTop: space.md, gap: space.sm }}>
                  {sugeridas.map((s) => (
                    <Pressable
                      key={s.cat}
                      accessibilityRole="button"
                      accessibilityLabel={`Anotar ${s.name}, ${s.puntos} puntos`}
                      onPress={() => usar(s.cat, false)}
                      style={({ pressed }) => ({
                        minHeight: 60,
                        borderRadius: radius.field,
                        borderWidth: border,
                        borderColor: s.mejor ? palette.mostaza : c.lineStrong,
                        backgroundColor: s.mejor ? palette.mostaza : 'transparent',
                        flexDirection: 'row',
                        alignItems: 'center',
                        gap: space.md,
                        paddingHorizontal: space.lg,
                        paddingVertical: space.sm,
                        opacity: pressed ? 0.8 : 1,
                      })}
                    >
                      <View style={{ flex: 1, gap: 1 }}>
                        <Row style={{ gap: space.sm }}>
                          <Title style={{ fontSize: 17 }} color={s.mejor ? onPlayerColor : c.ink}>
                            {s.name}
                          </Title>
                          {s.mejor ? (
                            <View style={{ height: 22, paddingHorizontal: 9, borderRadius: radius.pill, backgroundColor: palette.tinta, justifyContent: 'center' }}>
                              <Label color={palette.marfil} style={{ fontSize: 11 }}>
                                Mejor
                              </Label>
                            </View>
                          ) : null}
                        </Row>
                        <Label color={s.mejor ? onPlayerColor : c.muted} style={{ fontFamily: fonts.medium }}>
                          {s.detalle}
                        </Label>
                      </View>
                      <Num color={s.mejor ? onPlayerColor : c.ink} style={{ fontFamily: fonts.black, fontSize: 26, lineHeight: 32 }}>
                        {s.puntos}
                      </Num>
                    </Pressable>
                  ))}

                  {sugeridas.length === 0 ? (
                    <Body color={c.muted}>
                      Con estos dados no suma ninguna categoría libre. Podés volver a tirar o tachar una.
                    </Body>
                  ) : null}

                  <Pressable
                    accessibilityRole="button"
                    accessibilityLabel="Tachar una categoría"
                    onPress={tachar}
                    style={({ pressed }) => ({
                      minHeight: 52,
                      borderRadius: radius.field,
                      borderWidth: border,
                      borderStyle: 'dashed',
                      borderColor: c.muted,
                      alignItems: 'center',
                      justifyContent: 'center',
                      opacity: pressed ? 0.6 : 1,
                    })}
                  >
                    <Label color={c.ink} style={{ fontSize: 16 }}>
                      Tachar una categoría
                    </Label>
                  </Pressable>
                </View>
              </>
            ) : null}
          </>
        )}
      </ScrollView>

      {!terminada ? (
        <View style={{ paddingHorizontal: space.xl, paddingBottom: insets.bottom + space.lg }}>
          <Button
            label={tiro === 0 ? 'Tirar los dados' : `Tirar ${aTirar} ${aTirar === 1 ? 'dado' : 'dados'}`}
            meta={tiro === 0 ? undefined : quedan > 0 ? `queda${quedan === 1 ? '' : 'n'} ${quedan}` : 'sin tiros'}
            disabled={quedan <= 0 || (tirados && aTirar === 0)}
            onPress={lanzar}
          />
        </View>
      ) : null}
    </View>
  );
}
