import { useKeepAwake } from 'expo-keep-awake';
import { router } from 'expo-router';
import { useEffect, useRef, useState } from 'react';
import { Pressable, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { Clay } from '@/components/clay';
import { Body, Button, Card, Display, Label, Row, Screen, Segmented } from '@/components/ui';
import { haptic } from '@/lib/haptics';
import { onPlayerColor, palette, playerColor, radius, space } from '@/theme/tokens';
import { useTheme } from '@/theme/use-theme';

type Mode = 'libre' | 'senal';
type Status = 'armed' | 'waiting' | 'go' | 'done';

/** Entre 1,5 y 4,5 s antes de la señal. */
const randomDelay = () => 1500 + Math.random() * 3000;

export default function Pulsador() {
  const [playing, setPlaying] = useState(false);
  const [players, setPlayers] = useState(2);
  const [mode, setMode] = useState<Mode>('libre');
  const { c } = useTheme();

  if (playing) return <Arena players={players} mode={mode} onExit={() => setPlaying(false)} />;

  return (
    <Screen
      title="Pulsador"
      meta="Un teléfono, varios jugadores"
      decor={
        <View style={{ position: 'absolute', right: -4, top: 12 }} pointerEvents="none">
          <Clay name="pulsador" size={88} />
        </View>
      }
      footer={<Button label="Jugar" meta={`${players} zonas`} trailingIcon="arrowRight" onPress={() => setPlaying(true)} />}
    >
      <Label style={{ marginTop: space.lg, marginBottom: space.sm }}>Jugadores</Label>
      <Segmented options={[2, 3, 4].map((n) => ({ value: n, label: `${n}` }))} value={players} onChange={setPlayers} />

      <Label style={{ marginTop: space.xl, marginBottom: space.sm }}>Modo</Label>
      <Segmented
        options={[
          { value: 'libre', label: 'Libre' },
          { value: 'senal', label: 'Con señal' },
        ]}
        value={mode}
        onChange={setMode}
      />

      <Card color={mode === 'libre' ? palette.salvia : palette.tomate} style={{ marginTop: space.xl, padding: space.xl, gap: space.sm }}>
        <Label color={onPlayerColor}>{mode === 'libre' ? 'Modo libre' : 'Con señal'}</Label>
        <Body color={onPlayerColor} style={{ fontSize: 15, lineHeight: 21 }}>
          {mode === 'libre'
            ? 'Para preguntas y respuestas: el primero que toca su zona se queda con el turno.'
            : 'Esperen a que la pantalla diga ¡YA! Quien toque antes queda descalificado en esa ronda.'}
        </Body>
      </Card>

      <Body color={c.muted} style={{ marginTop: space.lg, fontSize: 14, lineHeight: 20 }}>
        Apoyá el teléfono en el centro de la mesa. Las zonas de arriba están giradas para quien está enfrente.
      </Body>
    </Screen>
  );
}

function Arena({ players, mode, onExit }: { players: number; mode: Mode; onExit: () => void }) {
  useKeepAwake();
  const insets = useSafeAreaInsets();
  const { c, scheme } = useTheme();
  const [status, setStatusState] = useState<Status>(mode === 'libre' ? 'armed' : 'waiting');
  const [winner, setWinner] = useState<number | null>(null);
  const [fouls, setFouls] = useState<number[]>([]);
  const goTimer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  // ref espejo para que dos toques casi simultáneos no declaren dos ganadores
  const statusRef = useRef<Status>(status);
  const setStatus = (s: Status) => {
    statusRef.current = s;
    setStatusState(s);
  };

  function arm() {
    setWinner(null);
    setFouls([]);
    clearTimeout(goTimer.current);
    if (mode === 'libre') {
      setStatus('armed');
    } else {
      setStatus('waiting');
      scheduleGo();
    }
  }

  function scheduleGo() {
    goTimer.current = setTimeout(() => {
      setStatus('go');
      haptic.warning();
    }, randomDelay());
  }

  useEffect(() => {
    if (mode === 'senal') scheduleGo();
    return () => clearTimeout(goTimer.current);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function touch(i: number) {
    const st = statusRef.current;
    if (st === 'done') return;
    if (st === 'waiting') {
      // tocó antes de la señal
      if (!fouls.includes(i)) {
        haptic.warning();
        setFouls((f) => [...f, i]);
      }
      return;
    }
    if (fouls.includes(i)) return;
    setStatus('done');
    setWinner(i);
    clearTimeout(goTimer.current);
    haptic.heavy();
  }

  const zones = Array.from({ length: players }, (_, i) => i);
  // 2 jugadores: arriba/abajo. 3–4: grilla 2×2 (la de arriba girada).
  const topRow = players === 2 ? [0] : [0, 1];
  const bottomRow = players === 2 ? [1] : zones.slice(2);

  const zone = (i: number, flipped: boolean) => {
    const color = playerColor(i, scheme);
    const isWinner = winner === i;
    const isFoul = fouls.includes(i);
    const dim = (winner !== null && !isWinner) || isFoul;
    let caption = `J${i + 1}`;
    if (isWinner) caption = '¡Primero!';
    else if (isFoul) caption = 'Antes de tiempo';
    else if (status === 'go') caption = '¡YA!';
    else if (status === 'waiting') caption = 'Esperá…';

    return (
      <View
        key={i}
        onTouchStart={() => touch(i)}
        style={{
          flex: 1,
          margin: 6,
          borderRadius: radius.card,
          backgroundColor: color,
          alignItems: 'center',
          justifyContent: 'center',
          gap: space.sm,
          padding: space.lg,
          opacity: dim ? 0.3 : 1,
          transform: flipped ? [{ rotate: '180deg' }] : [],
        }}
      >
        <Label color={onPlayerColor}>Jugador {i + 1}</Label>
        <Display
          color={onPlayerColor}
          style={{ fontSize: isWinner ? 46 : 38, lineHeight: isWinner ? 55 : 46, textAlign: 'center' }}
        >
          {caption}
        </Display>
      </View>
    );
  };

  return (
    <View style={{ flex: 1, backgroundColor: c.bg, paddingTop: insets.top + 6, paddingBottom: insets.bottom + 6 }}>
      <View style={{ flex: 1, flexDirection: 'row' }}>{topRow.map((i) => zone(i, true))}</View>

      {/* Barra central propia, en píldora */}
      <Row
        style={{
          marginHorizontal: space.lg,
          marginVertical: space.sm,
          height: 56,
          borderRadius: radius.pill,
          backgroundColor: c.inverseBg,
          justifyContent: 'space-between',
          paddingHorizontal: space.xl,
        }}
      >
        <Pressable accessibilityRole="button" hitSlop={10} onPress={onExit}>
          <Label color={c.inverseInk} style={{ fontSize: 15 }}>
            Ajustes
          </Label>
        </Pressable>
        <Pressable
          accessibilityRole="button"
          hitSlop={10}
          onPress={() => {
            haptic.tap();
            arm();
          }}
          style={{
            height: 40,
            paddingHorizontal: space.lg,
            borderRadius: radius.pill,
            backgroundColor: palette.mostaza,
            alignItems: 'center',
            justifyContent: 'center',
          }}
        >
          <Label color={onPlayerColor} style={{ fontSize: 15 }}>
            {status === 'done' ? 'Otra vez' : 'Reiniciar'}
          </Label>
        </Pressable>
        <Pressable accessibilityRole="button" hitSlop={10} onPress={() => router.back()}>
          <Label color={c.inverseInk} style={{ fontSize: 15 }}>
            Salir
          </Label>
        </Pressable>
      </Row>

      <View style={{ flex: 1, flexDirection: 'row' }}>{bottomRow.map((i) => zone(i, false))}</View>
    </View>
  );
}
