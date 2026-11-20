import { useKeepAwake } from 'expo-keep-awake';
import { router, useLocalSearchParams } from 'expo-router';
import { useEffect, useState } from 'react';
import { Pressable, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import QRCode from 'react-native-qrcode-svg';

import { Avatar, Body, Button, Card, Display, Label, Row, Screen, Segmented, Spinner, Title, Toggle } from '@/components/ui';
import { marginMs } from '@/features/pulsador/logic';
import type { Mode } from '@/features/pulsador/types';
import { quality } from '@/lib/clock-sync';
import { haptic } from '@/lib/haptics';
import { publicarSala } from '@/lib/nearby';
import { sonido } from '@/lib/sonido';
import { useRoom, type Room } from '@/lib/room';
import { onPlayerColor, palette, playerColor, radius, space } from '@/theme/tokens';
import { useTheme } from '@/theme/use-theme';

export default function Sala() {
  const params = useLocalSearchParams<{ code?: string; name?: string; host?: string }>();
  const code = (params.code ?? '').toUpperCase();
  const asHost = params.host === '1';
  const room = useRoom({ code, name: params.name || 'Jugador', asHost });
  useKeepAwake();

  if (room.status === 'conectando') return <Aviso title="Entrando…" body={`Sala ${code}`} spinner />;
  if (room.status === 'sin-sala')
    return (
      <Aviso
        title={asHost ? 'Sala cerrada' : 'No encontramos la sala'}
        body={asHost ? 'Cerraste la sala.' : `Nadie está esperando con el código ${code}. Revisá que esté bien escrito y que el anfitrión siga adentro.`}
      />
    );
  if (room.status === 'error') return <Aviso title="Sin conexión" body="No pudimos entrar a la sala. Revisá internet y probá de nuevo." />;
  if (room.status === 'jugando') return <Arena room={room} asHost={asHost} />;

  return <Lobby room={room} asHost={asHost} code={code} />;
}

function Aviso({ title, body, spinner }: { title: string; body: string; spinner?: boolean }) {
  const { c } = useTheme();
  return (
    <Screen title={title} scroll={false}>
      <Body color={c.muted} style={{ marginTop: space.lg }}>
        {body}
      </Body>
      {spinner ? (
        <View style={{ marginTop: space.xl }}>
          <Spinner color={c.muted} />
        </View>
      ) : (
        <Button label="Volver" variant="outline" style={{ marginTop: space.xl }} onPress={() => router.back()} />
      )}
    </Screen>
  );
}

/* ───────────── Lobby ───────────── */

/** El QR de la sala abre la app (o la web, que manda a la tienda) directo en esta sala. */
export const salaUrl = (code: string) => `https://quien-gana.app/p/${code}`;

function Lobby({ room, asHost, code }: { room: Room; asHost: boolean; code: string }) {
  const { c, scheme } = useTheme();
  const [mode, setMode] = useState<Mode>('libre');
  const [visible, setVisible] = useState(false);
  const [avisoRed, setAvisoRed] = useState<string | null>(null);
  const q = quality(room.sync);

  // "Visible en esta red": la sala se anuncia por Bonjour mientras el
  // anfitrión lo tenga prendido y esté en el lobby.
  const hostName = room.me?.name ?? 'Anfitrión';
  useEffect(() => {
    if (!asHost || !visible) return;
    let soltar: (() => void) | null = null;
    let vivo = true;
    publicarSala(code, hostName)
      .then((f) => {
        if (vivo) soltar = f;
        else f();
      })
      .catch(() => {
        setAvisoRed('No se pudo anunciar la sala. Revisá el wifi y el permiso de red local.');
        setVisible(false);
      });
    return () => {
      vivo = false;
      soltar?.();
    };
  }, [asHost, visible, code, hostName]);

  const texto: Record<typeof q, string> = {
    midiendo: 'Midiendo el retraso contra el anfitrión…',
    buena: 'Relojes sincronizados. El orden de los toques va a ser fiel.',
    justa: 'Sincronización justa: los toques muy parejos pueden salir empate.',
    mala: 'Conexión inestable. Mejor probá con wifi antes de jugar en serio.',
  };
  const colorQ = q === 'buena' ? c.ok : q === 'mala' ? c.bad : c.muted;

  return (
    <Screen
      title={code}
      meta="Código de la sala"
      footer={
        asHost ? (
          <Button
            label="Abrir ronda"
            meta={`${room.players.length} ${room.players.length === 1 ? 'jugador' : 'jugadores'}`}
            trailingIcon="arrowRight"
            disabled={room.players.length < 2}
            onPress={() => room.arm(mode)}
          />
        ) : (
          <Row style={{ gap: space.md, justifyContent: 'center' }}>
            <Spinner color={c.muted} />
            <Label>Esperando al anfitrión…</Label>
          </Row>
        )
      }
    >
      <Body color={c.muted} style={{ marginTop: space.sm, fontSize: 14, lineHeight: 20 }}>
        {asHost
          ? 'Pasá el código a los demás. Entran desde Pulsador → Varios equipos.'
          : 'Ya estás adentro. El anfitrión abre las rondas.'}
      </Body>

      {asHost ? (
        <Card style={{ marginTop: space.xl, padding: space.lg, gap: space.lg }}>
          <Row style={{ gap: space.lg, alignItems: 'center' }}>
            <View style={{ padding: 8, borderRadius: radius.sm, backgroundColor: palette.marfil }}>
              <QRCode value={salaUrl(code)} size={96} color={palette.tinta} backgroundColor={palette.marfil} />
            </View>
            <Body style={{ flex: 1, fontSize: 14, lineHeight: 19 }}>
              Que lo escaneen con la cámara o desde Pulsador → Escanear QR y entran directo.
            </Body>
          </Row>
          <Row style={{ gap: space.md }}>
            <View style={{ flex: 1, gap: 2 }}>
              <Title style={{ fontSize: 16 }}>Visible en esta red</Title>
              <Label>Los que estén en el mismo wifi con Pulsador abierto la ven aparecer.</Label>
            </View>
            <Toggle
              label="Visible en esta red"
              value={visible}
              onChange={(v) => {
                haptic.tap();
                setAvisoRed(null);
                setVisible(v);
              }}
            />
          </Row>
          {avisoRed ? <Label color={c.bad}>{avisoRed}</Label> : null}
        </Card>
      ) : null}

      <Label style={{ marginTop: space.xxl, marginBottom: space.md }}>En la sala</Label>
      <View style={{ gap: space.sm }}>
        {room.players.map((p) => (
          <Row key={p.id} style={{ gap: space.md }}>
            <Avatar name={p.name} color={playerColor(p.slot, scheme)} />
            <Body style={{ flex: 1 }}>{p.name}</Body>
            {p.isHost ? <Label>Árbitro</Label> : null}
            {p.id === room.me?.id ? <Label color={c.ink}>Vos</Label> : null}
          </Row>
        ))}
      </View>

      {asHost ? (
        <>
          <Label style={{ marginTop: space.xxl, marginBottom: space.sm }}>Modo</Label>
          <Segmented
            options={[
              { value: 'libre' as Mode, label: 'Libre' },
              { value: 'senal' as Mode, label: 'Con señal' },
            ]}
            value={mode}
            onChange={setMode}
          />
          <Body color={c.muted} style={{ marginTop: space.md, fontSize: 14, lineHeight: 20 }}>
            {mode === 'libre'
              ? 'Para preguntas y respuestas: abrís la ronda, leés la pregunta y gana el primero que toca.'
              : 'Todos esperan el ¡YA!. El que se adelanta queda afuera de la ronda.'}
          </Body>
        </>
      ) : null}

      <Card style={{ marginTop: space.xxl, padding: space.xl, gap: space.sm }}>
        <Row style={{ justifyContent: 'space-between' }}>
          <Label color={colorQ}>Sincronización</Label>
          {room.sync ? <Label color={colorQ}>± {Math.round(room.sync.uncertainty)} ms</Label> : null}
        </Row>
        <Body style={{ fontSize: 14, lineHeight: 20 }}>{texto[q]}</Body>
      </Card>
    </Screen>
  );
}

/* ───────────── Arena: una sola zona, a pantalla completa ───────────── */

function Arena({ room, asHost }: { room: Room; asHost: boolean }) {
  const { c, scheme } = useTheme();
  const insets = useSafeAreaInsets();
  const { round, result, turn, me, players, myTapAt, goAtLocal } = room;
  // Ronda cuya señal ya sonó. Guardar el id y no un booleano evita que el ¡YA!
  // de la ronda anterior se arrastre a la siguiente.
  const [sonoEn, setSonoEn] = useState<string | null>(null);

  // El ¡YA! se agenda en hora local, ya corregida contra el anfitrión.
  useEffect(() => {
    if (!round || goAtLocal == null) return;
    const id = round.id;
    const h = setTimeout(
      () => {
        setSonoEn(id);
        sonido.senal();
        haptic.warning();
      },
      Math.max(0, goAtLocal - Date.now()),
    );
    return () => clearTimeout(h);
  }, [round, goAtLocal]);

  const go = round?.goAt == null || sonoEn === round?.id;

  const name = (id: string) => players.find((p) => p.id === id)?.name ?? '—';
  const myId = me?.id;
  const myFoul = result ? Boolean(myId && result.fouls.includes(myId)) : myTapAt != null && goAtLocal != null && myTapAt < goAtLocal;
  const myPlace = result && myId ? result.queue.findIndex((g) => g.playerIds.includes(myId)) : -1;

  const esperando = turn && !turn.ended && result ? result.queue[turn.index] : null;
  const meToca = Boolean(esperando && myId && esperando.playerIds.includes(myId));
  const puedoTocar = Boolean(round) && room.synced && !result && myTapAt == null && !myFoul;

  const [titulo, pie] = (() => {
    if (result) {
      if (myFoul) return ['Te adelantaste', 'Quedás afuera de esta ronda'];
      if (myPlace < 0) return ['No llegaste', 'Nadie registró tu toque'];
      if (myPlace === 0) {
        const empate = result.queue[0].playerIds.length > 1;
        const m = marginMs(result.queue);
        return [empate ? 'Empate' : '¡Primero!', empate ? 'Demasiado parejo para desempatar' : m != null ? `Por ${m} ms` : 'Tenés la palabra'];
      }
      return [`${myPlace + 1}º`, `Primero: ${name(result.queue[0].playerIds[0])}`];
    }
    if (myTapAt != null) return ['Listo', 'Registrado, esperando a los demás'];
    if (!room.synced) return ['Sincronizando…', 'Tu reloj todavía no está ajustado'];
    if (myFoul) return ['Te adelantaste', 'Esperá el ¡YA!'];
    if (!go) return ['Esperá…', 'No toques todavía'];
    if (round?.goAt != null) return ['¡YA!', 'Tocá'];
    return ['Tocá', 'Cuando sepas la respuesta'];
  })();

  const color = playerColor(me?.slot ?? 0, scheme);
  const apagado = Boolean(result) && (myFoul || myPlace !== 0);

  return (
    <View style={{ flex: 1, backgroundColor: c.bg, paddingTop: insets.top + 6, paddingBottom: insets.bottom + 6 }}>
      <View
        onTouchStart={() => {
          if (!puedoTocar) return;
          room.tap();
          sonido.clic();
          haptic.heavy();
        }}
        style={{
          flex: 1,
          margin: 6,
          borderRadius: radius.card,
          backgroundColor: color,
          alignItems: 'center',
          justifyContent: 'center',
          gap: space.sm,
          padding: space.xl,
          opacity: apagado ? 0.3 : 1,
        }}
      >
        <Label color={onPlayerColor}>{me?.name ?? 'Vos'}</Label>
        <Display color={onPlayerColor} style={{ fontSize: 52, lineHeight: 60, textAlign: 'center' }}>
          {titulo}
        </Display>
        <Body color={onPlayerColor} style={{ opacity: 0.75, textAlign: 'center' }}>
          {pie}
        </Body>
      </View>

      {result && esperando ? (
        <Card
          color={meToca ? palette.mostaza : undefined}
          style={{ marginHorizontal: space.lg, marginTop: space.sm, padding: space.lg, gap: 2 }}
        >
          <Label color={meToca ? onPlayerColor : undefined}>Responde</Label>
          <Title color={meToca ? onPlayerColor : undefined}>
            {esperando.playerIds.map(name).join(' y ')}
            {esperando.playerIds.length > 1 ? ' (empate)' : ''}
          </Title>
        </Card>
      ) : null}

      {result && turn?.ended ? (
        <Card style={{ marginHorizontal: space.lg, marginTop: space.sm, padding: space.lg }}>
          <Label>{turn.ended === 'correcto' ? 'Ronda ganada' : 'Nadie acertó'}</Label>
        </Card>
      ) : null}

      <Barra room={room} asHost={asHost} />
    </View>
  );
}

function Barra({ room, asHost }: { room: Room; asHost: boolean }) {
  const { c } = useTheme();
  const { result, turn, round } = room;
  const decidiendo = asHost && result && turn && !turn.ended && result.queue.length > 0;

  if (decidiendo) {
    return (
      <Row style={{ marginHorizontal: space.lg, marginTop: space.sm, gap: space.sm }}>
        <Button label="Acertó" variant="color" color={palette.salvia} style={{ flex: 1 }} onPress={() => room.nextTurn(true)} />
        <Button label="Falló" variant="color" color={palette.tomate} style={{ flex: 1 }} onPress={() => room.nextTurn(false)} />
      </Row>
    );
  }

  return (
    <Row
      style={{
        marginHorizontal: space.lg,
        marginTop: space.sm,
        height: 56,
        borderRadius: radius.pill,
        backgroundColor: c.inverseBg,
        justifyContent: 'space-between',
        paddingHorizontal: space.xl,
      }}
    >
      <Pressable accessibilityRole="button" hitSlop={10} onPress={() => router.back()}>
        <Label color={c.inverseInk} style={{ fontSize: 15 }}>
          Salir
        </Label>
      </Pressable>

      {asHost ? (
        <Pressable
          accessibilityRole="button"
          hitSlop={10}
          onPress={() => {
            haptic.tap();
            room.arm(round?.mode ?? 'libre');
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
            {result ? 'Otra ronda' : 'Anular'}
          </Label>
        </Pressable>
      ) : (
        <Label color={c.inverseInk} style={{ fontSize: 15 }}>
          {result ? 'Esperá al árbitro' : 'En juego'}
        </Label>
      )}

      <View style={{ width: 36 }} />
    </Row>
  );
}
