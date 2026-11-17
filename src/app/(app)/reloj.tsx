import { useKeepAwake } from 'expo-keep-awake';
import { useEffect, useRef, useState } from 'react';
import { Pressable, View } from 'react-native';

import { Clay } from '@/components/clay';
import { Bar, Button, Card, Display, Label, Num, Row, Screen } from '@/components/ui';
import { haptic } from '@/lib/haptics';
import { border, onPlayerColor, palette, radius, space } from '@/theme/tokens';
import { useTheme } from '@/theme/use-theme';

const PRESETS = [30, 60, 90, 120, 180, 300];

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
  const endAt = useRef(0);

  useEffect(() => {
    if (!running) return;
    const id = setInterval(() => {
      const left = Math.max(0, endAt.current - Date.now());
      setRemaining(left);
      if (left <= 10_000 && left > 0 && left % 1000 < 100) haptic.tap();
      if (left === 0) {
        setRunning(false);
        haptic.warning();
        setTimeout(() => haptic.heavy(), 250);
      }
    }, 100);
    return () => clearInterval(id);
  }, [running]);

  function start() {
    const base = remaining === 0 ? duration : remaining;
    endAt.current = Date.now() + base;
    setRemaining(base);
    setRunning(true);
  }
  function pick(sec: number) {
    setRunning(false);
    setDuration(sec * 1000);
    setRemaining(sec * 1000);
  }

  const progress = duration ? remaining / duration : 0;
  const done = remaining === 0;
  const cardColor = done ? palette.tomate : running ? palette.mostaza : palette.crema;

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
            onPress={() => (running ? setRunning(false) : start())}
          />
        </Row>
      }
    >
      <Card color={cardColor} big style={{ marginTop: space.lg, paddingVertical: space.xxl, alignItems: 'center' }}>
        <Clay name="relojArena" size={132} style={{ transform: [{ rotate: done ? '180deg' : '0deg' }] }} />
        <Display color={onPlayerColor} style={{ fontSize: 76, lineHeight: 80, marginTop: space.md, letterSpacing: -2.5 }}>
          {fmt(remaining)}
        </Display>
        <Label color={onPlayerColor} style={{ fontSize: 15 }}>
          {done ? '¡Tiempo!' : running ? 'Corriendo' : 'Listo'}
        </Label>
        <View style={{ alignSelf: 'stretch', paddingHorizontal: space.xl, marginTop: space.lg }}>
          <Bar progress={progress} color={palette.tinta} height={12} />
        </View>
      </Card>

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
    </Screen>
  );
}
