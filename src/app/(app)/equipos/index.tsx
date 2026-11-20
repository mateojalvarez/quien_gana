import { router } from 'expo-router';
import { useMemo, useState } from 'react';
import { Pressable, TextInput, View } from 'react-native';

import { Clay } from '@/components/clay';
import { Icon } from '@/components/icons';
import { Notice, useOverlay } from '@/components/overlay';
import { Body, Button, Label, Row, Screen, Title } from '@/components/ui';
import { armar, LIMITES, tamanos, type Persona } from '@/features/equipos/rules';
import { haptic } from '@/lib/haptics';
import { groupById, playerNames, useGrupos } from '@/store/grupos';
import { useEquipos } from '@/store/equipos';
import { border, fonts, palette, radius, space, touch } from '@/theme/tokens';
import { useTheme } from '@/theme/use-theme';

export default function ArmarEquipos() {
  const { c } = useTheme();
  const overlay = useOverlay();

  const gente = useEquipos((s) => s.gente);
  const restricciones = useEquipos((s) => s.restricciones);
  const cantidad = useEquipos((s) => s.cantidad);
  const { agregar, agregarVarios, quitar, setCantidad, agregarRestriccion, quitarRestriccion, setEquipos } =
    useEquipos.getState();

  const activeId = useGrupos((s) => s.activeId);
  const grupos = useGrupos((s) => s.groups);
  const locals = useGrupos((s) => s.locals);
  const grupo = groupById(grupos, activeId);

  const [nombre, setNombre] = useState('');
  const [aviso, setAviso] = useState<string | null>(null);

  const porEquipo = useMemo(() => {
    if (gente.length < cantidad) return null;
    const t = tamanos(gente.length, cantidad);
    return t[0] === t[t.length - 1] ? `${t[0]} por equipo` : `${t[t.length - 1]} o ${t[0]} por equipo`;
  }, [gente.length, cantidad]);

  const nombrePorId = useMemo(() => new Map(gente.map((p) => [p.id, p.name])), [gente]);

  function sumar() {
    if (!nombre.trim()) return;
    haptic.tap();
    agregar(nombre);
    setNombre('');
    setAviso(null);
  }

  async function nuevaRestriccion() {
    if (gente.length < 2) return;
    const elegir = (titulo: string, entre: Persona[]) =>
      overlay.pick<Persona>(titulo, entre.map((p) => ({ label: p.name, value: p })));

    const a = await elegir('¿Quién?', gente);
    if (!a) return;
    const yaCon = new Set(
      restricciones.filter((r) => r.a === a.id || r.b === a.id).map((r) => (r.a === a.id ? r.b : r.a)),
    );
    const posibles = gente.filter((p) => p.id !== a.id && !yaCon.has(p.id));
    if (posibles.length === 0) {
      await overlay.notice({ title: `${a.name} ya no puede estar con nadie más`, message: 'Ya tiene una restricción con cada uno.' });
      return;
    }
    const b = await elegir(`${a.name} no puede estar con…`, posibles);
    if (!b) return;
    haptic.light();
    agregarRestriccion(a.id, b.id);
    setAviso(null);
  }

  async function generar() {
    const r = armar(gente, restricciones, cantidad);
    if (r.ok) {
      haptic.success();
      setAviso(null);
      setEquipos(r.equipos, r.desbalanceado);
      router.push('/equipos/resultado');
      return;
    }
    // No se "sigue intentando": la búsqueda ya recorrió todo y no hay.
    // El aviso va en hoja Y abajo: el botón está al pie, y un cartel al final
    // de la pantalla puede quedar fuera de vista justo cuando más importa.
    haptic.warning();
    setAviso(r.detalle);
    await overlay.notice({
      title: r.motivo === 'imposible' ? 'Así no se puede' : 'No lo pude resolver',
      message: r.detalle,
      okLabel: 'Cambiar algo',
    });
  }

  const puedeArmar = gente.length >= Math.max(2, cantidad);

  return (
    <Screen
      title="Equipos"
      meta="Generador"
      decor={
        <View style={{ position: 'absolute', right: -4, top: 8 }} pointerEvents="none">
          <Clay name="esferas" size={112} />
        </View>
      }
      footer={
        <Button
          label="Generar equipos"
          trailingIcon="arrowRight"
          disabled={!puedeArmar}
          meta={puedeArmar ? undefined : `Mínimo ${Math.max(2, cantidad)}`}
          onPress={generar}
        />
      }
    >
      {/* Agregar participantes */}
      <Row style={{ marginTop: space.xxl, gap: space.sm }}>
        <Row
          style={{
            flex: 1,
            minHeight: 54,
            borderRadius: radius.field,
            borderWidth: border,
            borderColor: c.lineStrong,
            paddingHorizontal: space.lg,
          }}
        >
          <TextInput
            value={nombre}
            onChangeText={setNombre}
            onSubmitEditing={sumar}
            placeholder="Agregar nombre"
            placeholderTextColor={c.hint}
            accessibilityLabel="Nombre del participante"
            returnKeyType="next"
            // el teclado NO se cierra al agregar: cargar ocho nombres seguidos
            // es el caso normal de esta pantalla
            submitBehavior="submit"
            autoCapitalize="words"
            maxLength={20}
            style={{ flex: 1, fontFamily: fonts.medium, fontSize: 16, color: c.ink, paddingVertical: space.md }}
          />
        </Row>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Agregar participante"
          accessibilityState={{ disabled: !nombre.trim() }}
          disabled={!nombre.trim()}
          onPress={sumar}
          style={({ pressed }) => ({
            width: 54,
            height: 54,
            borderRadius: 27,
            backgroundColor: c.inverseBg,
            alignItems: 'center',
            justifyContent: 'center',
            opacity: !nombre.trim() ? 0.35 : pressed ? 0.78 : 1,
          })}
        >
          <Icon name="plus" size={20} color={c.inverseInk} strokeWidth={2.4} />
        </Pressable>
      </Row>

      {grupo && playerNames(grupo, locals[grupo.id] ?? []).length > 0 ? (
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={`Traer los integrantes de ${grupo.name}`}
          onPress={() => {
            haptic.tap();
            agregarVarios(playerNames(grupo, locals[grupo.id] ?? []));
          }}
          style={({ pressed }) => ({ marginTop: space.md, alignSelf: 'flex-start', opacity: pressed ? 0.6 : 1 })}
        >
          <Row style={{ gap: 6 }}>
            <Icon name="users" size={16} color={c.ink} />
            <Label color={c.ink} style={{ textDecorationLine: 'underline' }}>
              Traer los de {grupo.name}
            </Label>
          </Row>
        </Pressable>
      ) : null}

      {/* Participantes */}
      <Row style={{ marginTop: space.xl, justifyContent: 'space-between', alignItems: 'baseline' }}>
        <Title style={{ fontSize: 20 }}>Participantes</Title>
        <Label style={{ fontVariant: ['tabular-nums'] }}>{gente.length}</Label>
      </Row>

      {gente.length === 0 ? (
        <Body color={c.muted} style={{ marginTop: space.sm }}>
          Cargá a los que van a jugar y después elegí en cuántos equipos repartirlos.
        </Body>
      ) : (
        <Row style={{ marginTop: space.md, flexWrap: 'wrap', gap: space.sm }}>
          {gente.map((p) => (
            <Row
              key={p.id}
              style={{
                height: 40,
                borderRadius: radius.pill,
                borderWidth: border,
                borderColor: c.lineStrong,
                paddingLeft: space.md + 2,
                paddingRight: 4,
                gap: 2,
              }}
            >
              <Label color={c.ink} style={{ fontSize: 15 }}>
                {p.name}
              </Label>
              <Pressable
                accessibilityRole="button"
                accessibilityLabel={`Quitar a ${p.name}`}
                hitSlop={6}
                onPress={() => {
                  haptic.light();
                  quitar(p.id);
                  setAviso(null);
                }}
                style={({ pressed }) => ({ width: 32, height: 32, alignItems: 'center', justifyContent: 'center', opacity: pressed ? 0.5 : 1 })}
              >
                <Icon name="close" size={14} color={c.muted} strokeWidth={2.4} />
              </Pressable>
            </Row>
          ))}
        </Row>
      )}

      {/* Cantidad de equipos */}
      <Row style={{ marginTop: space.xl, justifyContent: 'space-between', minHeight: touch + 8, gap: space.lg }}>
        <View style={{ flex: 1, gap: 2 }}>
          <Title style={{ fontSize: 16 }}>Cantidad de equipos</Title>
          <Label>{porEquipo ?? 'Falta gente'}</Label>
        </View>
        <Row style={{ gap: space.md }}>
          <Redondo
            icon="minus"
            label="Un equipo menos"
            disabled={cantidad <= LIMITES.minEquipos}
            onPress={() => setCantidad(cantidad - 1)}
          />
          <Label color={c.ink} style={{ minWidth: 30, textAlign: 'center', fontFamily: fonts.black, fontSize: 26, lineHeight: 32 }}>
            {cantidad}
          </Label>
          <Redondo
            icon="plus"
            label="Un equipo más"
            relleno
            disabled={cantidad >= LIMITES.maxEquipos}
            onPress={() => setCantidad(cantidad + 1)}
          />
        </Row>
      </Row>

      {/* Restricciones */}
      <Row style={{ marginTop: space.xl, justifyContent: 'space-between', alignItems: 'baseline' }}>
        <Title style={{ fontSize: 20 }}>No pueden estar juntos</Title>
        <Label style={{ fontVariant: ['tabular-nums'] }}>{restricciones.length}</Label>
      </Row>

      <View style={{ marginTop: space.md, gap: space.sm }}>
        {restricciones.map((r) => (
          <Row
            key={`${r.a}-${r.b}`}
            style={{
              minHeight: 56,
              borderRadius: radius.field,
              backgroundColor: palette.rosa,
              paddingLeft: 10,
              paddingRight: 6,
              gap: space.sm,
            }}
          >
            <Ficha nombre={nombrePorId.get(r.a) ?? '—'} />
            <Icon name="noJuntos" size={22} color={palette.tinta} strokeWidth={2.4} />
            <Ficha nombre={nombrePorId.get(r.b) ?? '—'} />
            <View style={{ flex: 1 }} />
            <Pressable
              accessibilityRole="button"
              accessibilityLabel={`Quitar la restricción entre ${nombrePorId.get(r.a)} y ${nombrePorId.get(r.b)}`}
              onPress={() => {
                haptic.light();
                quitarRestriccion(r.a, r.b);
                setAviso(null);
              }}
              style={({ pressed }) => ({ width: 44, height: 44, alignItems: 'center', justifyContent: 'center', opacity: pressed ? 0.5 : 1 })}
            >
              <Icon name="close" size={16} color={palette.tinta} strokeWidth={2.4} />
            </Pressable>
          </Row>
        ))}

        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Agregar restricción"
          accessibilityState={{ disabled: gente.length < 2 }}
          disabled={gente.length < 2}
          onPress={nuevaRestriccion}
          style={({ pressed }) => ({
            minHeight: 52,
            borderRadius: radius.field,
            borderWidth: border,
            borderStyle: 'dashed',
            borderColor: c.muted,
            alignItems: 'center',
            justifyContent: 'center',
            opacity: gente.length < 2 ? 0.4 : pressed ? 0.6 : 1,
          })}
        >
          <Label color={c.ink} style={{ fontSize: 16 }}>
            + Agregar restricción
          </Label>
        </Pressable>
      </View>

      {aviso ? (
        <View style={{ marginTop: space.lg }}>
          <Notice text={aviso} tone="bad" />
        </View>
      ) : null}

      <View style={{ height: space.huge }} />
    </Screen>
  );
}

function Ficha({ nombre }: { nombre: string }) {
  return (
    <View style={{ height: 36, paddingHorizontal: 14, borderRadius: radius.pill, backgroundColor: palette.marfil, justifyContent: 'center' }}>
      <Label color={palette.tinta} style={{ fontSize: 15 }} numberOfLines={1}>
        {nombre}
      </Label>
    </View>
  );
}

function Redondo({
  icon,
  label,
  relleno,
  disabled,
  onPress,
}: {
  icon: 'plus' | 'minus';
  label: string;
  relleno?: boolean;
  disabled?: boolean;
  onPress: () => void;
}) {
  const { c } = useTheme();
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityState={{ disabled: !!disabled }}
      disabled={disabled}
      onPress={() => {
        haptic.tap();
        onPress();
      }}
      style={({ pressed }) => ({
        width: 44,
        height: 44,
        borderRadius: 22,
        borderWidth: relleno ? 0 : border,
        borderColor: c.lineStrong,
        backgroundColor: relleno ? c.inverseBg : 'transparent',
        alignItems: 'center',
        justifyContent: 'center',
        opacity: disabled ? 0.3 : pressed ? 0.7 : 1,
      })}
    >
      <Icon name={icon} size={18} color={relleno ? c.inverseInk : c.ink} strokeWidth={2.4} />
    </Pressable>
  );
}
