import { useEffect } from 'react';
import { View } from 'react-native';
import Animated, { Easing, runOnJS, useAnimatedStyle, useSharedValue, withTiming } from 'react-native-reanimated';
import Svg, { Circle, G, Path, Text as SvgText } from 'react-native-svg';

import type { Premio } from '@/features/ruleta/rules';
import { sectores } from '@/features/ruleta/rules';
import { fonts, onPlayerColor, playerColor } from '@/theme/tokens';
import { useTheme } from '@/theme/use-theme';

/** Lo suficiente para que se sienta el envión y no tanto como para aburrir. */
const DURACION = 3800;

/** Dónde arranca el texto, medido desde el centro: deja libre el eje. */
const DESDE_CENTRO = 0.2;

export type Tirada = {
  /** Ángulo acumulado al que tiene que frenar. Lo calcula `anguloDestino`. */
  angulo: number;
  ganador: number;
  /** Cambia en cada giro: es lo que dispara la animación, no el ángulo. */
  n: number;
};

type Props = {
  premios: Premio[];
  tirada: Tirada | null;
  /** Corre cuando la rueda frenó del todo. */
  onFin: (ganador: number) => void;
  size?: number;
};

/** 0° es arriba y se crece en sentido horario; SVG mide desde el eje x. */
const punto = (cx: number, cy: number, r: number, grados: number) => {
  const rad = ((grados - 90) * Math.PI) / 180;
  return [cx + r * Math.cos(rad), cy + r * Math.sin(rad)] as const;
};

function sectorPath(cx: number, cy: number, r: number, desde: number, hasta: number) {
  // Con un solo premio no hay cuña posible: el círculo entero se dibuja aparte.
  const [x1, y1] = punto(cx, cy, r, desde);
  const [x2, y2] = punto(cx, cy, r, hasta);
  const grande = hasta - desde > 180 ? 1 : 0;
  return `M ${cx} ${cy} L ${x1} ${y1} A ${r} ${r} 0 ${grande} 1 ${x2} ${y2} Z`;
}

const recortar = (s: string, max: number) => (s.length > max ? `${s.slice(0, max - 1)}…` : s);

export function Rueda({ premios, tirada, onFin, size = 280 }: Props) {
  const { c } = useTheme();
  const rot = useSharedValue(0);

  useEffect(() => {
    if (!tirada) return;
    const ganador = tirada.ganador;
    rot.value = withTiming(tirada.angulo, { duration: DURACION, easing: Easing.out(Easing.cubic) }, (fin) => {
      if (fin) runOnJS(onFin)(ganador);
    });
    // El ángulo solo no sirve de disparador: dos tiradas pueden coincidir.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tirada?.n]);

  const estilo = useAnimatedStyle(() => ({ transform: [{ rotate: `${rot.value}deg` }] }));

  const r = size / 2;
  const total = premios.length;
  const partes = total > 0 ? sectores(total) : [];
  // Con muchos premios la cuña se angosta y el texto tiene que achicarse con ella.
  const fuente = total <= 6 ? 15 : total <= 10 ? 13 : total <= 14 ? 11 : 10;
  // El texto arranca en `DESDE_CENTRO * r` y tiene hasta el borde: el corte se
  // calcula con lo que entra en ese tramo, o los nombres largos se salen de la
  // rueda y quedan cortados por la mitad contra el filo.
  const tramo = r * (1 - DESDE_CENTRO) - 10;
  const letras = Math.max(5, Math.floor(tramo / (fuente * 0.56)));

  return (
    <View style={{ width: size, height: size, alignItems: 'center', justifyContent: 'center' }}>
      <Animated.View style={[{ width: size, height: size }, estilo]}>
        <Svg width={size} height={size}>
          {total === 1 ? (
            <Circle cx={r} cy={r} r={r - 2} fill={playerColor(0)} />
          ) : (
            partes.map((s, i) => (
              <Path key={premios[i].id} d={sectorPath(r, r, r - 2, s.desde, s.hasta)} fill={playerColor(i)} />
            ))
          )}

          {partes.map((s, i) => {
            const centro = (s.desde + s.hasta) / 2;
            // En la mitad izquierda el texto saldría cabeza abajo: se da vuelta
            // y se ancla del otro lado para que siempre se lea de corrido.
            const izquierda = centro > 180;
            const giro = izquierda ? centro + 90 : centro - 90;
            const x = izquierda ? r - r * DESDE_CENTRO : r + r * DESDE_CENTRO;
            return (
              <G key={premios[i].id} transform={`rotate(${giro}, ${r}, ${r})`}>
                <SvgText
                  x={x}
                  y={r}
                  fill={onPlayerColor}
                  fontSize={fuente}
                  fontFamily={fonts.bold}
                  textAnchor={izquierda ? 'end' : 'start'}
                  alignmentBaseline="middle"
                >
                  {recortar(premios[i].name, letras)}
                </SvgText>
              </G>
            );
          })}

          <Circle cx={r} cy={r} r={r - 2} fill="none" stroke={c.ink} strokeWidth={3} />
          <Circle cx={r} cy={r} r={16} fill={c.bg} stroke={c.ink} strokeWidth={3} />
        </Svg>
      </Animated.View>

      {/* La aguja queda afuera del giro: es lo único quieto de la pantalla. */}
      <View style={{ position: 'absolute', top: -6 }} pointerEvents="none">
        <Svg width={26} height={28}>
          <Path d="M13 28 L2 2 L24 2 Z" fill={c.ink} stroke={c.bg} strokeWidth={2} strokeLinejoin="round" />
        </Svg>
      </View>
    </View>
  );
}
