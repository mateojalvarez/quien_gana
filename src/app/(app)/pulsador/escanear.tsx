import { CameraView, useCameraPermissions } from 'expo-camera';
import { router, useLocalSearchParams } from 'expo-router';
import { useRef } from 'react';
import { View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { Body, Button, IconButton, Label, Screen } from '@/components/ui';
import { destinoDeUrl } from '@/features/grupos/use-invite-link';
import { haptic } from '@/lib/haptics';
import { normalizeCode } from '@/lib/room';
import { palette, radius, space } from '@/theme/tokens';
import { useTheme } from '@/theme/use-theme';

/** El código de sala que trae un QR: el enlace `/p/ABCD` o el código pelado. */
function codigoDelQr(dato: string): string | null {
  const destino = /^[a-z]+:\/\//i.test(dato) ? destinoDeUrl(dato) : null;
  if (destino) return destino.tipo === 'p' ? normalizeCode(destino.code) : null;
  const pelado = normalizeCode(dato);
  return pelado.length === 4 ? pelado : null;
}

export default function Escanear() {
  const { c } = useTheme();
  const insets = useSafeAreaInsets();
  const { name } = useLocalSearchParams<{ name?: string }>();
  const [permiso, pedir] = useCameraPermissions();
  const leido = useRef(false);

  if (!permiso) return <View style={{ flex: 1, backgroundColor: c.bg }} />;

  if (!permiso.granted) {
    return (
      <Screen title="Escanear QR" meta="Pulsador">
        <Body color={c.muted} style={{ marginTop: space.lg }}>
          Para leer el QR de la sala hace falta la cámara.
        </Body>
        <Button
          label={permiso.canAskAgain ? 'Permitir la cámara' : 'Volver'}
          style={{ marginTop: space.xl }}
          onPress={() => (permiso.canAskAgain ? pedir() : router.back())}
        />
      </Screen>
    );
  }

  return (
    <View style={{ flex: 1, backgroundColor: '#000' }}>
      <CameraView
        style={{ flex: 1 }}
        facing="back"
        barcodeScannerSettings={{ barcodeTypes: ['qr'] }}
        onBarcodeScanned={({ data }) => {
          if (leido.current) return;
          const code = codigoDelQr(data);
          if (!code) return;
          leido.current = true;
          haptic.success();
          router.replace({ pathname: '/pulsador/sala', params: { code, name: name || 'Jugador', host: '0' } });
        }}
      />
      <View style={{ position: 'absolute', top: insets.top + space.sm, left: space.xl }}>
        <IconButton name="close" label="Cerrar" variant="solid" onPress={() => router.back()} />
      </View>
      <View
        pointerEvents="none"
        style={{ position: 'absolute', left: 0, right: 0, top: 0, bottom: 0, alignItems: 'center', justifyContent: 'center' }}
      >
        <View style={{ width: 240, height: 240, borderRadius: radius.cardLg, borderWidth: 3, borderColor: palette.marfil }} />
        <Label color={palette.marfil} style={{ marginTop: space.lg, fontSize: 15 }}>
          Apuntá al QR de la sala
        </Label>
      </View>
    </View>
  );
}
