import { router, type Href } from 'expo-router';
import { useMemo, useState } from 'react';
import { Pressable, ScrollView, TextInput, View } from 'react-native';

import { Clay } from '@/components/clay';
import { Icon } from '@/components/icons';
import { Notice, useOverlay } from '@/components/overlay';
import { Escudo, Estrellas, Hoja, TotalPartidos } from '@/components/torneo-parts';
import { Avatar, Body, Button, Chip, Field, Label, Row, Screen, Segmented, Stepper, Title, Toggle } from '@/components/ui';
import { useCatalogoFC } from '@/features/torneo/catalogo-fc';
import {
  contarPartidos,
  estrellasDe,
  filtrarCatalogo,
  iniciar,
  LIMITES,
  ligasDelCatalogo,
  SIN_REGLAS,
  sortearParejas,
  validarFormato,
  type ReglasParejas,
} from '@/features/torneo/rules';
import type {
  Deporte,
  DatosTorneo,
  EquipoAsignado,
  FiltroEquipos,
  Formato,
  Modalidad,
  OrigenEquipos,
  TipoFormato,
} from '@/features/torneo/types';
import type { Player, PlayerRef } from '@/features/types';
import { haptic } from '@/lib/haptics';
import { uid } from '@/lib/id';
import { useAuth } from '@/providers/auth-provider';
import { useGames } from '@/store/games';
import { groupById, participantesDeGrupo, SIN_LOCALES, useGrupos } from '@/store/grupos';
import { border, fonts, palette, playerColor, radius, space, touch } from '@/theme/tokens';
import { useTheme } from '@/theme/use-theme';

type Persona = { id: string; name: string; avatarUrl: string | null; ref?: PlayerRef; activo: boolean; invitado?: boolean };
type Unidad = { id: string; nombre: string; integrantes: string[] };
type Paso = 'juego' | 'gente' | 'bombos' | 'equipos' | 'formato';

const COLOR_BOMBO = [palette.mostaza, palette.salvia, palette.tomate, palette.rosa, palette.azul, palette.crema];
const ESTRELLAS_DEFAULT = [5, 4.5, 4, 3.5, 3, 2.5];

export default function NuevoTorneo() {
  const { c, scheme } = useTheme();
  const overlay = useOverlay();
  const { session } = useAuth();
  const meId = session?.user.id;

  const grupos = useGrupos((s) => s.groups);
  const locals = useGrupos((s) => s.locals);
  const activeId = useGrupos((s) => s.activeId);
  const fc = useCatalogoFC();

  const [paso, setPaso] = useState<Paso>('juego');

  // Juego
  const [deporte, setDeporte] = useState<Deporte>('futbol');
  const [modalidad, setModalidad] = useState<Modalidad>('individual');
  const [titulo, setTitulo] = useState('');
  const [usaEquipos, setUsaEquipos] = useState(true);

  // Gente
  const [grupoId, setGrupoId] = useState<string | null>(activeId);
  const [personas, setPersonas] = useState<Persona[]>(() => {
    const g = groupById(grupos, activeId);
    return g ? participantesDeGrupo(g, locals[g.id] ?? SIN_LOCALES, meId, uid).map((p) => ({ ...p, activo: true })) : [];
  });
  const [invitado, setInvitado] = useState('');
  const [parejas, setParejas] = useState<[string, string][]>([]);
  const [elegido, setElegido] = useState<string | null>(null);
  const [reglas, setReglas] = useState<ReglasParejas>(SIN_REGLAS);
  const [hoja, setHoja] = useState<'ligas' | 'reglas' | null>(null);

  // Bombos
  const [cantBombos, setCantBombos] = useState(2);
  const [bomboDe, setBomboDe] = useState<Record<string, number>>({});
  const [estrellas, setEstrellas] = useState<number[]>(ESTRELLAS_DEFAULT);

  // Equipos
  const [origen, setOrigen] = useState<OrigenEquipos>('catalogo');
  const [filtro, setFiltro] = useState<FiltroEquipos>('clubes');
  /** null = todas las ligas. */
  const [ligas, setLigas] = useState<string[] | null>(null);
  const [manuales, setManuales] = useState<EquipoAsignado[][]>([]);
  const [buscando, setBuscando] = useState<{ bombo: number; texto: string } | null>(null);

  // Formato
  const [tipo, setTipo] = useState<TipoFormato>('grupos');
  const [idaVuelta, setIdaVuelta] = useState(false);
  const [playoffIdaVuelta, setPlayoffIdaVuelta] = useState(false);
  const [finalUnica, setFinalUnica] = useState(true);
  const [cantGrupos, setCantGrupos] = useState(2);
  const [clasifican, setClasifican] = useState(2);

  const grupo = groupById(grupos, grupoId);
  const conEquipos = deporte === 'futbol' && usaEquipos;
  const pasos: Paso[] = conEquipos ? ['juego', 'gente', 'bombos', 'equipos', 'formato'] : ['juego', 'gente', 'bombos', 'formato'];
  const indice = pasos.indexOf(paso);

  const activos = personas.filter((p) => p.activo);
  const nombreDe = useMemo(() => new Map(personas.map((p) => [p.id, p.name])), [personas]);

  // Parejas válidas: sólo con gente activa.
  const activosIds = new Set(activos.map((p) => p.id));
  const parejasVivas = parejas.filter(([a, b]) => activosIds.has(a) && activosIds.has(b));
  const emparejados = new Set(parejasVivas.flat());
  const sueltos = activos.filter((p) => !emparejados.has(p.id));

  const unidades: Unidad[] =
    modalidad === 'individual'
      ? activos.map((p) => ({ id: p.id, nombre: p.name, integrantes: [p.id] }))
      : parejasVivas.map(([a, b]) => ({ id: `${a}+${b}`, nombre: `${nombreDe.get(a)} y ${nombreDe.get(b)}`, integrantes: [a, b] }));

  const bombos = Math.max(1, Math.min(cantBombos, unidades.length || 1));
  const bomboPorDefecto = (i: number) => Math.min(bombos - 1, Math.floor((i * bombos) / Math.max(1, unidades.length)));
  const bomboDeUnidad = (u: Unidad, i: number) => {
    const b = bomboDe[u.id];
    return b !== undefined && b < bombos ? b : bomboPorDefecto(i);
  };
  const porBombo = Array.from({ length: bombos }, (_, b) => unidades.filter((u, i) => bomboDeUnidad(u, i) === b));

  const formato: Formato = {
    tipo,
    idaVuelta,
    playoffIdaVuelta,
    finalUnica,
    ...(tipo === 'grupos' ? { grupos: { cantidad: cantGrupos, clasificanPorGrupo: clasifican } } : {}),
  };
  const conteo = contarPartidos(formato, unidades.length);
  const errorFormato = validarFormato(formato, unidades.length);

  const ligasCatalogo = useMemo(() => ligasDelCatalogo(fc.catalogo.equipos), [fc.catalogo]);
  // Una liga guardada que ya no está en el catálogo no cuenta.
  const ligasVivas = useMemo(
    () => (ligas ? ligas.filter((l) => ligasCatalogo.some((x) => x.liga === l)) : null),
    [ligas, ligasCatalogo],
  );
  const catalogoFiltrado = useMemo(
    () => filtrarCatalogo(fc.catalogo.equipos, filtro, filtro === 'selecciones' ? null : ligasVivas),
    [fc.catalogo, filtro, ligasVivas],
  );

  // Reglas de parejas, sólo con gente activa.
  const reglasVivas: ReglasParejas = {
    fijas: reglas.fijas.filter(([a, b]) => activosIds.has(a) && activosIds.has(b)),
    prohibidas: reglas.prohibidas.filter(([a, b]) => activosIds.has(a) && activosIds.has(b)),
    cabezas: reglas.cabezas.filter((a) => activosIds.has(a)),
  };
  const cantReglas = reglasVivas.fijas.length + reglasVivas.prohibidas.length + reglasVivas.cabezas.length;
  const disponiblesPorEstrella = useMemo(() => {
    const m = new Map<number, number>();
    for (const e of catalogoFiltrado) {
      const s = estrellasDe(e.ovr, fc.umbrales);
      m.set(s, (m.get(s) ?? 0) + 1);
    }
    return m;
  }, [catalogoFiltrado, fc.umbrales]);

  /* ───── acciones ───── */

  async function elegirGrupo() {
    const SIN = '__sin-grupo__';
    const opcion = await overlay.pick<string>(
      'Traer participantes de…',
      [...grupos.map((g) => ({ label: g.name, value: g.id })), { label: 'Sin grupo', value: SIN }],
    );
    if (opcion === null) return; // cerró la hoja
    const valor = opcion === SIN ? null : opcion;
    if (valor === grupoId) return;
    const g = groupById(grupos, valor);
    const delGrupo = g ? participantesDeGrupo(g, locals[g.id] ?? SIN_LOCALES, meId, uid).map((p) => ({ ...p, activo: true })) : [];
    setGrupoId(valor);
    setPersonas((ps) => [...delGrupo, ...ps.filter((p) => p.invitado)]);
    setParejas([]);
    setBomboDe({});
  }

  /** `texto` viene del evento de enviar: el estado puede ir una letra atrás si se tipea rápido. */
  function sumarInvitado(texto: string = invitado) {
    const n = texto.trim();
    if (!n) return;
    haptic.tap();
    setPersonas((ps) => [...ps, { id: uid(), name: n, avatarUrl: null, activo: true, invitado: true }]);
    setInvitado('');
  }

  function alternar(p: Persona) {
    haptic.tap();
    if (p.invitado) setPersonas((ps) => ps.filter((x) => x.id !== p.id));
    else setPersonas((ps) => ps.map((x) => (x.id === p.id ? { ...x, activo: !x.activo } : x)));
  }

  function tocarSuelto(id: string) {
    haptic.tap();
    if (!elegido) return setElegido(id);
    if (elegido === id) return setElegido(null);
    setParejas((ps) => [...ps.filter(([a, b]) => activosIds.has(a) && activosIds.has(b)), [elegido, id]]);
    setElegido(null);
  }

  function parejasAlAzar() {
    const r = sortearParejas(
      activos.map((p) => p.id),
      reglasVivas,
    );
    if (!r) {
      haptic.warning();
      overlay.notice({
        title: 'No se puede',
        message: 'Con estas reglas no hay forma de armar las parejas. Sacá alguna y probá de nuevo.',
      });
      return;
    }
    haptic.light();
    setParejas(r.parejas);
    setElegido(null);
  }

  function agregarManual(b: number, nombre: string, ovr: number | null = null, id?: string) {
    const limpio = nombre.trim();
    if (!limpio) return;
    haptic.tap();
    setManuales((ms) => {
      const copia = Array.from({ length: bombos }, (_, i) => ms[i] ?? []);
      copia[b] = [...copia[b]!, { id: id ?? uid(), nombre: limpio, ovr, estrellas: ovr !== null ? estrellasDe(ovr, fc.umbrales) : null }];
      return copia;
    });
    setBuscando(null);
  }

  function quitarManual(b: number, id: string) {
    haptic.light();
    setManuales((ms) => ms.map((l, i) => (i === b ? l.filter((e) => e.id !== id) : l)));
  }

  /* ───── validación por paso ───── */

  function problema(p: Paso): string | null {
    if (p === 'juego') return titulo.trim() ? null : 'Ponele un nombre al torneo.';
    if (p === 'gente') {
      if (modalidad === 'parejas' && sueltos.length > 0) return sueltos.length === 1 ? `Falta pareja para ${sueltos[0]!.name}.` : 'Faltan armar parejas.';
      if (unidades.length < LIMITES.minParticipantes) return 'Hacen falta al menos 2 participantes.';
      if (unidades.length > LIMITES.maxParticipantes) return `Máximo ${LIMITES.maxParticipantes} participantes.`;
      return null;
    }
    if (p === 'bombos') return porBombo.some((b) => b.length === 0) ? 'Hay bombos vacíos: sacá uno o pasá a alguien.' : null;
    if (p === 'equipos') {
      if (origen === 'manual') {
        const mal = porBombo.findIndex((u, b) => (manuales[b]?.length ?? 0) !== u.length);
        return mal >= 0 ? `El bombo ${mal + 1} necesita ${porBombo[mal]!.length} equipos.` : null;
      }
      return null;
    }
    return errorFormato;
  }

  function crear() {
    const players: Player[] = activos.map((p) => ({ id: p.id, name: p.name, ...(p.ref ? { ref: p.ref } : {}) }));
    const participantes = unidades.map((u, i) => ({
      id: uid(),
      nombre: u.nombre,
      integrantes: u.integrantes,
      bombo: bomboDeUnidad(u, i),
      equipo: null,
    }));
    let datos: DatosTorneo = {
      deporte,
      modalidad,
      grupoId: grupo?.id ?? null,
      grupoNombre: grupo?.name ?? null,
      participantes,
      bombos: Array.from({ length: bombos }, (_, b) => ({ nombre: `Bombo ${b + 1}`, estrellas: estrellas[b] ?? 3 })),
      usaEquipos: conEquipos,
      origenEquipos: origen,
      filtroEquipos: filtro,
      ligasEquipos: filtro === 'selecciones' ? null : ligasVivas,
      ...(conEquipos && origen === 'manual' ? { equiposManuales: Array.from({ length: bombos }, (_, b) => manuales[b] ?? []) } : {}),
      formato,
      fase: 'sorteo',
      partidos: [],
    };
    const conSorteo = conEquipos || tipo === 'grupos';
    if (!conSorteo) datos = iniciar(datos);
    const id = useGames.getState().crearTorneo(titulo.trim(), players, datos);
    haptic.success();
    router.replace((conSorteo ? `/torneo/${id}/sorteo` : `/torneo/${id}`) as Href);
  }

  function siguiente() {
    const p = problema(paso);
    if (p) {
      haptic.warning();
      overlay.notice({ title: 'Falta algo', message: p });
      return;
    }
    if (indice === pasos.length - 1) return crear();
    haptic.tap();
    setPaso(pasos[indice + 1]!);
  }

  const ultimo = indice === pasos.length - 1;
  const errorActual = problema(paso);

  /* ───── pantalla ───── */

  return (
    <View style={{ flex: 1 }}>
      <Screen
        title={{ juego: 'Nuevo torneo', gente: 'Participantes', bombos: 'Bombos', equipos: 'Equipos', formato: 'Formato' }[paso]}
        meta={`Torneo · paso ${indice + 1} de ${pasos.length}`}
        decor={
          <View style={{ position: 'absolute', right: -4, top: 8 }} pointerEvents="none">
            <Clay name="trofeo" size={104} />
          </View>
        }
        footer={
          <Row style={{ gap: space.sm }}>
            {indice > 0 ? (
              <Button label="Atrás" variant="outline" style={{ flex: 0, paddingHorizontal: space.xl }} onPress={() => setPaso(pasos[indice - 1]!)} />
            ) : null}
            <Button
              style={{ flex: 1 }}
              label={ultimo ? 'Crear torneo' : 'Siguiente'}
              meta={ultimo && !errorFormato ? `${conteo.total} partidos` : undefined}
              trailingIcon="arrowRight"
              disabled={!!errorActual && paso !== 'gente' && paso !== 'equipos'}
              onPress={siguiente}
            />
          </Row>
        }
      >
        {paso === 'juego' ? (
          <View style={{ marginTop: space.xl, gap: space.xl }}>
            <Field label="Nombre" placeholder={deporte === 'futbol' ? 'Copa FIFA del viernes' : 'Torneo de ping-pong'} value={titulo} onChangeText={setTitulo} maxLength={40} />
            <View style={{ gap: space.sm }}>
              <Label>Juego</Label>
              <Segmented
                options={[
                  { value: 'futbol', label: 'Fútbol / FIFA' },
                  { value: 'otro', label: 'Otro juego' },
                ]}
                value={deporte}
                onChange={setDeporte}
              />
              <Label style={{ fontSize: 13 }}>
                {deporte === 'futbol'
                  ? 'Se anotan los goles: la diferencia define la tabla.'
                  : 'Ping-pong, pool, lo que sea: se anotan puntos o sets con las mismas reglas.'}
              </Label>
            </View>
            <View style={{ gap: space.sm }}>
              <Label>Se juega</Label>
              <Segmented
                options={[
                  { value: 'individual', label: 'Individual' },
                  { value: 'parejas', label: 'En parejas' },
                ]}
                value={modalidad}
                onChange={setModalidad}
              />
            </View>
            {deporte === 'futbol' ? (
              <Row style={{ justifyContent: 'space-between', gap: space.lg }}>
                <View style={{ flex: 1, gap: 2 }}>
                  <Title style={{ fontSize: 16 }}>Cada uno con un equipo</Title>
                  <Label>Para el FIFA: se sortean equipos por bombo.</Label>
                </View>
                <Toggle value={usaEquipos} onChange={setUsaEquipos} label="Cada uno con un equipo" />
              </Row>
            ) : null}
          </View>
        ) : null}

        {paso === 'gente' ? (
          <View style={{ marginTop: space.lg }}>
            <Pressable
              accessibilityRole="button"
              onPress={elegirGrupo}
              style={({ pressed }) => ({
                minHeight: 56,
                borderRadius: radius.field,
                borderWidth: border,
                borderColor: c.lineStrong,
                paddingHorizontal: space.lg,
                flexDirection: 'row',
                alignItems: 'center',
                gap: space.md,
                opacity: pressed ? 0.7 : 1,
              })}
            >
              <Icon name="users" size={20} color={c.ink} />
              <View style={{ flex: 1 }}>
                <Label style={{ fontSize: 12 }}>Grupo</Label>
                <Label color={c.ink} style={{ fontSize: 16 }} numberOfLines={1}>
                  {grupo ? grupo.name : grupos.length ? 'Sin grupo' : 'No tenés grupos'}
                </Label>
              </View>
              {grupos.length ? <Label color={c.ink}>Cambiar</Label> : null}
            </Pressable>

            <Row style={{ marginTop: space.xl, justifyContent: 'space-between', alignItems: 'baseline' }}>
              <Title style={{ fontSize: 20 }}>¿Quiénes juegan?</Title>
              <Label style={{ fontVariant: ['tabular-nums'] }}>{activos.length}</Label>
            </Row>

            <View style={{ marginTop: space.md, gap: space.sm }}>
              {personas.map((p, i) => (
                <Pressable
                  key={p.id}
                  accessibilityRole="checkbox"
                  accessibilityState={{ checked: p.activo }}
                  onPress={() => alternar(p)}
                  style={({ pressed }) => ({
                    minHeight: 54,
                    borderRadius: radius.field,
                    borderWidth: border,
                    borderColor: p.activo ? c.lineStrong : c.line,
                    paddingHorizontal: space.md,
                    flexDirection: 'row',
                    alignItems: 'center',
                    gap: space.md,
                    opacity: pressed ? 0.7 : p.activo ? 1 : 0.5,
                  })}
                >
                  <Avatar name={p.name} uri={p.avatarUrl} color={playerColor(i, scheme)} size={32} />
                  <View style={{ flex: 1 }}>
                    <Label color={c.ink} style={{ fontSize: 16 }} numberOfLines={1}>
                      {p.name}
                    </Label>
                    {p.invitado ? <Label style={{ fontSize: 12 }}>Invitado</Label> : null}
                  </View>
                  <Icon name={p.invitado ? 'close' : p.activo ? 'check' : 'plus'} size={18} color={c.ink} strokeWidth={2.4} />
                </Pressable>
              ))}
            </View>

            <Row style={{ marginTop: space.md, gap: space.sm }}>
              <View style={{ flex: 1, minHeight: 54, borderRadius: radius.field, borderWidth: border, borderColor: c.line, paddingHorizontal: space.lg, justifyContent: 'center' }}>
                <TextInput
                  value={invitado}
                  onChangeText={setInvitado}
                  onSubmitEditing={(e) => sumarInvitado(e.nativeEvent.text)}
                  // El teclado queda abierto para cargar a varios seguidos.
                  submitBehavior="submit"
                  placeholder="Sumar a alguien de afuera"
                  placeholderTextColor={c.hint}
                  returnKeyType="done"
                  maxLength={24}
                  style={{ fontFamily: fonts.medium, fontSize: 16, color: c.ink, paddingVertical: space.md }}
                />
              </View>
              <Pressable
                accessibilityRole="button"
                accessibilityLabel="Sumar invitado"
                disabled={!invitado.trim()}
                onPress={() => sumarInvitado()}
                style={({ pressed }) => ({
                  width: 54,
                  height: 54,
                  borderRadius: 27,
                  backgroundColor: c.inverseBg,
                  alignItems: 'center',
                  justifyContent: 'center',
                  opacity: !invitado.trim() ? 0.35 : pressed ? 0.78 : 1,
                })}
              >
                <Icon name="plus" size={20} color={c.inverseInk} strokeWidth={2.4} />
              </Pressable>
            </Row>

            {modalidad === 'parejas' ? (
              <View style={{ marginTop: space.xxl }}>
                <Row style={{ justifyContent: 'space-between', alignItems: 'baseline' }}>
                  <Title style={{ fontSize: 20 }}>Parejas</Title>
                  <Row style={{ gap: space.sm }}>
                    <Button
                      label={cantReglas ? `Reglas · ${cantReglas}` : 'Reglas'}
                      size="sm"
                      variant="outline"
                      style={{ alignSelf: 'auto', paddingHorizontal: space.lg }}
                      onPress={() => setHoja('reglas')}
                    />
                    <Button label="Al azar" icon="barajar" size="sm" variant="outline" style={{ alignSelf: 'auto', paddingHorizontal: space.lg }} onPress={parejasAlAzar} />
                  </Row>
                </Row>
                <Label style={{ marginTop: space.xs }}>
                  Tocá a dos para juntarlos, o armalas al azar.{cantReglas ? ' El azar respeta las reglas.' : ' Con Reglas fijás quién va o no va junto.'}
                </Label>
                <View style={{ marginTop: space.md, gap: space.sm }}>
                  {parejasVivas.map(([a, b]) => (
                    <Row key={`${a}+${b}`} style={{ minHeight: 48, borderRadius: radius.field, backgroundColor: c.wash, paddingLeft: space.lg, paddingRight: 4 }}>
                      <Label color={c.ink} style={{ flex: 1, fontSize: 16 }} numberOfLines={1}>
                        {nombreDe.get(a)} y {nombreDe.get(b)}
                      </Label>
                      <Pressable
                        accessibilityRole="button"
                        accessibilityLabel="Separar pareja"
                        onPress={() => setParejas((ps) => ps.filter(([x, y]) => !(x === a && y === b)))}
                        style={{ width: touch, height: touch, alignItems: 'center', justifyContent: 'center' }}
                      >
                        <Icon name="close" size={14} color={c.muted} strokeWidth={2.4} />
                      </Pressable>
                    </Row>
                  ))}
                </View>
                <Row style={{ marginTop: space.md, flexWrap: 'wrap', gap: space.sm }}>
                  {sueltos.map((p) => (
                    <Chip key={p.id} label={p.name} active={elegido === p.id} onPress={() => tocarSuelto(p.id)} />
                  ))}
                </Row>
              </View>
            ) : null}

            {errorActual ? (
              <View style={{ marginTop: space.lg }}>
                <Notice text={errorActual} />
              </View>
            ) : null}
          </View>
        ) : null}

        {paso === 'bombos' ? (
          <View style={{ marginTop: space.lg }}>
            <Body color={c.muted}>
              Separá por nivel: el bombo 1 son los más fuertes.{' '}
              {conEquipos ? 'A cada bombo le toca un equipo de distinta calidad, así el mejor no se lleva el mejor equipo.' : ''}
              {tipo === 'grupos' ? ' En fase de grupos, el bombo 1 son las cabezas de serie.' : ''}
            </Body>
            <Row style={{ marginTop: space.xl, justifyContent: 'space-between' }}>
              <Title style={{ fontSize: 16 }}>Cantidad de bombos</Title>
              <Stepper value={bombos} min={1} max={Math.min(LIMITES.maxBombos, unidades.length)} onChange={(n) => { setCantBombos(n); setBomboDe({}); }} />
            </Row>

            <View style={{ marginTop: space.lg, gap: space.sm }}>
              {unidades.map((u, i) => {
                const b = bomboDeUnidad(u, i);
                return (
                  <Row key={u.id} style={{ minHeight: 52, gap: space.sm }}>
                    <View style={{ width: 10, alignSelf: 'stretch', borderRadius: 5, backgroundColor: COLOR_BOMBO[b] }} />
                    <Label color={c.ink} style={{ flex: 1, fontSize: 16 }} numberOfLines={1}>
                      {u.nombre}
                    </Label>
                    <Row style={{ gap: 6 }}>
                      {Array.from({ length: bombos }, (_, k) => (
                        <Pressable
                          key={k}
                          accessibilityRole="button"
                          accessibilityLabel={`${u.nombre} al bombo ${k + 1}`}
                          accessibilityState={{ selected: k === b }}
                          onPress={() => {
                            haptic.tap();
                            setBomboDe((m) => ({ ...Object.fromEntries(unidades.map((x, j) => [x.id, bomboDeUnidad(x, j)])), ...m, [u.id]: k }));
                          }}
                          style={{
                            width: 38,
                            height: 38,
                            borderRadius: 19,
                            borderWidth: border,
                            borderColor: k === b ? 'transparent' : c.line,
                            backgroundColor: k === b ? COLOR_BOMBO[k] : 'transparent',
                            alignItems: 'center',
                            justifyContent: 'center',
                          }}
                        >
                          <Label color={k === b ? palette.tinta : c.muted} style={{ fontFamily: fonts.bold, fontSize: 15 }}>
                            {k + 1}
                          </Label>
                        </Pressable>
                      ))}
                    </Row>
                  </Row>
                );
              })}
            </View>

            <Row style={{ marginTop: space.lg, flexWrap: 'wrap', gap: space.md }}>
              {porBombo.map((u, b) => (
                <Label key={b} style={{ fontVariant: ['tabular-nums'] }}>
                  Bombo {b + 1}: {u.length}
                </Label>
              ))}
            </Row>
            {errorActual ? (
              <View style={{ marginTop: space.lg }}>
                <Notice text={errorActual} tone="bad" />
              </View>
            ) : null}
          </View>
        ) : null}

        {paso === 'equipos' ? (
          <View style={{ marginTop: space.lg, gap: space.lg }}>
            <Segmented
              options={[
                { value: 'catalogo', label: 'Sortear por estrellas' },
                { value: 'manual', label: 'Cargar a mano' },
              ]}
              value={origen}
              onChange={setOrigen}
            />

            {origen === 'catalogo' ? (
              <>
                <Row style={{ justifyContent: 'space-between' }}>
                  <Label style={{ flex: 1 }}>
                    Datos {fc.catalogo.edicion} · {fc.catalogo.equipos.length} equipos
                    {fc.revisado ? ` · revisado ${new Date(fc.revisado).toLocaleDateString('es-AR')}` : ''}
                  </Label>
                  <Pressable accessibilityRole="button" onPress={fc.actualizar} disabled={fc.actualizando} hitSlop={8}>
                    <Label color={c.ink} style={{ textDecorationLine: 'underline' }}>
                      {fc.actualizando ? 'Actualizando…' : 'Actualizar'}
                    </Label>
                  </Pressable>
                </Row>
                <Segmented
                  options={[
                    { value: 'clubes', label: 'Clubes' },
                    { value: 'selecciones', label: 'Selecciones' },
                    { value: 'todos', label: 'Todos' },
                  ]}
                  value={filtro}
                  onChange={setFiltro}
                />
                {filtro !== 'selecciones' ? (
                  <Pressable
                    accessibilityRole="button"
                    accessibilityLabel="Elegir ligas"
                    onPress={() => {
                      haptic.tap();
                      setHoja('ligas');
                    }}
                    style={({ pressed }) => ({
                      minHeight: 56,
                      borderRadius: radius.field,
                      borderWidth: border,
                      borderColor: c.line,
                      paddingHorizontal: space.lg,
                      flexDirection: 'row',
                      alignItems: 'center',
                      gap: space.md,
                      opacity: pressed ? 0.7 : 1,
                    })}
                  >
                    <View style={{ flex: 1, gap: 2 }}>
                      <Title style={{ fontSize: 16 }}>Ligas</Title>
                      <Label numberOfLines={1}>
                        {!ligasVivas
                          ? 'Todas las ligas'
                          : ligasVivas.length === 1
                            ? ligasVivas[0]
                            : `${ligasVivas.length} ligas · ${catalogoFiltrado.length} equipos`}
                      </Label>
                    </View>
                    <Icon name="chevronRight" size={18} color={c.muted} />
                  </Pressable>
                ) : null}
                {porBombo.map((u, b) => {
                  const s = estrellas[b] ?? 3;
                  const hay = disponiblesPorEstrella.get(s) ?? 0;
                  return (
                    <View key={b} style={{ borderRadius: radius.card, backgroundColor: COLOR_BOMBO[b], padding: space.lg, gap: space.sm }}>
                      <Row style={{ justifyContent: 'space-between' }}>
                        <View style={{ gap: 2 }}>
                          <Title style={{ fontSize: 18 }} color={palette.tinta}>
                            Bombo {b + 1}
                          </Title>
                          <Label color={palette.tinta}>
                            {u.length} {u.length === 1 ? 'equipo' : 'equipos'} · {hay} disponibles
                          </Label>
                        </View>
                        <Stepper
                          value={s}
                          min={0.5}
                          max={5}
                          step={0.5}
                          size={38}
                          onColored
                          labelMinus="Media estrella menos"
                          labelPlus="Media estrella más"
                          onChange={(n) => setEstrellas((es) => es.map((x, i) => (i === b ? n : x)))}
                        />
                      </Row>
                      <Estrellas valor={s} size={18} color={palette.tinta} />
                      {hay < u.length ? (
                        <Label color={palette.tinta} style={{ fontSize: 13 }}>
                          No alcanzan: se completa con equipos de media estrella arriba o abajo.
                        </Label>
                      ) : null}
                    </View>
                  );
                })}
              </>
            ) : (
              <>
                <Body color={c.muted}>Cargá los equipos de cada bombo. El sorteo sólo decide quién se queda con cuál.</Body>
                {porBombo.map((u, b) => {
                  const lista = manuales[b] ?? [];
                  const texto = buscando?.bombo === b ? buscando.texto : '';
                  const sugerencias =
                    texto.trim().length >= 2
                      ? fc.catalogo.equipos.filter((e) => e.nombre.toLowerCase().includes(texto.trim().toLowerCase())).slice(0, 5)
                      : [];
                  return (
                    <View key={b} style={{ borderRadius: radius.card, borderWidth: border, borderColor: c.line, padding: space.lg, gap: space.md }}>
                      <Row style={{ justifyContent: 'space-between' }}>
                        <Row style={{ gap: space.sm }}>
                          <View style={{ width: 14, height: 14, borderRadius: 7, backgroundColor: COLOR_BOMBO[b] }} />
                          <Title style={{ fontSize: 18 }}>Bombo {b + 1}</Title>
                        </Row>
                        <Label style={{ fontVariant: ['tabular-nums'] }}>
                          {lista.length}/{u.length}
                        </Label>
                      </Row>
                      {lista.map((e) => (
                        <Row key={e.id} style={{ gap: space.md }}>
                          <Escudo nombre={e.nombre} size={30} />
                          <Label color={c.ink} style={{ flex: 1, fontSize: 16 }} numberOfLines={1}>
                            {e.nombre}
                          </Label>
                          <Pressable accessibilityRole="button" accessibilityLabel={`Quitar ${e.nombre}`} onPress={() => quitarManual(b, e.id)} hitSlop={8}>
                            <Icon name="close" size={14} color={c.muted} strokeWidth={2.4} />
                          </Pressable>
                        </Row>
                      ))}
                      {lista.length < u.length ? (
                        <>
                          <TextInput
                            value={texto}
                            onChangeText={(t) => setBuscando({ bombo: b, texto: t })}
                            onSubmitEditing={() => agregarManual(b, texto)}
                            placeholder="Nombre del equipo"
                            placeholderTextColor={c.hint}
                            returnKeyType="done"
                            maxLength={30}
                            style={{
                              fontFamily: fonts.medium,
                              fontSize: 16,
                              color: c.ink,
                              minHeight: 48,
                              borderRadius: radius.sm,
                              borderWidth: border,
                              borderColor: c.line,
                              paddingHorizontal: space.md,
                            }}
                          />
                          {sugerencias.map((e) => (
                            <Pressable
                              key={e.id}
                              accessibilityRole="button"
                              onPress={() => agregarManual(b, e.nombre, e.ovr, `fc-${e.id}`)}
                              style={({ pressed }) => ({ flexDirection: 'row', alignItems: 'center', gap: space.md, opacity: pressed ? 0.6 : 1 })}
                            >
                              <Escudo nombre={e.nombre} size={26} />
                              <Label color={c.ink} style={{ flex: 1 }} numberOfLines={1}>
                                {e.nombre}
                              </Label>
                              <Estrellas valor={estrellasDe(e.ovr, fc.umbrales)} size={12} />
                            </Pressable>
                          ))}
                        </>
                      ) : null}
                    </View>
                  );
                })}
                {errorActual ? <Notice text={errorActual} /> : null}
              </>
            )}
          </View>
        ) : null}

        {paso === 'formato' ? (
          <View style={{ marginTop: space.lg, gap: space.xl }}>
            <Segmented
              options={[
                { value: 'liga', label: 'Liga' },
                { value: 'grupos', label: 'Grupos' },
                { value: 'playoff', label: 'Playoff' },
              ]}
              value={tipo}
              onChange={setTipo}
            />
            <Body color={c.muted}>
              {tipo === 'liga'
                ? 'Todos contra todos. Gana el que suma más puntos.'
                : tipo === 'grupos'
                  ? 'Grupos con cabezas de serie (bombo 1) y los mejores de cada grupo pasan al playoff.'
                  : 'Eliminación directa. Si no son potencia de 2, los mejores del bombo 1 pasan directo.'}
            </Body>

            {tipo === 'grupos' ? (
              <>
                <Row style={{ justifyContent: 'space-between' }}>
                  <Title style={{ fontSize: 16 }}>Grupos</Title>
                  <Stepper value={cantGrupos} min={2} max={Math.max(2, Math.min(LIMITES.maxGrupos, Math.floor(unidades.length / 2)))} onChange={setCantGrupos} />
                </Row>
                <Row style={{ justifyContent: 'space-between' }}>
                  <Title style={{ fontSize: 16 }}>Clasifican por grupo</Title>
                  <Stepper value={clasifican} min={1} max={4} onChange={setClasifican} />
                </Row>
              </>
            ) : null}

            {tipo !== 'playoff' ? (
              <Row style={{ justifyContent: 'space-between', gap: space.lg }}>
                <Title style={{ fontSize: 16, flex: 1 }}>{tipo === 'liga' ? 'Ida y vuelta' : 'Grupos a ida y vuelta'}</Title>
                <Toggle value={idaVuelta} onChange={setIdaVuelta} label="Ida y vuelta" />
              </Row>
            ) : null}

            {tipo !== 'liga' ? (
              <>
                <Row style={{ justifyContent: 'space-between', gap: space.lg }}>
                  <View style={{ flex: 1, gap: 2 }}>
                    <Title style={{ fontSize: 16 }}>Playoff a ida y vuelta</Title>
                    <Label>Primero se juegan todas las idas y después todas las vueltas.</Label>
                  </View>
                  <Toggle value={playoffIdaVuelta} onChange={setPlayoffIdaVuelta} label="Playoff a ida y vuelta" />
                </Row>
                {playoffIdaVuelta ? (
                  <Row style={{ justifyContent: 'space-between', gap: space.lg }}>
                    <Title style={{ fontSize: 16, flex: 1 }}>Final a un solo partido</Title>
                    <Toggle value={finalUnica} onChange={setFinalUnica} label="Final a un solo partido" />
                  </Row>
                ) : null}
              </>
            ) : null}

            {errorFormato ? <Notice text={errorFormato} tone="bad" /> : <TotalPartidos total={conteo.total} detalle={conteo.detalle} />}
            <Label style={{ fontSize: 13 }}>
              Tabla: 3 puntos por ganar y 1 por empatar. Si hay igualdad, define la diferencia de gol, después el que recibió menos y,
              si siguen iguales, un sorteo o un partido desempate. En el playoff, si el global queda igual, penales.
            </Label>
          </View>
        ) : null}

        <View style={{ height: space.huge }} />
      </Screen>

      <Hoja
        visible={hoja === 'ligas'}
        onCerrar={() => setHoja(null)}
        titulo="Ligas"
        mensaje={filtro === 'todos' ? 'Las selecciones entran igual: esto sólo recorta los clubes.' : 'De qué ligas salen los clubes del sorteo.'}
      >
        <HojaLigas ligas={ligasCatalogo} elegidas={ligasVivas} onChange={setLigas} />
        <Button label="Listo" onPress={() => setHoja(null)} />
      </Hoja>

      <Hoja
        visible={hoja === 'reglas'}
        onCerrar={() => setHoja(null)}
        titulo="Reglas de parejas"
        mensaje="El sorteo al azar las respeta."
      >
        <HojaReglas personas={activos} reglas={reglasVivas} onChange={setReglas} />
        <Button
          label="Sortear parejas"
          icon="barajar"
          onPress={() => {
            setHoja(null);
            parejasAlAzar();
          }}
        />
      </Hoja>
    </View>
  );
}

/* ───────────── Hoja: ligas ───────────── */

function HojaLigas({
  ligas,
  elegidas,
  onChange,
}: {
  ligas: { liga: string; equipos: number }[];
  elegidas: string[] | null;
  onChange: (l: string[] | null) => void;
}) {
  const { c } = useTheme();
  const set = new Set(elegidas ?? []);
  const alternar = (l: string) => {
    const nuevo = new Set(set);
    if (nuevo.has(l)) nuevo.delete(l);
    else nuevo.add(l);
    // Todas marcadas o ninguna = sin filtro.
    onChange(nuevo.size === 0 || nuevo.size === ligas.length ? null : [...nuevo]);
  };
  return (
    <View style={{ gap: space.md }}>
      <Row style={{ gap: space.sm }}>
        <Chip label="Todas" active={!elegidas} onPress={() => onChange(null)} />
        <Label style={{ flex: 1, textAlign: 'right' }}>
          {elegidas ? `${elegidas.length} de ${ligas.length}` : `${ligas.length} ligas`}
        </Label>
      </Row>
      <ScrollView style={{ maxHeight: 360 }} contentContainerStyle={{ flexDirection: 'row', flexWrap: 'wrap', gap: space.sm }}>
        {ligas.map(({ liga, equipos }) => (
          <Chip key={liga} label={`${liga} · ${equipos}`} active={set.has(liga)} onPress={() => alternar(liga)} />
        ))}
      </ScrollView>
      {!elegidas ? <Label color={c.muted}>Tocá una o más para limitar el sorteo.</Label> : null}
    </View>
  );
}

/* ───────────── Hoja: reglas de parejas ───────────── */

type TipoRegla = 'fijas' | 'prohibidas' | 'cabezas';

function HojaReglas({
  personas,
  reglas,
  onChange,
}: {
  personas: Persona[];
  reglas: ReglasParejas;
  onChange: (r: ReglasParejas) => void;
}) {
  const { c } = useTheme();
  const [tipo, setTipo] = useState<TipoRegla>('fijas');
  const [primero, setPrimero] = useState<string | null>(null);
  const nombre = (id: string) => personas.find((p) => p.id === id)?.name ?? '—';
  const enFija = new Set(reglas.fijas.flat());

  const tocar = (id: string) => {
    if (tipo === 'cabezas') {
      const ya = reglas.cabezas.includes(id);
      onChange({ ...reglas, cabezas: ya ? reglas.cabezas.filter((x) => x !== id) : [...reglas.cabezas, id] });
      return;
    }
    if (!primero) return setPrimero(id);
    if (primero === id) return setPrimero(null);
    const par: [string, string] = [primero, id];
    const igual = ([a, b]: [string, string]) => (a === par[0] && b === par[1]) || (a === par[1] && b === par[0]);
    // Un par no puede estar a la vez en "juntos" y "separados".
    const fijas = reglas.fijas.filter((p) => !igual(p));
    const prohibidas = reglas.prohibidas.filter((p) => !igual(p));
    if (tipo === 'fijas') {
      // Cada uno puede tener una sola pareja fija.
      onChange({ ...reglas, prohibidas, fijas: [...fijas.filter(([a, b]) => !par.includes(a) && !par.includes(b)), par] });
    } else {
      onChange({ ...reglas, fijas, prohibidas: [...prohibidas, par] });
    }
    haptic.success();
    setPrimero(null);
  };

  const pares = tipo === 'fijas' ? reglas.fijas : reglas.prohibidas;
  const quitar = (i: number) =>
    onChange(tipo === 'fijas' ? { ...reglas, fijas: reglas.fijas.filter((_, j) => j !== i) } : { ...reglas, prohibidas: reglas.prohibidas.filter((_, j) => j !== i) });

  const ayuda: Record<TipoRegla, string> = {
    fijas: 'Tocá a dos que tienen que ir juntos.',
    prohibidas: 'Tocá a dos que no pueden ir juntos.',
    cabezas: 'Marcá a los fuertes: cada pareja va a tener uno.',
  };

  return (
    <View style={{ gap: space.md }}>
      <Segmented
        options={[
          { value: 'fijas' as TipoRegla, label: `Juntos${reglas.fijas.length ? ` ${reglas.fijas.length}` : ''}` },
          { value: 'prohibidas' as TipoRegla, label: `Separados${reglas.prohibidas.length ? ` ${reglas.prohibidas.length}` : ''}` },
          { value: 'cabezas' as TipoRegla, label: `Nivel${reglas.cabezas.length ? ` ${reglas.cabezas.length}` : ''}` },
        ]}
        value={tipo}
        onChange={(t) => {
          setTipo(t);
          setPrimero(null);
        }}
      />
      <Label>{ayuda[tipo]}</Label>

      {tipo !== 'cabezas' && pares.length > 0 ? (
        <View style={{ gap: space.xs }}>
          {pares.map(([a, b], i) => (
            <Row key={`${a}+${b}`} style={{ minHeight: 44, borderRadius: radius.field, backgroundColor: c.wash, paddingLeft: space.lg, paddingRight: 4 }}>
              <Icon name={tipo === 'fijas' ? 'check' : 'close'} size={14} color={tipo === 'fijas' ? c.ok : c.bad} strokeWidth={2.4} />
              <Label color={c.ink} style={{ flex: 1, fontSize: 15, marginLeft: space.sm }} numberOfLines={1}>
                {nombre(a)} {tipo === 'fijas' ? 'con' : 'no con'} {nombre(b)}
              </Label>
              <Pressable
                accessibilityRole="button"
                accessibilityLabel="Quitar regla"
                onPress={() => quitar(i)}
                style={{ width: touch, height: touch, alignItems: 'center', justifyContent: 'center' }}
              >
                <Icon name="close" size={14} color={c.muted} strokeWidth={2.4} />
              </Pressable>
            </Row>
          ))}
        </View>
      ) : null}

      <ScrollView style={{ maxHeight: 240 }} contentContainerStyle={{ flexDirection: 'row', flexWrap: 'wrap', gap: space.sm }}>
        {personas.map((p) => {
          const activo = tipo === 'cabezas' ? reglas.cabezas.includes(p.id) : primero === p.id;
          const ocupado = tipo === 'fijas' && enFija.has(p.id) && primero !== p.id;
          return (
            <Chip
              key={p.id}
              label={ocupado ? `${p.name} ✓` : tipo === 'cabezas' && activo ? `★ ${p.name}` : p.name}
              active={activo}
              onPress={() => tocar(p.id)}
            />
          );
        })}
      </ScrollView>
    </View>
  );
}
