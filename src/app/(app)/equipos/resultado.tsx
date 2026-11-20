import { router } from 'expo-router';
import { Pressable, Share, View } from 'react-native';

import { Clay } from '@/components/clay';
import { Icon } from '@/components/icons';
import { useOverlay } from '@/components/overlay';
import { Body, Button, Display, Label, Row, Screen } from '@/components/ui';
import { armar, choca, type Persona } from '@/features/equipos/rules';
import { haptic } from '@/lib/haptics';
import { useEquipos } from '@/store/equipos';
import { onPlayerColor, palette, radius, space } from '@/theme/tokens';
import { useTheme } from '@/theme/use-theme';

const COLORES = [palette.mostaza, palette.salvia, palette.rosa, palette.tomate, palette.crema, palette.azul];

const nombreEquipo = (i: number) => `Equipo ${i + 1}`;

export default function ResultadoEquipos() {
  const { c } = useTheme();
  const overlay = useOverlay();
  const equipos = useEquipos((s) => s.equipos);
  const desbalanceado = useEquipos((s) => s.desbalanceado);
  const gente = useEquipos((s) => s.gente);
  const restricciones = useEquipos((s) => s.restricciones);
  const cantidad = useEquipos((s) => s.cantidad);
  const { setEquipos, mover } = useEquipos.getState();

  if (!equipos) {
    return (
      <Screen title="Equipos">
        <Body color={c.muted} style={{ marginTop: space.lg }}>
          No hay equipos armados. Volvé y tocá «Generar equipos».
        </Body>
      </Screen>
    );
  }

  function mezclar() {
    const r = armar(gente, restricciones, cantidad);
    if (r.ok) {
      haptic.success();
      setEquipos(r.equipos, r.desbalanceado);
    } else {
      haptic.warning();
      overlay.notice({ title: 'No se pudo rearmar', message: r.detalle });
    }
  }

  async function tocar(persona: Persona, desde: number) {
    const otros = equipos!.map((_, i) => i).filter((i) => i !== desde);
    const destino =
      otros.length === 1
        ? otros[0]
        : await overlay.pick<number>(
            `Mover a ${persona.name}`,
            otros.map((i) => ({ label: nombreEquipo(i), value: i })),
          );
    if (destino === null) return;

    const conflictos = choca(persona, equipos![destino], restricciones);
    if (conflictos.length > 0) {
      const ok = await overlay.confirm({
        title: `${persona.name} no puede estar con ${conflictos.map((p) => p.name).join(' ni ')}`,
        message: `Si lo movés a ${nombreEquipo(destino)} se rompe una restricción que pusiste.`,
        confirmLabel: 'Moverlo igual',
        destructive: true,
      });
      if (!ok) return;
    }
    haptic.tap();
    mover(persona.id, destino);
  }

  async function compartir() {
    const texto = equipos!
      .map((eq, i) => `${nombreEquipo(i)}: ${eq.map((p) => p.name).join(', ')}`)
      .join('\n');
    await Share.share({ message: texto }).catch(() => {});
  }

  const total = equipos.flat().length;
  // Lo que se muestra es lo que hay ahora, no lo que armó el generador: si
  // alguien movió gente a mano, las restricciones pueden haber quedado rotas.
  const rotas = restricciones.filter((r) =>
    equipos.some((eq) => eq.some((p) => p.id === r.a) && eq.some((p) => p.id === r.b)),
  );

  return (
    <Screen
      title="Equipos listos"
      meta={`${total} participantes · ${equipos.length} equipos`}
      right={
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Compartir los equipos"
          onPress={compartir}
          style={({ pressed }) => ({
            height: 44,
            paddingHorizontal: space.lg,
            borderRadius: radius.pill,
            borderWidth: 1.5,
            borderColor: c.lineStrong,
            justifyContent: 'center',
            opacity: pressed ? 0.7 : 1,
          })}
        >
          <Label color={c.ink} style={{ fontSize: 15 }}>
            Compartir
          </Label>
        </Pressable>
      }
      footer={
        <Row style={{ gap: space.md }}>
          <Button label="Mezclar de nuevo" icon="barajar" variant="outline" style={{ flex: 1 }} onPress={mezclar} />
          {equipos.length === 2 ? (
            <Button
              label="Usar en Truco"
              style={{ flex: 1 }}
              onPress={() =>
                router.push(
                  `/truco/nueva?e1=${encodeURIComponent(nombreEquipo(0))}&e2=${encodeURIComponent(nombreEquipo(1))}`,
                )
              }
            />
          ) : null}
        </Row>
      }
    >
      {/* Estado de las restricciones */}
      {restricciones.length > 0 ? (
        <Row style={{ marginTop: space.md, gap: 6 }}>
          <Icon name={rotas.length ? 'close' : 'check'} size={16} color={rotas.length ? c.bad : c.ok} strokeWidth={2.8} />
          <Label color={rotas.length ? c.bad : c.ok} style={{ flex: 1 }}>
            {rotas.length
              ? `Quedó ${rotas.length === 1 ? 'una restricción rota' : `${rotas.length} restricciones rotas`} porque moviste gente a mano`
              : `Se ${restricciones.length === 1 ? 'respetó la restricción' : `respetaron las ${restricciones.length} restricciones`}`}
          </Label>
        </Row>
      ) : null}

      {desbalanceado ? (
        <Body color={c.muted} style={{ marginTop: space.sm, fontSize: 14 }}>
          Con esas restricciones no se podían armar parejos, así que quedaron de distinto tamaño.
        </Body>
      ) : null}

      {/* Equipos */}
      <View style={{ marginTop: space.xl, gap: space.lg }}>
        {equipos.map((eq, i) => (
          <View
            key={i}
            style={{ borderRadius: 26, backgroundColor: COLORES[i % COLORES.length], padding: space.lg, overflow: 'hidden' }}
          >
            {i === 0 ? (
              <Clay name="corona" size={52} style={{ position: 'absolute', right: space.md, top: space.md }} />
            ) : null}
            <Row style={{ gap: space.sm, alignItems: 'baseline', paddingRight: i === 0 ? 70 : 0 }}>
              <Display style={{ fontSize: 24, lineHeight: 29 }} color={onPlayerColor} numberOfLines={1}>
                {nombreEquipo(i)}
              </Display>
              <Label color={onPlayerColor} style={{ fontVariant: ['tabular-nums'] }}>
                {eq.length}
              </Label>
            </Row>

            <Row style={{ marginTop: space.md, flexWrap: 'wrap', gap: space.sm }}>
              {eq.map((p) => (
                <Pressable
                  key={p.id}
                  accessibilityRole="button"
                  accessibilityLabel={`Mover a ${p.name} a otro equipo`}
                  onPress={() => tocar(p, i)}
                  style={({ pressed }) => ({
                    minHeight: 44,
                    borderRadius: radius.pill,
                    backgroundColor: palette.marfil,
                    flexDirection: 'row',
                    alignItems: 'center',
                    gap: space.sm,
                    paddingLeft: 6,
                    paddingRight: space.md,
                    opacity: pressed ? 0.7 : 1,
                  })}
                >
                  <View
                    style={{
                      width: 32,
                      height: 32,
                      borderRadius: 16,
                      borderWidth: 1.5,
                      borderColor: palette.tinta,
                      alignItems: 'center',
                      justifyContent: 'center',
                    }}
                  >
                    <Label color={palette.tinta} style={{ fontSize: 14 }}>
                      {p.name.slice(0, 1).toUpperCase()}
                    </Label>
                  </View>
                  <Label color={palette.tinta} style={{ fontSize: 16 }}>
                    {p.name}
                  </Label>
                </Pressable>
              ))}
              {eq.length === 0 ? (
                <Label color={onPlayerColor} style={{ paddingVertical: space.sm }}>
                  Vacío
                </Label>
              ) : null}
            </Row>
          </View>
        ))}
      </View>

      <Body color={c.muted} style={{ marginTop: space.md, fontSize: 13, lineHeight: 18 }}>
        Tocá un nombre para pasarlo a otro equipo. Si rompe una restricción, te avisamos antes de moverlo.
      </Body>

      <View style={{ height: space.huge }} />
    </Screen>
  );
}
