import { router } from 'expo-router';
import { Pressable, ScrollView, Text, View } from 'react-native';

import type { Game, Player } from '@/features/types';
import { haptic } from '@/lib/haptics';
import { useGames } from '@/store/games';
import { border, fonts, onPlayerColor, palette, playerColor, radius, space } from '@/theme/tokens';
import { useTheme } from '@/theme/use-theme';
import { Clay } from './clay';
import { useOverlay } from './overlay';
import { Avatar, Bar, Card, Display, Label, Num, Row, Title } from './ui';

/** Menú de la partida: hoja propia, nunca el ActionSheet del sistema. */
export function GameMenu({ game }: { game: Game }) {
  const { c } = useTheme();
  const overlay = useOverlay();
  const { undoRound, finish, remove } = useGames.getState();

  async function open() {
    await overlay.menu({
      title: game.title,
      message: `${game.kind === 'corazones' ? 'Corazones' : 'Anotador'} · ${game.rounds.length} ${game.rounds.length === 1 ? 'ronda' : 'rondas'}`,
      items: [
        { label: 'Deshacer última ronda', icon: 'undo', onPress: () => undoRound(game.id) },
        {
          label: game.finishedAt ? 'Reabrir partida' : 'Terminar partida',
          icon: 'flag',
          onPress: () => finish(game.id, !game.finishedAt),
        },
        {
          label: 'Eliminar partida',
          icon: 'trash',
          destructive: true,
          onPress: async () => {
            const ok = await overlay.confirm({
              title: '¿Eliminar la partida?',
              message: 'Se borran sus rondas y su tabla. No se puede deshacer.',
              confirmLabel: 'Eliminar',
              destructive: true,
            });
            if (!ok) return;
            remove(game.id);
            router.back();
          },
        },
      ],
    });
  }

  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel="Opciones de la partida"
      onPress={() => {
        haptic.tap();
        open();
      }}
      style={({ pressed }) => ({
        height: 44,
        paddingHorizontal: space.lg,
        borderRadius: radius.pill,
        borderWidth: border,
        borderColor: c.lineStrong,
        alignItems: 'center',
        justifyContent: 'center',
        opacity: pressed ? 0.6 : 1,
      })}
    >
      <Label color={c.ink} style={{ fontSize: 15 }}>
        Opciones
      </Label>
    </Pressable>
  );
}

/** Cierre de partida: tarjeta oscura con podio, como la pantalla de Ganador. */
export function WinnerBanner({
  name,
  total,
  podium,
}: {
  name: string;
  total: number;
  podium?: { name: string; total: number; color: string }[];
}) {
  const { scheme } = useTheme();
  const top = (podium ?? []).slice(0, 3);
  const max = Math.max(1, ...top.map((p) => p.total));
  const orden = top.length === 3 ? [1, 0, 2] : top.map((_, i) => i);

  return (
    // en oscuro la tarjeta sube un paso para despegarse del fondo tinta
    <Card color={scheme === 'dark' ? palette.tintaSuave : palette.tinta} big style={{ marginTop: space.lg, padding: space.xl }}>
      <Clay name="destello" size={44} style={{ position: 'absolute', right: 18, top: 14 }} />
      <Row style={{ gap: space.lg }}>
        <Clay name="corona" size={76} />
        <View style={{ flex: 1, gap: 2 }}>
          <Label color={palette.mostaza}>Partida terminada</Label>
          <Display color={palette.marfil} style={{ fontSize: 36, lineHeight: 38 }} numberOfLines={1}>
            ¡Ganó {name}!
          </Display>
          <Num color={palette.marfil} style={{ fontSize: 16, fontFamily: fonts.medium }}>
            {total} puntos
          </Num>
        </View>
      </Row>

      {top.length >= 2 ? (
        <Row style={{ marginTop: space.xl, gap: space.sm, alignItems: 'flex-end', height: 120 }}>
          {orden.map((idx) => {
            const p = top[idx];
            if (!p) return null;
            const h = 62 + Math.round((p.total / max) * 56);
            return (
              <View
                key={p.name + idx}
                style={{
                  flex: 1,
                  height: h,
                  borderTopLeftRadius: 20,
                  borderTopRightRadius: 20,
                  borderBottomLeftRadius: 8,
                  borderBottomRightRadius: 8,
                  backgroundColor: p.color,
                  alignItems: 'center',
                  justifyContent: 'center',
                }}
              >
                <Label color={onPlayerColor} style={{ fontSize: 13 }} numberOfLines={1}>
                  {idx + 1} · {p.name}
                </Label>
                <Num color={onPlayerColor} style={{ fontSize: idx === 0 ? 24 : 19, fontFamily: fonts.black }}>
                  {p.total}
                </Num>
              </View>
            );
          })}
        </Row>
      ) : null}
    </Card>
  );
}

/** Tabla de posiciones: líder destacado y barras con borde, como el mockup. */
export function StandingsList({
  rows,
  players,
  note,
  leaderKicker = 'Va ganando',
  leaderExtra,
}: {
  rows: { player: Player; total: number }[];
  players: Player[];
  note?: (p: Player, total: number) => string | null;
  leaderKicker?: string;
  leaderExtra?: string;
}) {
  const { c, scheme } = useTheme();
  if (rows.length === 0) return null;

  const leader = rows[0];
  const leaderIdx = players.findIndex((p) => p.id === leader.player.id);
  const leaderColor = playerColor(leaderIdx, scheme);
  const max = Math.max(1, ...rows.map((r) => Math.abs(r.total)));
  const gap = rows.length > 1 ? leader.total - rows[1].total : 0;

  return (
    <View>
      <Card color={leaderColor} big style={{ marginTop: space.lg, height: 150 }}>
        <Clay name="trofeo" size={140} style={{ position: 'absolute', right: -2, top: -22 }} />
        <View style={{ padding: space.xl, gap: 2 }}>
          <Label color={onPlayerColor}>{leaderKicker}</Label>
          <Display color={onPlayerColor} style={{ fontSize: 38, lineHeight: 40, maxWidth: 200 }} numberOfLines={1}>
            {leader.player.name}
          </Display>
          <Row style={{ gap: 6 }}>
            <Num color={onPlayerColor} style={{ fontSize: 15 }}>
              {leader.total} pts
            </Num>
            {rows.length > 1 ? (
              <Label color={onPlayerColor} style={{ fontFamily: fonts.medium, fontSize: 14 }}>
                · {gap >= 0 ? `+${gap}` : gap} sobre {rows[1].player.name}
              </Label>
            ) : null}
          </Row>
          {leaderExtra ? (
            <Label color={onPlayerColor} style={{ fontFamily: fonts.medium, fontSize: 13 }}>
              {leaderExtra}
            </Label>
          ) : null}
        </View>
      </Card>

      <View style={{ marginTop: space.xl, gap: space.lg }}>
        {rows.map((r, i) => {
          const colorIndex = players.findIndex((p) => p.id === r.player.id);
          const extra = note?.(r.player, r.total);
          return (
            <Row key={r.player.id} style={{ gap: space.md }}>
              <View
                style={{
                  width: 30,
                  height: 30,
                  borderRadius: 15,
                  borderWidth: border,
                  borderColor: c.lineStrong,
                  alignItems: 'center',
                  justifyContent: 'center',
                }}
              >
                <Num style={{ fontSize: 14 }}>{i + 1}</Num>
              </View>
              <View style={{ flex: 1, gap: 6 }}>
                <Row style={{ justifyContent: 'space-between', alignItems: 'baseline' }}>
                  <Title style={{ fontSize: 17 }} numberOfLines={1}>
                    {r.player.name}
                  </Title>
                  {extra ? <Label style={{ fontVariant: ['tabular-nums'] }}>{extra}</Label> : null}
                </Row>
                <Bar progress={Math.abs(r.total) / max} color={playerColor(colorIndex, scheme)} />
              </View>
              <Num style={{ width: 54, textAlign: 'right', fontSize: 24, fontFamily: fonts.black }}>{r.total}</Num>
            </Row>
          );
        })}
      </View>
    </View>
  );
}

/** Historial: filas = rondas, columnas = jugadores. Caja redondeada con scroll. */
export function HistoryTable({
  players,
  rows,
  onLongPressRow,
}: {
  players: Player[];
  rows: (string | number)[][];
  onLongPressRow?: (i: number) => void;
}) {
  const { c, scheme } = useTheme();
  const colW = 78;
  return (
    <View style={{ borderRadius: radius.card, borderWidth: border, borderColor: c.line, overflow: 'hidden' }}>
      <ScrollView horizontal showsHorizontalScrollIndicator={false}>
        <View>
          <Row style={{ backgroundColor: c.wash, paddingHorizontal: space.md }}>
            <View style={{ width: 38, paddingVertical: space.md }}>
              <Label style={{ fontSize: 12 }}>R</Label>
            </View>
            {players.map((p, i) => (
              <Row key={p.id} style={{ width: colW, paddingVertical: space.md, gap: 6 }}>
                <Avatar name={p.name} color={playerColor(i, scheme)} size={20} />
                <Label color={c.ink} style={{ fontSize: 12, flexShrink: 1 }} numberOfLines={1}>
                  {p.name.slice(0, 5)}
                </Label>
              </Row>
            ))}
          </Row>
          {rows.map((cells, ri) => (
            <Pressable
              key={ri}
              accessibilityRole="button"
              accessibilityLabel={`Ronda ${ri + 1}`}
              onLongPress={() => {
                haptic.light();
                onLongPressRow?.(ri);
              }}
              style={({ pressed }) => ({
                flexDirection: 'row',
                paddingHorizontal: space.md,
                borderTopWidth: 1,
                borderColor: c.line,
                backgroundColor: pressed ? c.wash : 'transparent',
              })}
            >
              <View style={{ width: 38, paddingVertical: 11 }}>
                <Num style={{ fontSize: 13 }} color={c.muted}>
                  {ri + 1}
                </Num>
              </View>
              {cells.map((v, ci) => (
                <View key={ci} style={{ width: colW, paddingVertical: 11 }}>
                  <Text style={{ fontFamily: fonts.medium, fontSize: 13.5, color: c.ink, fontVariant: ['tabular-nums'] }}>
                    {v}
                  </Text>
                </View>
              ))}
            </Pressable>
          ))}
        </View>
      </ScrollView>
    </View>
  );
}

/** Aviso de bonus/estado: tarjeta mostaza con ilustración, como la ronda del mockup. */
export function BonusCard({ title, kicker, note, clay }: { title: string; kicker: string; note?: string; clay?: 'cinta' | 'destello' }) {
  return (
    <Card color={palette.mostaza} style={{ height: 100, marginTop: space.lg }}>
      <Clay name={clay ?? 'cinta'} size={110} style={{ position: 'absolute', right: -2, top: -12 }} />
      <View style={{ padding: space.xl, gap: 2 }}>
        <Label color={onPlayerColor}>{kicker}</Label>
        <Display color={onPlayerColor} style={{ fontSize: 27, lineHeight: 29 }}>
          {title}
        </Display>
        {note ? (
          <Label color={onPlayerColor} style={{ fontFamily: fonts.medium, fontSize: 13 }}>
            {note}
          </Label>
        ) : null}
      </View>
    </Card>
  );
}

/** Fila de carga de puntos: avatar, nombre, dato y stepper. */
export function PlayerRow({
  name,
  color,
  caption,
  captionColor,
  right,
  tag,
}: {
  name: string;
  color: string;
  caption?: string;
  captionColor?: string;
  right: React.ReactNode;
  tag?: string;
}) {
  const { c } = useTheme();
  return (
    <Row style={{ minHeight: 66, gap: space.md, borderBottomWidth: 1, borderColor: c.line }}>
      <Avatar name={name} color={color} size={36} />
      <View style={{ flex: 1, minWidth: 0 }}>
        <Row style={{ gap: space.sm }}>
          <Title style={{ fontSize: 17 }} numberOfLines={1}>
            {name}
          </Title>
          {tag ? <Label style={{ fontSize: 12 }}>{tag}</Label> : null}
        </Row>
        {caption ? (
          <Label color={captionColor} style={{ fontFamily: fonts.medium, fontVariant: ['tabular-nums'] }}>
            {caption}
          </Label>
        ) : null}
      </View>
      {right}
    </Row>
  );
}

/** Pastilla de ronda del encabezado de Corazones. */
export function RoundPills({
  rounds,
  current,
}: {
  rounds: { n: number; cards: number }[];
  current: number;
}) {
  const { c } = useTheme();
  return (
    <Row style={{ gap: space.sm, marginTop: space.lg }}>
      {rounds.map((r) => {
        const done = r.n < current;
        const now = r.n === current;
        return (
          <View
            key={r.n}
            style={{
              flex: 1,
              height: 56,
              borderRadius: radius.pill,
              borderWidth: border,
              borderColor: c.lineStrong,
              backgroundColor: now ? c.inverseBg : done ? c.wash : 'transparent',
              alignItems: 'center',
              justifyContent: 'center',
            }}
          >
            <Label color={now ? c.inverseInk : c.muted} style={{ fontFamily: fonts.medium, fontSize: 11 }}>
              {done ? 'hecha' : now ? 'ahora' : 'ronda'}
            </Label>
            <Num color={now ? c.inverseInk : c.ink} style={{ fontSize: 17 }}>
              {r.n}
            </Num>
          </View>
        );
      })}
    </Row>
  );
}
