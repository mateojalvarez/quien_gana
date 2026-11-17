import { router, useLocalSearchParams } from 'expo-router';
import { useState } from 'react';
import { Pressable, TextInput, View } from 'react-native';

import { Clay } from '@/components/clay';
import { Icon } from '@/components/icons';
import {
  Avatar,
  Body,
  Button,
  Card,

  Field,
  Label,
  Num,
  Row,
  Screen,
  SectionHead,
  Segmented,
  Stepper,
  Tag,
} from '@/components/ui';
import { Reorderable } from '@/components/reorderable';
import { DEFAULTS, LIMITS, maxCards, maxPlayersFor, maxRoundsFor } from '@/features/corazones/rules';
import type { GameKind } from '@/features/types';
import { haptic } from '@/lib/haptics';
import { uid } from '@/lib/id';
import { useGames } from '@/store/games';
import { border, fonts, onPlayerColor, palette, playerColor, radius, space } from '@/theme/tokens';
import { useTheme } from '@/theme/use-theme';

/** El anotador no reparte cartas, así que su tope es sólo de practicidad. */
const MAX_PLAYERS_ANOTADOR = 8;
const ROW_H = 58;

export default function NuevaPartida() {
  const { kind: kindParam } = useLocalSearchParams<{ kind?: string }>();
  const kind: GameKind = kindParam === 'corazones' ? 'corazones' : 'anotador';
  const { c, scheme } = useTheme();
  const create = useGames((s) => s.create);

  const [title, setTitle] = useState('');
  const [players, setPlayers] = useState<{ id: string; name: string }[]>(() => [
    { id: uid(), name: '' },
    { id: uid(), name: '' },
  ]);
  const [target, setTarget] = useState<number | null>(kind === 'anotador' ? 100 : null);
  const [lowestWins, setLowestWins] = useState(false);
  const [totalRounds, setTotalRounds] = useState<number>(DEFAULTS.totalRounds);
  const [decks, setDecks] = useState<number>(DEFAULTS.decks);
  const [bonusFromRound, setBonusFromRound] = useState<number>(DEFAULTS.bonusFromRound);

  const named = players.map((p) => p.name.trim()).filter(Boolean);
  const cards = maxCards(named.length, decks);
  const canCreate = named.length >= 2;

  // En Corazones el mazo manda: `rondas × jugadores` cartas tienen que entrar en
  // `52 × mazos`. El tope de jugadores sale de ahí, y el de rondas es el mismo
  // límite visto desde el otro lado, para no dejar la partida en un estado que
  // no se puede repartir.
  const maxPlayers = kind === 'corazones' ? maxPlayersFor(totalRounds, decks) : MAX_PLAYERS_ANOTADOR;
  const maxRounds = Math.min(30, maxRoundsFor(players.length, decks));

  function setPlayerName(id: string, name: string) {
    setPlayers((ps) => ps.map((p) => (p.id === id ? { ...p, name } : p)));
  }

  function movePlayer(from: number, to: number) {
    setPlayers((ps) => {
      const next = ps.slice();
      const [moved] = next.splice(from, 1);
      next.splice(to, 0, moved);
      return next;
    });
    haptic.success();
  }

  /** Bajar mazos puede dejar las rondas sin cartas: se recortan a lo que entre. */
  function changeDecks(d: number) {
    setDecks(d);
    setTotalRounds((r) => Math.min(r, maxRoundsFor(players.length, d)));
  }

  function submit() {
    const fallbackTitle = `${kind === 'anotador' ? 'Partida' : 'Corazones'} ${new Date().toLocaleDateString('es-AR', { day: '2-digit', month: '2-digit' })}`;
    const id =
      kind === 'anotador'
        ? create({ kind, title: title.trim() || fallbackTitle, players: named, target, lowestWins })
        : create({
            kind,
            title: title.trim() || fallbackTitle,
            players: named,
            totalRounds,
            decks,
            bonusFromRound: Math.min(bonusFromRound, totalRounds),
          });
    haptic.success();
    router.replace(kind === 'anotador' ? `/anotador/${id}` : `/corazones/${id}`);
  }

  return (
    <Screen
      title="Nueva partida"
      meta={kind === 'anotador' ? 'Anotador' : 'Corazones'}
      decor={
        <View style={{ position: 'absolute', right: -8, top: 4 }} pointerEvents="none">
          <Clay name={kind === 'corazones' ? 'corazon' : 'lapiz'} size={96} />
        </View>
      }
      footer={
        <Button
          label="Repartir"
          meta={canCreate ? `${named.length} jugadores` : undefined}
          trailingIcon="arrowRight"
          disabled={!canCreate}
          onPress={submit}
        />
      }
    >
      <Field
        label="Nombre de la partida (opcional)"
        value={title}
        onChangeText={setTitle}
        placeholder={kind === 'anotador' ? 'Truco del viernes' : 'Corazones en lo de Juli'}
        style={{ marginTop: space.lg }}
      />

      <View style={{ marginTop: space.xxl }}>
        <SectionHead title="Jugadores" meta={`${named.length} de ${maxPlayers}`} />
        <Reorderable
          items={players}
          keyOf={(p) => p.id}
          rowHeight={ROW_H}
          gap={space.sm}
          onReorder={movePlayer}
          renderItem={({ id, name }, i) => (
            <Row
              style={{
                height: ROW_H,
                backgroundColor: c.bg,
                borderRadius: radius.field,
                borderWidth: border,
                borderColor: c.lineStrong,
                paddingLeft: space.md,
                paddingRight: 6,
                gap: space.md,
              }}
            >
              <Icon name="grip" size={16} color={c.muted} />
              <Avatar name={name || `${i + 1}`} color={playerColor(i, scheme)} size={34} />
              <TextInput
                value={name}
                onChangeText={(v) => setPlayerName(id, v)}
                placeholder={`Jugador ${i + 1}`}
                placeholderTextColor={c.muted}
                style={{ flex: 1, fontFamily: fonts.semibold, fontSize: 17, color: c.ink, paddingVertical: space.md }}
                returnKeyType="next"
                autoCapitalize="words"
              />
              {kind === 'corazones' && i === 0 && name.trim() ? <Tag label="Reparte" /> : null}
              {players.length > 2 ? (
                <Pressable
                  accessibilityRole="button"
                  accessibilityLabel={`Quitar ${name.trim() || `jugador ${i + 1}`}`}
                  hitSlop={6}
                  onPress={() => {
                    haptic.tap();
                    setPlayers((ps) => ps.filter((p) => p.id !== id));
                  }}
                  style={({ pressed }) => ({ width: 44, height: 44, alignItems: 'center', justifyContent: 'center', opacity: pressed ? 0.5 : 1 })}
                >
                  <Icon name="close" size={18} color={c.muted} />
                </Pressable>
              ) : null}
            </Row>
          )}
        />

        <View style={{ marginTop: space.sm }}>
          {players.length < maxPlayers ? (
            <Pressable
              accessibilityRole="button"
              onPress={() => {
                haptic.tap();
                setPlayers((ps) => [...ps, { id: uid(), name: '' }]);
              }}
              style={({ pressed }) => ({
                height: 54,
                borderRadius: radius.field,
                borderWidth: border,
                borderColor: c.muted,
                borderStyle: 'dashed',
                alignItems: 'center',
                justifyContent: 'center',
                flexDirection: 'row',
                gap: space.sm,
                opacity: pressed ? 0.6 : 1,
              })}
            >
              <Icon name="plus" size={18} color={c.ink} />
              <Label color={c.ink} style={{ fontSize: 16 }}>
                Agregar jugador
              </Label>
            </Pressable>
          ) : kind === 'corazones' ? (
            <Body color={c.muted} style={{ fontSize: 13.5, lineHeight: 19 }}>
              {maxPlayers === LIMITS.maxPlayers
                ? `Son ${LIMITS.maxPlayers} jugadores como máximo.`
                : `Con ${totalRounds} rondas y ${decks} mazo${decks > 1 ? 's' : ''} entran ${maxPlayers} jugadores. Para sumar más, bajá las rondas o sumá un mazo.`}
            </Body>
          ) : null}
        </View>
      </View>

      <View style={{ marginTop: space.xxl }}>
        <SectionHead title="Reglas" />

        {kind === 'corazones' ? (
          <>
            <Row style={{ gap: space.md, alignItems: 'stretch' }}>
              <Card color={palette.salvia} style={{ flex: 1, padding: space.lg, gap: space.md }}>
                <Label color={onPlayerColor} style={{ fontSize: 14 }}>
                  Rondas
                </Label>
                <Stepper value={totalRounds} onChange={setTotalRounds} min={1} max={maxRounds} size={36} onColored />
              </Card>
              <Card color={palette.rosa} style={{ flex: 1, padding: space.lg, gap: space.md }}>
                <Label color={onPlayerColor} style={{ fontSize: 14 }}>
                  Bonus desde
                </Label>
                <Stepper
                  value={Math.min(bonusFromRound, totalRounds)}
                  onChange={setBonusFromRound}
                  min={1}
                  max={totalRounds}
                  size={36}
                  onColored
                />
              </Card>
            </Row>

            <Label style={{ marginTop: space.lg, marginBottom: space.sm }}>Mazos</Label>
            <Segmented
              options={[
                { value: 1, label: '1 mazo' },
                { value: 2, label: '2 mazos' },
              ]}
              value={decks}
              onChange={changeDecks}
            />
            <Body color={c.muted} style={{ fontSize: 13.5, lineHeight: 19, marginTop: space.sm }}>
              {named.length >= 2
                ? `Con ${named.length} jugadores y ${decks} mazo${decks > 1 ? 's' : ''}: hasta ${cards} cartas por ronda y ${maxRounds} rondas. Acertar paga 10 + las bazas hechas; desde la ronda ${Math.min(bonusFromRound, totalRounds)}, 20 + las bazas.`
                : 'La ronda 1 se juega con una carta y va subiendo hasta el máximo que dan los mazos.'}
            </Body>
          </>
        ) : (
          <>
            <Label style={{ marginBottom: space.sm }}>Cómo se gana</Label>
            <Segmented
              options={[
                { value: 'high', label: 'Más puntos' },
                { value: 'low', label: 'Menos puntos' },
              ]}
              value={lowestWins ? 'low' : 'high'}
              onChange={(v) => setLowestWins(v === 'low')}
            />

            <Label style={{ marginTop: space.lg, marginBottom: space.sm }}>Puntaje objetivo</Label>
            <Card color={palette.salvia} style={{ padding: space.lg, gap: space.md }}>
              <Row style={{ justifyContent: 'space-between' }}>
                <Num style={{ fontSize: 34, fontFamily: fonts.black }} color={onPlayerColor}>
                  {target ?? '—'}
                </Num>
                <Row style={{ gap: space.sm }}>
                  {[30, 100, 500].map((n) => (
                    <Pressable
                      key={n}
                      accessibilityRole="button"
                      onPress={() => {
                        haptic.tap();
                        setTarget(n);
                      }}
                      style={({ pressed }) => ({
                        height: 36,
                        paddingHorizontal: space.md,
                        borderRadius: radius.pill,
                        borderWidth: border,
                        borderColor: onPlayerColor,
                        backgroundColor: target === n ? onPlayerColor : 'transparent',
                        alignItems: 'center',
                        justifyContent: 'center',
                        opacity: pressed ? 0.7 : 1,
                      })}
                    >
                      <Num style={{ fontSize: 15 }} color={target === n ? palette.marfil : onPlayerColor}>
                        {n}
                      </Num>
                    </Pressable>
                  ))}
                  <Pressable
                    accessibilityRole="button"
                    onPress={() => {
                      haptic.tap();
                      setTarget(null);
                    }}
                    style={({ pressed }) => ({
                      height: 36,
                      paddingHorizontal: space.md,
                      borderRadius: radius.pill,
                      borderWidth: border,
                      borderColor: onPlayerColor,
                      backgroundColor: target == null ? onPlayerColor : 'transparent',
                      alignItems: 'center',
                      justifyContent: 'center',
                      opacity: pressed ? 0.7 : 1,
                    })}
                  >
                    <Label color={target == null ? palette.marfil : onPlayerColor} style={{ fontSize: 14 }}>
                      Sin límite
                    </Label>
                  </Pressable>
                </Row>
              </Row>
            </Card>
            <Body color={c.muted} style={{ fontSize: 13.5, lineHeight: 19, marginTop: space.sm }}>
              Sin límite, la partida sigue hasta que la terminen a mano.
            </Body>
          </>
        )}
      </View>
    </Screen>
  );
}
