import { Redirect, router, useLocalSearchParams, type Href } from 'expo-router';
import { useState } from 'react';
import { Pressable, Text, View } from 'react-native';

import { Clay } from '@/components/clay';
import { Icon } from '@/components/icons';
import { Notice, useOverlay } from '@/components/overlay';
import { CuadroVisual } from '@/components/torneo-cuadro';
import { EquipoChico, Hoja, TablaPosiciones } from '@/components/torneo-parts';
import { Body, Button, IconButton, Label, Row, Screen, Segmented, Spinner, Stepper, Title } from '@/components/ui';
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
  puedeResortearCruces,
  resolverPorSorteo,
  resortearCruces,
  resumen,
  tablaLiga,
  tablasDeGrupos,
  type Empate,
} from '@/features/torneo/rules';
import { dejarDeSeguir, useCambiosDeEditores, useTorneoRemoto, type RolTorneo } from '@/features/torneo/compartido';
import type { Partido } from '@/features/torneo/types';
import type { TorneoGame } from '@/features/types';
import { haptic } from '@/lib/haptics';
import { useAuth } from '@/providers/auth-provider';
import { useGames } from '@/store/games';
import { border, fonts, palette, radius, space } from '@/theme/tokens';
import { useTheme } from '@/theme/use-theme';

type Vista = 'tabla' | 'partidos' | 'cuadro';

type Actualizar = (cambio: (g: TorneoGame) => TorneoGame) => void | Promise<void>;

export default function TorneoRuta() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const juego = useGames((s) => s.games[id]);
  // Lo que carguen los editores llega a la copia local del anfitrión.
  useCambiosDeEditores(id, juego?.kind === 'torneo');
  if (!juego) return <TorneoAjeno id={id} />;
  if (juego.kind !== 'torneo') return <Redirect href="/" />;
  if (juego.fase === 'sorteo') return <Redirect href={`/torneo/${juego.id}/sorteo` as Href} />;
  return (
    <Torneo juego={juego} rol="anfitrion" actualizar={(cambio) => useGames.getState().actualizarTorneo(juego.id, cambio)} />
  );
}

/** Un torneo de otro, compartido por grupo o enlace: en vivo desde la base. */
function TorneoAjeno({ id }: { id: string }) {
  const { c } = useTheme();
  const miId = useAuth().session?.user.id;
  const { estado, actualizar } = useTorneoRemoto(id, miId);
  if (estado.paso === 'cargando') {
    return (
      <Screen title="Torneo" scroll={false}>
        <View style={{ marginTop: space.xl }}>
          <Spinner color={c.muted} />
        </View>
      </Screen>
    );
  }
  if (estado.paso !== 'listo') {
    return (
      <Screen title={estado.paso === 'no-existe' ? 'No lo encontramos' : 'Sin conexión'} scroll={false}>
        <Body color={c.muted} style={{ marginTop: space.lg }}>
          {estado.paso === 'no-existe'
            ? 'Este torneo no existe o ya no está compartido con vos.'
            : 'No pudimos traer el torneo. Revisá internet y probá de nuevo.'}
        </Body>
        <Button label="Volver" variant="outline" style={{ marginTop: space.xl }} onPress={() => router.back()} />
      </Screen>
    );
  }
  return (
    <Torneo juego={estado.juego} rol={estado.rol} actualizar={estado.rol === 'espectador' ? undefined : actualizar} />
  );
}

function Torneo({ juego, rol, actualizar }: { juego: TorneoGame; rol: RolTorneo; actualizar?: Actualizar }) {
  const overlay = useOverlay();
  const { remove, rename } = useGames.getState();
  const { c } = useTheme();
  const miId = useAuth().session?.user.id;
  const esAnfitrion = rol === 'anfitrion';

  /** Corre el cambio y avisa si falló (los ajenos van por red). */
  async function aplicar(cambio: (g: TorneoGame) => TorneoGame): Promise<boolean> {
    if (!actualizar) return false;
    try {
      await actualizar(cambio);
      return true;
    } catch (e) {
      haptic.warning();
      await overlay.notice({ title: 'No se guardó', message: (e as Error).message ?? 'Probá de nuevo.' });
      return false;
    }
  }

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
      items: !esAnfitrion
        ? [
            {
              label: 'Dejar de verlo',
              icon: 'close',
              destructive: true,
              onPress: async () => {
                if (!miId) return;
                try {
                  await dejarDeSeguir(juego.id, miId);
                } catch {
                  // Si lo ve por el grupo no hay acceso propio que borrar.
                }
                router.back();
              },
            },
          ]
        : [
        {
          label: 'Compartir y permisos',
          icon: 'share',
          onPress: () => router.push(`/torneo/${juego.id}/compartir` as Href),
        },
        {
          label: 'Renombrar',
          icon: 'pencil',
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
    if (!actualizar) return;
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
    if (!actualizar) return;
    const nombres = e.ids.map((x) => nombreDe(juego, x)).join(', ');
    const opciones: { label: string; value: 'sorteo' | 'partido' }[] = [{ label: 'Sortear quién queda arriba', value: 'sorteo' }];
    if (e.ids.length === 2) opciones.push({ label: 'Jugar un partido desempate', value: 'partido' });
    const que = await overlay.pick('Empate total', opciones, `${nombres} quedaron iguales en puntos, diferencia y goles en contra.`);
    if (!que) return;
    if (!(await aplicar((g) => (que === 'sorteo' ? resolverPorSorteo(g, e) : crearDesempate(g, e))))) return;
    haptic.success();
    if (que === 'partido') setVista('partidos');
  }

  async function resortear() {
    const ok = await overlay.confirm({
      title: '¿Volver a sortear los cruces?',
      message: 'Se arma otro cuadro con las mismas reglas: ningún 1° contra otro 1° ni contra alguien de su grupo.',
      confirmLabel: 'Sortear de nuevo',
    });
    if (!ok) return;
    if (await aplicar((g) => resortearCruces(g))) haptic.success();
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
        <View style={{ marginTop: space.lg, borderRadius: radius.cardLg, backgroundColor: palette.mostaza, padding: space.xl, paddingRight: 92, gap: space.xs, overflow: 'hidden' }}>
          <Clay name="corona" size={60} style={{ position: 'absolute', right: space.lg, top: space.lg }} />
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

      {!esAnfitrion ? (
        <Row style={{ marginTop: space.lg, gap: space.sm }}>
          <Icon name={rol === 'editor' ? 'pencil' : 'eye'} size={16} color={c.muted} />
          <Label style={{ flex: 1 }}>
            {rol === 'editor'
              ? 'Podés cargar resultados: el anfitrión te dio permiso.'
              : 'Estás mirando: se actualiza solo cuando se cargan resultados.'}
          </Label>
        </Row>
      ) : null}

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
        {vista === 'partidos' ? <ListaPartidos juego={juego} onAbrir={abrir} soloLectura={!actualizar} /> : null}
        {vista === 'cuadro' ? (
          <Cuadro juego={juego} onAbrir={actualizar ? abrir : undefined} onResortear={esAnfitrion ? resortear : undefined} />
        ) : null}
      </View>

      <View style={{ height: space.huge }} />
    </Screen>

      <HojaResultado
        juego={juego}
        partido={editando}
        futbol={futbol}
        onCerrar={() => setEditando(null)}
        onGuardar={async (gl, gv, penales) => {
          if (!editando) return;
          const partido = editando;
          setEditando(null);
          const antes = juego.campeon;
          let campeon: string | null | undefined;
          const ok = await aplicar((g) => {
            const nuevo = cargarResultado(g, partido.id, gl, gv, penales);
            campeon = nuevo.campeon;
            return nuevo;
          });
          if (!ok) return;
          if (campeon && campeon !== antes) haptic.heavy();
          else haptic.success();
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

function ListaPartidos({
  juego,
  onAbrir,
  soloLectura,
}: {
  juego: TorneoGame;
  onAbrir: (p: Partido) => void;
  soloLectura?: boolean;
}) {
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
            <FilaPartido key={p.id} juego={juego} p={p} onPress={soloLectura ? undefined : () => onAbrir(p)} />
          ))}
        </View>
      ))}
    </>
  );
}

function FilaPartido({ juego, p, onPress }: { juego: TorneoGame; p: Partido; onPress?: () => void }) {
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
      disabled={!onPress}
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

function Cuadro({
  juego,
  onAbrir,
  onResortear,
}: {
  juego: TorneoGame;
  onAbrir?: (p: Partido) => void;
  /** Sólo para quien maneja el torneo, y mientras no se jugó nada del cuadro. */
  onResortear?: () => void;
}) {
  const { c } = useTheme();
  const llaves = juego.llaves ?? [];
  if (llaves.length === 0) {
    return (
      <View style={{ alignItems: 'center', gap: space.sm, paddingVertical: space.xl }}>
        <Icon name="flag" size={28} color={c.muted} />
        <Body color={c.muted} style={{ textAlign: 'center' }}>
          Cuando termine la fase de grupos se sortean los cruces: un 1° nunca se cruza con otro 1°, ni con alguien de su grupo.
        </Body>
      </View>
    );
  }
  return (
    <View style={{ gap: space.md }}>
      {juego.formato.tipo === 'grupos' && onResortear && puedeResortearCruces(juego) ? (
        <Row style={{ justifyContent: 'space-between', gap: space.md }}>
          <Label style={{ flex: 1 }}>Cruces sorteados. Hasta que se juegue un partido se pueden volver a sortear.</Label>
          <Button label="Re-sortear" icon="barajar" size="sm" variant="outline" onPress={onResortear} />
        </Row>
      ) : null}
      <CuadroVisual juego={juego} onAbrir={onAbrir} />
    </View>
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
