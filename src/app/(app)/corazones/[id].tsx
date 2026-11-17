import { useKeepAwake } from 'expo-keep-awake';
import { Redirect, useLocalSearchParams } from 'expo-router';
import { useState } from 'react';
import { View } from 'react-native';

import {
  BonusCard,
  GameMenu,
  HistoryTable,
  PlayerRow,
  RoundPills,
  StandingsList,
  WinnerBanner,
} from '@/components/game-parts';
import { Notice } from '@/components/overlay';
import { Body, Button, Label, Row, Screen, SectionHead, Segmented, Stepper } from '@/components/ui';
import {
  bidsBlocked,
  bonusForRound,
  cardsForRound,
  dealer,
  isBonusRound,
  playersInBidOrder,
  roundScore,
  standings,
  totalBids as sumBids,
  totalTricks as sumTricks,
  tricksComplete,
} from '@/features/corazones/rules';
import type { CorazonesRound } from '@/features/types';
import { haptic } from '@/lib/haptics';
import { useGames } from '@/store/games';
import { playerColor, space } from '@/theme/tokens';
import { useTheme } from '@/theme/use-theme';

type Phase = 'bids' | 'tricks';

const emptyRound = (): CorazonesRound => ({ bids: {}, tricks: {} });

export default function CorazonesGame() {
  useKeepAwake();
  const { id } = useLocalSearchParams<{ id: string }>();
  const game = useGames((s) => s.games[id]);
  const addRound = useGames((s) => s.addCorazonesRound);
  const updateRound = useGames((s) => s.updateCorazonesRound);
  const finish = useGames((s) => s.finish);
  const { c, scheme } = useTheme();

  const [phase, setPhase] = useState<Phase>('bids');
  const [draft, setDraft] = useState<CorazonesRound>(emptyRound);
  /** null = cargando la ronda nueva; número = editando esa ronda ya cerrada. */
  const [editing, setEditing] = useState<number | null>(null);

  if (!game || game.kind !== 'corazones') return <Redirect href="/" />;

  const rows = standings(game);
  const roundNo = editing != null ? editing + 1 : game.rounds.length + 1;
  const cards = cardsForRound(game, roundNo);
  const bonus = bonusForRound(game, roundNo);
  const repartidor = dealer(game, roundNo);
  const order = playersInBidOrder(game, roundNo);

  const totalBids = sumBids(game, draft);
  const totalTricks = sumTricks(game, draft);
  const blocked = bidsBlocked(game, roundNo, draft);
  const complete = tricksComplete(game, roundNo, draft);

  function set(field: keyof CorazonesRound, pid: string, n: number) {
    setDraft((d) => ({ ...d, [field]: { ...d[field], [pid]: n } }));
  }

  function reset() {
    setDraft(emptyRound());
    setPhase('bids');
    setEditing(null);
  }

  function startEdit(index: number) {
    if (!game || game.kind !== 'corazones') return;
    const r = game.rounds[index];
    setDraft({ bids: { ...r.bids }, tricks: { ...r.tricks } });
    setEditing(index);
    setPhase('bids');
  }

  function commit() {
    if (!game || game.kind !== 'corazones') return;
    const round: CorazonesRound = emptyRound();
    for (const p of game.players) {
      round.bids[p.id] = draft.bids[p.id] ?? 0;
      round.tricks[p.id] = draft.tricks[p.id] ?? 0;
    }
    if (editing != null) {
      updateRound(game.id, editing, round);
      reset();
      haptic.success();
      return;
    }
    addRound(game.id, round);
    reset();
    if (roundNo >= game.totalRounds) {
      finish(game.id, true);
      haptic.success();
    } else {
      haptic.light();
    }
  }

  const champion = game.finishedAt ? rows[0] : null;
  const editingNow = editing != null;
  const showEditor = editingNow || !game.finishedAt;
  const roundsDone = game.rounds.length;

  // Cinco pastillas alrededor de la ronda actual
  const from = Math.max(1, Math.min(roundNo - 2, Math.max(1, game.totalRounds - 4)));
  const pills = Array.from({ length: Math.min(5, game.totalRounds) }, (_, i) => ({
    n: from + i,
    cards: cardsForRound(game, from + i),
  })).filter((p) => p.n <= game.totalRounds);

  return (
    <Screen
      title={game.title}
      meta={`Corazones · ronda ${Math.min(roundNo, game.totalRounds)} de ${game.totalRounds}`}
      right={<GameMenu game={game} />}
      footer={
        !showEditor ? null : phase === 'bids' ? (
          <View style={{ gap: space.sm }}>
            {blocked ? (
              <Notice
                tone="bad"
                text={
                  repartidor
                    ? `${repartidor.name} reparte: la suma no puede dar ${cards}`
                    : `La suma no puede dar ${cards}`
                }
              />
            ) : (
              <Notice text={`${totalBids} de ${cards} pedidos`} tone={totalBids === cards ? 'ok' : 'muted'} />
            )}
            <Row style={{ gap: space.sm }}>
              {editingNow ? <Button label="Cancelar" variant="outline" style={{ width: 120 }} onPress={reset} /> : null}
              <Button
                label="Cargar bazas"
                trailingIcon="arrowRight"
                disabled={blocked}
                style={{ flex: 1 }}
                onPress={() => setPhase('tricks')}
              />
            </Row>
          </View>
        ) : (
          <View style={{ gap: space.sm }}>
            <Notice
              tone={complete ? 'ok' : 'muted'}
              text={complete ? `${cards} de ${cards} bazas cargadas` : `${totalTricks} de ${cards} bazas cargadas`}
            />
            <Row style={{ gap: space.sm }}>
              <Button label="Pedidos" variant="outline" icon="chevronLeft" style={{ width: 130 }} onPress={() => setPhase('bids')} />
              <Button
                label={editingNow ? `Guardar ronda ${roundNo}` : `Cerrar ronda ${roundNo}`}
                disabled={!complete}
                style={{ flex: 1 }}
                onPress={commit}
              />
            </Row>
          </View>
        )
      }
    >
      {champion && !editingNow ? (
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
        note={(p) => {
          const hits = game.rounds.filter((r) => r.bids[p.id] === r.tricks[p.id]).length;
          return roundsDone ? `${hits} de ${roundsDone} cumplidos` : null;
        }}
      />

      {showEditor ? (
        <>
          <RoundPills rounds={pills} current={roundNo} />

          {isBonusRound(game, roundNo) ? (
            <BonusCard
              kicker="Bonus activo"
              title={`Acierto +${bonus}`}
              note={`Desde la ronda ${game.bonusFromRound ?? roundNo} hasta el final`}
            />
          ) : null}

          <Segmented
            style={{ marginTop: space.lg }}
            options={[
              { value: 'bids', label: 'Pedidos', meta: `${totalBids}/${cards}` },
              { value: 'tricks', label: 'Bazas', meta: `${totalTricks}/${cards}` },
            ]}
            value={phase}
            onChange={(v) => setPhase(v)}
          />

          <SectionHead
            style={{ marginTop: space.xl }}
            title={phase === 'bids' ? 'Pedidos' : 'Bazas hechas'}
            meta={`${cards} ${cards === 1 ? 'carta' : 'cartas'} · acierto +${bonus}`}
          />
          <Body color={c.muted} style={{ fontSize: 13.5, marginTop: -space.sm, marginBottom: space.sm }}>
            {editingNow ? 'Editando una ronda cerrada · ' : ''}
            {repartidor ? `Reparte ${repartidor.name} y pide último` : 'Sin jugadores'}
          </Body>

          {order.map((p) => {
            const colorIndex = game.players.findIndex((x) => x.id === p.id);
            const bid = draft.bids[p.id] ?? 0;
            const tricks = draft.tricks[p.id] ?? 0;
            const preview = roundScore(game, { bids: { [p.id]: bid }, tricks: { [p.id]: tricks } }, p.id, roundNo);
            const isDealer = repartidor?.id === p.id;
            return (
              <PlayerRow
                key={p.id}
                name={p.name}
                color={playerColor(colorIndex, scheme)}
                tag={isDealer ? 'reparte' : undefined}
                caption={phase === 'tricks' ? `Pidió ${bid} · ${preview >= 0 ? '+' : ''}${preview}` : undefined}
                captionColor={phase === 'tricks' ? (bid === tricks ? c.ok : c.bad) : undefined}
                right={
                  phase === 'bids' ? (
                    <Stepper
                      value={bid}
                      onChange={(n) => set('bids', p.id, n)}
                      min={0}
                      max={cards}
                      labelMinus={`Un pedido menos para ${p.name}`}
                      labelPlus={`Un pedido más para ${p.name}`}
                    />
                  ) : (
                    <Stepper
                      value={tricks}
                      onChange={(n) => set('tricks', p.id, n)}
                      min={0}
                      max={cards}
                      labelMinus={`Una baza menos para ${p.name}`}
                      labelPlus={`Una baza más para ${p.name}`}
                    />
                  )
                }
              />
            );
          })}
        </>
      ) : null}

      {roundsDone ? (
        <View style={{ marginTop: space.huge }}>
          <SectionHead title="Historial" meta="mantené pulsado para editar" />
          <HistoryTable
            players={game.players}
            onLongPressRow={startEdit}
            rows={game.rounds.map((r, ri) =>
              game.players.map((p) => `${r.bids[p.id]}/${r.tricks[p.id]} · ${roundScore(game, r, p.id, ri + 1)}`),
            )}
          />
          <Label style={{ marginTop: space.sm }}>pedido / hechas · puntos de la ronda</Label>
        </View>
      ) : null}
    </Screen>
  );
}
