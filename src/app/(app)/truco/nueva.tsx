import { router, useLocalSearchParams } from 'expo-router';
import { useState } from 'react';
import { Pressable, TextInput, View } from 'react-native';

import { Clay } from '@/components/clay';
import { Body, Button, Label, Row, Screen, Title, Toggle } from '@/components/ui';
import { DEFAULTS, TARGETS, type TrucoTarget } from '@/features/truco/rules';
import { haptic } from '@/lib/haptics';
import { useGames } from '@/store/games';
import { border, fonts, palette, radius, space, touch } from '@/theme/tokens';
import { useTheme } from '@/theme/use-theme';

const COLOR_EQUIPO = [palette.mostaza, palette.tomate];

const DESCRIPCION: Record<TrucoTarget, string> = {
  15: 'Una vuelta, sin buenas',
  30: '15 malas y 15 buenas',
};

export default function NuevoTruco() {
  const { c } = useTheme();
  const create = useGames((s) => s.create);
  // El generador de equipos puede mandar los nombres ya armados.
  const { e1, e2 } = useLocalSearchParams<{ e1?: string; e2?: string }>();

  const [teams, setTeams] = useState<string[]>([e1 || DEFAULTS.teams[0], e2 || DEFAULTS.teams[1]]);
  const [target, setTarget] = useState<TrucoTarget>(DEFAULTS.target);
  const [matches, setMatches] = useState(DEFAULTS.matches);

  const nombres = teams.map((t, i) => t.trim() || DEFAULTS.teams[i]);

  function empezar() {
    const id = create({
      kind: 'truco',
      title: `${nombres[0]} vs ${nombres[1]}`,
      players: nombres,
      target,
      matches,
    });
    router.replace(`/truco/${id}`);
  }

  return (
    <Screen
      title="Truco"
      meta="Nueva partida"
      decor={
        <View style={{ position: 'absolute', right: 4, top: 6 }} pointerEvents="none">
          {/* Adentro y no desbordando como el resto de las arcillas: el abanico
              ocupa todo el ancho de su cuadro, así que contra el canto de la
              pantalla el borde se ve cortado y parece un recorte, no un desborde. */}
          <Clay name="cartasEspanolas" size={128} />
        </View>
      }
      footer={<Button label="Empezar partida" trailingIcon="arrowRight" onPress={empezar} />}
    >
      <Title style={{ fontSize: 20, marginTop: space.xxl, marginBottom: space.sm }}>Equipos</Title>
      <View style={{ gap: space.sm }}>
        {teams.map((nombre, i) => (
          <Row
            key={i}
            style={{
              minHeight: 56,
              borderRadius: radius.field,
              borderWidth: border,
              borderColor: c.lineStrong,
              paddingHorizontal: space.lg,
              gap: space.md,
            }}
          >
            <View style={{ width: 14, height: 14, borderRadius: 7, backgroundColor: COLOR_EQUIPO[i] }} />
            <TextInput
              value={nombre}
              onChangeText={(t) => setTeams((ts) => ts.map((v, j) => (j === i ? t : v)))}
              placeholder={DEFAULTS.teams[i]}
              placeholderTextColor={c.muted}
              accessibilityLabel={`Nombre del equipo ${i + 1}`}
              maxLength={20}
              style={{ flex: 1, fontFamily: fonts.semibold, fontSize: 17, color: c.ink, paddingVertical: space.md }}
            />
          </Row>
        ))}
      </View>

      <Title style={{ fontSize: 20, marginTop: space.xxl, marginBottom: space.sm }}>¿A cuántos?</Title>
      <View
        accessibilityRole="radiogroup"
        accessibilityLabel="Puntos para ganar"
        style={{ flexDirection: 'row', gap: space.md, alignItems: 'stretch' }}
      >
        {TARGETS.map((t) => {
          const activo = t === target;
          return (
            <Pressable
              key={t}
              accessibilityRole="radio"
              accessibilityState={{ checked: activo }}
              accessibilityLabel={`A ${t}. ${DESCRIPCION[t]}`}
              onPress={() => {
                haptic.tap();
                setTarget(t);
              }}
              style={({ pressed }) => ({
                flex: 1,
                height: 112,
                borderRadius: radius.card,
                borderWidth: activo ? 0 : border,
                borderColor: c.lineStrong,
                backgroundColor: activo ? c.inverseBg : 'transparent',
                padding: space.lg,
                justifyContent: 'space-between',
                opacity: pressed ? 0.8 : 1,
              })}
            >
              <Title
                color={activo ? c.inverseInk : c.ink}
                style={{ fontSize: 40, lineHeight: 48, fontFamily: fonts.black, fontVariant: ['tabular-nums'] }}
              >
                {t}
              </Title>
              <Body color={activo ? c.inverseInk : c.ink} style={{ fontSize: 13, lineHeight: 17 }}>
                {DESCRIPCION[t]}
              </Body>
            </Pressable>
          );
        })}
      </View>

      <Title style={{ fontSize: 20, marginTop: space.xxl, marginBottom: space.xs }}>Opciones</Title>
      <Row style={{ minHeight: touch + 12, justifyContent: 'space-between', gap: space.lg }}>
        <View style={{ flex: 1, gap: 2 }}>
          <Title style={{ fontSize: 16 }}>Fósforos</Title>
          <Label>Dibujar los puntos de a cinco</Label>
        </View>
        <Toggle value={matches} onChange={setMatches} label="Fósforos" />
      </Row>

      <View style={{ height: space.huge }} />
    </Screen>
  );
}
