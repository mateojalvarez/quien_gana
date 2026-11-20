import * as Notifications from 'expo-notifications';
import { AndroidImportance, AndroidNotificationPriority, AndroidNotificationVisibility } from 'expo-notifications';
import { AppState, Platform } from 'react-native';

import { permisoAlarma } from '@/live-activity';

/**
 * El aviso del final del reloj cuando la pantalla está bloqueada.
 *
 * Con el teléfono bloqueado iOS ignora `Vibration` y los háptiles de la app,
 * así que el aviso tiene que salir del sistema:
 *  · iOS 26+: AlarmKit (ver modules/live-activity). Suena y vibra como el
 *    temporizador del reloj de Apple, aunque esté en silencio.
 *  · iOS 17–25 y Android: una notificación local agendada para el final, con
 *    el sonido de alarma de la app y nivel "sensible al tiempo" (pasa los
 *    resúmenes y el modo concentración). La notificación también hace vibrar
 *    el Apple Watch.
 */

const CANAL = 'reloj';
let configurado = false;
let pendiente: string | null = null;

function configurar() {
  if (configurado || Platform.OS === 'web') return;
  configurado = true;
  // Con la app abierta el aviso lo da la pantalla: la notificación no se muestra.
  Notifications.setNotificationHandler({
    handleNotification: async () => {
      const enPantalla = AppState.currentState === 'active';
      return {
        shouldShowBanner: !enPantalla,
        shouldShowList: !enPantalla,
        shouldPlaySound: !enPantalla,
        shouldSetBadge: false,
      };
    },
  });
  if (Platform.OS === 'android') {
    Notifications.setNotificationChannelAsync(CANAL, {
      name: 'Reloj',
      importance: AndroidImportance.MAX,
      sound: 'alarma.wav',
      vibrationPattern: [0, 700, 250, 700, 250, 700, 250, 700],
      lockscreenVisibility: AndroidNotificationVisibility.PUBLIC,
      bypassDnd: true,
    }).catch(() => {});
  }
}

/**
 * Se pide una vez, al empezar el primer reloj. Devuelve si el final va a
 * sonar con AlarmKit (true) o con una notificación (false).
 */
export async function prepararAviso(): Promise<boolean> {
  if (Platform.OS === 'web') return false;
  configurar();
  if (await permisoAlarma()) return true;
  try {
    const actual = await Notifications.getPermissionsAsync();
    if (!actual.granted && actual.canAskAgain) {
      await Notifications.requestPermissionsAsync({
        ios: { allowAlert: true, allowSound: true, allowBadge: false },
      });
    }
  } catch {
    // Sin permiso, queda el aviso de adentro de la app.
  }
  return false;
}

export async function agendarFin(finMs: number): Promise<void> {
  if (Platform.OS === 'web') return;
  configurar();
  await cancelarFin();
  if (finMs - Date.now() < 1500) return;
  try {
    pendiente = await Notifications.scheduleNotificationAsync({
      content: {
        title: '¡Tiempo!',
        body: 'Se terminó el reloj.',
        sound: 'alarma.wav',
        interruptionLevel: 'timeSensitive',
        priority: AndroidNotificationPriority.MAX,
        vibrate: [0, 700, 250, 700, 250, 700],
      },
      trigger: { type: Notifications.SchedulableTriggerInputTypes.DATE, date: finMs, channelId: CANAL },
    });
  } catch {
    pendiente = null;
  }
}

export async function cancelarFin(): Promise<void> {
  const id = pendiente;
  pendiente = null;
  if (!id) return;
  await Notifications.cancelScheduledNotificationAsync(id).catch(() => {});
}
