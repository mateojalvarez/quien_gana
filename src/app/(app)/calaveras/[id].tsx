import { useKeepAwake } from 'expo-keep-awake';
import { Redirect, useLocalSearchParams } from 'expo-router';
import { useState } from 'react';
import { View } from 'react-native';

import { GameMenu, HistoryTable, PlayerRow, RoundPills, StandingsList, WinnerBanner } from '@/components/game-parts';
import { Notice } from '@/components/overlay';
import { Avatar, Body, Button, Card, Label, Num, Row, Screen, SectionHead, Segmented, Stepper, Title, Toggle } from '@/components/ui';
import {
  acerto,
  APUESTAS,
  bazasEsperadas,
  bonusActivos,
  cardsForRound,
  dealer,
  emptyRound,
  LIMITS,
  necesitaBonus,
  roundScore,
  standings,
} from '@/features/calaveras/rules';
import type { CalaverasRound } from '@/features/types';
import { haptic } from '@/lib/haptics';
import { useGames } from '@/store/games';
import { fonts, playerColor, space } from '@/theme/tokens';
import { useTheme } from '@/theme/use-theme';

type Phase = 'bids' | 'tricks' | 'bonus';

const firmado = (n: number) => (n > 0 ? `+${n}` : String(n));

export default function CalaverasPartida() {
  useKeepAwake();
  const { id } = useLocalSearchParams<{ id: string }>();
  const game = useGames((s) => s.games[id]);
  const addRound = useGames((s) => s.addCalaverasRound);
  const updateRound = useGames((s) => s.updateCalaverasRound);
  const finish = useGames((s) => s.finish);
  const { c, scheme } = useTheme();

  const [phase, setPhase] = useState<Phase>('bids');
  const [draft, setDraft] = useState<CalaverasRound>(emptyRound);
  /** null = cargando la ronda nueva; número = editando esa ronda ya cerrada. */
  const [editing, setEditing] = useState<number | null>(null);

  if (!game || game.kind !== 'calaveras') return <Redirect href="/" />;

  const { extras } = game;
  const rows = standings(game);
  const roundNo = editing != null ? editing + 1 : game.rounds.length + 1;
  const cards = cardsForRound(roundNo);
  const esperadas = bazasEsperadas(roundNo, extras.edicionNueva && draft.kraken);
  const repartidor = dealer(game, roundNo);
  const activos = bonusActivos(extras);

  const sumBids = game.players.reduce((a, p) => a + (draft.bids[p.id] ?? 0), 0);
  const sumTricks = game.players.reduce((a, p) => a + (draft.tricks[p.id] ?? 0), 0);
  const complete = sumTricks === esperadas;
  const conBonus = necesitaBonus(draft, game.players, extras);

  function set(field: 'bids' | 'tricks' | 'apuesta', pid: string, n: number) {
    setDraft((d) => ({ ...d, [field]: { ...d[field], [pid]: n } }));
  }

  function setBonus(pid: string, key: string, n: number) {
    setDraft((d) => ({ ...d, bonus: { ...d.bonus, [pid]: { ...(d.bonus[pid] ?? {}), [key]: n } } }));
  }

  function reset() {
    setDraft(emptyRound());
    setPhase('bids');
    setEditing(null);
  }

  function startEdit(index: number) {
    if (!game || game.kind !== 'calaveras') return;
    haptic.tap();
    const r = game.rounds[index];
    setDraft({
      bids: { ...r.bids },
      tricks: { ...r.tricks },
      bonus: Object.fromEntries(Object.entries(r.bonus).map(([k, v]) => [k, { ...v }])),
      apuesta: { ...r.apuesta },
      kraken: r.kraken,
    });
    setEditing(index);
    setPhase('bids');
  }

  function commit() {
    if (!game || game.kind !== 'calaveras') return;
    const round = emptyRound();
    round.kraken = extras.edicionNueva && draft.kraken;
    for (const p of game.players) {
      round.bids[p.id] = draft.bids[p.id] ?? 0;
      round.tricks[p.id] = draft.tricks[p.id] ?? 0;
      // Los bonus de quien no acertó no cuentan: no se guardan para no confundir al editar.
      if (acerto(round, p.id) && draft.bonus[p.id]) {
        const limpio = Object.fromEntries(Object.entries(draft.bonus[p.id]).filter(([, n]) => n > 0));
        if (Object.keys(limpio).length) round.bonus[p.id] = limpio;
      }
      if (extras.edicionNueva && draft.apuesta[p.id]) round.apuesta[p.id] = draft.apuesta[p.id];
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

  // Cinco pastillas alrededor de la ronda actual
  const from = Math.max(1, Math.min(roundNo - 2, Math.max(1, game.totalRounds - 4)));
  const pills = Array.from({ length: Math.min(5, game.totalRounds) }, (_, i) => ({
    n: from + i,
    cards: cardsForRound(from + i),
  })).filter((p) => p.n <= game.totalRounds);

  const cerrar = (
    <Button
      label={editingNow ? `Guardar ronda ${roundNo}` : `Cerrar ronda ${roundNo}`}
      disabled={!complete}
      style={{ flex: 1 }}
      onPress={commit}
    />
  );

  const footer = !showEditor ? null : phase === 'bids' ? (
    <View style={{ gap: space.sm }}>
      <Notice
        tone="muted"
        text={`Pidieron ${sumBids} de ${cards} · ${sumBids > cards ? 'van a pelear' : sumBids < cards ? 'sobran bazas' : 'justo'}`}
      />
      <Row style={{ gap: space.sm }}>
        {editingNow ? <Button label="Cancelar" variant="outline" style={{ width: 120 }} onPress={reset} /> : null}
        <Button label="Cargar bazas" trailingIcon="arrowRight" style={{ flex: 1 }} onPress={() => setPhase('tricks')} />
      </Row>
    </View>
  ) : phase === 'tricks' ? (
    <View style={{ gap: space.sm }}>
      <Notice tone={complete ? 'ok' : 'muted'} text={`${sumTricks} de ${esperadas} bazas cargadas`} />
      <Row style={{ gap: space.sm }}>
        <Button label="Pedidos" variant="outline" icon="chevronLeft" style={{ width: 130 }} onPress={() => setPhase('bids')} />
        {conBonus ? (
          <Button
            label="Bonus"
            trailingIcon="arrowRight"
            disabled={!complete}
            style={{ flex: 1 }}
            onPress={() => setPhase('bonus')}
          />
        ) : (
          cerrar
        )}
      </Row>
    </View>
  ) : (
    <Row style={{ gap: space.sm }}>
      <Button label="Bazas" variant="outline" icon="chevronLeft" style={{ width: 130 }} onPress={() => setPhase('tricks')} />
      {cerrar}
    </Row>
  );

  return (
    <Screen
      title={game.title}
      meta={`Calaveras y piratas · ronda ${Math.min(roundNo, game.totalRounds)} de ${game.totalRounds}`}
      right={<GameMenu game={game} />}
      footer={footer}
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
          const n = game.rounds.length;
          const hits = game.rounds.filter((r) => acerto(r, p.id)).length;
          return n ? `${hits} de ${n} cumplidos` : null;
        }}
      />

      {showEditor ? (
        <>
          <RoundPills rounds={pills} current={roundNo} />

          <Segmented
            style={{ marginTop: space.lg }}
            options={[
              { value: 'bids', label: 'Pedidos', meta: String(sumBids) },
              { value: 'tricks', label: 'Bazas', meta: `${sumTricks}/${esperadas}` },
              ...(conBonus ? [{ value: 'bonus' as const, label: 'Bonus' }] : []),
            ]}
            value={phase}
            onChange={(v) => setPhase(v)}
          />

          <SectionHead
            style={{ marginTop: space.xl }}
            title={phase === 'bids' ? 'Pedidos' : phase === 'tricks' ? 'Bazas hechas' : 'Bonus y apuestas'}
            meta={`${cards} ${cards === 1 ? 'carta' : 'cartas'}`}
          />
          <Body color={c.muted} style={{ fontSize: 13.5, marginTop: -space.sm, marginBottom: space.sm }}>
            {editingNow ? 'Editando una ronda cerrada · ' : ''}
            {phase === 'bonus'
              ? 'Los bonus sólo cuentan para quien acertó.'
              : repartidor
                ? `Reparte ${repartidor.name}`
                : 'Sin jugadores'}
          </Body>

          {phase === 'tricks' && extras.edicionNueva ? (
            <Row style={{ minHeight: 62, justifyContent: 'space-between', gap: space.lg }}>
              <View style={{ flex: 1, gap: 2 }}>
                <Title style={{ fontSize: 16 }}>Salió el Kraken</Title>
                <Label>Una baza se pierde: suman {cards - 1}</Label>
              </View>
              <Toggle value={draft.kraken} onChange={(v) => setDraft((d) => ({ ...d, kraken: v }))} label="Salió el Kraken" />
            </Row>
          ) : null}

          {phase === 'bonus'
            ? game.players.map((p, i) => {
                const ok = acerto(draft, p.id);
                const puntos = roundScore(draft, p.id, roundNo, extras);
                const cuenta = draft.bonus[p.id] ?? {};
                return (
                  <Card key={p.id} style={{ padding: space.lg, gap: space.sm, marginBottom: space.md }}>
                    <Row style={{ gap: space.md }}>
                      <Avatar name={p.name} color={playerColor(i, scheme)} size={34} />
                      <View style={{ flex: 1, minWidth: 0 }}>
                        <Title style={{ fontSize: 17 }} numberOfLines={1}>
                          {p.name}
                        </Title>
                        <Label color={ok ? c.ok : c.bad}>
                          {ok ? 'Acertó' : 'Falló'} · pidió {draft.bids[p.id] ?? 0}, hizo {draft.tricks[p.id] ?? 0}
                        </Label>
                      </View>
                      <Num style={{ fontSize: 22, fontFamily: fonts.black }} color={puntos < 0 ? c.bad : c.ink}>
                        {firmado(puntos)}
                      </Num>
                    </Row>

                    {ok
                      ? activos.map((b) => (
                          <Row key={b.key} style={{ gap: space.md, minHeight: 44 }}>
                            <Label style={{ flex: 1, fontSize: 13.5 }} color={c.ink}>
                              {b.label} · {firmado(b.valor)}
                            </Label>
                            <Stepper
                              value={cuenta[b.key] ?? 0}
                              onChange={(n) => setBonus(p.id, b.key, n)}
                              max={LIMITS.maxBonus}
                              size={34}
                              labelMinus={`${b.label}: uno menos para ${p.name}`}
                              labelPlus={`${b.label}: uno más para ${p.name}`}
                            />
                          </Row>
                        ))
                      : null}

                    {extras.edicionNueva ? (
                      <View style={{ gap: space.xs, marginTop: space.xs }}>
                        <Label style={{ fontSize: 13 }}>Apuesta del Rascal</Label>
                        <Segmented
                          options={APUESTAS.map((n) => ({ value: n, label: n ? `${n}` : 'Nada' }))}
                          value={draft.apuesta[p.id] ?? 0}
                          onChange={(n) => set('apuesta', p.id, n)}
                        />
                      </View>
                    ) : null}
                  </Card>
                );
              })
            : game.players.map((p, i) => {
                const bid = draft.bids[p.id] ?? 0;
                const tricks = draft.tricks[p.id] ?? 0;
                const preview = roundScore({ ...emptyRound(), bids: { [p.id]: bid }, tricks: { [p.id]: tricks } }, p.id, roundNo, extras);
                return (
                  <PlayerRow
                    key={p.id}
                    name={p.name}
                    color={playerColor(i, scheme)}
                    tag={repartidor?.id === p.id ? 'reparte' : undefined}
                    caption={phase === 'tricks' ? `Pidió ${bid} · ${firmado(preview)}` : undefined}
                    captionColor={phase === 'tricks' ? (bid === tricks ? c.ok : c.bad) : undefined}
                    right={
                      <Stepper
                        value={phase === 'bids' ? bid : tricks}
                        onChange={(n) => set(phase === 'bids' ? 'bids' : 'tricks', p.id, n)}
                        min={0}
                        max={cards}
                        labelMinus={phase === 'bids' ? `Un pedido menos para ${p.name}` : `Una baza menos para ${p.name}`}
                        labelPlus={phase === 'bids' ? `Un pedido más para ${p.name}` : `Una baza más para ${p.name}`}
                      />
                    }
                  />
                );
              })}
        </>
      ) : null}

      {game.rounds.length ? (
        <View style={{ marginTop: space.huge }}>
          <SectionHead title="Historial" meta="mantené pulsado para editar" />
          <HistoryTable
            players={game.players}
            onLongPressRow={startEdit}
            rows={game.rounds.map((r, ri) =>
              game.players.map((p) => `${r.bids[p.id] ?? 0}/${r.tricks[p.id] ?? 0} · ${roundScore(r, p.id, ri + 1, extras)}`),
            )}
          />
          <Label style={{ marginTop: space.sm }}>pedido / hechas · puntos de la ronda</Label>
        </View>
      ) : null}
    </Screen>
  );
}
