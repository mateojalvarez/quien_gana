import * as Haptics from 'expo-haptics';
import { Platform, Vibration } from 'react-native';

import { useSettings } from '@/store/settings';

const enabled = () => Platform.OS !== 'web' && useSettings.getState().haptics;

/**
 * El final del reloj: el aviso más fuerte que se puede pedir desde JavaScript.
 *
 * Los haptics de iOS son finos a propósito (un golpecito en la yema), así que
 * para "muy fuerte" hay que ir al motor de vibración de siempre con
 * `Vibration`, que es el que se siente con el teléfono en el bolsillo o sobre
 * la mesa. Se repite en tandas durante toda la alarma en vez de una sola vez:
 * un buzz suelto se pierde.
 */
const ALARMA_MS = 5_500;
const TANDA_MS = 700;
let tandas: ReturnType<typeof setInterval> | null = null;

function alarma(ms = ALARMA_MS) {
  if (!enabled()) return;
  pararAlarma();
  const golpe = () => {
    // El patrón sólo lo entiende Android; iOS hace un buzz por llamada.
    if (Platform.OS === 'android') Vibration.vibrate([0, 400, 150, 400], false);
    else Vibration.vibrate();
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error).catch(() => {});
    setTimeout(() => Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Heavy).catch(() => {}), 160);
    setTimeout(() => Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Heavy).catch(() => {}), 330);
  };
  golpe();
  tandas = setInterval(golpe, TANDA_MS);
  setTimeout(pararAlarma, ms);
}

function pararAlarma() {
  if (tandas) {
    clearInterval(tandas);
    tandas = null;
  }
  Vibration.cancel();
}

export const haptic = {
  tap: () => enabled() && Haptics.selectionAsync().catch(() => {}),
  light: () => enabled() && Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {}),
  heavy: () => enabled() && Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Heavy).catch(() => {}),
  success: () =>
    enabled() && Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => {}),
  warning: () =>
    enabled() && Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning).catch(() => {}),
  /** Fin del reloj: tandas de vibración fuerte mientras suena la alarma. */
  alarma,
  /** Cortar las tandas antes de tiempo. */
  pararAlarma,
};
