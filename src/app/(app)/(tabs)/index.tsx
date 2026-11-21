import { router, useFocusEffect, type Href } from 'expo-router';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { Pressable, ScrollView, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { Clay } from '@/components/clay';
import { useGameMenu } from '@/components/game-parts';
import { Icon } from '@/components/icons';
import { TAB_BAR_SPACE } from '@/components/tab-bar';
import { Avatar, Body, Card, Display, Label, Num, Row, Rule, SectionHead, Tag, Title } from '@/components/ui';
import { standings as anotadorStandings } from '@/features/anotador/logic';
import type { Tool } from '@/features/catalog';
import { standings as burakoStandings } from '@/features/burako/rules';
import { standings as calaverasStandings } from '@/features/calaveras/rules';
import { standings as corazonesStandings } from '@/features/corazones/rules';
import { posiciones as generalaPosiciones, rondas as generalaRondas } from '@/features/generala/rules';
import { nombreDe, resumen as torneoResumen, tablaLiga } from '@/features/torneo/rules';
import { scores as trucoScores, summary as trucoSummary } from '@/features/truco/rules';
import type { Game, TorneoGame } from '@/features/types';
import { useApodo } from '@/features/perfil/apodo';
import { torneosCompartidos } from '@/features/torneo/compartido';
import { displayName } from '@/lib/auth';
import { haptic } from '@/lib/haptics';
import { useAuth } from '@/providers/auth-provider';
import { favoriteTools, frequentTools, useCatalog } from '@/store/catalog';
import { groupById, useGrupos } from '@/store/grupos';
import { sortedGames, useGames } from '@/store/games';
import { fonts, onPlayerColor, palette, playerColor, radius, space } from '@/theme/tokens';
import { useTheme } from '@/theme/use-theme';

/** Quién va ganando. En Truco es el equipo con más puntos, si hay alguno. */
function leaderOf(g: Game) {
  if (g.kind === 'torneo') {
    if (g.campeon) return { player: { id: g.campeon, name: nombreDe(g, g.campeon) }, total: null };
    if (g.formato.tipo !== 'liga') return null;
    const [primero] = tablaLiga(g).filas;
    return primero && primero.pj > 0 ? { player: { id: primero.id, name: nombreDe(g, primero.id) }, total: primero.pts } : null;
  }
  if (g.kind === 'generala') {
    const [primero] = generalaPosiciones(g.players, g.sheets);
    return primero && primero.total > 0 ? { player: { id: primero.id, name: primero.name }, total: primero.total } : null;
  }
  if (g.kind === 'truco') {
    const [a, b] = trucoScores(g);
    if (a === 0 && b === 0) return null;
    const i = a >= b ? 0 : 1;
    return { player: g.players[i], total: Math.max(a, b) };
  }
  const s =
    g.kind === 'anotador'
      ? anotadorStandings(g)
      : g.kind === 'burako'
        ? burakoStandings(g)
        : g.kind === 'calaveras'
          ? calaverasStandings(g)
          : corazonesStandings(g);
  return g.rounds.length ? s[0] : null;
}

/** Cuánto se jugó ya: rondas, o toques en Truco. */
const jugadas = (g: Game) =>
  g.kind === 'torneo'
    ? g.partidos.filter((p) => p.gl !== null).length + (g.fase === 'en-juego' ? 1 : 0)
    : g.kind === 'truco'
    ? g.moves.length
    : g.kind === 'generala'
      ? Object.values(g.sheets).reduce((n, s) => n + Object.keys(s).length, 0)
      : g.rounds.length;

const NOMBRE = {
  anotador: 'Anotador',
  corazones: 'Corazones',
  truco: 'Truco',
  generala: 'Generala',
  burako: 'Burako',
  calaveras: 'Calaveras y piratas',
} as const;

function detalle(g: Game): string {
  if (g.kind === 'torneo') {
    const r = torneoResumen(g);
    const grupo = g.grupoNombre ? ` · ${g.grupoNombre}` : '';
    return `Torneo · ${r.etapa} · ${r.jugados}/${r.total} partidos${grupo}`;
  }
  if (g.kind === 'truco') return `Truco · ${trucoSummary(g)}`;
  if (g.kind === 'generala') {
    const anotadas = Math.min(...g.players.map((p) => Object.keys(g.sheets[p.id] ?? {}).length));
    return `Generala · ronda ${Math.min(anotadas + 1, generalaRondas)} de ${generalaRondas} · ${g.players.length} jugadores`;
  }
  const n = g.rounds.length;
  return `${NOMBRE[g.kind]} · ${n} ${n === 1 ? 'ronda' : 'rondas'} · ${g.players.length} jugadores`;
}

const hrefOf = (g: Game) =>
  (g.kind === 'torneo'
    ? g.fase === 'sorteo'
      ? `/torneo/${g.id}/sorteo`
      : `/torneo/${g.id}`
    : `/${g.kind}/${g.id}`) as Href;

function fechaDeHoy() {
  const s = new Date().toLocaleDateString('es-AR', { weekday: 'long', day: 'numeric', month: 'short' });
  return s.charAt(0).toUpperCase() + s.slice(1).replace('.', '');
}

export default function Inicio() {
  const { c, scheme } = useTheme();
  const insets = useSafeAreaInsets();
  const { session } = useAuth();
  const games = useGames((s) => s.games);
  const list = useMemo(() => sortedGames(games), [games]);
  const favorites = useCatalog((s) => s.favorites);
  const plays = useCatalog((s) => s.plays);
  const recordPlay = useCatalog((s) => s.recordPlay);

  const activeId = useGrupos((s) => s.activeId);
  const grupos = useGrupos((s) => s.groups);
  const grupo = groupById(grupos, activeId);

  const favs = useMemo(() => favoriteTools(favorites), [favorites]);
  const freq = useMemo(() => frequentTools(plays, { exclude: favorites }), [plays, favorites]);

  const abrirMenu = useGameMenu();

  // Torneos de otros que veo (por grupo o enlace): se refrescan al volver acá.
  const [compartidos, setCompartidos] = useState<TorneoGame[]>([]);
  const miId = session?.user.id;
  useFocusEffect(
    useCallback(() => {
      if (!miId) return;
      torneosCompartidos(miId)
        .then(setCompartidos)
        .catch(() => {});
    }, [miId]),
  );
  const nickname = useApodo((s) => s.nickname);
  const nombre = displayName(session?.user, nickname);
  useEffect(() => {
    const u = session?.user;
    if (u && !u.is_anonymous) useApodo.getState().cargar(u.id).catch(() => {});
  }, [session?.user]);
  const enCurso = list.find((g) => !g.finishedAt && jugadas(g) > 0) ?? list.find((g) => !g.finishedAt);

  /** Único camino para abrir un juego: así el conteo de frecuentes no se escapa. */
  const abrir = (t: Tool) => {
    if (!t.href) return;
    recordPlay(t.id);
    router.push(t.href);
  };

  // El safe area va en el contenedor, no en el contentContainer: si no, al scrollear
  // las cards pasan por detras de la barra de estado y chocan con la hora.
  return (
    <View style={{ flex: 1, backgroundColor: c.bg, paddingTop: insets.top }}>
      <ScrollView
        showsVerticalScrollIndicator={false}
        contentContainerStyle={{
          paddingTop: space.lg,
          paddingHorizontal: space.xl,
          paddingBottom: insets.bottom + TAB_BAR_SPACE,
        }}
      >
        {/* Saludo y grupo activo */}
        <Row style={{ justifyContent: 'space-between', alignItems: 'flex-start' }}>
          <View style={{ flex: 1, gap: 2 }}>
            <Display style={{ fontSize: 26, lineHeight: 31 }} numberOfLines={1}>
              Hola, {nombre.split(' ')[0]}
            </Display>
            <Label style={{ fontFamily: fonts.medium }}>{fechaDeHoy()}</Label>
          </View>
          {grupo ? (
            <Pressable
              accessibilityRole="button"
              accessibilityLabel={`Grupo activo: ${grupo.name}`}
              onPress={() => {
                haptic.tap();
                router.push(`/grupos/${grupo.id}`);
              }}
              style={({ pressed }) => ({
                maxWidth: 180,
                height: 40,
                borderRadius: radius.pill,
                borderWidth: 1.5,
                borderColor: c.lineStrong,
                flexDirection: 'row',
                alignItems: 'center',
                gap: 6,
                paddingHorizontal: space.md,
                opacity: pressed ? 0.7 : 1,
              })}
            >
              <Label style={{ fontFamily: fonts.medium }}>Con</Label>
              <Label color={c.ink} style={{ fontSize: 14, flexShrink: 1 }} numberOfLines={1}>
                {grupo.name}
              </Label>
              <Icon name="chevronRight" size={15} color={c.muted} />
            </Pressable>
          ) : null}
        </Row>

        {/* Partida en curso */}
        {enCurso ? (
          <Card color={c.inverseBg} onPress={() => router.push(hrefOf(enCurso))} style={{ marginTop: space.xl, height: 128 }}>
            <Clay
              name={
                enCurso.kind === 'torneo'
                  ? 'trofeo'
                  : enCurso.kind === 'corazones'
                  ? 'corazon'
                  : enCurso.kind === 'truco'
                    ? 'cartasEspanolas'
                    : enCurso.kind === 'generala'
                      ? 'generala'
                      : enCurso.kind === 'burako'
                        ? 'burako'
                        : enCurso.kind === 'calaveras'
                          ? 'calavera'
                          : 'lapiz'
              }
              size={80}
              style={{ position: 'absolute', right: space.md, top: space.md }}
            />
            <View style={{ padding: space.lg, flex: 1, justifyContent: 'space-between' }}>
              <View style={{ gap: 1 }}>
                <Label color={palette.mostaza}>Partida en curso</Label>
                <Title style={{ fontSize: 24, maxWidth: 190 }} color={c.inverseInk} numberOfLines={1}>
                  {enCurso.title}
                </Title>
              </View>
              <Row style={{ justifyContent: 'space-between' }}>
                <Row>
                  {enCurso.players.slice(0, 5).map((p, i) => (
                    <Avatar
                      key={p.id}
                      name={p.name}
                      color={playerColor(i, scheme)}
                      size={28}
                      ring={c.inverseBg}
                      style={{ marginRight: -9 }}
                    />
                  ))}
                </Row>
                <View
                  style={{
                    height: 34,
                    paddingHorizontal: space.lg,
                    borderRadius: radius.pill,
                    backgroundColor: c.bg,
                    alignItems: 'center',
                    justifyContent: 'center',
                  }}
                >
                  <Label color={c.ink} style={{ fontSize: 15 }}>
                    Seguir
                  </Label>
                </View>
              </Row>
            </View>
          </Card>
        ) : null}

        {/* Favoritos */}
        <View style={{ marginTop: space.xxl }}>
          <SectionHead title="Favoritos" />
          {favs.length === 0 ? (
            <Pressable
              accessibilityRole="button"
              onPress={() => {
                haptic.tap();
                router.push('/juegos');
              }}
              style={({ pressed }) => ({ opacity: pressed ? 0.7 : 1 })}
            >
              <Body color={c.muted}>Marcá tus juegos con la estrella en Juegos y van a aparecer acá.</Body>
            </Pressable>
          ) : (
            <Row style={{ marginTop: space.lg, flexWrap: 'wrap', gap: space.sm, alignItems: 'flex-start' }}>
              {favs.map((t) => (
                <Card
                  key={t.id}
                  color={t.color}
                  onPress={() => abrir(t)}
                  style={{ width: '48.4%', height: 104, justifyContent: 'flex-end' }}
                >
                  <Clay name={t.clay} size={52} style={{ position: 'absolute', right: space.sm, top: space.sm }} />
                  <View style={{ padding: space.lg, gap: 1 }}>
                    <Label color={onPlayerColor} style={{ fontSize: 12 }}>
                      {t.kicker}
                    </Label>
                    <Title style={{ fontSize: 19 }} color={onPlayerColor} numberOfLines={1} adjustsFontSizeToFit>
                      {t.name}
                    </Title>
                  </View>
                </Card>
              ))}
            </Row>
          )}
        </View>

        {/* Frecuentes */}
        {freq.length > 0 ? (
          <View style={{ marginTop: space.xxl }}>
            <SectionHead title="Frecuentes" meta="este mes" />
            <View style={{ marginTop: space.xs }}>
              {freq.map(({ tool, n }) => (
                <View key={tool.id}>
                  <Pressable
                    accessibilityRole="button"
                    accessibilityLabel={tool.name}
                    onPress={() => {
                      haptic.tap();
                      abrir(tool);
                    }}
                    style={({ pressed }) => ({
                      height: 56,
                      flexDirection: 'row',
                      alignItems: 'center',
                      gap: space.md,
                      opacity: pressed ? 0.7 : 1,
                    })}
                  >
                    <View
                      style={{
                        width: 40,
                        height: 40,
                        borderRadius: radius.sm,
                        backgroundColor: tool.color,
                        alignItems: 'center',
                        justifyContent: 'center',
                      }}
                    >
                      <Clay name={tool.clay} size={32} />
                    </View>
                    <Title style={{ flex: 1, fontSize: 16 }} numberOfLines={1}>
                      {tool.name}
                    </Title>
                    <Label style={{ fontFamily: fonts.semibold, fontVariant: ['tabular-nums'] }}>
                      {n} {n === 1 ? 'vez' : 'veces'}
                    </Label>
                    <Icon name="chevronRight" size={18} color={c.muted} />
                  </Pressable>
                  <Rule />
                </View>
              ))}
            </View>
          </View>
        ) : null}

        {/* Torneos de otros */}
        {compartidos.length > 0 ? (
          <View style={{ marginTop: space.huge }}>
            <SectionHead title="Torneos compartidos" meta={`${compartidos.length}`} />
            <View style={{ gap: space.sm, marginTop: space.xs }}>
              {compartidos.map((t) => (
                <Pressable
                  key={t.id}
                  accessibilityRole="button"
                  onPress={() => {
                    haptic.tap();
                    router.push(`/torneo/${t.id}` as Href);
                  }}
                  style={({ pressed }) => ({
                    minHeight: 64,
                    borderRadius: radius.field,
                    backgroundColor: palette.salvia,
                    paddingHorizontal: space.lg,
                    paddingVertical: space.md,
                    flexDirection: 'row',
                    alignItems: 'center',
                    gap: space.md,
                    opacity: pressed ? 0.75 : 1,
                  })}
                >
                  <View style={{ flex: 1, gap: 1 }}>
                    <Title style={{ fontSize: 17 }} color={onPlayerColor} numberOfLines={1}>
                      {t.title}
                    </Title>
                    <Label color={onPlayerColor} numberOfLines={1}>
                      {t.grupoNombre ? `${t.grupoNombre} · ` : ''}
                      {t.fase === 'terminado' ? 'Terminado' : 'En juego'}
                    </Label>
                  </View>
                  <Icon name="chevronRight" size={18} color={onPlayerColor} />
                </Pressable>
              ))}
            </View>
          </View>
        ) : null}

        {/* Partidas guardadas */}
        <View style={{ marginTop: space.huge }}>
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
                    accessibilityHint="Mantené apretado para ver más acciones"
                    onPress={() => {
                      haptic.tap();
                      router.push(hrefOf(g));
                    }}
                    onLongPress={() => {
                      haptic.heavy();
                      abrirMenu(g, { enLista: true, onAbrir: () => router.push(hrefOf(g)) });
                    }}
                    delayLongPress={350}
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
                        {detalle(g)}
                      </Label>
                    </View>
                    {lead ? (
                      <View style={{ alignItems: 'flex-end' }}>
                        <Label>{g.finishedAt ? (g.kind === 'torneo' ? 'Campeón' : 'Ganó') : 'Va ganando'}</Label>
                        <Row style={{ gap: 6 }}>
                          <Label color={c.ink} style={{ fontSize: 14 }} numberOfLines={1}>
                            {lead.player.name}
                          </Label>
                          {lead.total !== null ? <Num style={{ fontSize: 18 }}>{lead.total}</Num> : null}
                        </Row>
                      </View>
                    ) : (
                      <Label>{g.kind === 'torneo' ? 'Sin partidos' : 'Sin rondas'}</Label>
                    )}
                  </Pressable>
                );
              })}
            </View>
          )}
        </View>
      </ScrollView>
    </View>
  );
}
