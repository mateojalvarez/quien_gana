// Piezas del pulsador multidispositivo: la hoja de "sala cerca", el editor de
// reglas, la planilla de puntos y el anuncio de ganador.

import { useEffect, useState, type ReactNode } from 'react';
import { Pressable, Text, View } from 'react-native';
import { Gesture, GestureDetector } from 'react-native-gesture-handler';
import Animated, {
  Easing,
  FadeIn,
  FadeOut,
  runOnJS,
  useAnimatedStyle,
  useSharedValue,
  withDelay,
  withRepeat,
  withSequence,
  withSpring,
  withTiming,
  ZoomIn,
} from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { ranking } from '@/features/pulsador/logic';
import type { Marcador, Player, Rules } from '@/features/pulsador/types';
import { haptic } from '@/lib/haptics';
import type { SalaCerca } from '@/lib/nearby';
import { sonido } from '@/lib/sonido';
import { fonts, palette, playerColor, radius, space } from '@/theme/tokens';
import { useTheme } from '@/theme/use-theme';
import { Clay } from './clay';
import { Icon } from './icons';
import { Avatar, Body, Button, Display, Label, Row, Stepper, Title, Toggle } from './ui';

/* ───────────── Hoja: sala en el mismo wifi ───────────── */

/** Onda del radar: crece y se desvanece, en loop, desfasada por `delay`. */
function Onda({ delay, color }: { delay: number; color: string }) {
  const p = useSharedValue(0);
  useEffect(() => {
    p.set(withDelay(delay, withRepeat(withTiming(1, { duration: 2400, easing: Easing.out(Easing.quad) }), -1, false)));
  }, [delay, p]);
  const estilo = useAnimatedStyle(() => ({
    opacity: 0.55 * (1 - p.get()),
    transform: [{ scale: 0.6 + p.get() * 0.65 }],
  }));
  return (
    <Animated.View
      pointerEvents="none"
      style={[{ position: 'absolute', width: 150, height: 150, borderRadius: 75, borderWidth: 3, borderColor: color }, estilo]}
    />
  );
}

/**
 * Como la invitación a una Jam: aparece sola cuando el teléfono encuentra una
 * sala en el wifi. Se cierra tocando afuera o arrastrando hacia abajo.
 */
export function HojaSalaCerca({
  salas,
  onUnirme,
  onCerrar,
}: {
  salas: SalaCerca[];
  onUnirme: (s: SalaCerca) => void;
  onCerrar: () => void;
}) {
  const { c, scheme } = useTheme();
  const insets = useSafeAreaInsets();
  const [elegida, setElegida] = useState(0);
  const sala = salas[Math.min(elegida, salas.length - 1)];
  const y = useSharedValue(600);
  const botonPulso = useSharedValue(1);

  useEffect(() => {
    y.set(withSpring(0, { damping: 18, stiffness: 160 }));
    botonPulso.set(withDelay(500, withRepeat(withSequence(withTiming(1.04, { duration: 700 }), withTiming(1, { duration: 700 })), -1)));
    haptic.success();
    sonido.tic();
  }, [y, botonPulso]);

  const cerrar = () => {
    y.set(withTiming(700, { duration: 220 }, (done) => {
      'worklet';
      if (done) runOnJS(onCerrar)();
    }));
  };

  const pan = Gesture.Pan()
    .activeOffsetY(8)
    .onUpdate((e) => {
      y.set(Math.max(0, e.translationY));
    })
    .onEnd((e) => {
      if (e.translationY > 120 || e.velocityY > 900) {
        y.set(withTiming(700, { duration: 200 }, (done) => {
          'worklet';
          if (done) runOnJS(onCerrar)();
        }));
      } else {
        y.set(withSpring(0, { damping: 18 }));
      }
    });

  const hojaEstilo = useAnimatedStyle(() => ({ transform: [{ translateY: y.get() }] }));
  const scrimEstilo = useAnimatedStyle(() => ({ opacity: Math.max(0, 1 - y.get() / 500) }));
  const botonEstilo = useAnimatedStyle(() => ({ transform: [{ scale: botonPulso.get() }] }));

  if (!sala) return null;

  return (
    <View style={{ position: 'absolute', left: 0, right: 0, top: 0, bottom: 0, justifyContent: 'flex-end' }}>
      <Animated.View style={[{ position: 'absolute', left: 0, right: 0, top: 0, bottom: 0, backgroundColor: c.scrim }, scrimEstilo]}>
        <Pressable accessibilityRole="button" accessibilityLabel="Cerrar" style={{ flex: 1 }} onPress={cerrar} />
      </Animated.View>
      <GestureDetector gesture={pan}>
        <Animated.View
          style={[
            {
              backgroundColor: c.bg,
              borderTopLeftRadius: radius.cardLg,
              borderTopRightRadius: radius.cardLg,
              paddingTop: space.md,
              paddingHorizontal: space.xl,
              paddingBottom: insets.bottom + space.xl,
              alignItems: 'center',
              gap: space.lg,
            },
            hojaEstilo,
          ]}
        >
          <View style={{ width: 44, height: 5, borderRadius: 3, backgroundColor: c.line }} />

          {/* Radar: la sala "se escucha" en la red */}
          <View style={{ width: 190, height: 170, alignItems: 'center', justifyContent: 'center' }}>
            <Onda delay={0} color={palette.salvia} />
            <Onda delay={800} color={palette.mostaza} />
            <Onda delay={1600} color={palette.tomate} />
            <Animated.View entering={ZoomIn.springify().damping(12)}>
              <Clay name="pulsador" size={104} />
            </Animated.View>
          </View>

          <View style={{ alignItems: 'center', gap: space.xs }}>
            <Row style={{ gap: 6 }}>
              <Icon name="wifi" size={15} color={c.muted} />
              <Label>En tu misma red</Label>
            </Row>
            <Display style={{ fontSize: 30, lineHeight: 36, textAlign: 'center' }} numberOfLines={2}>
              {sala.host} armó una sala
            </Display>
            <Row style={{ gap: space.sm, marginTop: space.xs }}>
              <Avatar name={sala.host} color={playerColor(0, scheme)} size={28} />
              <Text style={{ fontFamily: fonts.bold, fontSize: 20, letterSpacing: 4, color: c.ink }}>{sala.code}</Text>
            </Row>
          </View>

          {salas.length > 1 ? (
            <Row style={{ gap: space.sm, flexWrap: 'wrap', justifyContent: 'center' }}>
              {salas.map((s, i) => (
                <Pressable
                  key={s.code}
                  accessibilityRole="button"
                  accessibilityLabel={`Sala de ${s.host}`}
                  onPress={() => {
                    haptic.tap();
                    setElegida(i);
                  }}
                  style={{
                    paddingHorizontal: space.md,
                    height: 34,
                    borderRadius: radius.pill,
                    justifyContent: 'center',
                    backgroundColor: i === elegida ? c.inverseBg : c.wash,
                  }}
                >
                  <Label color={i === elegida ? c.inverseInk : c.ink}>
                    {s.host} · {s.code}
                  </Label>
                </Pressable>
              ))}
            </Row>
          ) : null}

          <Animated.View style={[{ alignSelf: 'stretch' }, botonEstilo]}>
            <Button
              label="Unirme"
              trailingIcon="arrowRight"
              variant="color"
              color={palette.salvia}
              onPress={() => {
                haptic.success();
                onUnirme(sala);
              }}
            />
          </Animated.View>
          <Pressable accessibilityRole="button" hitSlop={10} onPress={cerrar}>
            <Label style={{ fontSize: 15 }}>Ahora no</Label>
          </Pressable>
        </Animated.View>
      </GestureDetector>
    </View>
  );
}

/* ───────────── Reglas ───────────── */

export function ReglasPulsador({ rules, onChange }: { rules: Rules; onChange?: (r: Rules) => void }) {
  const { c } = useTheme();
  const editable = Boolean(onChange);
  const fila = (titulo: string, sub: string, control: ReactNode) => (
    <Row style={{ gap: space.md, minHeight: 52 }}>
      <View style={{ flex: 1, gap: 2 }}>
        <Title style={{ fontSize: 16 }}>{titulo}</Title>
        <Label>{sub}</Label>
      </View>
      {control}
    </Row>
  );
  const valor = (t: string) => (
    <Text style={{ fontFamily: fonts.bold, fontSize: 20, color: c.ink, fontVariant: ['tabular-nums'] }}>{t}</Text>
  );

  return (
    <View style={{ gap: space.md }}>
      {fila(
        'Acierto',
        'Puntos que suma responder bien',
        editable ? (
          <Stepper value={rules.acierto} min={1} max={10} size={38} onChange={(n) => onChange!({ ...rules, acierto: n })} />
        ) : (
          valor(`+${rules.acierto}`)
        ),
      )}
      {fila(
        'Error',
        rules.fallo === 0 ? 'Equivocarse no resta' : 'Puntos que resta equivocarse',
        editable ? (
          <Stepper value={rules.fallo} min={0} max={10} size={38} onChange={(n) => onChange!({ ...rules, fallo: n })} />
        ) : (
          valor(rules.fallo ? `−${rules.fallo}` : '0')
        ),
      )}
      {fila(
        'Rondas',
        rules.rondas === null ? 'Ilimitadas: se juega hasta que quieran' : `Gana el que más sume en ${rules.rondas}`,
        editable ? (
          <Toggle
            label="Rondas ilimitadas"
            value={rules.rondas === null}
            onChange={(v) => onChange!({ ...rules, rondas: v ? null : 10 })}
          />
        ) : (
          valor(rules.rondas === null ? '∞' : `${rules.rondas}`)
        ),
      )}
      {editable && rules.rondas !== null ? (
        <Row style={{ justifyContent: 'space-between' }}>
          <Label>Cantidad de rondas</Label>
          <Stepper value={rules.rondas} min={1} max={50} size={38} onChange={(n) => onChange!({ ...rules, rondas: n })} />
        </Row>
      ) : null}
    </View>
  );
}

/* ───────────── Planilla ───────────── */

/** Tabla de posiciones parcial. `compacta` es la tira que va en la arena. */
export function Planilla({
  players,
  marcador,
  meId,
  compacta,
}: {
  players: Player[];
  marcador: Marcador;
  meId?: string;
  compacta?: boolean;
}) {
  const { c, scheme } = useTheme();
  const porId = new Map(players.map((p) => [p.id, p]));
  const tabla = ranking(
    marcador.scores,
    players.map((p) => p.id),
  );
  const { rules, jugadas } = marcador;
  const lista = compacta ? tabla.slice(0, 3) : tabla;

  return (
    <View style={{ gap: compacta ? 4 : space.sm }}>
      <Row style={{ justifyContent: 'space-between' }}>
        <Label>{compacta ? 'Posiciones' : 'Planilla'}</Label>
        <Label style={{ fontVariant: ['tabular-nums'] }}>
          {rules.rondas === null ? `Ronda ${jugadas}` : `Ronda ${Math.min(jugadas, rules.rondas)}/${rules.rondas}`}
        </Label>
      </Row>
      {lista.map((fila, i) => {
        const p = porId.get(fila.id);
        if (!p) return null;
        const d = marcador.ultimo[fila.id];
        const lider = i === 0 && fila.puntos > (tabla[1]?.puntos ?? -Infinity);
        return (
          <Row
            key={fila.id}
            style={{
              gap: space.md,
              minHeight: compacta ? 34 : 48,
              paddingHorizontal: compacta ? 0 : space.md,
              borderRadius: radius.field,
              backgroundColor: !compacta && fila.id === meId ? c.wash : 'transparent',
            }}
          >
            <Text style={{ width: 22, fontFamily: fonts.bold, fontSize: 15, color: c.muted, fontVariant: ['tabular-nums'] }}>{i + 1}</Text>
            <Avatar name={p.name} color={playerColor(p.slot, scheme)} size={compacta ? 24 : 32} />
            <Body style={{ flex: 1, fontSize: compacta ? 15 : 17 }} numberOfLines={1}>
              {p.name}
              {fila.id === meId ? ' (vos)' : ''}
            </Body>
            {lider ? <Icon name="flag" size={14} color={palette.mostaza} /> : null}
            {d ? (
              <Animated.View key={`${fila.id}:${d}:${jugadas}`} entering={FadeIn.duration(200)}>
                <Label color={d > 0 ? c.ok : c.bad} style={{ fontVariant: ['tabular-nums'] }}>
                  {d > 0 ? `▲ ${d}` : `▼ ${-d}`}
                </Label>
              </Animated.View>
            ) : null}
            <Text
              style={{
                minWidth: 36,
                textAlign: 'right',
                fontFamily: fonts.black,
                fontSize: compacta ? 18 : 24,
                color: c.ink,
                fontVariant: ['tabular-nums'],
              }}
            >
              {fila.puntos}
            </Text>
          </Row>
        );
      })}
    </View>
  );
}

/* ───────────── Anuncio de ganador ───────────── */

export function AnuncioGanador({
  players,
  marcador,
  meId,
  asHost,
  onSeguir,
  onTerminar,
  onRevancha,
  onSalir,
}: {
  players: Player[];
  marcador: Marcador;
  meId?: string;
  asHost: boolean;
  onSeguir: () => void;
  onTerminar: () => void;
  onRevancha: () => void;
  onSalir: () => void;
}) {
  const { c } = useTheme();
  const insets = useSafeAreaInsets();
  const a = marcador.anuncio;
  const clave = a ? `${a.motivo}:${a.ganadores.join(',')}:${a.terminado}` : null;

  useEffect(() => {
    if (!clave) return;
    sonido.senal();
    haptic.success();
  }, [clave]);

  if (!a) return null;
  const nombre = (id: string) => players.find((p) => p.id === id)?.name ?? '—';
  const gane = Boolean(meId && a.ganadores.includes(meId));
  const empate = a.ganadores.length > 1;
  const titulo = empate ? 'Empate' : `¡Ganó ${nombre(a.ganadores[0]!)}!`;
  const sub = a.terminado
    ? 'Partida terminada'
    : a.motivo === 'matematico'
      ? 'Ya nadie lo alcanza, aunque queden rondas'
      : empate
        ? `${a.ganadores.map(nombre).join(' y ')} terminan iguales`
        : 'Se jugaron todas las rondas';

  return (
    <Animated.View
      entering={FadeIn.duration(220)}
      exiting={FadeOut.duration(160)}
      style={{ position: 'absolute', left: 0, right: 0, top: 0, bottom: 0, backgroundColor: c.scrim, justifyContent: 'flex-end' }}
    >
      <View
        style={{
          backgroundColor: c.bg,
          borderTopLeftRadius: radius.cardLg,
          borderTopRightRadius: radius.cardLg,
          padding: space.xl,
          paddingBottom: insets.bottom + space.xl,
          gap: space.lg,
        }}
      >
        <Animated.View entering={ZoomIn.springify().damping(10)} style={{ alignSelf: 'center' }}>
          <Clay name={empate ? 'corona' : 'trofeo'} size={120} />
        </Animated.View>
        <View style={{ alignItems: 'center', gap: space.xs }}>
          {gane ? <Label color={c.ok}>¡Sos vos!</Label> : null}
          <Display style={{ textAlign: 'center' }} numberOfLines={2} adjustsFontSizeToFit minimumFontScale={0.6}>
            {titulo}
          </Display>
          <Body color={c.muted} style={{ textAlign: 'center' }}>
            {sub}
          </Body>
        </View>

        <View style={{ borderRadius: radius.card, borderWidth: 1.5, borderColor: c.line, padding: space.md }}>
          <Planilla players={players} marcador={marcador} meId={meId} />
        </View>

        {asHost ? (
          a.terminado ? (
            <Row style={{ gap: space.sm }}>
              <Button label="Salir" variant="outline" style={{ flex: 1 }} onPress={onSalir} />
              <Button label="Revancha" icon="barajar" style={{ flex: 1 }} onPress={onRevancha} />
            </Row>
          ) : (
            <Row style={{ gap: space.sm }}>
              <Button label="Terminar" variant="outline" style={{ flex: 1 }} onPress={onTerminar} />
              <Button label="Seguir jugando" variant="color" color={palette.salvia} style={{ flex: 1.4 }} onPress={onSeguir} />
            </Row>
          )
        ) : a.terminado ? (
          <Button label="Salir" variant="outline" onPress={onSalir} />
        ) : (
          <Label style={{ textAlign: 'center' }}>El anfitrión decide si siguen jugando.</Label>
        )}
      </View>
    </Animated.View>
  );
}

