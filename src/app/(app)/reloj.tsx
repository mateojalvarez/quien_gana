import { useKeepAwake } from 'expo-keep-awake';
import { useEffect, useRef, useState, type ReactNode } from 'react';
import { Animated, Easing, Pressable, View } from 'react-native';

import { Clay } from '@/components/clay';
import { Bar, Button, Card, Display, Label, Num, Row, Screen, Stepper, Title } from '@/components/ui';
import { haptic } from '@/lib/haptics';
import { sonido } from '@/lib/sonido';
import { border, onPlayerColor, palette, radius, space } from '@/theme/tokens';
import { useTheme } from '@/theme/use-theme';

const PRESETS = [30, 60, 90, 120, 180, 300];
/** Desde acá el cuadrado titila y suena un tic por segundo. */
const AVISO_MS = 5_000;

const fmt = (ms: number) => {
  const s = Math.ceil(ms / 1000);
  return `${String(Math.floor(s / 60)).padStart(2, '0')}:${String(s % 60).padStart(2, '0')}`;
};

export default function Reloj() {
  useKeepAwake();
  const { c } = useTheme();
  const [duration, setDuration] = useState(60_000);
  const [remaining, setRemaining] = useState(60_000);
  const [running, setRunning] = useState(false);
  // Personalizado: se edita siempre, aunque esté elegido un preset.
  const [min, setMin] = useState(1);
  const [seg, setSeg] = useState(30);
  const endAt = useRef(0);
  // El aviso del final sale una sola vez por cuenta, y no depende de que un
  // tick del intervalo caiga justo en 0.
  const avisado = useRef(false);
  const ultimoTic = useRef(-1);

  useEffect(() => {
    if (!running) return;

    const avisar = () => {
      if (avisado.current) return;
      avisado.current = true;
      setRemaining(0);
      setRunning(false);
      sonido.alarma();
      haptic.warning();
      setTimeout(() => haptic.heavy(), 250);
      setTimeout(() => haptic.heavy(), 520);
    };

    const fin = setTimeout(avisar, Math.max(0, endAt.current - Date.now()));
    const id = setInterval(() => {
      const left = Math.max(0, endAt.current - Date.now());
      setRemaining(left);
      if (left === 0) {
        avisar();
        return;
      }
      // Un tic por segundo en la cuenta final, sin repetir el mismo segundo.
      const s = Math.ceil(left / 1000);
      if (left <= AVISO_MS && ultimoTic.current !== s) {
        ultimoTic.current = s;
        sonido.tic();
        haptic.tap();
      }
    }, 100);

    return () => {
      clearTimeout(fin);
      clearInterval(id);
    };
  }, [running]);

  function start() {
    const base = remaining === 0 ? duration : remaining;
    if (base === 0) return;
    avisado.current = false;
    ultimoTic.current = -1;
    endAt.current = Date.now() + base;
    setRemaining(base);
    setRunning(true);
  }

  function pick(sec: number) {
    setRunning(false);
    avisado.current = false;
    ultimoTic.current = -1;
    setDuration(sec * 1000);
    setRemaining(sec * 1000);
  }

  /** Cargar el personalizado lo deja listo para empezar, como un preset. */
  function custom(m: number, s: number) {
    setMin(m);
    setSeg(s);
    pick(m * 60 + s);
  }

  const progress = duration ? remaining / duration : 0;
  const done = remaining === 0;
  const avisando = running && remaining > 0 && remaining <= AVISO_MS;
  const cardColor = done ? palette.tomate : running ? palette.mostaza : palette.crema;
  const personalizado = !PRESETS.includes(duration / 1000) && duration === (min * 60 + seg) * 1000;

  return (
    <Screen
      title="Reloj"
      meta="Reloj de arena para turnos"
      footer={
        <Row style={{ gap: space.sm }}>
          <Button label="Reiniciar" variant="outline" style={{ flex: 1 }} onPress={() => pick(duration / 1000)} />
          <Button
            label={running ? 'Pausar' : done ? 'Otra vez' : 'Empezar'}
            icon={running ? 'pause' : 'play'}
            style={{ flex: 2 }}
            disabled={!running && duration === 0 && remaining === 0}
            onPress={() => (running ? setRunning(false) : start())}
          />
        </Row>
      }
    >
      <Titilante activo={avisando}>
        <Card color={cardColor} big style={{ paddingVertical: space.xxl, alignItems: 'center' }}>
          <Clay name="relojArena" size={132} style={{ transform: [{ rotate: done ? '180deg' : '0deg' }] }} />
          <Display color={onPlayerColor} style={{ fontSize: 76, lineHeight: 91, marginTop: space.lg, letterSpacing: -2.5 }}>
            {fmt(remaining)}
          </Display>
          <Label color={onPlayerColor} style={{ fontSize: 15 }}>
            {done ? '¡Tiempo!' : avisando ? 'Últimos segundos' : running ? 'Corriendo' : 'Listo'}
          </Label>
          <View style={{ alignSelf: 'stretch', paddingHorizontal: space.xl, marginTop: space.lg }}>
            <Bar progress={progress} color={palette.tinta} height={12} />
          </View>
        </Card>
      </Titilante>

      <Label style={{ marginTop: space.huge, marginBottom: space.sm }}>Duración</Label>
      <Row style={{ flexWrap: 'wrap', gap: space.sm }}>
        {PRESETS.map((p) => {
          const active = duration === p * 1000;
          return (
            <Pressable
              key={p}
              accessibilityRole="button"
              accessibilityState={{ selected: active }}
              onPress={() => {
                haptic.tap();
                pick(p);
              }}
              style={({ pressed }) => ({
                height: 50,
                minWidth: 92,
                paddingHorizontal: space.lg,
                borderRadius: radius.pill,
                borderWidth: border,
                borderColor: c.lineStrong,
                backgroundColor: active ? c.inverseBg : 'transparent',
                alignItems: 'center',
                justifyContent: 'center',
                opacity: pressed ? 0.7 : 1,
              })}
            >
              <Num color={active ? c.inverseInk : c.ink} style={{ fontSize: 17 }}>
                {fmt(p * 1000)}
              </Num>
            </Pressable>
          );
        })}
      </Row>

      {/* Personalizado: minutos y segundos a mano, sin teclado */}
      <View
        style={{
          marginTop: space.lg,
          borderRadius: radius.field,
          borderWidth: border,
          borderColor: personalizado ? c.lineStrong : c.line,
          padding: space.lg,
          gap: space.md,
        }}
      >
        <Row style={{ justifyContent: 'space-between', alignItems: 'baseline' }}>
          <Title style={{ fontSize: 16 }}>Personalizado</Title>
          <Num style={{ fontSize: 17 }}>{fmt((min * 60 + seg) * 1000)}</Num>
        </Row>
        <Row style={{ justifyContent: 'space-between', gap: space.md }}>
          <View style={{ gap: space.sm, alignItems: 'center' }}>
            <Label>Minutos</Label>
            <Stepper value={min} onChange={(v) => custom(v, seg)} min={0} max={59} labelMinus="Un minuto menos" labelPlus="Un minuto más" />
          </View>
          <View style={{ gap: space.sm, alignItems: 'center' }}>
            <Label>Segundos</Label>
            <Stepper
              value={seg}
              onChange={(v) => custom(min, v)}
              min={0}
              max={55}
              step={5}
              labelMinus="Cinco segundos menos"
              labelPlus="Cinco segundos más"
            />
          </View>
        </Row>
      </View>
    </Screen>
  );
}

/** Titileo de los últimos segundos: la tarjeta se apaga y prende sola. */
function Titilante({ activo, children }: { activo: boolean; children: ReactNode }) {
  // Igual que el Toggle de ui.tsx: el valor animado vive en estado, no en un ref.
  const [anim] = useState(() => new Animated.Value(1));

  useEffect(() => {
    if (!activo) {
      anim.setValue(1);
      return;
    }
    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(anim, { toValue: 0.35, duration: 300, easing: Easing.inOut(Easing.quad), useNativeDriver: true }),
        Animated.timing(anim, { toValue: 1, duration: 300, easing: Easing.inOut(Easing.quad), useNativeDriver: true }),
      ]),
    );
    loop.start();
    return () => {
      loop.stop();
      anim.setValue(1);
    };
  }, [activo, anim]);

  return <Animated.View style={{ marginTop: space.lg, opacity: anim }}>{children}</Animated.View>;
}
