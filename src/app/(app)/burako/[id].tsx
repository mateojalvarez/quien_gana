import { useKeepAwake } from 'expo-keep-awake';
import { Redirect, useLocalSearchParams } from 'expo-router';
import { useState } from 'react';
import { Pressable, TextInput, View } from 'react-native';

import { GameMenu, HistoryTable, StandingsList, WinnerBanner } from '@/components/game-parts';
import { Icon } from '@/components/icons';
import { Avatar, Body, Button, Card, Chip, Label, Num, Row, Screen, SectionHead, Stepper, Title } from '@/components/ui';
import { ganador, LIMITS, puntosLado, puntosRonda, standings } from '@/features/burako/rules';
import type { BurakoGame, BurakoRound } from '@/features/types';
import { haptic } from '@/lib/haptics';
import { useGames } from '@/store/games';
import { border, fonts, playerColor, radius, space } from '@/theme/tokens';
import { useTheme } from '@/theme/use-theme';

/** Lo que se está cargando de un lado: las fichas como texto, para poder escribir el signo. */
type Borrador = { puras: number; impuras: number; fichas: string; sinMuerto: boolean };
type Draft = { lados: Record<string, Borrador>; corto: string | null };

const vacio = (): Borrador => ({ puras: 0, impuras: 0, fichas: '', sinMuerto: false });

function fichasDe(texto: string) {
  const n = parseInt(texto, 10);
  return Number.isFinite(n) ? n : 0;
}

function aRonda(game: BurakoGame, d: Draft): BurakoRound {
  const lados: BurakoRound['lados'] = {};
  for (const p of game.players) {
    const b = d.lados[p.id] ?? vacio();
    lados[p.id] = { puras: b.puras, impuras: b.impuras, fichas: fichasDe(b.fichas), sinMuerto: b.sinMuerto };
  }
  return { lados, corto: d.corto };
}

function aBorrador(r: BurakoRound): Draft {
  const lados: Record<string, Borrador> = {};
  for (const [id, l] of Object.entries(r.lados)) {
    lados[id] = { puras: l.puras, impuras: l.impuras, fichas: l.fichas ? String(l.fichas) : '', sinMuerto: l.sinMuerto };
  }
  return { lados, corto: r.corto };
}

const firmado = (n: number) => (n > 0 ? `+${n}` : String(n));

export default function BurakoPartida() {
  useKeepAwake();
  const { id } = useLocalSearchParams<{ id: string }>();
  const game = useGames((s) => s.games[id]);
  const addRound = useGames((s) => s.addBurakoRound);
  const updateRound = useGames((s) => s.updateBurakoRound);
  const finish = useGames((s) => s.finish);
  const { c, scheme } = useTheme();

  const [draft, setDraft] = useState<Draft>({ lados: {}, corto: null });
  /** null = cargando la ronda nueva; número = editando esa ronda ya anotada. */
  const [editing, setEditing] = useState<number | null>(null);

  if (!game || game.kind !== 'burako') return <Redirect href="/" />;

  const rows = standings(game);
  const roundNo = editing != null ? editing + 1 : game.rounds.length + 1;
  const editingNow = editing != null;
  const showEditor = editingNow || !game.finishedAt;
  const hayAlgo =
    draft.corto != null ||
    Object.values(draft.lados).some((b) => b.puras || b.impuras || b.sinMuerto || fichasDe(b.fichas) !== 0);

  function setLado(pid: string, cambio: Partial<Borrador>) {
    setDraft((d) => ({ ...d, lados: { ...d.lados, [pid]: { ...(d.lados[pid] ?? vacio()), ...cambio } } }));
  }

  function reset() {
    setDraft({ lados: {}, corto: null });
    setEditing(null);
  }

  function startEdit(index: number) {
    if (!game || game.kind !== 'burako') return;
    haptic.tap();
    setDraft(aBorrador(game.rounds[index]));
    setEditing(index);
  }

  function commit() {
    if (!game || game.kind !== 'burako') return;
    const round = aRonda(game, draft);
    if (editing != null) updateRound(game.id, editing, round);
    else addRound(game.id, round);
    reset();

    // Al editar una ronda vieja el ganador puede cambiar o dejar de existir.
    const updated = useGames.getState().games[game.id];
    if (updated?.kind !== 'burako') return;
    const gano = ganador(updated);
    if (gano && !updated.finishedAt) {
      finish(game.id, true);
      haptic.success();
    } else if (!gano && updated.finishedAt) {
      finish(game.id, false);
      haptic.light();
    } else {
      haptic.light();
    }
  }

  const champion = game.finishedAt ? rows[0] : null;
  const modoTxt = game.modo === 'parejas' ? 'en parejas' : `${game.players.length} jugadores`;

  return (
    <Screen
      title={game.title}
      meta={`Burako · ${modoTxt} · a ${game.target}`}
      right={<GameMenu game={game} />}
      keyboardToolbar
      footer={
        showEditor ? (
          <Row style={{ gap: space.sm }}>
            {editingNow ? <Button label="Cancelar" variant="outline" style={{ width: 120 }} onPress={reset} /> : null}
            <Button
              label={editingNow ? `Guardar ronda ${roundNo}` : `Anotar ronda ${roundNo}`}
              trailingIcon={editingNow ? undefined : 'arrowRight'}
              disabled={!hayAlgo}
              style={{ flex: 1 }}
              onPress={commit}
            />
          </Row>
        ) : null
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
        note={(_, total) => (game.finishedAt ? null : `faltan ${Math.max(0, game.target - total)}`)}
      />

      {showEditor ? (
        <View style={{ marginTop: space.huge }}>
          <SectionHead title={`Ronda ${roundNo}`} meta={editingNow ? 'editando' : 'vacío = 0'} />
          <View style={{ gap: space.md }}>
            {game.players.map((p, i) => (
              <TarjetaLado
                key={p.id}
                nombre={p.name}
                integrantes={game.integrantes?.[p.id]}
                color={playerColor(i, scheme)}
                lado={draft.lados[p.id] ?? vacio()}
                corto={draft.corto === p.id}
                onLado={(cambio) => setLado(p.id, cambio)}
                onCorto={() => {
                  setDraft((d) => ({ ...d, corto: d.corto === p.id ? null : p.id }));
                }}
              />
            ))}
          </View>
          <Body color={c.muted} style={{ fontSize: 13.5, lineHeight: 19, marginTop: space.sm }}>
            Pura 200 · impura 100 · cortar 100 · sin muerto −100. Las fichas van con su signo.
          </Body>
        </View>
      ) : null}

      {game.rounds.length ? (
        <View style={{ marginTop: space.huge }}>
          <SectionHead title="Historial" meta="mantené pulsado para editar" />
          <HistoryTable
            players={game.players}
            onLongPressRow={startEdit}
            rows={game.rounds.map((r) => game.players.map((p) => firmado(puntosRonda(r, p.id))))}
          />
          <Label style={{ marginTop: space.sm }}>puntos de cada ronda</Label>
        </View>
      ) : null}
    </Screen>
  );
}

function TarjetaLado({
  nombre,
  integrantes,
  color,
  lado,
  corto,
  onLado,
  onCorto,
}: {
  nombre: string;
  integrantes?: string[];
  color: string;
  lado: Borrador;
  corto: boolean;
  onLado: (cambio: Partial<Borrador>) => void;
  onCorto: () => void;
}) {
  const { c } = useTheme();
  const negativo = lado.fichas.startsWith('-');
  const subtotal = puntosLado(
    { puras: lado.puras, impuras: lado.impuras, fichas: fichasDe(lado.fichas), sinMuerto: lado.sinMuerto },
    corto,
  );

  return (
    <Card style={{ padding: space.lg, gap: space.md, borderWidth: border, borderColor: c.line }}>
      <Row style={{ gap: space.md }}>
        <Avatar name={nombre} color={color} size={36} />
        <View style={{ flex: 1, minWidth: 0 }}>
          <Title style={{ fontSize: 17 }} numberOfLines={1}>
            {nombre}
          </Title>
          {integrantes?.length ? <Label numberOfLines={1}>Pareja</Label> : null}
        </View>
        <Num
          style={{ fontSize: 24, fontFamily: fonts.black }}
          color={subtotal < 0 ? c.bad : subtotal > 0 ? c.ok : c.muted}
          accessibilityLabel={`Subtotal de ${nombre}: ${subtotal}`}
        >
          {firmado(subtotal)}
        </Num>
      </Row>

      <Row style={{ gap: space.md }}>
        <View style={{ flex: 1, gap: space.xs }}>
          <Label style={{ fontSize: 13 }}>Puras · 200</Label>
          <Stepper
            value={lado.puras}
            onChange={(n) => onLado({ puras: n })}
            max={LIMITS.maxCanastas}
            size={38}
            labelMinus={`Una canasta pura menos para ${nombre}`}
            labelPlus={`Una canasta pura más para ${nombre}`}
          />
        </View>
        <View style={{ flex: 1, gap: space.xs }}>
          <Label style={{ fontSize: 13 }}>Impuras · 100</Label>
          <Stepper
            value={lado.impuras}
            onChange={(n) => onLado({ impuras: n })}
            max={LIMITS.maxCanastas}
            size={38}
            labelMinus={`Una canasta impura menos para ${nombre}`}
            labelPlus={`Una canasta impura más para ${nombre}`}
          />
        </View>
      </Row>

      <Row style={{ gap: space.sm }}>
        <Label style={{ flex: 1, fontSize: 13 }}>Fichas</Label>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={`Fichas en ${negativo ? 'positivo' : 'negativo'} para ${nombre}`}
          hitSlop={6}
          onPress={() => {
            haptic.tap();
            onLado({ fichas: negativo ? lado.fichas.slice(1) : `-${lado.fichas}` });
          }}
          style={({ pressed }) => ({
            width: 40,
            height: 40,
            borderRadius: 20,
            alignItems: 'center',
            justifyContent: 'center',
            borderWidth: border,
            borderColor: negativo ? c.bad : c.line,
            opacity: pressed ? 0.6 : 1,
          })}
        >
          <Icon name={negativo ? 'minus' : 'plus'} size={18} color={negativo ? c.bad : c.ink} />
        </Pressable>
        <View
          style={{
            width: 104,
            height: 46,
            borderRadius: radius.field,
            borderWidth: border,
            borderColor: c.line,
            justifyContent: 'center',
            paddingHorizontal: space.md,
          }}
        >
          <TextInput
            value={lado.fichas}
            onChangeText={(t) => {
              const digits = t.replace(/[^\d]/g, '').slice(0, String(LIMITS.maxFichas).length);
              onLado({ fichas: (negativo ? '-' : '') + digits });
            }}
            keyboardType="number-pad"
            placeholder="0"
            placeholderTextColor={c.hint}
            accessibilityLabel={`Puntos de fichas de ${nombre}`}
            style={{
              fontFamily: fonts.black,
              fontSize: 21,
              color: negativo ? c.bad : c.ink,
              textAlign: 'right',
              fontVariant: ['tabular-nums'],
            }}
          />
        </View>
      </Row>

      <Row style={{ gap: space.sm, flexWrap: 'wrap' }}>
        <Chip label={corto ? 'Cortó · +100' : 'Cortó'} active={corto} onPress={onCorto} />
        <Chip
          label={lado.sinMuerto ? 'Sin muerto · −100' : 'No tomó el muerto'}
          active={lado.sinMuerto}
          onPress={() => onLado({ sinMuerto: !lado.sinMuerto })}
        />
      </Row>
    </Card>
  );
}
