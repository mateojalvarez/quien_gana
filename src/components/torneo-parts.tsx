// Piezas del generador de torneos: estrellas, escudo con iniciales, la hoja de
// abajo para cargar resultados, el rodillo del sorteo y la tabla de posiciones.

import { useEffect, useRef, useState, type ReactNode } from 'react';
import { Pressable, Text, View } from 'react-native';
import Animated, {
  Easing,
  FadeIn,
  useAnimatedStyle,
  useSharedValue,
  withSequence,
  withSpring,
  withTiming,
} from 'react-native-reanimated';
import { KeyboardAvoidingView } from 'react-native-keyboard-controller';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import type { Fila } from '@/features/torneo/rules';
import type { DatosTorneo, EquipoAsignado } from '@/features/torneo/types';
import { haptic } from '@/lib/haptics';
import { border, fonts, onPlayerColor, palette, playerColor, radius, space } from '@/theme/tokens';
import { useTheme } from '@/theme/use-theme';
import { Icon } from './icons';
import { Body, Display, Label, Row } from './ui';

/* ───────────── Estrellas ───────────── */

export function Estrellas({ valor, size = 14, color }: { valor: number; size?: number; color?: string }) {
  const { c } = useTheme();
  const tinta = color ?? c.ink;
  const llenas = Math.floor(valor);
  const media = valor - llenas >= 0.5;
  return (
    <Row style={{ gap: 1 }} >
      {Array.from({ length: llenas }, (_, i) => (
        <Text key={i} style={{ fontSize: size, color: tinta, lineHeight: size + 3 }}>
          ★
        </Text>
      ))}
      {media ? <Text style={{ fontSize: size, color: tinta, lineHeight: size + 3, opacity: 0.45 }}>★</Text> : null}
      <Text style={{ fontFamily: fonts.semibold, fontSize: size - 2, color: tinta, marginLeft: 3 }}>{valor}</Text>
    </Row>
  );
}

/* ───────────── Escudo ───────────── */

const iniciales = (nombre: string) =>
  nombre
    .replace(/^(FC|CF|AC|AS|SC|RC|CD|SL|SS|1\.)\s+/i, '')
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((p) => p[0]!.toUpperCase())
    .join('');

/** Sin escudos reales: un círculo de color con las iniciales, siempre el mismo color por equipo. */
export function Escudo({ nombre, size = 34 }: { nombre: string; size?: number }) {
  let h = 0;
  for (const ch of nombre) h = (h * 31 + ch.charCodeAt(0)) >>> 0;
  return (
    <View
      style={{
        width: size,
        height: size,
        borderRadius: size / 2,
        backgroundColor: playerColor(h % 6),
        alignItems: 'center',
        justifyContent: 'center',
      }}
    >
      <Text style={{ fontFamily: fonts.black, fontSize: size * 0.38, color: onPlayerColor }}>{iniciales(nombre)}</Text>
    </View>
  );
}

export function EquipoChico({ equipo }: { equipo: EquipoAsignado | null | undefined }) {
  const { c } = useTheme();
  if (!equipo) return null;
  return (
    <Label numberOfLines={1} color={c.muted} style={{ fontSize: 13 }}>
      {equipo.nombre}
      {equipo.estrellas !== null ? ` · ${equipo.estrellas}★` : ''}
    </Label>
  );
}

/* ───────────── Hoja de abajo ───────────── */

/** Hoja propia con contenido libre (la de overlay sólo trae menú, confirmar y texto). */
export function Hoja({
  visible,
  onCerrar,
  titulo,
  mensaje,
  children,
}: {
  visible: boolean;
  onCerrar: () => void;
  titulo: string;
  mensaje?: string;
  children: ReactNode;
}) {
  const { c } = useTheme();
  const insets = useSafeAreaInsets();
  if (!visible) return null;
  return (
    <View style={{ position: 'absolute', left: 0, right: 0, top: 0, bottom: 0, justifyContent: 'flex-end' }}>
      <Animated.View
        entering={FadeIn.duration(160)}
        style={{ position: 'absolute', left: 0, right: 0, top: 0, bottom: 0, backgroundColor: c.scrim }}
      >
        <Pressable accessibilityRole="button" accessibilityLabel="Cerrar" style={{ flex: 1 }} onPress={onCerrar} />
      </Animated.View>
      <KeyboardAvoidingView behavior="padding">
        <View
          style={{
            backgroundColor: c.bg,
            borderTopLeftRadius: radius.cardLg,
            borderTopRightRadius: radius.cardLg,
            paddingTop: space.xl,
            paddingHorizontal: space.xl,
            paddingBottom: insets.bottom + space.xl,
            gap: space.lg,
          }}
        >
          <View style={{ alignSelf: 'center', width: 44, height: 5, borderRadius: 3, backgroundColor: c.line }} />
          <View style={{ gap: space.sm }}>
            <Display style={{ fontSize: 26, lineHeight: 32, letterSpacing: -0.6 }} numberOfLines={3}>
              {titulo}
            </Display>
            {mensaje ? <Body color={c.muted}>{mensaje}</Body> : null}
          </View>
          {children}
        </View>
      </KeyboardAvoidingView>
    </View>
  );
}

/* ───────────── Rodillo del sorteo ───────────── */

/**
 * Tragamonedas: pasa nombres al azar, cada vez más lento, y frena en `final`
 * con un golpe. Arranca cada vez que cambia `clave`; sin clave muestra `final` quieto.
 */
export function Rodillo({
  opciones,
  final,
  clave,
  onFin,
  lento,
  color,
  sub,
  alto = 84,
}: {
  opciones: string[];
  final: string;
  clave: string | null;
  onFin?: () => void;
  /** El rodillo del equipo dura más: es el que genera expectativa. */
  lento?: boolean;
  color: string;
  sub?: ReactNode;
  alto?: number;
}) {
  // El giro en curso: qué nombre muestra ahora y si ya frenó. Sólo se escribe
  // desde los timers, así que quieto (sin clave) se muestra `final` directo.
  const [giro, setGiro] = useState<{ clave: string; texto: string; frenado: boolean } | null>(null);
  const escala = useSharedValue(1);
  const vuelco = useSharedValue(0);
  const fin = useRef(onFin);
  const pool = useRef<string[]>([]);
  useEffect(() => {
    fin.current = onFin;
    pool.current = opciones.length > 1 ? opciones : [final];
  });

  useEffect(() => {
    if (!clave) return;
    let espera = 40;
    const factor = lento ? 1.12 : 1.22;
    let timer: ReturnType<typeof setTimeout> | undefined;

    const paso = () => {
      if (espera > 330) {
        setGiro({ clave, texto: '', frenado: true });
        vuelco.value = 80;
        vuelco.value = withTiming(0, { duration: 320, easing: Easing.out(Easing.back(1.6)) });
        escala.value = withSequence(withTiming(1.12, { duration: 140 }), withSpring(1, { damping: 9 }));
        haptic.success();
        fin.current?.();
        return;
      }
      const opcionesAhora = pool.current;
      setGiro({ clave, texto: opcionesAhora[Math.floor(Math.random() * opcionesAhora.length)] ?? '', frenado: false });
      haptic.tap();
      espera *= factor;
      timer = setTimeout(paso, espera);
    };
    timer = setTimeout(paso, 0);
    return () => clearTimeout(timer);
  }, [clave, lento, escala, vuelco]);

  const esteGiro = clave && giro?.clave === clave ? giro : null;
  const girando = !!clave && !esteGiro?.frenado;
  const texto = !clave || esteGiro?.frenado ? final : (esteGiro?.texto ?? '');

  const estilo = useAnimatedStyle(() => ({
    transform: [{ perspective: 600 }, { rotateX: `${vuelco.value}deg` }, { scale: escala.value }],
  }));

  return (
    <Animated.View
      style={[
        {
          minHeight: alto,
          borderRadius: radius.card,
          backgroundColor: color,
          paddingHorizontal: space.xl,
          paddingVertical: space.md,
          justifyContent: 'center',
          alignItems: 'center',
          gap: 4,
        },
        estilo,
      ]}
    >
      <Text
        numberOfLines={1}
        adjustsFontSizeToFit
        style={{
          fontFamily: fonts.black,
          fontSize: 28,
          color: onPlayerColor,
          opacity: girando ? 0.75 : 1,
          letterSpacing: -0.5,
        }}
      >
        {texto || ' '}
      </Text>
      {!girando && sub ? sub : null}
    </Animated.View>
  );
}

/* ───────────── Tabla de posiciones ───────────── */

export function TablaPosiciones({
  datos,
  filas,
  clasifican = 0,
  titulo,
}: {
  datos: DatosTorneo;
  filas: Fila[];
  /** Cuántos de arriba se marcan como clasificados (fase de grupos). */
  clasifican?: number;
  titulo?: string;
}) {
  const { c } = useTheme();
  const futbol = datos.deporte === 'futbol';
  const cols: [keyof Fila, string][] = [
    ['pj', 'PJ'],
    ['g', 'G'],
    ['e', 'E'],
    ['p', 'P'],
    ['gf', futbol ? 'GF' : 'PF'],
    ['gc', futbol ? 'GC' : 'PC'],
    ['dg', futbol ? 'DG' : 'Dif'],
    ['pts', 'Pts'],
  ];
  const ancho = 23;
  const participante = (id: string) => datos.participantes.find((p) => p.id === id);

  return (
    <View style={{ borderRadius: radius.card, borderWidth: border, borderColor: c.line, overflow: 'hidden' }}>
      {titulo ? (
        <View style={{ paddingHorizontal: space.lg, paddingTop: space.md, paddingBottom: space.xs }}>
          <Label color={c.ink} style={{ fontFamily: fonts.bold, fontSize: 15 }}>
            {titulo}
          </Label>
        </View>
      ) : null}
      <Row style={{ paddingHorizontal: space.md, paddingVertical: space.sm, gap: 2 }}>
        <Label style={{ flex: 1, fontSize: 12 }}>Equipo</Label>
        {cols.map(([k, l]) => (
          <Label key={k} style={{ width: ancho, textAlign: 'center', fontSize: 12 }}>
            {l}
          </Label>
        ))}
      </Row>
      {filas.map((f, i) => {
        const p = participante(f.id);
        const clasifica = i < clasifican;
        return (
          <Row
            key={f.id}
            style={{
              paddingHorizontal: space.md,
              paddingVertical: space.sm,
              gap: 2,
              borderTopWidth: 1,
              borderTopColor: c.line,
              backgroundColor: clasifica ? palette.salvia + '44' : 'transparent',
            }}
          >
            <Row style={{ flex: 1, gap: space.sm }}>
              <Text style={{ fontFamily: fonts.bold, fontSize: 13, color: c.muted, width: 16, textAlign: 'right' }}>{i + 1}</Text>
              <View style={{ flex: 1 }}>
                <Label color={c.ink} numberOfLines={1} style={{ fontSize: 14, fontFamily: fonts.semibold }}>
                  {p?.nombre ?? '—'}
                </Label>
                <EquipoChico equipo={p?.equipo} />
              </View>
            </Row>
            {cols.map(([k]) => (
              <Text
                key={k}
                style={{
                  width: ancho,
                  textAlign: 'center',
                  fontFamily: k === 'pts' ? fonts.black : fonts.medium,
                  fontSize: 13,
                  color: c.ink,
                  fontVariant: ['tabular-nums'],
                }}
              >
                {k === 'dg' && f.dg > 0 ? `+${f.dg}` : f[k]}
              </Text>
            ))}
          </Row>
        );
      })}
    </View>
  );
}

/* ───────────── Contador grande ───────────── */

export function TotalPartidos({ total, detalle }: { total: number; detalle: { etiqueta: string; partidos: number }[] }) {
  const { c } = useTheme();
  return (
    <View style={{ borderRadius: radius.card, backgroundColor: c.inverseBg, padding: space.xl, gap: space.md }}>
      <Row style={{ gap: space.md, alignItems: 'flex-end' }}>
        {/* Con tres o cuatro cifras el número no entraba: se achica en vez de cortarse. */}
        <Text
          numberOfLines={1}
          adjustsFontSizeToFit
          minimumFontScale={0.5}
          style={{ fontFamily: fonts.black, fontSize: 56, lineHeight: 58, color: c.inverseInk, fontVariant: ['tabular-nums'], flexShrink: 1, maxWidth: '62%' }}
        >
          {total}
        </Text>
        <Label color={c.inverseInk} style={{ fontSize: 17, marginBottom: 8, flex: 1 }}>
          {total === 1 ? 'partido en total' : 'partidos en total'}
        </Label>
      </Row>
      <View style={{ gap: 4 }}>
        {detalle.map((d) => (
          <Row key={d.etiqueta} style={{ justifyContent: 'space-between' }}>
            <Label color={c.inverseInk} style={{ opacity: 0.8, flex: 1 }} numberOfLines={1}>
              {d.etiqueta}
            </Label>
            <Label color={c.inverseInk} style={{ fontVariant: ['tabular-nums'] }}>
              {d.partidos}
            </Label>
          </Row>
        ))}
      </View>
    </View>
  );
}

/** Punto chico para avisos dentro de tarjetas. */
export function Aviso({ texto }: { texto: string }) {
  const { c } = useTheme();
  return (
    <Row style={{ gap: space.sm, alignItems: 'flex-start' }}>
      <Icon name="flag" size={16} color={c.muted} />
      <Label style={{ flex: 1 }}>{texto}</Label>
    </Row>
  );
}
