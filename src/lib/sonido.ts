// Sonidos cortos de la app, hermano de lib/haptics.ts.
//
// Dos reglas, las mismas que los haptics: nunca tira (un sonido que falla no
// puede cortar una ronda) y se apaga desde Perfil.
//
// `playsInSilentMode: true` es a propósito: el aviso del reloj tiene que llegar
// aunque el switch esté en silencio. El que no quiere sonido lo apaga desde
// Perfil, que es el interruptor que sí entendemos.
//
// `shouldPlayInBackground: true` (más el modo de audio `audio` que agrega el
// plugin de expo-audio) es lo que deja seguir sonando cuando se bloquea la
// pantalla en medio de un sonido.
//
// Los players se crean la primera vez que suena cada uno y se reusan: crearlos
// en cada toque mete un retraso que en el pulsador se nota.

import { createAudioPlayer, setAudioModeAsync, type AudioPlayer } from 'expo-audio';
import { Platform } from 'react-native';

import { useSettings } from '@/store/settings';

const FUENTES = {
  clic: require('../../assets/sonidos/clic.wav'),
  senal: require('../../assets/sonidos/senal.wav'),
  alarma: require('../../assets/sonidos/alarma.wav'),
  tic: require('../../assets/sonidos/tic.wav'),
  // Un segundo de ruido de un bit: no se escucha, sólo mantiene abierta la
  // sesión de audio. Ver `fondo` abajo.
  silencio: require('../../assets/sonidos/silencio.wav'),
} as const;

type Nombre = keyof typeof FUENTES;

const sePuede = () => Platform.OS !== 'web';
const enabled = () => sePuede() && useSettings.getState().sonidos;

const players = new Map<Nombre, AudioPlayer>();
let modoListo = false;

function prepararModo() {
  if (modoListo) return;
  modoListo = true;
  setAudioModeAsync({
    playsInSilentMode: true,
    shouldPlayInBackground: true,
    // Sin exclusividad: nadie quiere que un juego de mesa le corte la música.
    interruptionMode: 'mixWithOthers',
  }).catch(() => {});
}

function player(nombre: Nombre): AudioPlayer | null {
  try {
    let p = players.get(nombre);
    if (!p) {
      p = createAudioPlayer(FUENTES[nombre]);
      players.set(nombre, p);
    }
    return p;
  } catch {
    return null;
  }
}

function tocar(nombre: Nombre, volumen = 1) {
  if (!enabled()) return;
  try {
    prepararModo();
    const p = player(nombre);
    if (!p) return;
    p.volume = volumen;
    // Volver a cero antes de tocar: si no, el segundo toque seguido no suena.
    p.seekTo(0)
      .then(() => p.play())
      .catch(() => {
        try {
          p.play();
        } catch {
          // ya está, sin sonido
        }
      });
  } catch {
    // sin sonido
  }
}

/** La alarma del reloj: en bucle, para que no termine en un parpadeo. */
const ALARMA_MS = 5_500;
let cortar: ReturnType<typeof setTimeout> | null = null;

function alarma(ms = ALARMA_MS) {
  if (!enabled()) return;
  try {
    prepararModo();
    const p = player('alarma');
    if (!p) return;
    p.volume = 1;
    p.loop = true;
    p.seekTo(0)
      .then(() => p.play())
      .catch(() => {
        try {
          p.play();
        } catch {
          /* sin sonido */
        }
      });
    if (cortar) clearTimeout(cortar);
    cortar = setTimeout(callar, ms);
  } catch {
    // sin sonido
  }
}

/** Corta la alarma a mano (pausar o reiniciar el reloj). */
function callar() {
  if (cortar) {
    clearTimeout(cortar);
    cortar = null;
  }
  try {
    const p = players.get('alarma');
    if (!p) return;
    p.loop = false;
    p.pause();
  } catch {
    // ya estaba callada
  }
}

/**
 * Sesión de audio abierta a propósito, sin nada que escuchar.
 *
 * Con la pantalla bloqueada iOS suspende el JavaScript, y un reloj suspendido
 * no avisa nada: ni suena ni vibra hasta que se vuelve a abrir la app. La única
 * forma de que los temporizadores sigan corriendo es que la app esté
 * reproduciendo algo, así que mientras el reloj corre tocamos un bucle
 * inaudible.
 *
 * No depende del interruptor de sonido de Perfil: no se escucha, y es lo que
 * permite que la vibración del final llegue con el teléfono bloqueado. Si iOS
 * igual nos suspende (puede pasar: la sesión es compartida, no exclusiva), el
 * aviso sale al volver a la app, que es como se portaba antes.
 */
export const fondo = {
  activar() {
    if (!sePuede()) return;
    try {
      prepararModo();
      const p = player('silencio');
      if (!p) return;
      p.volume = 0.02;
      p.loop = true;
      p.play();
    } catch {
      // sin sesión: el reloj sigue andando con la app abierta
    }
  },
  soltar() {
    try {
      const p = players.get('silencio');
      if (!p) return;
      p.loop = false;
      p.pause();
    } catch {
      // ya estaba suelta
    }
  },
};

export const sonido = {
  /** Toque del pulsador. */
  clic: () => tocar('clic'),
  /** El ¡YA! del pulsador. */
  senal: () => tocar('senal'),
  /** Reloj en cero: suena en bucle unos segundos. */
  alarma,
  /** Cortar la alarma antes de que termine sola. */
  callar,
  /** Cuenta final del reloj: uno por segundo. */
  tic: () => tocar('tic', 0.6),
};
