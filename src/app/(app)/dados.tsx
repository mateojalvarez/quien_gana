import { useEffect, useRef, useState } from 'react';
import { Pressable, View } from 'react-native';

import { Clay } from '@/components/clay';
import { Button, Card, Display, Label, Num, Row, Screen, SectionHead, Stepper } from '@/components/ui';
import { haptic } from '@/lib/haptics';
import { border, fonts, onPlayerColor, palette, radius, space } from '@/theme/tokens';
import { useTheme } from '@/theme/use-theme';

const FACES = [4, 6, 8, 10, 12, 20] as const;
type Faces = (typeof FACES)[number];

const roll = (faces: number) => 1 + Math.floor(Math.random() * faces);

// Posiciones de pips de un d6 en una grilla 3×3 (índices 0..8)
const PIPS: Record<number, number[]> = {
  1: [4],
  2: [0, 8],
  3: [0, 4, 8],
  4: [0, 2, 6, 8],
  5: [0, 2, 4, 6, 8],
  6: [0, 2, 3, 5, 6, 8],
};

/** Dado como tarjeta redondeada de color, sin bordes duros. */
function Die({ value, faces, size, rolling, color }: { value: number; faces: number; size: number; rolling: boolean; color: string }) {
  const box = {
    width: size,
    height: size,
    borderRadius: Math.round(size * 0.26),
    backgroundColor: color,
    opacity: rolling ? 0.72 : 1,
  } as const;

  if (faces === 6) {
    const pip = size * 0.15;
    return (
      <View style={[box, { padding: size * 0.13, flexDirection: 'row', flexWrap: 'wrap' }]}>
        {Array.from({ length: 9 }).map((_, i) => (
          <View key={i} style={{ width: '33.33%', height: '33.33%', alignItems: 'center', justifyContent: 'center' }}>
            {PIPS[value]?.includes(i) ? (
              <View style={{ width: pip, height: pip, borderRadius: pip / 2, backgroundColor: onPlayerColor }} />
            ) : null}
          </View>
        ))}
      </View>
    );
  }
  return (
    <View style={[box, { alignItems: 'center', justifyContent: 'center' }]}>
      <Display color={onPlayerColor} style={{ fontSize: size * 0.4, lineHeight: size * 0.44 }}>
        {value}
      </Display>
      <Label color={onPlayerColor} style={{ position: 'absolute', bottom: 8, right: 12, fontSize: 11 }}>
        d{faces}
      </Label>
    </View>
  );
}

const DIE_COLORS = [palette.mostaza, palette.tomate, palette.salvia, palette.rosa, palette.crema, palette.azul];

export default function Dados() {
  const { c } = useTheme();
  const [faces, setFaces] = useState<Faces>(6);
  const [count, setCount] = useState(2);
  const [values, setValues] = useState<number[]>([6, 6]);
  const [rolling, setRolling] = useState(false);
  const [history, setHistory] = useState<{ label: string; total: number; values: number[] }[]>([]);
  const timer = useRef<ReturnType<typeof setInterval> | undefined>(undefined);

  useEffect(() => () => clearInterval(timer.current), []);

  function doRoll() {
    if (rolling) return;
    setRolling(true);
    let ticks = 0;
    clearInterval(timer.current);
    timer.current = setInterval(() => {
      ticks++;
      haptic.tap();
      const next = Array.from({ length: count }, () => roll(faces));
      setValues(next);
      if (ticks >= 8) {
        clearInterval(timer.current);
        setRolling(false);
        haptic.heavy();
        const total = next.reduce((a, b) => a + b, 0);
        setHistory((h) => [{ label: `${count}d${faces}`, total, values: next }, ...h].slice(0, 12));
      }
    }, 55);
  }

  const total = values.reduce((a, b) => a + b, 0);
  const size = count <= 2 ? 136 : count <= 4 ? 104 : 86;

  return (
    <Screen
      title="Dados"
      meta="Tocá los dados o el botón"
      footer={<Button label="Tirar" meta={`${count}d${faces}`} onPress={doRoll} />}
    >
      <Pressable accessibilityRole="button" accessibilityLabel={`Tirar ${count} dados de ${faces} caras`} onPress={doRoll}>
        <Row style={{ flexWrap: 'wrap', gap: space.md, justifyContent: 'center', paddingVertical: space.xl }}>
          {values.map((v, i) => (
            <Die key={i} value={v} faces={faces} size={size} rolling={rolling} color={DIE_COLORS[i % DIE_COLORS.length]} />
          ))}
        </Row>
      </Pressable>

      {/* Tarjeta inversa: negra en claro, marfil en oscuro */}
      <Card color={c.inverseBg} style={{ paddingHorizontal: space.xl, paddingVertical: space.lg }}>
        <Row style={{ justifyContent: 'space-between', alignItems: 'baseline' }}>
          <View>
            <Label color={c.inverseInk}>Total</Label>
            <Label color={c.inverseInk} style={{ fontFamily: fonts.medium, fontSize: 14, opacity: 0.7 }}>
              {values.join(' · ')}
            </Label>
          </View>
          <Display color={c.inverseInk} style={{ fontSize: 54, lineHeight: 56 }}>
            {total}
          </Display>
        </Row>
      </Card>

      <View style={{ marginTop: space.huge }}>
        <Label style={{ marginBottom: space.sm }}>Caras</Label>
        <Row style={{ gap: space.sm, flexWrap: 'wrap' }}>
          {FACES.map((f) => {
            const active = f === faces;
            return (
              <Pressable
                key={f}
                accessibilityRole="button"
                accessibilityState={{ selected: active }}
                onPress={() => {
                  haptic.tap();
                  setFaces(f);
                  setValues(Array.from({ length: count }, () => f));
                }}
                style={({ pressed }) => ({
                  height: 46,
                  minWidth: 62,
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
                <Num color={active ? c.inverseInk : c.ink} style={{ fontSize: 16 }}>
                  d{f}
                </Num>
              </Pressable>
            );
          })}
        </Row>

        <Row style={{ justifyContent: 'space-between', marginTop: space.xl }}>
          <View>
            <Label color={c.ink} style={{ fontSize: 16 }}>
              Cantidad
            </Label>
            <Label>hasta 6 dados</Label>
          </View>
          <Stepper
            value={count}
            min={1}
            max={6}
            onChange={(n) => {
              setCount(n);
              setValues(Array.from({ length: n }, (_, i) => values[i] ?? faces));
            }}
          />
        </Row>
      </View>

      {history.length ? (
        <View style={{ marginTop: space.huge }}>
          <SectionHead title="Tiradas" meta={`${history.length} ${history.length === 1 ? 'tirada' : 'tiradas'}`} />
          <View style={{ gap: space.sm }}>
            {history.map((h, i) => (
              <Row
                key={i}
                style={{
                  minHeight: 54,
                  borderRadius: radius.field,
                  borderWidth: border,
                  borderColor: c.line,
                  paddingHorizontal: space.lg,
                  gap: space.md,
                }}
              >
                <Label color={c.ink} style={{ width: 52 }}>
                  {h.label}
                </Label>
                <Label style={{ flex: 1, fontFamily: fonts.medium, fontVariant: ['tabular-nums'] }} numberOfLines={1}>
                  {h.values.join(' · ')}
                </Label>
                <Num style={{ fontSize: 20 }}>{h.total}</Num>
              </Row>
            ))}
          </View>
        </View>
      ) : (
        <Row style={{ marginTop: space.huge, gap: space.md }}>
          <Clay name="dado" size={64} />
          <Label style={{ flex: 1 }}>Las tiradas van quedando acá, con el detalle de cada dado.</Label>
        </Row>
      )}
    </Screen>
  );
}
