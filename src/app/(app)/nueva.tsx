import { router, useLocalSearchParams } from 'expo-router';
import { useMemo, useState } from 'react';
import { Pressable, TextInput, View } from 'react-native';

import { Clay } from '@/components/clay';
import { useOverlay } from '@/components/overlay';
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
  Title,
  Toggle,
} from '@/components/ui';
import { Reorderable } from '@/components/reorderable';
import { armarParejas, DEFAULTS as BURAKO, LIMITS as BURAKO_LIMITS, nombreEquipo } from '@/features/burako/rules';
import { DEFAULTS as CALAVERAS, LIMITS as CALAVERAS_LIMITS, maxPlayersFor } from '@/features/calaveras/rules';
import { DEFAULTS, LIMITS, maxCards } from '@/features/corazones/rules';
import { haptic } from '@/lib/haptics';
import { uid } from '@/lib/id';
import { useGames } from '@/store/games';
import { groupById, playerNames, useGrupos } from '@/store/grupos';
import { border, fonts, onPlayerColor, palette, playerColor, radius, space } from '@/theme/tokens';
import { useTheme } from '@/theme/use-theme';

/** Los tres de siempre; cualquier otro número se carga con «Otro». */
const OBJETIVOS = [30, 100, 500] as const;
const MAX_OBJETIVO = 9999;

/** El anotador no reparte cartas, así que su tope es sólo de practicidad. */
const MAX_PLAYERS_ANOTADOR = 8;
/** Generala: con más de seis, una vuelta entera se hace eterna. */
const MAX_PLAYERS_GENERALA = 6;
const ROW_H = 58;

type Kind = 'anotador' | 'corazones' | 'generala' | 'burako' | 'calaveras';
const KINDS_NUEVA: Kind[] = ['anotador', 'corazones', 'generala', 'burako', 'calaveras'];

const NOMBRE: Record<Kind, string> = {
  anotador: 'Anotador',
  corazones: 'Corazones',
  generala: 'Generala',
  burako: 'Burako',
  calaveras: 'Calaveras y piratas',
};

const EJEMPLO: Record<Kind, string> = {
  anotador: 'Truco del viernes',
  corazones: 'Corazones en lo de Juli',
  generala: 'Generala del domingo',
  burako: 'Burako en lo de la abuela',
  calaveras: 'Piratas del sábado',
};

const CLAY = { anotador: 'lapiz', corazones: 'corazon', generala: 'generala', burako: 'burako', calaveras: 'calavera' } as const;

type Extras = { edicionNueva: boolean; expansion: boolean };

function topeDe(kind: Kind, modo: 'individual' | 'parejas', extras: Extras) {
  switch (kind) {
    case 'corazones':
      return LIMITS.maxPlayers;
    case 'generala':
      return MAX_PLAYERS_GENERALA;
    case 'burako':
      return modo === 'parejas' ? BURAKO_LIMITS.integrantesParejas : BURAKO_LIMITS.maxIndividual;
    case 'calaveras':
      return maxPlayersFor(extras);
    default:
      return MAX_PLAYERS_ANOTADOR;
  }
}

export default function NuevaPartida() {
  const { kind: kindParam } = useLocalSearchParams<{ kind?: string }>();
  // Truco no pasa por acá: tiene su propia pantalla, con equipos en vez de jugadores.
  const kind: Kind = KINDS_NUEVA.includes(kindParam as Kind) ? (kindParam as Kind) : 'anotador';
  const { c, scheme } = useTheme();
  const overlay = useOverlay();
  const create = useGames((s) => s.create);

  // El grupo activo precarga a sus integrantes: con cuenta y sin cuenta.
  const activeId = useGrupos((s) => s.activeId);
  const groups = useGrupos((s) => s.groups);
  const locals = useGrupos((s) => s.locals);
  const grupo = groupById(groups, activeId);
  const delGrupo = useMemo(
    () => (grupo ? playerNames(grupo, locals[grupo.id] ?? []) : []),
    [grupo, locals],
  );

  const vacios = () => [
    { id: uid(), name: '' },
    { id: uid(), name: '' },
  ];

  const [title, setTitle] = useState('');
  const [usandoGrupo, setUsandoGrupo] = useState(delGrupo.length >= 2);
  const [players, setPlayers] = useState<{ id: string; name: string }[]>(() => {
    const nombres = delGrupo.slice(0, topeDe(kind, 'individual', { edicionNueva: true, expansion: false }));
    return nombres.length >= 2 ? nombres.map((name) => ({ id: uid(), name })) : vacios();
  });
  const [target, setTarget] = useState<number | null>(kind === 'anotador' ? 100 : null);
  const [lowestWins, setLowestWins] = useState(false);
  const [totalRounds, setTotalRounds] = useState<number>(DEFAULTS.totalRounds);
  const [decks, setDecks] = useState<number>(DEFAULTS.decks);
  const [bonusFromRound, setBonusFromRound] = useState<number>(DEFAULTS.bonusFromRound);
  const [modo, setModoState] = useState<'individual' | 'parejas'>('individual');
  const [meta, setMeta] = useState<number>(BURAKO.target);
  const [extras, setExtrasState] = useState<Extras>({ edicionNueva: true, expansion: false });
  const [rondasPiratas, setRondasPiratas] = useState<number>(CALAVERAS.totalRounds);

  const named = players.map((p) => p.name.trim()).filter(Boolean);
  const cards = maxCards(named.length, decks);
  const canCreate =
    kind === 'burako' && modo === 'parejas' ? named.length === BURAKO_LIMITS.integrantesParejas : named.length >= 2;

  // Las rondas no limitan a los jugadores ni al revés: cada ronda se reparte de
  // nuevo, así que jugadores y mazos sólo definen el máximo de bazas por ronda.
  const maxPlayers = topeDe(kind, modo, extras);

  /** Al cambiar el tope, la lista se recorta o se completa con lugares vacíos. */
  function ajustarLugares(tope: number, minimo: number) {
    setPlayers((ps) => {
      const next = ps.slice(0, tope);
      while (next.length < minimo) next.push({ id: uid(), name: '' });
      return next;
    });
  }

  function setModo(m: 'individual' | 'parejas') {
    setModoState(m);
    const tope = topeDe('burako', m, extras);
    ajustarLugares(tope, m === 'parejas' ? tope : 2);
  }

  function setExtras(e: Extras) {
    setExtrasState(e);
    ajustarLugares(topeDe('calaveras', modo, e), 2);
  }
  const maxRounds = LIMITS.maxRounds;

  const otroObjetivo = target != null && !OBJETIVOS.includes(target as (typeof OBJETIVOS)[number]);

  async function pedirObjetivo() {
    haptic.tap();
    const escrito = await overlay.prompt({
      title: 'Puntaje objetivo',
      message: `El que diga el juego: hasta ${MAX_OBJETIVO}.`,
      placeholder: '250',
      initial: otroObjetivo ? String(target) : '',
      keyboardType: 'number-pad',
      maxLength: 4,
      confirmLabel: 'Usar',
    });
    if (!escrito) return;
    const n = parseInt(escrito.replace(/[^\d]/g, ''), 10);
    if (!Number.isFinite(n) || n < 1) return;
    setTarget(Math.min(n, MAX_OBJETIVO));
  }

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

  function submit() {
    const nombreKind = kind === 'anotador' ? 'Partida' : NOMBRE[kind];
    const fallbackTitle = `${nombreKind} ${new Date().toLocaleDateString('es-AR', { day: '2-digit', month: '2-digit' })}`;
    const parejas = armarParejas(named);
    const id =
      kind === 'burako'
        ? create({
            kind,
            title: title.trim() || fallbackTitle,
            modo,
            target: meta,
            ...(modo === 'parejas'
              ? { players: parejas.map(nombreEquipo), integrantes: parejas }
              : { players: named }),
          })
        : kind === 'calaveras'
        ? create({ kind, title: title.trim() || fallbackTitle, players: named, totalRounds: rondasPiratas, extras })
        : kind === 'generala'
        ? create({ kind, title: title.trim() || fallbackTitle, players: named })
        : kind === 'anotador'
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
    router.replace(`/${kind}/${id}`);
  }

  return (
    <Screen
      title="Nueva partida"
      meta={NOMBRE[kind]}
      decor={
        <View style={{ position: 'absolute', right: -8, top: 4 }} pointerEvents="none">
          <Clay name={CLAY[kind]} size={96} />
        </View>
      }
      footer={
        <Button
          label={kind === 'generala' ? 'Empezar' : 'Repartir'}
          meta={canCreate ? (kind === 'burako' && modo === 'parejas' ? '2 parejas' : `${named.length} jugadores`) : undefined}
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
        placeholder={EJEMPLO[kind]}
        style={{ marginTop: space.lg }}
      />

      <View style={{ marginTop: space.xxl }}>
        <SectionHead title="Jugadores" meta={`${named.length} de ${maxPlayers}`} />

        {grupo && delGrupo.length >= 2 ? (
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={
              usandoGrupo ? `Quitar los integrantes de ${grupo.name}` : `Cargar los integrantes de ${grupo.name}`
            }
            onPress={() => {
              haptic.tap();
              if (usandoGrupo) {
                setPlayers(vacios());
                setUsandoGrupo(false);
              } else {
                setPlayers(delGrupo.slice(0, maxPlayers).map((name) => ({ id: uid(), name })));
                setUsandoGrupo(true);
              }
            }}
            style={({ pressed }) => ({
              marginBottom: space.md,
              minHeight: 44,
              borderRadius: radius.pill,
              borderWidth: border,
              borderColor: c.lineStrong,
              backgroundColor: usandoGrupo ? c.inverseBg : 'transparent',
              flexDirection: 'row',
              alignItems: 'center',
              gap: space.sm,
              paddingHorizontal: space.lg,
              alignSelf: 'flex-start',
              opacity: pressed ? 0.75 : 1,
            })}
          >
            <Icon name="users" size={17} color={usandoGrupo ? c.inverseInk : c.ink} />
            <Label color={usandoGrupo ? c.inverseInk : c.ink} style={{ fontSize: 14.5 }}>
              {grupo.name}
            </Label>
            <Icon name={usandoGrupo ? 'close' : 'plus'} size={15} color={usandoGrupo ? c.inverseInk : c.muted} />
          </Pressable>
        ) : null}
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
                placeholderTextColor={c.hint}
                style={{ flex: 1, fontFamily: fonts.semibold, fontSize: 17, color: c.ink, paddingVertical: space.md }}
                returnKeyType="next"
                autoCapitalize="words"
              />
              {(kind === 'corazones' || kind === 'calaveras') && i === 0 && name.trim() ? <Tag label="Reparte" /> : null}
              {kind === 'burako' && modo === 'parejas' ? <Tag label={i % 2 === 0 ? 'Pareja A' : 'Pareja B'} /> : null}
              {players.length > 2 && !(kind === 'burako' && modo === 'parejas') ? (
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
          ) : kind === 'corazones' || kind === 'calaveras' ? (
            <Body color={c.muted} style={{ fontSize: 13.5, lineHeight: 19 }}>
              {`Son ${maxPlayers} jugadores como máximo.`}
            </Body>
          ) : kind === 'burako' && modo === 'parejas' ? (
            <Body color={c.muted} style={{ fontSize: 13.5, lineHeight: 19 }}>
              Sentados enfrentados: el 1.º y el 3.º contra el 2.º y el 4.º. Arrastrá para cambiar las parejas.
            </Body>
          ) : null}
        </View>
      </View>

      <View style={{ marginTop: space.xxl, display: kind === 'generala' ? 'none' : 'flex' }}>
        <SectionHead title="Reglas" />

        {kind === 'burako' ? (
          <>
            <Label style={{ marginBottom: space.sm }}>Cómo juegan</Label>
            <Segmented
              options={[
                { value: 'individual', label: 'Individual' },
                { value: 'parejas', label: 'En parejas' },
              ]}
              value={modo}
              onChange={setModo}
            />
            <Card color={palette.tomate} style={{ marginTop: space.lg, padding: space.lg, gap: space.md }}>
              <Label color={onPlayerColor} style={{ fontSize: 14 }}>
                Gana el que llega a
              </Label>
              <Stepper
                value={meta}
                onChange={setMeta}
                min={BURAKO_LIMITS.minTarget}
                max={BURAKO_LIMITS.maxTarget}
                step={BURAKO_LIMITS.stepTarget}
                size={36}
                onColored
              />
            </Card>
            <Body color={c.muted} style={{ fontSize: 13.5, lineHeight: 19, marginTop: space.sm }}>
              Canasta pura 200, impura 100, cortar 100, más las fichas (pueden dar negativo). No levantar el muerto resta 100.
            </Body>
          </>
        ) : kind === 'calaveras' ? (
          <>
            <Card color={palette.salvia} style={{ padding: space.lg, gap: space.md }}>
              <Label color={onPlayerColor} style={{ fontSize: 14 }}>
                Rondas
              </Label>
              <Stepper
                value={rondasPiratas}
                onChange={setRondasPiratas}
                min={1}
                max={CALAVERAS_LIMITS.maxRounds}
                size={36}
                onColored
              />
            </Card>
            <View style={{ marginTop: space.lg }}>
              <FilaToggle
                titulo="Cartas de la edición nueva"
                detalle="Botín, Kraken, Ballena blanca y la apuesta del Rascal"
                value={extras.edicionNueva}
                onChange={(v) => setExtras({ ...extras, edicionNueva: v })}
              />
              <FilaToggle
                titulo="Paquete de expansión"
                detalle="Los 7 y 8, el Primer oficial y Davy Jones"
                value={extras.expansion}
                onChange={(v) => setExtras({ ...extras, expansion: v })}
              />
            </View>
            <Body color={c.muted} style={{ fontSize: 13.5, lineHeight: 19, marginTop: space.sm }}>
              En la ronda N se reparten N cartas. Acertar paga 20 por baza pedida (pedir 0 paga 10 por carta); errar resta 10 por baza de diferencia. Los bonus sólo cuentan si se acierta.
            </Body>
          </>
        ) : kind === 'corazones' ? (
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
              onChange={setDecks}
            />
            <Body color={c.muted} style={{ fontSize: 13.5, lineHeight: 19, marginTop: space.sm }}>
              {named.length >= 2
                ? `Con ${named.length} jugadores y ${decks} mazo${decks > 1 ? 's' : ''}: hasta ${cards} cartas por ronda${
                    totalRounds > cards ? `, y las últimas ${totalRounds - cards} se juegan con ${cards}` : ''
                  }. Acertar paga 10 + las bazas hechas; desde la ronda ${Math.min(bonusFromRound, totalRounds)}, 20 + las bazas.`
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
              <Row style={{ justifyContent: 'space-between', alignItems: 'flex-start', gap: space.md }}>
                <Num style={{ fontSize: 34, fontFamily: fonts.black }} color={onPlayerColor}>
                  {target ?? '—'}
                </Num>
                <Row style={{ flex: 1, flexWrap: 'wrap', justifyContent: 'flex-end', gap: space.sm }}>
                  {OBJETIVOS.map((n) => (
                    <Pildora
                      key={n}
                      label={String(n)}
                      activa={target === n}
                      onPress={() => {
                        haptic.tap();
                        setTarget(n);
                      }}
                    />
                  ))}
                  <Pildora
                    label="Otro"
                    activa={otroObjetivo}
                    onPress={pedirObjetivo}
                  />
                  <Pildora
                    label="Sin límite"
                    activa={target == null}
                    onPress={() => {
                      haptic.tap();
                      setTarget(null);
                    }}
                  />
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

function FilaToggle({
  titulo,
  detalle,
  value,
  onChange,
}: {
  titulo: string;
  detalle: string;
  value: boolean;
  onChange: (v: boolean) => void;
}) {
  return (
    <Row style={{ minHeight: 62, justifyContent: 'space-between', gap: space.lg }}>
      <View style={{ flex: 1, gap: 2 }}>
        <Title style={{ fontSize: 16 }}>{titulo}</Title>
        <Label>{detalle}</Label>
      </View>
      <Toggle value={value} onChange={onChange} label={titulo} />
    </Row>
  );
}

/** Píldora de la tarjeta de objetivo: va sobre color, así que el texto es tinta. */
function Pildora({ label, activa, onPress }: { label: string; activa: boolean; onPress: () => void }) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityState={{ selected: activa }}
      onPress={onPress}
      style={({ pressed }) => ({
        height: 36,
        paddingHorizontal: space.md,
        borderRadius: radius.pill,
        borderWidth: border,
        borderColor: onPlayerColor,
        backgroundColor: activa ? onPlayerColor : 'transparent',
        alignItems: 'center',
        justifyContent: 'center',
        opacity: pressed ? 0.7 : 1,
      })}
    >
      <Label color={activa ? palette.marfil : onPlayerColor} style={{ fontSize: 14.5 }}>
        {label}
      </Label>
    </Pressable>
  );
}
