import { useRef, useState } from 'react';
import { Pressable, TextInput, View } from 'react-native';

import { Clay } from '@/components/clay';
import { Icon } from '@/components/icons';
import { useOverlay } from '@/components/overlay';
import { Rueda, type Tirada } from '@/components/rueda';
import { Body, Button, Label, Row, Screen, Swatch, Title } from '@/components/ui';
import { anguloDestino, LIMITES, sortear, type Premio } from '@/features/ruleta/rules';
import { haptic } from '@/lib/haptics';
import { useRuleta } from '@/store/ruleta';
import { border, fonts, playerColor, radius, space } from '@/theme/tokens';
import { useTheme } from '@/theme/use-theme';

export default function Ruleta() {
  const { c } = useTheme();
  const overlay = useOverlay();

  const premios = useRuleta((s) => s.premios);
  const sacados = useRuleta((s) => s.sacados);
  const { agregar, quitar, sacar, devolver, limpiar, setAngulo } = useRuleta.getState();

  const [nombre, setNombre] = useState('');
  const [tirada, setTirada] = useState<Tirada | null>(null);
  const [girando, setGirando] = useState(false);
  // Sobrevive al re-render sin provocarlo: sólo lo lee la tirada siguiente.
  const vuelta = useRef(0);

  const lleno = premios.length >= LIMITES.maxPremios;
  const puedeGirar = premios.length >= LIMITES.minPremios && !girando;

  function sumar() {
    const limpio = nombre.trim();
    if (!limpio || lleno) return;
    haptic.tap();
    agregar(limpio);
    setNombre('');
  }

  function girar() {
    if (!puedeGirar) return;
    haptic.tap();
    const ganador = sortear(premios.length);
    const actual = useRuleta.getState().angulo;
    const angulo = anguloDestino(ganador, premios.length, actual);
    vuelta.current += 1;
    setAngulo(angulo);
    setGirando(true);
    setTirada({ angulo, ganador, n: vuelta.current });
  }

  async function frenó(indice: number) {
    setGirando(false);
    // La lista pudo cambiar mientras giraba: se vuelve a leer, no se confía.
    const premio: Premio | undefined = useRuleta.getState().premios[indice];
    if (!premio) return;
    haptic.success();

    const que = await overlay.pick<'sacar' | 'otra'>(
      premio.name,
      [
        { label: 'Sacarlo de la ruleta', value: 'sacar' },
        { label: 'Girar de nuevo', value: 'otra' },
      ],
      premios.length > 1 ? `Quedan ${premios.length} premios en la rueda.` : undefined,
    );

    if (que === 'sacar') {
      haptic.light();
      sacar(premio.id);
    } else if (que === 'otra') {
      girar();
    }
  }

  async function vaciar() {
    const ok = await overlay.confirm({
      title: '¿Vaciar la ruleta?',
      message: 'Se borran los premios cargados y los que ya salieron.',
      confirmLabel: 'Vaciar',
    });
    if (ok) {
      haptic.warning();
      limpiar();
      setTirada(null);
    }
  }

  return (
    <Screen
      title="Ruleta"
      meta="Premios"
      decor={
        <View style={{ position: 'absolute', right: -4, top: 8 }} pointerEvents="none">
          <Clay name="destello" size={112} />
        </View>
      }
      footer={
        <Button
          label={girando ? 'Girando…' : 'Girar'}
          disabled={!puedeGirar}
          meta={premios.length < LIMITES.minPremios ? `Mínimo ${LIMITES.minPremios} premios` : undefined}
          onPress={girar}
        />
      }
    >
      {/* Agregar premios */}
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
            placeholder="Agregar premio"
            placeholderTextColor={c.muted}
            accessibilityLabel="Nombre del premio"
            returnKeyType="next"
            // El teclado no se cierra al agregar: cargar diez premios seguidos
            // es el caso normal de esta pantalla.
            submitBehavior="submit"
            autoCapitalize="sentences"
            maxLength={28}
            editable={!lleno}
            style={{ flex: 1, fontFamily: fonts.medium, fontSize: 16, color: c.ink, paddingVertical: space.md }}
          />
        </Row>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Agregar premio"
          accessibilityState={{ disabled: !nombre.trim() || lleno }}
          disabled={!nombre.trim() || lleno}
          onPress={sumar}
          style={({ pressed }) => ({
            width: 54,
            height: 54,
            borderRadius: 27,
            backgroundColor: c.inverseBg,
            alignItems: 'center',
            justifyContent: 'center',
            opacity: !nombre.trim() || lleno ? 0.35 : pressed ? 0.78 : 1,
          })}
        >
          <Icon name="plus" size={20} color={c.inverseInk} strokeWidth={2.4} />
        </Pressable>
      </Row>

      {lleno ? (
        <Label color={c.muted} style={{ marginTop: space.sm }}>
          Hasta {LIMITES.maxPremios} premios: más arriba de eso no se leen en la rueda.
        </Label>
      ) : null}

      {/* La rueda */}
      <View style={{ alignItems: 'center', marginTop: space.xl, minHeight: 300, justifyContent: 'center' }}>
        {premios.length === 0 ? (
          <View style={{ alignItems: 'center', gap: space.md, paddingVertical: space.xxl }}>
            <Clay name="asteriscoTomate" size={88} />
            <Body color={c.muted} style={{ textAlign: 'center' }}>
              Cargá los premios de a uno y la rueda se arma sola.
            </Body>
          </View>
        ) : (
          <Rueda premios={premios} tirada={tirada} onFin={frenó} />
        )}
      </View>

      {premios.length === 1 ? (
        <Body color={c.muted} style={{ marginTop: space.md, textAlign: 'center' }}>
          Queda uno solo: agregá otro para que haya algo que sortear.
        </Body>
      ) : null}

      {/* En la rueda */}
      {premios.length > 0 ? (
        <>
          <Row style={{ marginTop: space.xl, justifyContent: 'space-between', alignItems: 'baseline' }}>
            <Title style={{ fontSize: 20 }}>En la rueda</Title>
            <Label style={{ fontVariant: ['tabular-nums'] }}>{premios.length}</Label>
          </Row>
          <View style={{ marginTop: space.md, gap: space.sm }}>
            {premios.map((p, i) => (
              <Row key={p.id} style={{ gap: space.md, minHeight: 40 }}>
                <Swatch color={playerColor(i)} />
                <Label color={c.ink} style={{ flex: 1, fontSize: 15 }} numberOfLines={1}>
                  {p.name}
                </Label>
                <Pressable
                  accessibilityRole="button"
                  accessibilityLabel={`Quitar ${p.name}`}
                  hitSlop={6}
                  disabled={girando}
                  onPress={() => {
                    haptic.light();
                    quitar(p.id);
                  }}
                  style={({ pressed }) => ({
                    width: 36,
                    height: 36,
                    alignItems: 'center',
                    justifyContent: 'center',
                    opacity: girando ? 0.3 : pressed ? 0.5 : 1,
                  })}
                >
                  <Icon name="close" size={16} color={c.muted} strokeWidth={2.4} />
                </Pressable>
              </Row>
            ))}
          </View>
        </>
      ) : null}

      {/* Ya salieron */}
      {sacados.length > 0 ? (
        <>
          <Row style={{ marginTop: space.xl, justifyContent: 'space-between', alignItems: 'baseline' }}>
            <Title style={{ fontSize: 20 }}>Ya salieron</Title>
            <Label style={{ fontVariant: ['tabular-nums'] }}>{sacados.length}</Label>
          </Row>
          <View style={{ marginTop: space.md, gap: space.sm }}>
            {sacados.map((p) => (
              <Row key={p.id} style={{ gap: space.md, minHeight: 40, opacity: 0.6 }}>
                <Icon name="check" size={16} color={c.muted} strokeWidth={2.4} />
                <Label color={c.ink} style={{ flex: 1, fontSize: 15 }} numberOfLines={1}>
                  {p.name}
                </Label>
                <Pressable
                  accessibilityRole="button"
                  accessibilityLabel={`Devolver ${p.name} a la ruleta`}
                  hitSlop={6}
                  disabled={girando}
                  onPress={() => {
                    haptic.light();
                    devolver(p.id);
                  }}
                  style={({ pressed }) => ({ paddingHorizontal: space.sm, opacity: pressed ? 0.5 : 1 })}
                >
                  <Label color={c.ink} style={{ textDecorationLine: 'underline' }}>
                    Devolver
                  </Label>
                </Pressable>
              </Row>
            ))}
          </View>
        </>
      ) : null}

      {premios.length + sacados.length > 0 ? (
        <Button label="Vaciar la ruleta" variant="ghost" size="sm" onPress={vaciar} style={{ marginTop: space.xl }} />
      ) : null}
    </Screen>
  );
}
