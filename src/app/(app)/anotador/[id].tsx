import { useKeepAwake } from 'expo-keep-awake';
import { Redirect, useLocalSearchParams } from 'expo-router';
import { useState } from 'react';
import { Pressable, TextInput, View } from 'react-native';

import { GameMenu, HistoryTable, PlayerRow, StandingsList, WinnerBanner } from '@/components/game-parts';
import { Icon } from '@/components/icons';
import { Button, Label, Row, Screen, SectionHead } from '@/components/ui';
import { standings, winner } from '@/features/anotador/logic';
import { haptic } from '@/lib/haptics';
import { useGames } from '@/store/games';
import { border, fonts, playerColor, radius, space } from '@/theme/tokens';
import { useTheme } from '@/theme/use-theme';

export default function AnotadorGame() {
  useKeepAwake();
  const { id } = useLocalSearchParams<{ id: string }>();
  const game = useGames((s) => s.games[id]);
  const addRound = useGames((s) => s.addAnotadorRound);
  const finish = useGames((s) => s.finish);
  const { c, scheme } = useTheme();
  const [draft, setDraft] = useState<Record<string, string>>({});

  if (!game || game.kind !== 'anotador') return <Redirect href="/" />;

  const rows = standings(game);
  const roundNo = game.rounds.length + 1;
  const hasInput = Object.values(draft).some((v) => v !== '' && v !== '-');

  function commit() {
    if (!game) return;
    const round: Record<string, number> = {};
    for (const p of game.players) {
      const n = parseInt(draft[p.id] ?? '', 10);
      round[p.id] = Number.isFinite(n) ? n : 0;
    }
    addRound(game.id, round);
    setDraft({});
    const updated = useGames.getState().games[game.id];
    if (updated?.kind === 'anotador' && winner(updated)) {
      finish(game.id, true);
      haptic.success();
    } else {
      haptic.light();
    }
  }

  const champion = game.finishedAt ? rows[0] : null;

  return (
    <Screen
      title={game.title}
      meta={`Anotador · ${game.rounds.length} ${game.rounds.length === 1 ? 'ronda' : 'rondas'}${game.target ? ` · a ${game.target}` : ''} · ${game.lowestWins ? 'menos gana' : 'más gana'}`}
      right={<GameMenu game={game} />}
      keyboardToolbar
      footer={
        game.finishedAt ? null : (
          <Button label={`Anotar ronda ${roundNo}`} trailingIcon="arrowRight" disabled={!hasInput} onPress={commit} />
        )
      }
    >
      {champion ? (
        <WinnerBanner
          name={champion.player.name}
          total={champion.total}
          podium={rows.slice(0, 3).map((r) => ({
            name: r.player.name,
            total: r.total,
            color: playerColor(game.players.findIndex((p) => p.id === r.player.id), scheme),
          }))}
        />
      ) : null}

      <StandingsList
        rows={rows}
        players={game.players}
        leaderKicker={game.finishedAt ? 'Ganó' : 'Va ganando'}
        note={(_, total) => (game.target && !game.finishedAt ? `faltan ${Math.max(0, game.target - total)}` : null)}
      />

      {!game.finishedAt ? (
        <View style={{ marginTop: space.huge }}>
          <SectionHead title={`Ronda ${roundNo}`} meta="vacío = 0" />
          {game.players.map((p, i) => {
            const v = draft[p.id] ?? '';
            const negative = v.startsWith('-');
            return (
              <PlayerRow
                key={p.id}
                name={p.name}
                color={playerColor(i, scheme)}
                right={
                  <Row style={{ gap: space.sm }}>
                    <Pressable
                      accessibilityRole="button"
                      accessibilityLabel={`Puntos en ${negative ? 'positivo' : 'negativo'} para ${p.name}`}
                      hitSlop={6}
                      onPress={() => {
                        haptic.tap();
                        setDraft((d) => ({ ...d, [p.id]: negative ? v.slice(1) : `-${v}` }));
                      }}
                      style={({ pressed }) => ({
                        width: 40,
                        height: 40,
                        borderRadius: 20,
                        alignItems: 'center',
                        justifyContent: 'center',
                        borderWidth: border,
                        borderColor: negative ? c.bad : c.line,
                        opacity: pressed ? 0.6 : 1,
                      })}
                    >
                      <Icon name={negative ? 'minus' : 'plus'} size={18} color={negative ? c.bad : c.ink} />
                    </Pressable>
                    <View
                      style={{
                        width: 92,
                        height: 48,
                        borderRadius: radius.field,
                        borderWidth: border,
                        borderColor: c.line,
                        justifyContent: 'center',
                        paddingHorizontal: space.md,
                      }}
                    >
                      <TextInput
                        value={v}
                        onChangeText={(t) => {
                          const digits = t.replace(/[^\d]/g, '');
                          setDraft((d) => ({ ...d, [p.id]: (negative ? '-' : '') + digits }));
                        }}
                        keyboardType="number-pad"
                        placeholder="0"
                        placeholderTextColor={c.hint}
                        accessibilityLabel={`Puntos de ${p.name} en la ronda ${roundNo}`}
                        style={{
                          fontFamily: fonts.black,
                          fontSize: 22,
                          color: negative ? c.bad : c.ink,
                          textAlign: 'right',
                          fontVariant: ['tabular-nums'],
                        }}
                      />
                    </View>
                  </Row>
                }
              />
            );
          })}
        </View>
      ) : null}

      {game.rounds.length ? (
        <View style={{ marginTop: space.huge }}>
          <SectionHead title="Historial" meta={`${game.rounds.length} ${game.rounds.length === 1 ? 'ronda' : 'rondas'}`} />
          <HistoryTable
            players={game.players}
            rows={game.rounds.map((r) => game.players.map((p) => (r[p.id] > 0 ? `+${r[p.id]}` : (r[p.id] ?? 0))))}
          />
          <Label style={{ marginTop: space.sm }}>puntos cargados por ronda</Label>
        </View>
      ) : null}
    </Screen>
  );
}
