import { router, type Href } from 'expo-router';
import { useMemo, useRef, useState } from 'react';
import { Pressable, ScrollView, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { Clay, type ClayName } from '@/components/clay';
import { Icon, type IconName } from '@/components/icons';
import { Avatar, Body, Card, Chip, Display, Label, Num, Row, SectionHead, Tag, Title } from '@/components/ui';
import { standings as anotadorStandings } from '@/features/anotador/logic';
import { standings as corazonesStandings } from '@/features/corazones/rules';
import type { Game } from '@/features/types';
import { displayName } from '@/lib/auth';
import { haptic } from '@/lib/haptics';
import { useAuth } from '@/providers/auth-provider';
import { sortedGames, useGames } from '@/store/games';
import { fonts, onPlayerColor, palette, playerColor, radius, space } from '@/theme/tokens';
import { useTheme } from '@/theme/use-theme';

type Familia = 'cartas' | 'dados' | 'rapidos';

type Tool = {
  name: string;
  kicker: string;
  desc?: string;
  clay: ClayName;
  color: string;
  href: Href;
  familia: Familia;
};

const TOOLS: Tool[] = [
  { name: 'Corazones', kicker: 'Cartas', desc: 'Pedidos, bazas y bonus', clay: 'corazon', color: palette.mostaza, href: '/nueva?kind=corazones', familia: 'cartas' },
  { name: 'Dados', kicker: 'Azar', desc: 'Hasta 6 dados\nSuma automática', clay: 'dado', color: palette.tomate, href: '/dados', familia: 'dados' },
  { name: 'Pulsador', kicker: 'Rapidez', desc: 'El primero que toca gana', clay: 'pulsador', color: palette.salvia, href: '/pulsador', familia: 'rapidos' },
  { name: 'Anotador', kicker: 'Libre', desc: 'Puntos por ronda', clay: 'lapiz', color: palette.rosa, href: '/nueva?kind=anotador', familia: 'cartas' },
  { name: 'Reloj', kicker: 'Turnos', desc: 'Reloj de arena', clay: 'relojArena', color: palette.crema, href: '/reloj', familia: 'rapidos' },
];

const FILTROS: { label: string; value: 'todos' | Familia }[] = [
  { label: 'Todos', value: 'todos' },
  { label: 'Cartas', value: 'cartas' },
  { label: 'Dados', value: 'dados' },
  { label: 'Rápidos', value: 'rapidos' },
];

function leaderOf(g: Game) {
  const s = g.kind === 'anotador' ? anotadorStandings(g) : corazonesStandings(g);
  return g.rounds.length ? s[0] : null;
}

const hrefOf = (g: Game) => (g.kind === 'anotador' ? `/anotador/${g.id}` : `/corazones/${g.id}`) as Href;

function fechaDeHoy() {
  const s = new Date().toLocaleDateString('es-AR', { weekday: 'long', day: 'numeric', month: 'short' });
  return s.charAt(0).toUpperCase() + s.slice(1).replace('.', '');
}

export default function Hub() {
  const { c, scheme } = useTheme();
  const insets = useSafeAreaInsets();
  const { session } = useAuth();
  const games = useGames((s) => s.games);
  const list = useMemo(() => sortedGames(games), [games]);
  const [filtro, setFiltro] = useState<'todos' | Familia>('todos');
  const scroller = useRef<React.ComponentRef<typeof ScrollView>>(null);
  const yJuegos = useRef(0);
  const yPartidas = useRef(0);

  const nombre = displayName(session?.user);
  const enCurso = list.find((g) => !g.finishedAt && g.rounds.length > 0) ?? list.find((g) => !g.finishedAt);
  const tools = TOOLS.filter((t) => filtro === 'todos' || t.familia === filtro);

  const goTo = (y: number) => scroller.current?.scrollTo({ y: Math.max(0, y - 12), animated: true });

  return (
    <View style={{ flex: 1, backgroundColor: c.bg }}>
      <ScrollView
        ref={scroller}
        showsVerticalScrollIndicator={false}
        contentContainerStyle={{
          paddingTop: insets.top + space.lg,
          paddingHorizontal: space.xl,
          paddingBottom: insets.bottom + 110,
        }}
      >
        {/* Encabezado: perfil · saludo · ajustes */}
        <Row style={{ justifyContent: 'space-between' }}>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Perfil y cuenta"
            onPress={() => {
              haptic.tap();
              router.push('/ajustes');
            }}
          >
            <Avatar name={nombre} color={palette.mostaza} size={44} />
          </Pressable>
          <View style={{ alignItems: 'center' }}>
            <Title style={{ fontSize: 18 }} numberOfLines={1}>
              Hola, {nombre.split(' ')[0]}
            </Title>
            <Label style={{ fontFamily: fonts.medium }}>{fechaDeHoy()}</Label>
          </View>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Ajustes"
            hitSlop={8}
            onPress={() => {
              haptic.tap();
              router.push('/ajustes');
            }}
            style={({ pressed }) => ({ width: 44, height: 44, alignItems: 'center', justifyContent: 'center', opacity: pressed ? 0.6 : 1 })}
          >
            <Icon name="sliders" size={22} color={c.ink} />
          </Pressable>
        </Row>

        {/* Partida en curso */}
        {enCurso ? (
          <Card color={palette.mostaza} onPress={() => router.push(hrefOf(enCurso))} style={{ marginTop: space.xl, height: 190 }}>
            <Clay
              name={enCurso.kind === 'corazones' ? 'corazon' : 'lapiz'}
              size={112}
              style={{ position: 'absolute', right: 10, top: -10 }}
            />
            <View style={{ padding: space.xl, flex: 1, justifyContent: 'space-between' }}>
              <View style={{ gap: 2 }}>
                <Label color={onPlayerColor}>Partida en curso</Label>
                <Display style={{ fontSize: 34, lineHeight: 36, maxWidth: 220 }} color={onPlayerColor} numberOfLines={1}>
                  {enCurso.title}
                </Display>
                <Label color={onPlayerColor} style={{ fontFamily: fonts.medium, fontSize: 14 }}>
                  {enCurso.kind === 'corazones'
                    ? `Ronda ${Math.min(enCurso.rounds.length + 1, enCurso.totalRounds)} de ${enCurso.totalRounds}`
                    : `${enCurso.rounds.length} ${enCurso.rounds.length === 1 ? 'ronda' : 'rondas'} jugadas`}
                </Label>
              </View>
              <Row style={{ justifyContent: 'space-between' }}>
                <Row>
                  {enCurso.players.slice(0, 5).map((p, i) => {
                    // un jugador mostaza sobre tarjeta mostaza se perdería: va en marfil
                    const col = playerColor(i, scheme);
                    return (
                      <Avatar
                        key={p.id}
                        name={p.name}
                        color={col === palette.mostaza ? palette.marfil : col}
                        ring={palette.mostaza}
                        style={{ marginRight: -8 }}
                      />
                    );
                  })}
                </Row>
                <View
                  style={{
                    height: 38,
                    paddingHorizontal: space.lg,
                    borderRadius: radius.pill,
                    backgroundColor: palette.tinta,
                    alignItems: 'center',
                    justifyContent: 'center',
                  }}
                >
                  <Label color={palette.marfil} style={{ fontSize: 15 }}>
                    Seguir
                  </Label>
                </View>
              </Row>
            </View>
          </Card>
        ) : null}

        {/* Filtros */}
        <Row style={{ marginTop: space.xl, gap: space.sm }} >
          {FILTROS.map((f) => (
            <Chip key={f.value} label={f.label} active={filtro === f.value} onPress={() => setFiltro(f.value)} />
          ))}
        </Row>

        {/* Tus juegos */}
        <View onLayout={(e) => (yJuegos.current = e.nativeEvent.layout.y)} style={{ marginTop: space.xxl }}>
          <SectionHead title="Tus juegos" meta={`${tools.length} de ${TOOLS.length}`} />
          <Row style={{ alignItems: 'flex-start', gap: space.md }}>
            {[0, 1].map((col) => (
              <View key={col} style={{ flex: 1, gap: space.md }}>
                {tools
                  .filter((_, i) => i % 2 === col)
                  .map((t) => {
                    const i = tools.indexOf(t);
                    const tall = i % 4 === 0 || i % 4 === 3;
                    return (
                      <Card
                        key={t.name}
                        color={t.color}
                        onPress={() => router.push(t.href)}
                        style={{ height: tall ? 220 : 148 }}
                      >
                        <Clay
                          name={t.clay}
                          size={tall ? 118 : 92}
                          style={{ position: 'absolute', right: -8, bottom: tall ? 4 : undefined, top: tall ? undefined : -18 }}
                        />
                        <View style={{ padding: space.lg, flex: 1, justifyContent: tall ? 'flex-start' : 'flex-end' }}>
                          <Label color={onPlayerColor}>{t.kicker}</Label>
                          <Title style={{ fontSize: 23, marginTop: 1 }} color={onPlayerColor}>
                            {t.name}
                          </Title>
                          {tall && t.desc ? (
                            <Body color={onPlayerColor} style={{ fontSize: 14, lineHeight: 19, marginTop: 4, maxWidth: 120 }}>
                              {t.desc}
                            </Body>
                          ) : null}
                        </View>
                      </Card>
                    );
                  })}
              </View>
            ))}
          </Row>
        </View>

        {/* Partidas guardadas */}
        <View onLayout={(e) => (yPartidas.current = e.nativeEvent.layout.y)} style={{ marginTop: space.huge }}>
          <SectionHead title="Partidas" meta={`${list.length} ${list.length === 1 ? 'guardada' : 'guardadas'}`} />

          {list.length === 0 ? (
            <Card style={{ paddingVertical: space.xxl, alignItems: 'center', gap: space.sm }}>
              <Clay name="trofeo" size={84} />
              <Body color={c.muted} style={{ textAlign: 'center', paddingHorizontal: space.xl }}>
                Todavía no hay partidas.{'\n'}Empezá con Corazones o el Anotador.
              </Body>
            </Card>
          ) : (
            <View style={{ gap: space.sm }}>
              {list.map((g) => {
                const lead = leaderOf(g);
                return (
                  <Pressable
                    key={g.id}
                    accessibilityRole="button"
                    onPress={() => {
                      haptic.tap();
                      router.push(hrefOf(g));
                    }}
                    style={({ pressed }) => ({
                      minHeight: 72,
                      borderRadius: radius.field,
                      borderWidth: 1.5,
                      borderColor: c.line,
                      paddingHorizontal: space.lg,
                      paddingVertical: space.md,
                      flexDirection: 'row',
                      alignItems: 'center',
                      gap: space.md,
                      opacity: pressed ? 0.7 : 1,
                    })}
                  >
                    <Row style={{ width: 44 }}>
                      {g.players.slice(0, 3).map((p, i) => (
                        <Avatar key={p.id} name={p.name} color={playerColor(i, scheme)} size={28} ring={c.bg} style={{ marginRight: -12 }} />
                      ))}
                    </Row>
                    <View style={{ flex: 1, gap: 2 }}>
                      <Row style={{ gap: space.sm }}>
                        <Title style={{ fontSize: 17 }} numberOfLines={1}>
                          {g.title}
                        </Title>
                        {g.finishedAt ? <Tag label="Final" bg={c.wash} color={c.ink} /> : null}
                      </Row>
                      <Label numberOfLines={1} style={{ fontFamily: fonts.medium, fontVariant: ['tabular-nums'] }}>
                        {g.kind === 'corazones' ? 'Corazones' : 'Anotador'} · {g.rounds.length}{' '}
                        {g.rounds.length === 1 ? 'ronda' : 'rondas'} · {g.players.length} jugadores
                      </Label>
                    </View>
                    {lead ? (
                      <View style={{ alignItems: 'flex-end' }}>
                        <Label>{g.finishedAt ? 'Ganó' : 'Va ganando'}</Label>
                        <Row style={{ gap: 6 }}>
                          <Label color={c.ink} style={{ fontSize: 14 }} numberOfLines={1}>
                            {lead.player.name}
                          </Label>
                          <Num style={{ fontSize: 18 }}>{lead.total}</Num>
                        </Row>
                      </View>
                    ) : (
                      <Label>Sin rondas</Label>
                    )}
                  </Pressable>
                );
              })}
            </View>
          )}
        </View>
      </ScrollView>

      {/* Barra inferior propia, en píldora */}
      <View
        style={{
          position: 'absolute',
          left: space.xl,
          right: space.xl,
          bottom: insets.bottom + space.md,
          height: 64,
          borderRadius: radius.pill,
          backgroundColor: c.inverseBg,
          flexDirection: 'row',
          alignItems: 'center',
          justifyContent: 'space-between',
          paddingHorizontal: 6,
        }}
      >
        <NavButton icon="home" label="Inicio" active onPress={() => goTo(0)} />
        <NavButton icon="grid" label="Juegos" onPress={() => goTo(yJuegos.current)} />
        <NavButton icon="bars" label="Partidas" onPress={() => goTo(yPartidas.current)} />
        <NavButton icon="user" label="Perfil" onPress={() => router.push('/ajustes')} />
      </View>
    </View>
  );
}

function NavButton({
  icon,
  label,
  active,
  onPress,
}: {
  icon: IconName;
  label: string;
  active?: boolean;
  onPress: () => void;
}) {
  const { c } = useTheme();
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityState={{ selected: !!active }}
      onPress={() => {
        haptic.tap();
        onPress();
      }}
      style={({ pressed }) => ({
        width: 52,
        height: 52,
        borderRadius: 26,
        alignItems: 'center',
        justifyContent: 'center',
        backgroundColor: active ? c.bg : 'transparent',
        opacity: pressed ? 0.7 : 1,
      })}
    >
      <Icon name={icon} size={22} color={active ? c.ink : c.inverseInk} />
    </Pressable>
  );
}
