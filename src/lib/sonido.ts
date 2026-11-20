// Sonidos cortos de la app, hermano de lib/haptics.ts.
//
// Dos reglas, las mismas que los haptics: nunca tira (un sonido que falla no
// puede cortar una ronda) y se apaga desde Perfil.
//
// `playsInSilentMode: false` es a propósito: si el teléfono está en silencio
// manda el switch, y el aviso igual llega por vibración. Los players se crean
// la primera vez que suena cada uno y se reusan: crearlos en cada toque mete
// un retraso que en el pulsador se nota.

import { createAudioPlayer, setAudioModeAsync, type AudioPlayer } from 'expo-audio';
import { Platform } from 'react-native';

import { useSettings } from '@/store/settings';

const FUENTES = {
  clic: require('../../assets/sonidos/clic.wav'),
  senal: require('../../assets/sonidos/senal.wav'),
  alarma: require('../../assets/sonidos/alarma.wav'),
  tic: require('../../assets/sonidos/tic.wav'),
} as const;

type Nombre = keyof typeof FUENTES;

const enabled = () => Platform.OS !== 'web' && useSettings.getState().sonidos;

const players = new Map<Nombre, AudioPlayer>();
let modoListo = false;

function tocar(nombre: Nombre, volumen = 1) {
  if (!enabled()) return;
  try {
    if (!modoListo) {
      modoListo = true;
      setAudioModeAsync({ playsInSilentMode: false, interruptionMode: 'mixWithOthers' }).catch(() => {});
    }
    let p = players.get(nombre);
    if (!p) {
      p = createAudioPlayer(FUENTES[nombre]);
      players.set(nombre, p);
    }
    p.volume = volumen;
    // Volver a cero antes de tocar: si no, el segundo toque seguido no suena.
    p.seekTo(0)
      .then(() => p!.play())
      .catch(() => {
        try {
          p!.play();
        } catch {
          // ya está, sin sonido
        }
      });
  } catch {
    // sin sonido
  }
}

export const sonido = {
  /** Toque del pulsador. */
  clic: () => tocar('clic'),
  /** El ¡YA! del pulsador. */
  senal: () => tocar('senal'),
  /** Reloj en cero. */
  alarma: () => tocar('alarma'),
  /** Cuenta final del reloj: uno por segundo. */
  tic: () => tocar('tic', 0.6),
};
