// Entrar a un torneo compartido. Llega por https://quien-gana.app/t/<code>,
// quiengana://t/<code> o el QR de la pantalla Compartir.

import { router, useLocalSearchParams, type Href } from 'expo-router';
import { useEffect, useState } from 'react';
import { View } from 'react-native';

import { Body, Button, Screen, Spinner } from '@/components/ui';
import { unirseATorneo } from '@/features/torneo/compartido';
import { haptic } from '@/lib/haptics';
import { space } from '@/theme/tokens';
import { useTheme } from '@/theme/use-theme';

export default function EntrarATorneo() {
  const { code } = useLocalSearchParams<{ code: string }>();
  const { c } = useTheme();
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let vivo = true;
    unirseATorneo((code ?? '').toUpperCase())
      .then((id) => {
        if (!vivo) return;
        haptic.success();
        router.replace(`/torneo/${id}` as Href);
      })
      .catch((e: { code?: string }) => {
        if (!vivo) return;
        setError(
          e?.code === 'P0002'
            ? 'Ese enlace no corresponde a ningún torneo. Pedile al anfitrión que lo vuelva a compartir.'
            : 'No pudimos abrir el torneo. Revisá la conexión y probá de nuevo.',
        );
      });
    return () => {
      vivo = false;
    };
  }, [code]);

  return (
    <Screen title={error ? 'No lo encontramos' : 'Abriendo torneo…'} scroll={false}>
      {error ? (
        <>
          <Body color={c.muted} style={{ marginTop: space.lg }}>
            {error}
          </Body>
          <Button label="Volver al inicio" variant="outline" style={{ marginTop: space.xl }} onPress={() => router.replace('/')} />
        </>
      ) : (
        <View style={{ marginTop: space.xl }}>
          <Spinner color={c.muted} />
        </View>
      )}
    </Screen>
  );
}
