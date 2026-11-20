import { Redirect, router, useLocalSearchParams, type Href } from 'expo-router';
import { useState } from 'react';
import { Pressable, Text, View } from 'react-native';

import { Clay } from '@/components/clay';
import { Icon } from '@/components/icons';
import { Notice, useOverlay } from '@/components/overlay';
import { EquipoChico, Escudo, Hoja, TablaPosiciones } from '@/components/torneo-parts';
import { Body, Button, IconButton, Label, Row, Screen, Segmented, Stepper, Title } from '@/components/ui';
import {
  cargarResultado,
  crearDesempate,
  empatesPendientes,
  jugado,
  letraGrupo,
  nombreDe,
  nombreRonda,
  pidePenales,
  puedeEditar,
  resolverPorSorteo,
  resultadoLlave,
  resumen,
  tablaLiga,
  tablasDeGrupos,
  type Empate,
} from '@/features/torneo/rules';
import type { Partido } from '@/features/torneo/types';
import type { TorneoGame } from '@/features/types';
import { haptic } from '@/lib/haptics';
import { useGames } from '@/store/games';
import { border, fonts, palette, radius, space } from '@/theme/tokens';
import { useTheme } from '@/theme/use-theme';

type Vista = 'tabla' | 'partidos' | 'cuadro';

export default function TorneoRuta() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const juego = useGames((s) => s.games[id]);
  if (!juego || juego.kind !== 'torneo') return <Redirect href="/" />;
  if (juego.fase === 'sorteo') return <Redirect href={`/torneo/${juego.id}/sorteo` as Href} />;
  return <Torneo juego={juego} />;
}

function Torneo({ juego }: { juego: TorneoGame }) {
  const overlay = useOverlay();
  const { actualizarTorneo, remove, rename } = useGames.getState();

  const hayCuadro = !!(juego.llaves && juego.llaves.length);
  const vistas: { value: Vista; label: string }[] =
    juego.formato.tipo === 'liga'
      ? [
          { value: 'tabla', label: 'Tabla' },
          { value: 'partidos', label: 'Partidos' },
        ]
      : juego.formato.tipo === 'grupos'
        ? [
            { value: 'tabla', label: 'Grupos' },
            { value: 'partidos', label: 'Partidos' },
            { value: 'cuadro', label: 'Cuadro' },
          ]
        : [
            { value: 'cuadro', label: 'Cuadro' },
            { value: 'partidos', label: 'Partidos' },
          ];
  const [vista, setVista] = useState<Vista>(juego.formato.tipo === 'playoff' ? 'cuadro' : hayCuadro ? 'cuadro' : 'tabla');
  const [editando, setEditando] = useState<Partido | null>(null);

  const r = resumen(juego);
  const empates = empatesPendientes(juego);
  const futbol = juego.deporte === 'futbol';

  async function menu() {
    await overlay.menu({
      title: juego.title,
      message: `${r.etapa} · ${r.jugados}/${r.total} partidos`,
      items: [
        {
          label: 'Renombrar',
          icon: 'sliders',
          onPress: async () => {
            const t = await overlay.prompt({ title: 'Nombre del torneo', initial: juego.title, maxLength: 40 });
            if (t?.trim()) rename(juego.id, t.trim());
          },
        },
        {
          label: 'Eliminar torneo',
          icon: 'trash',
          destructive: true,
          onPress: async () => {
            const ok = await overlay.confirm({
              title: '¿Eliminar el torneo?',
              message: 'Se borran todos sus partidos y resultados. No se puede deshacer.',
              confirmLabel: 'Eliminar',
              destructive: true,
            });
            if (!ok) return;
            remove(juego.id);
            router.back();
          },
        },
      ],
    });
  }

  function abrir(p: Partido) {
    if (!puedeEditar(juego, p)) {
      haptic.warning();
      overlay.notice({
        title: 'Ya no se puede cambiar',
        message:
          p.etapa === 'playoff'
            ? 'La ronda siguiente ya tiene resultados. Borralos primero para corregir este.'
            : 'El cuadro del playoff ya se armó con esta tabla.',
      });
      return;
    }
    haptic.tap();
    setEditando(p);
  }

  async function resolver(e: Empate) {
    const nombres = e.ids.map((x) => nombreDe(juego, x)).join(', ');
    const opciones: { label: string; value: 'sorteo' | 'partido' }[] = [{ label: 'Sortear quién queda arriba', value: 'sorteo' }];
    if (e.ids.length === 2) opciones.push({ label: 'Jugar un partido desempate', value: 'partido' });
    const que = await overlay.pick('Empate total', opciones, `${nombres} quedaron iguales en puntos, diferencia y goles en contra.`);
    if (!que) return;
    haptic.success();
    actualizarTorneo(juego.id, (g) => (que === 'sorteo' ? resolverPorSorteo(g, e) : crearDesempate(g, e)));
    if (que === 'partido') setVista('partidos');
  }

  const campeon = juego.campeon ? juego.participantes.find((p) => p.id === juego.campeon) : null;

  return (
    <View style={{ flex: 1 }}>
    <Screen
      title={juego.title}
      meta={`${r.etapa} · ${r.jugados}/${r.total} partidos${juego.grupoNombre ? ` · ${juego.grupoNombre}` : ''}`}
      right={<IconButton name="sliders" label="Opciones del torneo" onPress={menu} />}
    >
      {campeon ? (
        <View style={{ marginTop: space.lg, borderRadius: radius.cardLg, backgroundColor: palette.mostaza, padding: space.xl, gap: space.xs }}>
          <Clay name="corona" size={72} style={{ position: 'absolute', right: 12, top: -18 }} />
          <Label color={palette.tinta}>Campeón</Label>
          <Text style={{ fontFamily: fonts.black, fontSize: 32, color: palette.tinta, letterSpacing: -0.8 }} numberOfLines={2}>
            {campeon.nombre}
          </Text>
          {campeon.equipo ? (
            <Label color={palette.tinta} style={{ fontSize: 16 }}>
              con {campeon.equipo.nombre}
            </Label>
          ) : null}
        </View>
      ) : null}

      {empates.map((e) => {
        const desempate = juego.partidos.find((p) => p.etapa === 'desempate' && p.clave === e.clave);
        return (
          <Pressable
            key={e.clave}
            accessibilityRole="button"
            onPress={() => (desempate ? abrir(desempate) : resolver(e))}
            style={({ pressed }) => ({
              marginTop: space.lg,
              borderRadius: radius.card,
              backgroundColor: palette.rosa,
              padding: space.lg,
              gap: 4,
              opacity: pressed ? 0.8 : 1,
            })}
          >
            <Title style={{ fontSize: 17 }} color={palette.tinta}>
              {e.grupo !== undefined ? `Empate en el grupo ${letraGrupo(e.grupo)}` : 'Empate en la cima'}
            </Title>
            <Label color={palette.tinta}>
              {e.ids.map((x) => nombreDe(juego, x)).join(', ')} quedaron iguales en todo.{' '}
              {desempate ? 'Cargá el partido desempate.' : 'Tocá para sortear o jugar un desempate.'}
            </Label>
          </Pressable>
        );
      })}

      <Segmented style={{ marginTop: space.xl }} options={vistas} value={vista} onChange={setVista} />

      <View style={{ marginTop: space.lg, gap: space.lg }}>
        {vista === 'tabla' && juego.formato.tipo === 'liga' ? <TablaPosiciones datos={juego} filas={tablaLiga(juego).filas} /> : null}
        {vista === 'tabla' && juego.formato.tipo === 'grupos'
          ? tablasDeGrupos(juego).map((t, g) => (
              <TablaPosiciones
                key={g}
                datos={juego}
                filas={t.filas}
                titulo={`Grupo ${letraGrupo(g)}`}
                clasifican={juego.formato.grupos?.clasificanPorGrupo ?? 0}
              />
            ))
          : null}
        {vista === 'partidos' ? <ListaPartidos juego={juego} onAbrir={abrir} /> : null}
        {vista === 'cuadro' ? <Cuadro juego={juego} onAbrir={abrir} /> : null}
      </View>

      <View style={{ height: space.huge }} />
    </Screen>

      <HojaResultado
        juego={juego}
        partido={editando}
        futbol={futbol}
        onCerrar={() => setEditando(null)}
        onGuardar={(gl, gv, penales) => {
          if (!editando) return;
          const antes = juego.campeon;
          actualizarTorneo(juego.id, (g) => cargarResultado(g, editando.id, gl, gv, penales));
          const despues = useGames.getState().games[juego.id];
          if (despues?.kind === 'torneo' && despues.campeon && despues.campeon !== antes) haptic.heavy();
          else haptic.success();
          setEditando(null);
        }}
      />
    </View>
  );
}

/* ───────────── Partidos ───────────── */

function seccionDe(p: Partido, juego: TorneoGame): string {
  if (p.etapa === 'desempate') return 'Desempates';
  if (p.etapa === 'playoff') {
    const total = Math.max(...(juego.llaves ?? []).map((l) => l.ronda)) + 1;
    const piernas = juego.partidos.some((q) => q.llave === p.llave && q.pierna === 2);
    return nombreRonda(p.ronda, total) + (piernas ? (p.pierna === 1 ? ' · Ida' : ' · Vuelta') : '');
  }
  return `Fecha ${p.ronda + 1}`;
}

function ListaPartidos({ juego, onAbrir }: { juego: TorneoGame; onAbrir: (p: Partido) => void }) {
  const { c } = useTheme();
  // Orden de juego: grupos/liga por fecha, después el cuadro ronda por ronda con
  // todas las idas antes que las vueltas, y los desempates al final.
  const orden = (p: Partido) =>
    p.etapa === 'desempate' ? 1e6 : p.etapa === 'playoff' ? 1e4 + p.ronda * 10 + p.pierna : p.ronda * 10;
  const lista = juego.partidos.slice().sort((a, b) => orden(a) - orden(b) || (a.grupo ?? 0) - (b.grupo ?? 0));
  const secciones: { titulo: string; partidos: Partido[] }[] = [];
  for (const p of lista) {
    const t = seccionDe(p, juego);
    const ultima = secciones[secciones.length - 1];
    if (ultima?.titulo === t) ultima.partidos.push(p);
    else secciones.push({ titulo: t, partidos: [p] });
  }
  if (secciones.length === 0) {
    return <Body color={c.muted}>Todavía no hay partidos.</Body>;
  }
  return (
    <>
      {secciones.map((s) => (
        <View key={s.titulo} style={{ gap: space.sm }}>
          <Row style={{ justifyContent: 'space-between' }}>
            <Title style={{ fontSize: 17 }}>{s.titulo}</Title>
            <Label style={{ fontVariant: ['tabular-nums'] }}>
              {s.partidos.filter(jugado).length}/{s.partidos.length}
            </Label>
          </Row>
          {s.partidos.map((p) => (
            <FilaPartido key={p.id} juego={juego} p={p} onPress={() => onAbrir(p)} />
          ))}
        </View>
      ))}
    </>
  );
}

function FilaPartido({ juego, p, onPress }: { juego: TorneoGame; p: Partido; onPress: () => void }) {
  const { c } = useTheme();
  const local = juego.participantes.find((x) => x.id === p.local);
  const visit = juego.participantes.find((x) => x.id === p.visitante);
  const hecho = jugado(p);
  const ganaL = hecho && (p.gl! > p.gv! || (p.gl === p.gv && p.penales && p.penales.l > p.penales.v));
  const ganaV = hecho && (p.gv! > p.gl! || (p.gl === p.gv && p.penales && p.penales.v > p.penales.l));
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={`${local?.nombre} contra ${visit?.nombre}`}
      onPress={onPress}
      style={({ pressed }) => ({
        minHeight: 64,
        borderRadius: radius.field,
        borderWidth: border,
        borderColor: hecho ? c.line : c.lineStrong,
        paddingHorizontal: space.md,
        paddingVertical: space.sm,
        flexDirection: 'row',
        alignItems: 'center',
        gap: space.sm,
        opacity: pressed ? 0.7 : 1,
      })}
    >
      <View style={{ flex: 1, alignItems: 'flex-end' }}>
        <Label color={c.ink} numberOfLines={1} style={{ fontSize: 15, fontFamily: ganaL ? fonts.black : fonts.semibold, textAlign: 'right' }}>
          {local?.nombre ?? '—'}
        </Label>
        <EquipoChico equipo={local?.equipo} />
      </View>
      <View style={{ minWidth: 70, alignItems: 'center' }}>
        {p.grupo !== undefined && p.etapa === 'grupo' ? (
          <Label style={{ fontSize: 11 }}>Grupo {letraGrupo(p.grupo)}</Label>
        ) : null}
        <Text style={{ fontFamily: fonts.black, fontSize: 22, color: hecho ? c.ink : c.hint, fontVariant: ['tabular-nums'] }}>
          {hecho ? `${p.gl} - ${p.gv}` : 'vs'}
        </Text>
        {p.penales ? (
          <Label style={{ fontSize: 11 }}>
            ({p.penales.l}-{p.penales.v} pen.)
          </Label>
        ) : null}
      </View>
      <View style={{ flex: 1 }}>
        <Label color={c.ink} numberOfLines={1} style={{ fontSize: 15, fontFamily: ganaV ? fonts.black : fonts.semibold }}>
          {visit?.nombre ?? '—'}
        </Label>
        <EquipoChico equipo={visit?.equipo} />
      </View>
    </Pressable>
  );
}

/* ───────────── Cuadro ───────────── */

function Cuadro({ juego, onAbrir }: { juego: TorneoGame; onAbrir: (p: Partido) => void }) {
  const { c } = useTheme();
  const llaves = juego.llaves ?? [];
  if (llaves.length === 0) {
    return (
      <View style={{ alignItems: 'center', gap: space.sm, paddingVertical: space.xl }}>
        <Icon name="flag" size={28} color={c.muted} />
        <Body color={c.muted} style={{ textAlign: 'center' }}>
          El cuadro se arma solo cuando termina la fase de grupos.
        </Body>
      </View>
    );
  }
  const total = Math.max(...llaves.map((l) => l.ronda)) + 1;
  return (
    <>
      {Array.from({ length: total }, (_, ronda) => (
        <View key={ronda} style={{ gap: space.sm }}>
          <Title style={{ fontSize: 17 }}>{nombreRonda(ronda, total)}</Title>
          {llaves
            .filter((l) => l.ronda === ronda)
            .map((l) => {
              const res = resultadoLlave(l, juego.partidos);
              const partidos = juego.partidos.filter((p) => p.llave === l.id);
              const pendiente = partidos.find((p) => !jugado(p)) ?? partidos[partidos.length - 1];
              const linea = (pid: string | null, goles: number, gana: boolean) => {
                const p = pid ? juego.participantes.find((x) => x.id === pid) : null;
                return (
                  <Row style={{ gap: space.sm }}>
                    {p?.equipo ? <Escudo nombre={p.equipo.nombre} size={24} /> : <View style={{ width: 24 }} />}
                    <Label
                      color={pid ? c.ink : c.hint}
                      numberOfLines={1}
                      style={{ flex: 1, fontSize: 15, fontFamily: gana ? fonts.black : fonts.semibold }}
                    >
                      {pid ? (p?.nombre ?? '—') : 'A definir'}
                    </Label>
                    {!l.bye && partidos.some(jugado) ? (
                      <Text style={{ fontFamily: fonts.black, fontSize: 17, color: c.ink, fontVariant: ['tabular-nums'] }}>{goles}</Text>
                    ) : null}
                  </Row>
                );
              };
              return (
                <Pressable
                  key={l.id}
                  accessibilityRole="button"
                  disabled={l.bye || !pendiente}
                  onPress={() => pendiente && onAbrir(pendiente)}
                  style={({ pressed }) => ({
                    borderRadius: radius.field,
                    borderWidth: border,
                    borderColor: res.ganador ? c.line : c.lineStrong,
                    padding: space.md,
                    gap: 6,
                    opacity: pressed ? 0.7 : 1,
                  })}
                >
                  {linea(l.a, res.global[0], !!res.ganador && res.ganador === l.a && !l.bye)}
                  {l.bye ? (
                    <Label style={{ fontSize: 13, marginLeft: 32 }}>Pasa directo</Label>
                  ) : (
                    linea(l.b, res.global[1], !!res.ganador && res.ganador === l.b)
                  )}
                  {res.faltanPenales ? <Label style={{ fontSize: 13 }}>Global igualado: faltan los penales.</Label> : null}
                  {partidos.length === 2 && partidos.some(jugado) ? (
                    <Label style={{ fontSize: 12 }}>
                      {partidos.map((p) => (jugado(p) ? `${p.pierna === 1 ? 'Ida' : 'Vuelta'} ${p.gl}-${p.gv}` : null)).filter(Boolean).join(' · ')}
                    </Label>
                  ) : null}
                </Pressable>
              );
            })}
        </View>
      ))}
    </>
  );
}

/* ───────────── Cargar resultado ───────────── */

function HojaResultado({
  juego,
  partido,
  futbol,
  onCerrar,
  onGuardar,
}: {
  juego: TorneoGame;
  partido: Partido | null;
  futbol: boolean;
  onCerrar: () => void;
  onGuardar: (gl: number | null, gv: number | null, penales: { l: number; v: number } | null) => void;
}) {
  const { c } = useTheme();
  const [gl, setGl] = useState(0);
  const [gv, setGv] = useState(0);
  const [pl, setPl] = useState(0);
  const [pv, setPv] = useState(0);
  const [de, setDe] = useState<string | null>(null);

  // Al abrir otro partido, arrancar con lo que ya tenía cargado.
  if (partido && de !== partido.id) {
    setDe(partido.id);
    setGl(partido.gl ?? 0);
    setGv(partido.gv ?? 0);
    setPl(partido.penales?.l ?? 0);
    setPv(partido.penales?.v ?? 0);
  }
  if (!partido && de !== null) setDe(null);

  if (!partido) return null;
  const local = nombreDe(juego, partido.local);
  const visit = nombreDe(juego, partido.visitante);
  const penales = pidePenales(partido, gl, gv, juego);
  const listo = !penales || pl !== pv;
  const max = futbol ? 30 : 99;
  const nombrePenales = futbol ? 'Penales' : 'Desempate';

  const lado = (nombre: string, equipo: string | undefined, valor: number, set: (n: number) => void) => (
    <Row style={{ justifyContent: 'space-between', gap: space.md }}>
      <View style={{ flex: 1 }}>
        <Title style={{ fontSize: 18 }} numberOfLines={1}>
          {nombre}
        </Title>
        {equipo ? <Label numberOfLines={1}>{equipo}</Label> : null}
      </View>
      <Stepper value={valor} min={0} max={max} onChange={set} />
    </Row>
  );

  return (
    <Hoja
      visible
      onCerrar={onCerrar}
      titulo={partido.etapa === 'desempate' ? 'Partido desempate' : futbol ? 'Resultado' : 'Resultado'}
      mensaje={futbol ? 'Anotá el resultado exacto: la diferencia de gol define la tabla.' : 'Anotá los puntos o sets de cada uno.'}
    >
      {lado(local, juego.participantes.find((p) => p.id === partido.local)?.equipo?.nombre, gl, setGl)}
      {lado(visit, juego.participantes.find((p) => p.id === partido.visitante)?.equipo?.nombre, gv, setGv)}

      {penales ? (
        <View style={{ borderRadius: radius.field, backgroundColor: c.wash, padding: space.lg, gap: space.md }}>
          <Label color={c.ink}>
            {partido.etapa === 'desempate'
              ? `Empataron: se define por ${nombrePenales.toLowerCase()}.`
              : `El global quedó igual: se define por ${nombrePenales.toLowerCase()}.`}
          </Label>
          <Row style={{ justifyContent: 'space-between' }}>
            <Label color={c.ink} style={{ flex: 1 }} numberOfLines={1}>
              {local}
            </Label>
            <Stepper value={pl} min={0} max={30} size={38} onChange={setPl} />
          </Row>
          <Row style={{ justifyContent: 'space-between' }}>
            <Label color={c.ink} style={{ flex: 1 }} numberOfLines={1}>
              {visit}
            </Label>
            <Stepper value={pv} min={0} max={30} size={38} onChange={setPv} />
          </Row>
          {!listo ? <Notice text={`Los ${nombrePenales.toLowerCase()} no pueden terminar iguales.`} /> : null}
        </View>
      ) : null}

      <Button label="Guardar" disabled={!listo} onPress={() => onGuardar(gl, gv, penales ? { l: pl, v: pv } : null)} />
      {jugado(partido) ? (
        <Button label="Borrar resultado" variant="ghost" onPress={() => onGuardar(null, null, null)} />
      ) : null}
    </Hoja>
  );
}
