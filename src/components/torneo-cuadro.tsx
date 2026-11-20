import { Pressable, ScrollView, Text, View } from 'react-native';
import Animated, { FadeIn } from 'react-native-reanimated';
import Svg, { Path } from 'react-native-svg';

import { jugado, nombreRonda, resultadoLlave } from '@/features/torneo/rules';
import type { DatosTorneo, Llave, Partido } from '@/features/torneo/types';
import { border, fonts, palette, radius, space } from '@/theme/tokens';
import { useTheme } from '@/theme/use-theme';
import { Clay } from './clay';
import { Escudo } from './torneo-parts';
import { Label } from './ui';

/** Medidas del cuadro: columnas por ronda y líneas en el hueco entre columnas. */
const COL = 172;
const GAP = 36;
const CARD = 72;
const SEP = 14;
const HEAD = 30;

/**
 * Posición vertical (centro) de cada llave: la primera ronda va apilada y cada
 * llave de una ronda siguiente queda a mitad de camino entre las dos que la
 * alimentan. Es lo que dibuja el "árbol" del cuadro.
 */
export function centrosDelCuadro(llaves: Llave[]): number[][] {
  const total = Math.max(...llaves.map((l) => l.ronda)) + 1;
  const primera = llaves.filter((l) => l.ronda === 0).length;
  const centros: number[][] = [Array.from({ length: primera }, (_, i) => i * (CARD + SEP) + CARD / 2)];
  for (let r = 1; r < total; r++) {
    const prev = centros[r - 1];
    centros.push(Array.from({ length: prev.length / 2 }, (_, i) => (prev[2 * i] + prev[2 * i + 1]) / 2));
  }
  return centros;
}

export function CuadroVisual({
  juego,
  onAbrir,
}: {
  juego: DatosTorneo;
  /** Sin `onAbrir` el cuadro es de sólo lectura (espectadores). */
  onAbrir?: (p: Partido) => void;
}) {
  const { c } = useTheme();
  const llaves = juego.llaves ?? [];
  if (llaves.length === 0) return null;

  const total = Math.max(...llaves.map((l) => l.ronda)) + 1;
  const centros = centrosDelCuadro(llaves);
  const alto = centros[0].length * (CARD + SEP) - SEP;
  const campeon = juego.campeon ? juego.participantes.find((p) => p.id === juego.campeon) : null;
  const columnas = total + (campeon ? 1 : 0);
  const ancho = columnas * COL + (columnas - 1) * GAP;
  const x = (r: number) => r * (COL + GAP);
  const llave = (r: number, pos: number) => llaves.find((l) => l.ronda === r && l.pos === pos);

  // Líneas: de cada llave a la siguiente, pintadas fuerte si ese lado ya avanzó.
  const lineas: { d: string; fuerte: boolean }[] = [];
  for (let r = 1; r < total; r++) {
    centros[r].forEach((cy, pos) => {
      const destino = llave(r, pos);
      [2 * pos, 2 * pos + 1].forEach((hijo, lado) => {
        const origen = llave(r - 1, hijo);
        const ganador = origen ? resultadoLlave(origen, juego.partidos).ganador : null;
        const llego = lado === 0 ? destino?.a : destino?.b;
        const x1 = x(r - 1) + COL;
        const xm = x1 + GAP / 2;
        const y1 = HEAD + centros[r - 1][hijo];
        lineas.push({ d: `M${x1} ${y1} H${xm} V${HEAD + cy} H${x(r)}`, fuerte: !!ganador && ganador === llego });
      });
    });
  }
  if (campeon) {
    const y = HEAD + centros[total - 1][0];
    lineas.push({ d: `M${x(total - 1) + COL} ${y} H${x(total)}`, fuerte: true });
  }

  return (
    <Animated.View entering={FadeIn.duration(350)} key={juego.semillaCruces ?? 'cuadro'}>
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        style={{ marginHorizontal: -space.xl }}
        contentContainerStyle={{ paddingHorizontal: space.xl }}
      >
        <View style={{ width: ancho, height: HEAD + alto }}>
          <Svg width={ancho} height={HEAD + alto} style={{ position: 'absolute', left: 0, top: 0 }}>
            {lineas.map((l, i) => (
              <Path
                key={i}
                d={l.d}
                stroke={l.fuerte ? c.ink : c.lineStrong}
                strokeWidth={l.fuerte ? 2.2 : 1.5}
                strokeLinejoin="round"
                fill="none"
              />
            ))}
          </Svg>

          {Array.from({ length: total }, (_, r) => (
            <Label
              key={`h${r}`}
              numberOfLines={1}
              style={{ position: 'absolute', left: x(r), top: 0, width: COL, fontFamily: fonts.bold, color: c.ink }}
            >
              {nombreRonda(r, total)}
            </Label>
          ))}

          {llaves.map((l) => (
            <TarjetaLlave
              key={l.id}
              juego={juego}
              llave={l}
              top={HEAD + centros[l.ronda][l.pos] - CARD / 2}
              left={x(l.ronda)}
              onAbrir={onAbrir}
            />
          ))}

          {campeon ? (
            <View
              style={{
                position: 'absolute',
                left: x(total),
                top: HEAD + centros[total - 1][0] - CARD / 2 - 14,
                width: COL,
                height: CARD + 28,
                borderRadius: radius.field,
                backgroundColor: palette.mostaza,
                padding: space.md,
                overflow: 'hidden',
                justifyContent: 'center',
              }}
            >
              <Clay name="trofeo" size={40} style={{ position: 'absolute', right: space.sm, top: space.sm }} />
              <Label color={palette.tinta}>Campeón</Label>
              <Text
                numberOfLines={2}
                style={{ fontFamily: fonts.black, fontSize: 17, color: palette.tinta, marginRight: 40 }}
              >
                {campeon.nombre}
              </Text>
            </View>
          ) : null}
        </View>
      </ScrollView>
    </Animated.View>
  );
}

function TarjetaLlave({
  juego,
  llave: l,
  top,
  left,
  onAbrir,
}: {
  juego: DatosTorneo;
  llave: Llave;
  top: number;
  left: number;
  onAbrir?: (p: Partido) => void;
}) {
  const { c } = useTheme();
  const res = resultadoLlave(l, juego.partidos);
  const partidos = juego.partidos.filter((p) => p.llave === l.id);
  const pendiente = partidos.find((p) => !jugado(p)) ?? partidos[partidos.length - 1];
  const hayGoles = !l.bye && partidos.some(jugado);

  const linea = (pid: string | null, goles: number, gana: boolean, perdio: boolean) => {
    const p = pid ? juego.participantes.find((x) => x.id === pid) : null;
    return (
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, height: 24, opacity: perdio ? 0.45 : 1 }}>
        {p?.equipo ? <Escudo nombre={p.equipo.nombre} size={18} /> : null}
        <Label
          color={pid ? c.ink : c.hint}
          numberOfLines={1}
          style={{ flex: 1, fontSize: 14, fontFamily: gana ? fonts.black : fonts.semibold }}
        >
          {pid ? (p?.nombre ?? '—') : 'A definir'}
        </Label>
        {hayGoles ? (
          <Text style={{ fontFamily: fonts.black, fontSize: 15, color: c.ink, fontVariant: ['tabular-nums'] }}>{goles}</Text>
        ) : null}
      </View>
    );
  };

  const ganaA = !!res.ganador && res.ganador === l.a && !l.bye;
  const ganaB = !!res.ganador && res.ganador === l.b;
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={`${juego.participantes.find((p) => p.id === l.a)?.nombre ?? 'A definir'} contra ${
        l.bye ? 'nadie' : (juego.participantes.find((p) => p.id === l.b)?.nombre ?? 'a definir')
      }`}
      disabled={!onAbrir || l.bye || !pendiente}
      onPress={() => pendiente && onAbrir?.(pendiente)}
      style={({ pressed }) => ({
        position: 'absolute',
        top,
        left,
        width: COL,
        height: CARD,
        borderRadius: radius.field,
        borderWidth: border,
        borderColor: res.ganador ? c.line : c.lineStrong,
        backgroundColor: c.bg,
        paddingHorizontal: space.md,
        justifyContent: 'center',
        opacity: pressed ? 0.7 : 1,
      })}
    >
      {linea(l.a, res.global[0], ganaA, ganaB)}
      {l.bye ? (
        <Label style={{ fontSize: 12, height: 24, lineHeight: 24 }}>Pasa directo</Label>
      ) : (
        linea(l.b, res.global[1], ganaB, ganaA)
      )}
      {res.faltanPenales ? (
        <Label style={{ position: 'absolute', bottom: 2, right: space.md, fontSize: 10 }}>faltan penales</Label>
      ) : null}
    </Pressable>
  );
}
