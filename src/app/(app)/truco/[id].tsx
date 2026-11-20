import { router, useLocalSearchParams } from 'expo-router';
import { useKeepAwake } from 'expo-keep-awake';
import { Pressable, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { Clay } from '@/components/clay';
import { Fosforos } from '@/components/fosforos';
import { useTrucoLiveActivity } from '@/features/live-activity/truco';
import { GameMenu } from '@/components/game-parts';
import { Icon } from '@/components/icons';
import { Body, Display, IconButton, Label, Num, Row, Title } from '@/components/ui';
import {
  enBuenas,
  faltan,
  matchRows,
  movePossible,
  RULES,
  scores,
  winner,
} from '@/features/truco/rules';
import type { TrucoGame } from '@/features/types';
import { haptic } from '@/lib/haptics';
import { useGames } from '@/store/games';
import { border, fonts, onPlayerColor, palette, radius, space } from '@/theme/tokens';
import { useTheme } from '@/theme/use-theme';

const COLOR_EQUIPO = [palette.mostaza, palette.tomate];

export default function TrucoPartida() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { c } = useTheme();
  const insets = useSafeAreaInsets();
  const juego = useGames((s) => s.games[id]);
  const addMove = useGames((s) => s.addTrucoMove);
  const finish = useGames((s) => s.finish);

  // Una partida de truco son varias manos mirando las cartas, no la pantalla:
  // sin esto el teléfono se bloquea solo en la mitad del reparto. Igual que en
  // el anotador y en corazones.
  useKeepAwake();

  // Antes del return temprano: el orden de los hooks no puede cambiar.
  useTrucoLiveActivity(juego?.kind === 'truco' ? juego : null);

  if (!juego || juego.kind !== 'truco') {
    return (
      <View style={{ flex: 1, backgroundColor: c.bg, paddingTop: insets.top + space.huge, paddingHorizontal: space.xl }}>
        <Body color={c.muted}>Esta partida ya no está.</Body>
      </View>
    );
  }

  const game: TrucoGame = juego;
  const puntos = scores(game);
  const ganador = winner(game);

  function tocar(team: 0 | 1, delta: 1 | -1) {
    if (!movePossible(game, { team, delta })) return;
    if (delta > 0) haptic.tap();
    else haptic.light();
    addMove(game.id, { team, delta });
    // Al llegar al objetivo la partida se cierra sola.
    const despues = scores({ ...game, moves: [...game.moves, { team, delta }] });
    if (despues[team] >= game.target && !game.finishedAt) {
      haptic.success();
      finish(game.id, true);
    }
  }

  return (
    <View style={{ flex: 1, backgroundColor: c.bg, paddingTop: insets.top + space.sm }}>
      <View style={{ paddingHorizontal: space.xl }}>
        <Row style={{ justifyContent: 'space-between' }}>
          <IconButton
            name="chevronLeft"
            label="Volver"
            onPress={() => (router.canGoBack() ? router.back() : router.replace('/'))}
          />
          <GameMenu game={game} />
        </Row>

        <View style={{ marginTop: space.md, gap: 2 }}>
          <Label>
            Truco · a {game.target}
            {ganador !== null ? ' · terminada' : ''}
          </Label>
          <Display style={{ fontSize: 30, lineHeight: 36 }} numberOfLines={1}>
            {game.players[0]?.name} vs {game.players[1]?.name}
          </Display>
        </View>
      </View>

      {/* Tanteadores */}
      <Row style={{ flex: 1, alignItems: 'stretch', gap: space.md, paddingHorizontal: space.xl, marginTop: space.lg }}>
        {[0, 1].map((i) => {
          const team = i as 0 | 1;
          const score = puntos[team];
          const buenas = enBuenas(score, game.target);
          const filas = matchRows(score, game.target);
          const gano = ganador === team;
          // La tarjeta se pinta cuando el equipo pasó a buenas, como en el mockup.
          const fondo = buenas ? COLOR_EQUIPO[team] : 'transparent';
          const tinta = buenas ? onPlayerColor : c.ink;
          const apagado = buenas ? 'rgba(21,17,16,.16)' : c.line;

          return (
            <View
              key={team}
              style={{
                flex: 1,
                borderRadius: 28,
                borderWidth: border,
                borderColor: buenas ? COLOR_EQUIPO[team] : c.lineStrong,
                backgroundColor: fondo,
                padding: space.lg - 2,
              }}
            >
              <Row style={{ justifyContent: 'space-between' }}>
                <Title style={{ fontSize: 16, flexShrink: 1 }} color={tinta} numberOfLines={1}>
                  {game.players[team]?.name}
                </Title>
                <View
                  style={{
                    width: 12,
                    height: 12,
                    borderRadius: 6,
                    // un punto del mismo color que su tarjeta se perdería: va en marfil
                    backgroundColor: buenas ? palette.marfil : COLOR_EQUIPO[team],
                    borderWidth: border,
                    borderColor: onPlayerColor,
                  }}
                />
              </Row>

              <Num
                color={tinta}
                style={{ marginTop: 6, fontFamily: fonts.black, fontSize: 72, lineHeight: 86, letterSpacing: -2 }}
              >
                {score}
              </Num>

              <Row style={{ marginTop: space.sm, gap: space.sm, flexWrap: 'wrap' }}>
                {game.target === 30 ? (
                  <View
                    style={{
                      height: 28,
                      paddingHorizontal: space.md,
                      borderRadius: radius.pill,
                      borderWidth: border,
                      borderColor: buenas ? onPlayerColor : c.lineStrong,
                      backgroundColor: buenas ? onPlayerColor : 'transparent',
                      justifyContent: 'center',
                    }}
                  >
                    <Label color={buenas ? COLOR_EQUIPO[team] : c.ink} style={{ fontSize: 13 }}>
                      {buenas ? 'Buenas' : 'Malas'}
                    </Label>
                  </View>
                ) : null}
                <Label color={tinta} style={{ fontFamily: fonts.medium, fontVariant: ['tabular-nums'] }}>
                  {gano ? '¡Ganó!' : `Faltan ${faltan(score, game.target)}`}
                </Label>
              </Row>

              {/* Fósforos */}
              {game.matches ? (
                <View style={{ marginTop: 'auto', gap: space.sm }}>
                  {game.target === 30 ? (
                    <Label color={tinta} style={{ fontSize: 12 }}>
                      Malas
                    </Label>
                  ) : null}
                  <Fosforos groups={filas.malas} color={tinta} off={apagado} />
                  {filas.buenas ? (
                    <>
                      <Row style={{ gap: 6, marginVertical: 2 }} >
                        <View style={{ flex: 1, height: border, backgroundColor: tinta }} />
                        <Label color={tinta} style={{ fontSize: 11, fontVariant: ['tabular-nums'] }}>
                          {RULES.malas}
                        </Label>
                        <View style={{ flex: 1, height: border, backgroundColor: tinta }} />
                      </Row>
                      <Label color={tinta} style={{ fontSize: 12 }}>
                        Buenas
                      </Label>
                      <Fosforos groups={filas.buenas} color={tinta} off={apagado} />
                    </>
                  ) : null}
                </View>
              ) : (
                <View style={{ marginTop: 'auto', alignItems: 'center' }}>
                  {gano ? <Clay name="corona" size={72} /> : null}
                </View>
              )}
            </View>
          );
        })}
      </Row>

      {/* Botones. Deshacer vive en el menú de la partida: abajo del tanteador
          competía por atención con el +1, que es lo único que se toca jugando. */}
      <View style={{ paddingHorizontal: space.xl, paddingBottom: insets.bottom + space.lg, gap: space.sm, marginTop: space.xxl }}>
        <Row style={{ gap: space.md, alignItems: 'stretch' }}>
          {[0, 1].map((i) => {
            const team = i as 0 | 1;
            const puedeRestar = movePossible(game, { team, delta: -1 });
            const puedeSumar = movePossible(game, { team, delta: 1 });
            return (
              <Row key={team} style={{ flex: 1, gap: space.sm }}>
                <Pressable
                  accessibilityRole="button"
                  accessibilityLabel={`Restar un punto a ${game.players[team]?.name}`}
                  accessibilityState={{ disabled: !puedeRestar }}
                  disabled={!puedeRestar}
                  onPress={() => tocar(team, -1)}
                  style={({ pressed }) => ({
                    width: 56,
                    height: 72,
                    borderRadius: 22,
                    borderWidth: border,
                    borderColor: c.lineStrong,
                    alignItems: 'center',
                    justifyContent: 'center',
                    opacity: !puedeRestar ? 0.3 : pressed ? 0.7 : 1,
                  })}
                >
                  <Icon name="minus" size={20} color={c.ink} strokeWidth={2.6} />
                </Pressable>
                <Pressable
                  accessibilityRole="button"
                  accessibilityLabel={`Sumar un punto a ${game.players[team]?.name}`}
                  accessibilityState={{ disabled: !puedeSumar }}
                  disabled={!puedeSumar}
                  onPress={() => tocar(team, 1)}
                  style={({ pressed }) => ({
                    flex: 1,
                    height: 72,
                    borderRadius: 22,
                    backgroundColor: c.inverseBg,
                    alignItems: 'center',
                    justifyContent: 'center',
                    opacity: !puedeSumar ? 0.3 : pressed ? 0.78 : 1,
                  })}
                >
                  <Num
                    color={c.inverseInk}
                    style={{ fontFamily: fonts.black, fontSize: 28, lineHeight: 34 }}
                  >
                    +1
                  </Num>
                </Pressable>
              </Row>
            );
          })}
        </Row>
      </View>
    </View>
  );
}
