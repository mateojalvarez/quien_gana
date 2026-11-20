import { useKeepAwake } from 'expo-keep-awake';
import { router, useFocusEffect, useLocalSearchParams } from 'expo-router';
import { useCallback, useEffect, useRef, useState } from 'react';
import { Pressable, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { Clay } from '@/components/clay';
import { Icon } from '@/components/icons';
import { Body, Button, Card, Display, Field, Label, Row, Screen, Segmented } from '@/components/ui';
import { useApodo } from '@/features/perfil/apodo';
import { displayName } from '@/lib/auth';
import { haptic } from '@/lib/haptics';
import { useSalasCerca } from '@/lib/nearby';
import { sonido } from '@/lib/sonido';
import { makeCode, normalizeCode } from '@/lib/room';
import { useAuth } from '@/providers/auth-provider';
import { onPlayerColor, palette, playerColor, radius, space } from '@/theme/tokens';
import { useTheme } from '@/theme/use-theme';

type Mode = 'libre' | 'senal';
type Status = 'armed' | 'waiting' | 'go' | 'done';
type Where = 'mesa' | 'varios';

/** Entre 1,5 y 4,5 s antes de la señal. */
const randomDelay = () => 1500 + Math.random() * 3000;

export default function Pulsador() {
  // Llega con `code` desde el QR o el enlace de una sala: directo a "Varios equipos".
  const params = useLocalSearchParams<{ code?: string }>();
  const codigoInicial = normalizeCode(params.code ?? '');
  const [playing, setPlaying] = useState(false);
  const [where, setWhere] = useState<Where>(codigoInicial ? 'varios' : 'mesa');
  const [players, setPlayers] = useState(2);
  const [mode, setMode] = useState<Mode>('libre');

  if (playing) return <Arena players={players} mode={mode} onExit={() => setPlaying(false)} />;

  return (
    <Screen
      title="Pulsador"
      meta={where === 'mesa' ? 'Un teléfono, varios jugadores' : 'Un teléfono por jugador'}
      decor={
        <View style={{ position: 'absolute', right: -4, top: 12 }} pointerEvents="none">
          <Clay name="pulsador" size={88} />
        </View>
      }
      footer={
        where === 'mesa' ? (
          <Button label="Jugar" meta={`${players} zonas`} trailingIcon="arrowRight" onPress={() => setPlaying(true)} />
        ) : undefined
      }
    >
      <Segmented
        style={{ marginTop: space.lg }}
        options={[
          { value: 'mesa' as Where, label: 'En la mesa' },
          { value: 'varios' as Where, label: 'Varios equipos' },
        ]}
        value={where}
        onChange={setWhere}
      />

      {where === 'mesa' ? (
        <Mesa players={players} setPlayers={setPlayers} mode={mode} setMode={setMode} />
      ) : (
        <Varios key={codigoInicial} codigoInicial={codigoInicial} />
      )}
    </Screen>
  );
}

/* ───────────── Un solo teléfono en el centro de la mesa ───────────── */

function Mesa({
  players,
  setPlayers,
  mode,
  setMode,
}: {
  players: number;
  setPlayers: (n: number) => void;
  mode: Mode;
  setMode: (m: Mode) => void;
}) {
  const { c } = useTheme();
  return (
    <>
      <Label style={{ marginTop: space.xl, marginBottom: space.sm }}>Jugadores</Label>
      <Segmented options={[2, 3, 4].map((n) => ({ value: n, label: `${n}` }))} value={players} onChange={setPlayers} />

      <Label style={{ marginTop: space.xl, marginBottom: space.sm }}>Modo</Label>
      <Segmented
        options={[
          { value: 'libre' as Mode, label: 'Libre' },
          { value: 'senal' as Mode, label: 'Con señal' },
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
    </>
  );
}

/* ───────────── Un teléfono por jugador ───────────── */

function Varios({ codigoInicial }: { codigoInicial: string }) {
  const { c } = useTheme();
  const { session } = useAuth();
  const nickname = useApodo((s) => s.nickname);
  const [name, setName] = useState(() => {
    const u = session?.user;
    if (!u || u.is_anonymous) return '';
    return displayName(u, nickname).trim().split(' ')[0].slice(0, 14);
  });
  // Un código nuevo por enlace/QR remonta este componente (ver `key` arriba).
  const [code, setCode] = useState(codigoInicial);

  // Sólo se busca en la red mientras esta pantalla está a la vista.
  const [enFoco, setEnFoco] = useState(false);
  useFocusEffect(
    useCallback(() => {
      setEnFoco(true);
      return () => setEnFoco(false);
    }, []),
  );
  const cerca = useSalasCerca(enFoco);

  const go = (sala: string, host: boolean) => {
    const quien = name.trim() || 'Jugador';
    haptic.tap();
    router.push({ pathname: '/pulsador/sala', params: { code: sala, name: quien, host: host ? '1' : '0' } });
  };

  return (
    <>
      <Field
        label="Tu nombre"
        value={name}
        onChangeText={setName}
        placeholder="Jugador"
        maxLength={14}
        autoCapitalize="words"
        style={{ marginTop: space.xl }}
      />

      <Button
        label="Crear sala"
        trailingIcon="arrowRight"
        style={{ marginTop: space.lg }}
        onPress={() => go(makeCode(), true)}
      />

      {/* Salas en el mismo wifi, como una Jam */}
      {cerca.salas.length > 0 || cerca.error ? (
        <View style={{ marginTop: space.xxl, gap: space.sm }}>
          <Row style={{ gap: 6 }}>
            <Icon name="wifi" size={16} color={c.ink} />
            <Label color={c.ink}>Salas cerca</Label>
          </Row>
          {cerca.error ? <Label color={c.bad}>{cerca.error}</Label> : null}
          {cerca.salas.map((s) => (
            <Pressable
              key={s.code}
              accessibilityRole="button"
              accessibilityLabel={`Unirme a la sala de ${s.host}`}
              onPress={() => go(s.code, false)}
              style={({ pressed }) => ({
                minHeight: 60,
                borderRadius: radius.field,
                backgroundColor: palette.salvia,
                paddingHorizontal: space.lg,
                flexDirection: 'row',
                alignItems: 'center',
                gap: space.md,
                opacity: pressed ? 0.75 : 1,
              })}
            >
              <View style={{ flex: 1 }}>
                <Label color={onPlayerColor}>Sala {s.code}</Label>
                <Body color={onPlayerColor} style={{ fontSize: 16 }} numberOfLines={1}>
                  {s.host}
                </Body>
              </View>
              <Label color={onPlayerColor} style={{ fontSize: 15 }}>
                Unirme
              </Label>
            </Pressable>
          ))}
        </View>
      ) : null}

      <Button
        label="Escanear QR"
        icon="qr"
        variant="outline"
        style={{ marginTop: space.xxl }}
        onPress={() => {
          haptic.tap();
          router.push({ pathname: '/pulsador/escanear', params: { name: name.trim() || 'Jugador' } });
        }}
      />

      <Row style={{ marginTop: space.lg, gap: space.md, alignItems: 'flex-end' }}>
        <Field
          label="Entrar con código"
          value={code}
          onChangeText={(t) => setCode(normalizeCode(t))}
          placeholder="ABCD"
          autoCapitalize="characters"
          autoCorrect={false}
          mono
          style={{ flex: 1 }}
        />
        <Button
          label="Unirme"
          variant="outline"
          size="sm"
          disabled={code.length < 4}
          style={{ marginBottom: 6 }}
          onPress={() => go(code, false)}
        />
      </Row>

      <Card color={palette.azul} style={{ marginTop: space.xxl, padding: space.xl, gap: space.sm }}>
        <Label color={onPlayerColor}>Cómo decide</Label>
        <Body color={onPlayerColor} style={{ fontSize: 15, lineHeight: 21 }}>
          Cada toque viaja con su hora, no con su orden de llegada. Los teléfonos ajustan su reloj contra el
          anfitrión al entrar, así que gana el que tocó antes aunque tenga peor señal.
        </Body>
      </Card>

      <Body color={c.muted} style={{ marginTop: space.lg, fontSize: 14, lineHeight: 20 }}>
        Todos necesitan internet. El que crea la sala hace de árbitro: arranca las rondas y marca si la respuesta
        fue correcta.
      </Body>
    </>
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
      sonido.senal();
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
    sonido.clic();
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
        {/* "¡Primero!" no entra en el ancho de la zona: una sola línea que se achica sola. */}
        <Display
          color={onPlayerColor}
          numberOfLines={1}
          adjustsFontSizeToFit
          minimumFontScale={0.6}
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
