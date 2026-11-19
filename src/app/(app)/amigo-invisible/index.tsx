import { router, useFocusEffect } from 'expo-router';
import { useCallback, useState } from 'react';
import { View } from 'react-native';

import { Clay } from '@/components/clay';
import { Body, Button, Card, Label, Row, Screen, Tag, Title } from '@/components/ui';
import { listSorteos } from '@/features/amigo-invisible/api';
import { useAuth } from '@/providers/auth-provider';
import type { Sorteo } from '@/features/amigo-invisible/types';
import { fechaCorta } from '@/features/amigo-invisible/types';
import { palette, space } from '@/theme/tokens';
import { useTheme } from '@/theme/use-theme';

export default function AmigoInvisible() {
  const { c } = useTheme();
  const [sorteos, setSorteos] = useState<Sorteo[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  // Mandar correos a terceros desde nuestro dominio pide cuenta de verdad: la
  // policy del insert lo frena igual, pero avisarlo acá evita que el invitado
  // cargue quince correos para chocarse con un error al final.
  const invitado = useAuth().session?.user?.is_anonymous === true;

  // Al volver de sortear, la lista tiene que estar al día sin tirar de nada.
  useFocusEffect(
    useCallback(() => {
      if (invitado) return;
      let vivo = true;
      listSorteos()
        .then((s) => vivo && (setSorteos(s), setError(null)))
        .catch((e) => vivo && setError(String(e?.message ?? e)));
      return () => {
        vivo = false;
      };
    }, [invitado]),
  );

  return (
    <Screen
      title="Amigo invisible"
      meta="Sorteo por correo"
      decor={
        <View style={{ position: 'absolute', right: -4, top: 8 }} pointerEvents="none">
          <Clay name="cinta" size={112} />
        </View>
      }
      footer={
        invitado ? (
          <Button label="Ir a mi perfil" onPress={() => router.push('/perfil')} />
        ) : (
          <Button label="Nuevo sorteo" icon="plus" onPress={() => router.push('/amigo-invisible/nuevo')} />
        )
      }
    >
      {invitado ? (
        <View style={{ alignItems: 'center', gap: space.md, marginTop: space.huge }}>
          <Clay name="cinta" size={96} />
          <Body color={c.muted} style={{ textAlign: 'center' }}>
            Para mandarles correos a los participantes hace falta una cuenta: como invitado no se puede.
            Vinculá Google o Apple desde tu perfil y volvé.
          </Body>
        </View>
      ) : error ? (
        <Body color={c.bad} style={{ marginTop: space.xxl }}>
          {error}
        </Body>
      ) : sorteos === null ? null : sorteos.length === 0 ? (
        <View style={{ alignItems: 'center', gap: space.md, marginTop: space.huge }}>
          <Clay name="asteriscoSalvia" size={96} />
          <Body color={c.muted} style={{ textAlign: 'center' }}>
            Cargá a los que participan con su correo. Cada uno recibe por mail a quién le toca, y nadie ve el
            resultado de los demás — vos tampoco.
          </Body>
        </View>
      ) : (
        <View style={{ marginTop: space.xxl, gap: space.md }}>
          {sorteos.map((s) => (
            <Card key={s.id} onPress={() => router.push(`/amigo-invisible/${s.id}`)} style={{ padding: space.lg }}>
              <Row style={{ justifyContent: 'space-between', alignItems: 'flex-start', gap: space.md }}>
                <View style={{ flex: 1, gap: 2 }}>
                  <Title style={{ fontSize: 18 }} numberOfLines={1}>
                    {s.name}
                  </Title>
                  <Label color={c.muted}>
                    {s.cuantos} {s.cuantos === 1 ? 'participante' : 'participantes'}
                    {s.drawnAt ? ` · ${fechaCorta(s.drawnAt)}` : ''}
                  </Label>
                </View>
                {s.status === 'drawn' ? (
                  <Tag label="Sorteado" bg={palette.salvia} color={c.ink} />
                ) : s.status === 'error' ? (
                  <Tag label="Quedó a medias" bg={c.bad} color={c.onColor} />
                ) : (
                  <Tag label="Borrador" bg={c.wash} color={c.muted} />
                )}
              </Row>
            </Card>
          ))}
        </View>
      )}
    </Screen>
  );
}
