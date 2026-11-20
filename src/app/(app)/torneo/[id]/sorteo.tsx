import { Redirect, router, useLocalSearchParams, type Href } from 'expo-router';
import { useState } from 'react';
import { View } from 'react-native';
import Animated, { FadeInDown } from 'react-native-reanimated';

import { Clay } from '@/components/clay';
import { Icon } from '@/components/icons';
import { Notice, useOverlay } from '@/components/overlay';
import { Escudo, Estrellas, Rodillo } from '@/components/torneo-parts';
import { Body, Button, IconButton, Label, Row, Screen, Title } from '@/components/ui';
import { useCatalogoFC } from '@/features/torneo/catalogo-fc';
import {
  armarGrupos,
  estrellasDe,
  filtrarCatalogo,
  iniciar,
  letraGrupo,
  matchear,
  sortearEquipos,
} from '@/features/torneo/rules';
import type { EquipoAsignado } from '@/features/torneo/types';
import type { TorneoGame } from '@/features/types';
import { haptic } from '@/lib/haptics';
import { sonido } from '@/lib/sonido';
import { useGames } from '@/store/games';
import { palette, radius, space } from '@/theme/tokens';
import { useTheme } from '@/theme/use-theme';

const COLOR_BOMBO = [palette.mostaza, palette.salvia, palette.tomate, palette.rosa, palette.azul, palette.crema];

export default function SorteoRuta() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const juego = useGames((s) => s.games[id]);
  if (!juego || juego.kind !== 'torneo') return <Redirect href="/" />;
  if (juego.fase !== 'sorteo') return <Redirect href={`/torneo/${juego.id}` as Href} />;
  return <Sorteo juego={juego} />;
}

type Etapa = { tipo: 'equipos'; bombo: number } | { tipo: 'grupos' };
type Par = { participante: string; equipo: EquipoAsignado };
type Giro = { fase: 'participante' | 'destino'; clave: string } | null;

function Sorteo({ juego }: { juego: TorneoGame }) {
  const { c } = useTheme();
  const overlay = useOverlay();
  const fc = useCatalogoFC();
  const { actualizarTorneo } = useGames.getState();

  const nombre = (pid: string) => juego.participantes.find((p) => p.id === pid)?.nombre ?? '—';

  // Lo que hay que sortear, en orden: equipos bombo por bombo y después los grupos.
  const etapas: Etapa[] = [
    ...(juego.usaEquipos
      ? juego.bombos.map((_, b) => ({ tipo: 'equipos' as const, bombo: b })).filter((e) => juego.participantes.some((p) => p.bombo === e.bombo))
      : []),
    ...(juego.formato.tipo === 'grupos' ? [{ tipo: 'grupos' as const }] : []),
  ];
  const lista = (e: Etapa) =>
    e.tipo === 'equipos' ? juego.participantes.filter((p) => p.bombo === e.bombo).every((p) => p.equipo) : !!juego.grupos;
  const etapa = etapas.find((e) => !lista(e)) ?? null;

  // Equipos: la cola del bombo en curso, armada al primer toque.
  const [cola, setCola] = useState<{ bombo: number; pares: Par[]; ampliado: boolean; pool: string[] } | null>(null);
  const [indice, setIndice] = useState(0);
  // Grupos: el orden del sorteo, revelado de a uno.
  const [grupos, setGrupos] = useState<{ orden: { participante: string; grupo: number }[]; grupos: string[][] } | null>(null);
  const [revelados, setRevelados] = useState(0);
  const [giro, setGiro] = useState<Giro>(null);
  // El último par revelado queda a la vista hasta el próximo giro.
  const [ultimo, setUltimo] = useState<Par | null>(null);

  const colaActual = etapa?.tipo === 'equipos' && cola?.bombo === etapa.bombo ? cola : null;
  const parActual = colaActual?.pares[indice] ?? null;

  function prepararCola(bombo: number) {
    const pendientes = juego.participantes.filter((p) => p.bombo === bombo && !p.equipo).map((p) => p.id);
    const usados = new Set(juego.participantes.flatMap((p) => (p.equipo ? [p.equipo.id] : [])));
    let equipos: EquipoAsignado[];
    let ampliado = false;
    let pool: string[];
    if (juego.origenEquipos === 'manual') {
      equipos = (juego.equiposManuales?.[bombo] ?? []).filter((e) => !usados.has(e.id));
      pool = equipos.map((e) => e.nombre);
    } else {
      const filtrado = filtrarCatalogo(fc.catalogo.equipos, juego.filtroEquipos);
      const estrellas = juego.bombos[bombo]?.estrellas ?? 3;
      const r = sortearEquipos(filtrado, fc.umbrales, estrellas, pendientes.length, usados);
      equipos = r.equipos;
      ampliado = r.ampliado;
      // El rodillo pasa por todos los de esa estrella: da la sensación de que podía salir cualquiera.
      pool = filtrado.filter((e) => Math.abs(estrellasDe(e.ovr, fc.umbrales) - estrellas) <= 0.5).map((e) => e.nombre);
    }
    const nueva = { bombo, pares: matchear(pendientes, equipos), ampliado, pool };
    setCola(nueva);
    setIndice(0);
    return nueva;
  }

  function asignar(pares: Par[]) {
    const porId = new Map(pares.map((p) => [p.participante, p.equipo]));
    actualizarTorneo(juego.id, (g) => ({
      ...g,
      participantes: g.participantes.map((p) => (porId.has(p.id) ? { ...p, equipo: porId.get(p.id)! } : p)),
    }));
  }

  /* ───── equipos ───── */

  function sortearSiguiente() {
    if (etapa?.tipo !== 'equipos' || giro) return;
    const actual = colaActual ?? prepararCola(etapa.bombo);
    if (actual.pares.length === 0) return;
    setGiro({ fase: 'participante', clave: `p-${actual.bombo}-${indice}-${Date.now()}` });
  }

  function finParticipante() {
    setTimeout(() => setGiro((g) => (g ? { fase: 'destino', clave: g.clave + '-d' } : g)), 450);
  }

  function finEquipo() {
    if (!parActual) return;
    sonido.senal();
    asignar([parActual]);
    setUltimo(parActual);
    setGiro(null);
    setIndice((i) => i + 1);
  }

  function sortearTodoElBombo() {
    if (etapa?.tipo !== 'equipos') return;
    // Con la cola recién armada, `indice` todavía es el del bombo anterior.
    const desde = colaActual ? indice : 0;
    const actual = colaActual ?? prepararCola(etapa.bombo);
    haptic.heavy();
    asignar(actual.pares.slice(desde));
    setUltimo(null);
    setGiro(null);
    setIndice(actual.pares.length);
  }

  /* ───── grupos ───── */

  function prepararGrupos() {
    const r = armarGrupos(juego.participantes, juego.formato.grupos?.cantidad ?? 2);
    setGrupos(r);
    setRevelados(0);
    return r;
  }

  function sortearGrupoSiguiente() {
    if (giro) return;
    const r = grupos ?? prepararGrupos();
    if (revelados >= r.orden.length) return;
    setGiro({ fase: 'participante', clave: `g-${revelados}-${Date.now()}` });
  }

  function finGrupo() {
    sonido.senal();
    setGiro(null);
    setRevelados((n) => n + 1);
  }

  function revelarTodosLosGrupos() {
    const r = grupos ?? prepararGrupos();
    haptic.heavy();
    setGiro(null);
    setRevelados(r.orden.length);
  }

  function confirmarGrupos() {
    if (!grupos) return;
    haptic.success();
    actualizarTorneo(juego.id, (g) => ({ ...g, grupos: grupos.grupos }));
  }

  /* ───── todo listo ───── */

  function empezar() {
    haptic.success();
    actualizarTorneo(juego.id, (g) => iniciar(g));
    router.replace(`/torneo/${juego.id}` as Href);
  }

  async function rehacer() {
    const ok = await overlay.confirm({
      title: '¿Sortear de nuevo?',
      message: 'Se borran los equipos y grupos sorteados hasta ahora.',
      confirmLabel: 'Sortear de nuevo',
      destructive: true,
    });
    if (!ok) return;
    actualizarTorneo(juego.id, (g) => ({
      ...g,
      grupos: undefined,
      participantes: g.participantes.map((p) => ({ ...p, equipo: null })),
    }));
    setCola(null);
    setGrupos(null);
    setIndice(0);
    setRevelados(0);
    setGiro(null);
    setUltimo(null);
  }

  /* ───── pantalla ───── */

  const asignados = juego.participantes.filter((p) => p.equipo);
  const enGrupos = grupos ? grupos.orden.slice(0, revelados) : [];
  const actualGrupo = grupos?.orden[revelados] ?? null;
  const gruposRevelados = grupos?.grupos.map((_, g) => enGrupos.filter((x) => x.grupo === g).map((x) => x.participante)) ?? [];
  const pendientesGrupo = grupos ? grupos.orden.slice(revelados).map((x) => nombre(x.participante)) : [];

  let titulo = 'Listo';
  let footer: React.ReactNode = <Button label="Empezar torneo" trailingIcon="arrowRight" onPress={empezar} />;

  if (etapa?.tipo === 'equipos') {
    titulo = `Bombo ${etapa.bombo + 1}`;
    footer = (
      <Row style={{ gap: space.sm }}>
        <Button label="Todo" variant="outline" style={{ flex: 0, paddingHorizontal: space.xl }} disabled={!!giro} onPress={sortearTodoElBombo} />
        <Button
          style={{ flex: 1 }}
          label={giro ? 'Sorteando…' : 'Sortear'}
          icon="barajar"
          disabled={!!giro}
          onPress={sortearSiguiente}
        />
      </Row>
    );
  } else if (etapa?.tipo === 'grupos') {
    titulo = 'Grupos';
    const todos = grupos && revelados >= grupos.orden.length;
    footer = todos ? (
      <Button label="Confirmar grupos" trailingIcon="arrowRight" onPress={confirmarGrupos} />
    ) : (
      <Row style={{ gap: space.sm }}>
        <Button label="Todo" variant="outline" style={{ flex: 0, paddingHorizontal: space.xl }} disabled={!!giro} onPress={revelarTodosLosGrupos} />
        <Button style={{ flex: 1 }} label={giro ? 'Sorteando…' : 'Sortear'} icon="barajar" disabled={!!giro} onPress={sortearGrupoSiguiente} />
      </Row>
    );
  }

  const colorBombo = etapa?.tipo === 'equipos' ? COLOR_BOMBO[etapa.bombo % COLOR_BOMBO.length]! : palette.mostaza;
  const pendientesBombo =
    colaActual?.pares.slice(indice).map((p) => nombre(p.participante)) ??
    (etapa?.tipo === 'equipos' ? juego.participantes.filter((p) => p.bombo === etapa.bombo && !p.equipo).map((p) => p.nombre) : []);

  return (
    <Screen
      title={titulo}
      meta={`${juego.title} · sorteo`}
      right={<IconButton name="undo" label="Sortear de nuevo" onPress={rehacer} />}
      footer={footer}
    >
      {etapa?.tipo === 'equipos' ? (
        <View style={{ marginTop: space.lg, gap: space.md }}>
          <Row style={{ justifyContent: 'space-between' }}>
            <Label>{juego.origenEquipos === 'manual' ? 'Equipos cargados a mano' : 'Nivel de equipos'}</Label>
            {juego.origenEquipos === 'catalogo' ? <Estrellas valor={juego.bombos[etapa.bombo]?.estrellas ?? 3} size={16} /> : null}
          </Row>
          <Rodillo
            opciones={pendientesBombo}
            final={giro && parActual ? nombre(parActual.participante) : ultimo ? nombre(ultimo.participante) : '¿Quién sale?'}
            clave={giro?.fase === 'participante' ? giro.clave : null}
            onFin={finParticipante}
            color={colorBombo}
          />
          <View style={{ alignItems: 'center' }}>
            <View style={{ transform: [{ rotate: '90deg' }] }}>
              <Icon name="arrowRight" size={22} color={c.muted} />
            </View>
          </View>
          <Rodillo
            opciones={colaActual?.pool ?? []}
            final={giro?.fase === 'destino' && parActual ? parActual.equipo.nombre : giro ? '?' : (ultimo?.equipo.nombre ?? '?')}
            clave={giro?.fase === 'destino' ? giro.clave : null}
            onFin={finEquipo}
            lento
            color={c.inverseBg === palette.tinta ? palette.crema : palette.arena}
            sub={
              (giro?.fase === 'destino' ? parActual : giro ? null : ultimo)?.equipo.estrellas != null ? (
                <Estrellas valor={(giro ? parActual : ultimo)!.equipo.estrellas!} size={14} color={palette.tinta} />
              ) : null
            }
          />
          {colaActual?.ampliado ? (
            <Notice text="No había suficientes equipos con esas estrellas: algunos salen de media estrella arriba o abajo." />
          ) : null}
        </View>
      ) : null}

      {etapa?.tipo === 'grupos' ? (
        <View style={{ marginTop: space.lg, gap: space.md }}>
          <Body color={c.muted}>Bombo por bombo: el bombo 1 pone una cabeza de serie en cada grupo.</Body>
          <Rodillo
            opciones={pendientesGrupo}
            final={
              actualGrupo && giro
                ? nombre(actualGrupo.participante)
                : grupos && revelados > 0
                  ? nombre(grupos.orden[revelados - 1]!.participante)
                  : '¿Quién sale?'
            }
            clave={giro?.fase === 'participante' ? giro.clave : null}
            onFin={() => setTimeout(() => setGiro((g) => (g ? { fase: 'destino', clave: g.clave + '-d' } : g)), 450)}
            color={palette.mostaza}
          />
          <Rodillo
            opciones={(grupos?.grupos ?? []).map((_, g) => `Grupo ${letraGrupo(g)}`)}
            final={
              giro?.fase === 'destino' && actualGrupo
                ? `Grupo ${letraGrupo(actualGrupo.grupo)}`
                : !giro && grupos && revelados > 0
                  ? `Grupo ${letraGrupo(grupos.orden[revelados - 1]!.grupo)}`
                  : '?'
            }
            clave={giro?.fase === 'destino' ? giro.clave : null}
            onFin={finGrupo}
            lento
            alto={64}
            color={palette.salvia}
          />
          <Row style={{ flexWrap: 'wrap', gap: space.sm, marginTop: space.sm }}>
            {gruposRevelados.map((ids, g) => (
              <View key={g} style={{ width: '48.5%', borderRadius: radius.card, borderWidth: 1.5, borderColor: c.line, padding: space.md, gap: 6 }}>
                <Title style={{ fontSize: 16 }}>Grupo {letraGrupo(g)}</Title>
                {ids.map((pid) => (
                  <Animated.View key={pid} entering={FadeInDown.springify().damping(14)}>
                    <Label color={c.ink} numberOfLines={1}>
                      {nombre(pid)}
                    </Label>
                  </Animated.View>
                ))}
              </View>
            ))}
          </Row>
        </View>
      ) : null}

      {!etapa ? (
        <View style={{ marginTop: space.xl, alignItems: 'center', gap: space.md }}>
          <Clay name="trofeo" size={120} />
          <Title style={{ fontSize: 22, textAlign: 'center' }}>Sorteo terminado</Title>
          <Body color={c.muted} style={{ textAlign: 'center' }}>
            Revisá cómo quedó y arrancá el torneo. Hasta empezar podés volver a sortear.
          </Body>
          {juego.grupos ? (
            <Row style={{ flexWrap: 'wrap', gap: space.sm, marginTop: space.sm }}>
              {juego.grupos.map((ids, g) => (
                <View key={g} style={{ width: '48.5%', borderRadius: radius.card, borderWidth: 1.5, borderColor: c.line, padding: space.md, gap: 6 }}>
                  <Title style={{ fontSize: 16 }}>Grupo {letraGrupo(g)}</Title>
                  {ids.map((pid) => (
                    <Label key={pid} color={c.ink} numberOfLines={1}>
                      {nombre(pid)}
                    </Label>
                  ))}
                </View>
              ))}
            </Row>
          ) : null}
        </View>
      ) : null}

      {asignados.length ? (
        <View style={{ marginTop: space.xxl, gap: space.sm }}>
          <Title style={{ fontSize: 18 }}>Equipos sorteados</Title>
          {asignados.map((p) => (
            <Animated.View key={p.id} entering={FadeInDown.springify().damping(14)}>
              <Row style={{ minHeight: 52, gap: space.md, borderRadius: radius.field, backgroundColor: c.wash, paddingHorizontal: space.md }}>
                <View style={{ width: 8, height: 30, borderRadius: 4, backgroundColor: COLOR_BOMBO[p.bombo % COLOR_BOMBO.length] }} />
                <Label color={c.ink} style={{ flex: 1, fontSize: 15 }} numberOfLines={1}>
                  {p.nombre}
                </Label>
                <Escudo nombre={p.equipo!.nombre} size={28} />
                <View style={{ maxWidth: '45%' }}>
                  <Label color={c.ink} numberOfLines={1} style={{ fontSize: 15 }}>
                    {p.equipo!.nombre}
                  </Label>
                  {p.equipo!.estrellas !== null ? <Estrellas valor={p.equipo!.estrellas} size={11} /> : null}
                </View>
              </Row>
            </Animated.View>
          ))}
        </View>
      ) : null}

      <View style={{ height: space.huge }} />
    </Screen>
  );
}
