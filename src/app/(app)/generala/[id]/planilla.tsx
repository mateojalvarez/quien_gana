import { router, useLocalSearchParams } from 'expo-router';
import { ScrollView, View } from 'react-native';

import { Body, Button, Label, Num, Row, Screen, Title } from '@/components/ui';
import { CATEGORIAS, posiciones, rondas, total, type Planilla } from '@/features/generala/rules';
import { useGames } from '@/store/games';
import { fonts, space } from '@/theme/tokens';
import { useTheme } from '@/theme/use-theme';

const COL = 68;

export default function PlanillaGenerala() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { c, scheme } = useTheme();
  const juego = useGames((s) => s.games[id]);

  if (!juego || juego.kind !== 'generala') {
    return (
      <Screen title="Planilla">
        <Body color={c.muted}>Esta partida ya no está.</Body>
      </Screen>
    );
  }

  const game = juego;
  const sheets = game.sheets as Record<string, Planilla>;
  const enTurno = game.players[game.turn]?.id;
  const anotadas = Math.min(...game.players.map((p) => Object.keys(sheets[p.id] ?? {}).length));
  const ronda = Math.min(anotadas + 1, rondas);
  // Resaltar la columna del que está jugando, como en el papel.
  const resaltado = scheme === 'dark' ? '#3A322D' : '#FBE3AE';

  return (
    <Screen
      title="Planilla"
      meta={`Generala · ronda ${ronda} de ${rondas}`}
      footer={<Button label="Volver a los dados" onPress={() => router.back()} />}
    >
      <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ marginTop: space.lg }}>
        <View>
          {/* Encabezados */}
          <Row style={{ height: 40 }}>
            <Label style={{ width: 120 }}>Categoría</Label>
            {game.players.map((p) => (
              <View
                key={p.id}
                style={{
                  width: COL,
                  height: 40,
                  borderTopLeftRadius: 14,
                  borderTopRightRadius: 14,
                  backgroundColor: p.id === enTurno && !game.finishedAt ? resaltado : 'transparent',
                  alignItems: 'center',
                  justifyContent: 'center',
                }}
              >
                <Title style={{ fontSize: 14 }} numberOfLines={1}>
                  {p.name}
                </Title>
              </View>
            ))}
          </Row>

          {/* Filas */}
          {CATEGORIAS.map((cat) => (
            <Row key={cat.id} style={{ height: 37, borderBottomWidth: 1, borderBottomColor: c.line }}>
              <Row style={{ width: 120, gap: 6 }}>
                <Label color={c.ink} style={{ fontSize: 15 }}>
                  {cat.name}
                </Label>
                {cat.hint ? <Label style={{ fontSize: 11, fontFamily: fonts.medium }}>{cat.hint}</Label> : null}
              </Row>
              {game.players.map((p) => {
                const celda = (sheets[p.id] ?? {})[cat.id];
                const activa = p.id === enTurno && !game.finishedAt;
                return (
                  <Row
                    key={p.id}
                    style={{
                      width: COL,
                      height: 37,
                      justifyContent: 'center',
                      backgroundColor: activa ? resaltado : 'transparent',
                    }}
                  >
                    {celda === undefined ? null : celda.cruzada ? (
                      <Label color={c.bad} style={{ fontSize: 16 }}>
                        ×
                      </Label>
                    ) : (
                      <Row>
                        <Num style={{ fontSize: 16 }}>{celda.puntos}</Num>
                        {celda.servida ? (
                          <Label color={c.ink} style={{ fontSize: 10, marginLeft: 2, marginBottom: 8 }}>
                            S
                          </Label>
                        ) : null}
                      </Row>
                    )}
                  </Row>
                );
              })}
            </Row>
          ))}

          {/* Total */}
          <Row
            style={{
              marginTop: space.sm,
              height: 48,
              borderRadius: 16,
              backgroundColor: c.inverseBg,
              paddingLeft: 14,
            }}
          >
            <Title style={{ width: 106, fontSize: 15 }} color={c.inverseInk}>
              Total
            </Title>
            {game.players.map((p) => (
              <Row key={p.id} style={{ width: COL, justifyContent: 'center' }}>
                <Num color={c.inverseInk} style={{ fontFamily: fonts.black, fontSize: 20 }}>
                  {total(sheets[p.id] ?? {})}
                </Num>
              </Row>
            ))}
          </Row>
        </View>
      </ScrollView>

      <Body color={c.muted} style={{ marginTop: space.md, fontSize: 12.5, lineHeight: 17 }}>
        <Label color={c.ink} style={{ fontSize: 12.5 }}>
          S
        </Label>{' '}
        servida en el primer tiro ·{' '}
        <Label color={c.bad} style={{ fontSize: 12.5 }}>
          ×
        </Label>{' '}
        tachada
      </Body>

      {game.finishedAt ? (
        <View style={{ marginTop: space.lg, gap: space.xs }}>
          <Title style={{ fontSize: 18 }}>Ganó {posiciones(game.players, sheets)[0]?.name}</Title>
          {game.servedWinner ? <Label>Con generala servida.</Label> : null}
        </View>
      ) : null}

      <View style={{ height: space.huge }} />
    </Screen>
  );
}
