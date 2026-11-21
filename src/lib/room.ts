import type { RealtimeChannel } from '@supabase/supabase-js';
import { useCallback, useEffect, useRef, useState } from 'react';
import { AppState } from 'react-native';

import { aplicarTurno, claveAnuncio, COLLECT_MS, definido, MARCADOR_INICIAL, ranking, resolveRound } from '@/features/pulsador/logic';
import type { Marcador, Mode, Msg, Player, RoundResult, Rules, Tap, Turn } from '@/features/pulsador/types';
import { ClockSync, SAMPLE_GOAL, type Estimate } from './clock-sync';
import { uid } from './id';
import { supabase } from './supabase';

/**
 * Sala efímera del pulsador sobre Supabase Realtime.
 *
 * No toca la base: el roster sale de presence y todo lo demás son mensajes de
 * broadcast. Por eso no hace falta estar logueado — el pulsador se usa sin cuenta.
 *
 * El anfitrión es la única autoridad: recibe los toques, los ordena y difunde
 * el resultado. Los invitados sólo reportan y pintan.
 */

/** Sin vocales: cuatro letras al azar nunca forman una palabra incómoda. */
const ALPHABET = 'BCDFGHJKLMNPQRSTVWXYZ';

export const makeCode = () =>
  Array.from({ length: 4 }, () => ALPHABET[Math.floor(Math.random() * ALPHABET.length)]).join('');

export const normalizeCode = (s: string) => s.toUpperCase().replace(/[^A-Z]/g, '').slice(0, 4);

/** Entre 1,5 y 4,5 s antes de la señal. */
const randomDelay = () => 1500 + Math.random() * 3000;

/** Muestras del handshake, uno cada tanto para que no se pisen en la red. */
const BURST_GAP_MS = 140;
/** Los relojes derivan: se vuelve a medir seguido. */
const UPKEEP_MS = 30_000;
/** Si no aparece anfitrión en este plazo, la sala no existe. */
const HOST_GRACE_MS = 2500;

export type RoomStatus = 'conectando' | 'lobby' | 'jugando' | 'sin-sala' | 'error';

export type Round = { id: string; mode: Mode; goAt: number | null };

export type Room = {
  status: RoomStatus;
  me: Player | null;
  players: Player[];
  /** Calidad de la sincronización de este teléfono contra el anfitrión. */
  sync: Estimate | null;
  round: Round | null;
  /** Instante del ¡YA! en el reloj de ESTE teléfono. */
  goAtLocal: number | null;
  result: RoundResult | null;
  turn: Turn | null;
  /** Hora local del toque propio en la ronda actual, para feedback inmediato. */
  myTapAt: number | null;
  /** Hasta que el reloj no esté medido, los toques de este teléfono no valen. */
  synced: boolean;
  tap: () => void;
  arm: (mode: Mode) => void;
  nextTurn: (ok: boolean) => void;
  endRoom: () => void;
  /** Puntaje, reglas y anuncio de ganador. Lo decide el anfitrión y lo copian todos. */
  marcador: Marcador;
  setRules: (r: Rules) => void;
  /** El anfitrión cierra el anuncio y se sigue sumando. */
  seguir: () => void;
  /** El anfitrión da la partida por terminada: todos ven la planilla final. */
  terminar: () => void;
  /** Puntos a cero, mismas reglas. */
  revancha: () => void;
};

export function useRoom({ code, name, asHost }: { code: string; name: string; asHost: boolean }): Room {
  const [meId] = useState(uid);
  const [joinedAt] = useState(() => Date.now());
  const [status, setStatus] = useState<RoomStatus>('conectando');
  const [players, setPlayers] = useState<Player[]>([]);
  const [sync, setSync] = useState<Estimate | null>(
    asHost ? { offset: 0, rtt: 0, uncertainty: 0, samples: SAMPLE_GOAL } : null,
  );
  const [round, setRound] = useState<Round | null>(null);
  const [result, setResult] = useState<RoundResult | null>(null);
  const [turn, setTurn] = useState<Turn | null>(null);
  const [myTapAt, setMyTapAt] = useState<number | null>(null);
  const [marcador, setMarcador] = useState<Marcador>(MARCADOR_INICIAL);

  const chan = useRef<RealtimeChannel | null>(null);
  const clock = useRef<ClockSync | null>(null);
  // Espejos: los handlers del canal se crean una sola vez y no ven el estado.
  const roundRef = useRef<Round | null>(null);
  const resultRef = useRef<RoundResult | null>(null);
  const turnRef = useRef<Turn | null>(null);
  const playersRef = useRef<Player[]>([]);
  const taps = useRef<Tap[]>([]);
  const collect = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const marcadorRef = useRef<Marcador>(MARCADOR_INICIAL);
  /** Anuncio que el anfitrión ya vio y eligió seguir: no se repite. */
  const visto = useRef<string | null>(null);

  const send = useCallback((msg: Msg) => {
    chan.current?.send({ type: 'broadcast', event: 'msg', payload: msg });
  }, []);

  const putRound = useCallback((r: Round | null) => {
    roundRef.current = r;
    setRound(r);
  }, []);
  const putResult = useCallback((r: RoundResult | null) => {
    resultRef.current = r;
    setResult(r);
  }, []);
  const putTurn = useCallback((t: Turn | null) => {
    turnRef.current = t;
    setTurn(t);
  }, []);

  /* ── Marcador (sólo el anfitrión escribe) ─────────────────────────── */

  const envioMarcador = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  /**
   * `demorar`: para los steppers de reglas. Tocar rápido manda una ráfaga que
   * Realtime recorta, y si se pierde el último mensaje los invitados se quedan
   * con un valor viejo. Se espera a que el anfitrión deje de tocar.
   */
  const putMarcador = useCallback(
    (m: Marcador, demorar = false) => {
      marcadorRef.current = m;
      setMarcador(m);
      if (!asHost) return;
      clearTimeout(envioMarcador.current);
      const enviar = () => send({ type: 'marcador', marcador: marcadorRef.current });
      if (demorar) envioMarcador.current = setTimeout(enviar, 300);
      else enviar();
    },
    [asHost, send],
  );

  /** Recalcula si la partida quedó definida y arma el anuncio. */
  const conAnuncio = useCallback((m: Marcador): Marcador => {
    if (m.anuncio?.terminado) return m;
    const ids = playersRef.current.map((p) => p.id);
    const d = definido(m.scores, ids, m.rules, m.jugadas);
    if (!d || claveAnuncio(d) === visto.current) return { ...m, anuncio: null };
    return { ...m, anuncio: { ...d, terminado: false } };
  }, []);

  /* ── Árbitro: junta los toques y resuelve ─────────────────────────── */

  const finish = useCallback(() => {
    clearTimeout(collect.current);
    collect.current = undefined;
    const r = roundRef.current;
    if (!r) return;
    const res = resolveRound(r.id, taps.current, { mode: r.mode, goAt: r.goAt });
    const t: Turn = { roundId: r.id, index: 0, ended: res.queue.length ? null : 'nadie' };
    putResult(res);
    putTurn(t);
    send({ type: 'result', result: res });
    send({ type: 'turn', turn: t });
    // Nadie tocó: la ronda igual cuenta.
    if (t.ended) {
      const m = marcadorRef.current;
      putMarcador(conAnuncio({ ...m, jugadas: m.jugadas + 1 }));
    }
  }, [conAnuncio, putMarcador, putResult, putTurn, send]);

  const collectTap = useCallback(
    (tap: Tap & { roundId: string }) => {
      const r = roundRef.current;
      if (!r || r.id !== tap.roundId || resultRef.current) return;
      taps.current.push({ playerId: tap.playerId, t: tap.t });

      // Un toque adelantado es falta: no abre la ventana ni corta la espera.
      const foul = r.goAt !== null && tap.t < r.goAt;
      if (!foul) {
        if (!collect.current) collect.current = setTimeout(finish, COLLECT_MS);
        return;
      }
      // Si se adelantaron todos no queda a quién esperar.
      const fouled = new Set(taps.current.filter((x) => r.goAt !== null && x.t < r.goAt).map((x) => x.playerId));
      if (playersRef.current.length > 0 && fouled.size >= playersRef.current.length) finish();
    },
    [finish],
  );

  /* ── Canal ────────────────────────────────────────────────────────── */

  useEffect(() => {
    if (!code) return;
    let alive = true;
    const timers: ReturnType<typeof setInterval>[] = [];

    const ch = supabase.channel(`pulsador:${code}`, {
      config: { broadcast: { self: false }, presence: { key: meId } },
    });
    chan.current = ch;

    const cs = new ClockSync((id) => send({ type: 'ping', from: meId, id }));
    clock.current = cs;

    ch.on('presence', { event: 'sync' }, () => {
      const seen = new Map<string, Omit<Player, 'slot'>>();
      for (const metas of Object.values(ch.presenceState<Record<string, unknown>>())) {
        for (const m of metas) {
          const id = m.id as string | undefined;
          if (!id || seen.has(id)) continue;
          seen.set(id, {
            id,
            name: (m.name as string) || 'Jugador',
            joinedAt: (m.joinedAt as number) ?? 0,
            isHost: Boolean(m.host),
          });
        }
      }
      const list = [...seen.values()]
        .sort((a, b) => a.joinedAt - b.joinedAt || a.id.localeCompare(b.id))
        .map((p, slot) => ({ ...p, slot }));
      const antes = playersRef.current.length;
      playersRef.current = list;
      if (alive) setPlayers(list);
      // El que llega tarde no vio el marcador: se lo reenvía el anfitrión.
      if (asHost && list.length > antes) send({ type: 'marcador', marcador: marcadorRef.current });
    });

    ch.on('broadcast', { event: 'msg' }, ({ payload }) => {
      // Se toma la hora de llegada antes de cualquier otra cosa.
      const tHost = Date.now();
      const msg = payload as Msg;
      if (!alive) return;

      switch (msg.type) {
        case 'ping':
          if (asHost) send({ type: 'pong', to: msg.from, id: msg.id, tHost });
          return;
        case 'pong':
          if (msg.to === meId && cs.onPong(msg.id, msg.tHost)) setSync(cs.estimate);
          return;
        case 'tap':
          if (asHost) collectTap({ ...msg });
          return;
        case 'arm':
          if (asHost) return;
          taps.current = [];
          setMyTapAt(null);
          putResult(null);
          putTurn(null);
          putRound({ id: msg.roundId, mode: msg.mode, goAt: msg.goAt });
          setStatus('jugando');
          return;
        case 'result':
          if (!asHost) putResult(msg.result);
          return;
        case 'turn':
          if (!asHost) putTurn(msg.turn);
          return;
        case 'marcador':
          if (!asHost) {
            marcadorRef.current = msg.marcador;
            setMarcador(msg.marcador);
          }
          return;
        case 'end':
          if (!asHost && alive) setStatus('sin-sala');
          return;
      }
    });

    ch.subscribe((state) => {
      if (!alive) return;
      if (state === 'CHANNEL_ERROR' || state === 'TIMED_OUT') {
        setStatus('error');
        return;
      }
      if (state !== 'SUBSCRIBED') return;
      ch.track({ id: meId, name, joinedAt, host: asHost });
      setStatus((s) => (s === 'conectando' ? 'lobby' : s));

      if (asHost) return;
      // Ráfaga inicial y después mantenimiento, porque los relojes derivan.
      let n = 0;
      const burst = setInterval(() => {
        cs.ping();
        if (++n >= SAMPLE_GOAL) clearInterval(burst);
      }, BURST_GAP_MS);
      timers.push(burst, setInterval(() => cs.ping(), UPKEEP_MS));
    });

    // Sin anfitrión no hay sala: el código estaba mal o ya la cerraron.
    const grace = setTimeout(() => {
      if (!alive || asHost) return;
      setStatus((s) => (playersRef.current.some((p) => p.isHost) ? s : 'sin-sala'));
    }, HOST_GRACE_MS);

    // Volver de segundo plano invalida el offset: se mide de cero.
    const app = AppState.addEventListener('change', (s) => {
      if (s !== 'active' || asHost) return;
      cs.reset();
      setSync(null);
      let n = 0;
      const burst = setInterval(() => {
        cs.ping();
        if (++n >= SAMPLE_GOAL) clearInterval(burst);
      }, BURST_GAP_MS);
      timers.push(burst);
    });

    return () => {
      alive = false;
      clearTimeout(grace);
      clearTimeout(collect.current);
      clearTimeout(envioMarcador.current);
      timers.forEach(clearInterval);
      app.remove();
      if (asHost) ch.send({ type: 'broadcast', event: 'msg', payload: { type: 'end' } satisfies Msg });
      supabase.removeChannel(ch);
      chan.current = null;
      clock.current = null;
    };
  }, [asHost, code, collectTap, joinedAt, meId, name, putResult, putRound, putTurn, send]);

  /* ── Acciones ─────────────────────────────────────────────────────── */

  const tap = useCallback(() => {
    // Primero la hora, después todo lo demás: cualquier trabajo acá es error.
    const local = Date.now();
    const r = roundRef.current;
    if (!r || resultRef.current || myTapAt !== null) return;

    // Sin offset medido el toque es basura: los relojes de dos teléfonos
    // pueden diferir en segundos, así que mandarlo con offset 0 no sería un
    // error chico, sería ganar o perder sin motivo.
    if (!asHost && !clock.current?.estimate) return;

    setMyTapAt(local);
    const t = asHost ? local : (clock.current?.toHost(local) ?? local);
    if (asHost) collectTap({ playerId: meId, t, roundId: r.id });
    else send({ type: 'tap', roundId: r.id, playerId: meId, t });
  }, [asHost, collectTap, meId, myTapAt, send]);

  const arm = useCallback(
    (mode: Mode) => {
      if (!asHost) return;
      clearTimeout(collect.current);
      collect.current = undefined;
      taps.current = [];
      setMyTapAt(null);
      putResult(null);
      putTurn(null);
      const r: Round = {
        id: uid(),
        mode,
        goAt: mode === 'senal' ? Date.now() + randomDelay() : null,
      };
      putRound(r);
      setStatus('jugando');
      send({ type: 'arm', roundId: r.id, mode: r.mode, goAt: r.goAt });
      // Las flechitas de la planilla son de la ronda: arrancan de cero.
      if (Object.keys(marcadorRef.current.ultimo).length) putMarcador({ ...marcadorRef.current, ultimo: {} });
    },
    [asHost, putMarcador, putResult, putRound, putTurn, send],
  );

  const nextTurn = useCallback(
    (ok: boolean) => {
      const res = resultRef.current;
      const t = turnRef.current;
      if (!asHost || !res || !t || t.ended) return;
      const next: Turn = ok
        ? { ...t, ended: 'correcto' }
        : t.index + 1 < res.queue.length
          ? { ...t, index: t.index + 1 }
          : { ...t, ended: 'nadie' };
      putTurn(next);
      send({ type: 'turn', turn: next });

      // Puntos para quien tenía la palabra.
      const m = marcadorRef.current;
      const ids = res.queue[t.index]?.playerIds ?? [];
      const { scores, delta } = aplicarTurno(m.scores, ids, ok, m.rules);
      const ultimo = { ...m.ultimo };
      for (const [id, d] of Object.entries(delta)) ultimo[id] = (ultimo[id] ?? 0) + d;
      const jugadas = next.ended ? m.jugadas + 1 : m.jugadas;
      putMarcador(conAnuncio({ ...m, scores, ultimo, jugadas }));
    },
    [asHost, conAnuncio, putMarcador, putTurn, send],
  );

  const setRules = useCallback(
    (rules: Rules) => {
      if (!asHost) return;
      // Cambiar las reglas puede definir (o des-definir) la partida.
      visto.current = null;
      putMarcador(conAnuncio({ ...marcadorRef.current, rules }), true);
    },
    [asHost, conAnuncio, putMarcador],
  );

  const seguir = useCallback(() => {
    const a = marcadorRef.current.anuncio;
    if (!asHost || !a) return;
    visto.current = claveAnuncio(a);
    putMarcador({ ...marcadorRef.current, anuncio: null });
  }, [asHost, putMarcador]);

  const terminar = useCallback(() => {
    if (!asHost) return;
    const m = marcadorRef.current;
    const tabla = ranking(m.scores, playersRef.current.map((p) => p.id));
    const top = tabla[0]?.puntos ?? 0;
    const ganadores = m.anuncio?.ganadores ?? tabla.filter((x) => x.puntos === top).map((x) => x.id);
    putMarcador({ ...m, anuncio: { ganadores, motivo: m.anuncio?.motivo ?? 'final', terminado: true } });
  }, [asHost, putMarcador]);

  const revancha = useCallback(() => {
    if (!asHost) return;
    visto.current = null;
    putMarcador({ ...MARCADOR_INICIAL, rules: marcadorRef.current.rules });
  }, [asHost, putMarcador]);

  const endRoom = useCallback(() => {
    if (asHost) send({ type: 'end' });
  }, [asHost, send]);

  const me = players.find((p) => p.id === meId) ?? null;
  // El offset se lee del estado y no del ref: durante el render el ref puede
  // ir una medición adelantado respecto de lo que se está pintando.
  const goAtLocal = round?.goAt == null ? null : round.goAt - (sync?.offset ?? 0);

  return {
    status,
    me,
    players,
    sync,
    round,
    goAtLocal,
    result,
    turn,
    myTapAt,
    synced: asHost || sync !== null,
    tap,
    arm,
    nextTurn,
    endRoom,
    marcador,
    setRules,
    seguir,
    terminar,
    revancha,
  };
}
