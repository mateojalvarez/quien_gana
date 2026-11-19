import { useCallback, useEffect, useRef } from 'react';
import { AppState } from 'react-native';

import {
  actualizarTruco,
  iniciarTruco,
  soportado,
  terminarTruco,
  tomarPendientes,
  type EstadoTruco,
} from '@/live-activity';
import { scores } from '@/features/truco/rules';
import type { TrucoGame } from '@/features/types';
import { useGames } from '@/store/games';
import { useSettings } from '@/store/settings';

/** La partida, contada como la ve la pantalla bloqueada. */
function estadoDe(game: TrucoGame): EstadoTruco {
  const [nosotros, ellos] = scores(game);
  const ultimo = game.moves[game.moves.length - 1];
  return {
    partidaId: game.id,
    target: game.target,
    nombreNos: game.players[0]?.name ?? 'Nosotros',
    nombreEllos: game.players[1]?.name ?? 'Ellos',
    nosotros,
    ellos,
    // El botón de deshacer de afuera sólo sabe restar, así que se habilita
    // únicamente cuando el último toque fue un +1. Si fue un −1, se apaga.
    ultimoEquipo: ultimo && ultimo.delta > 0 ? ultimo.team : null,
  };
}

/**
 * Mantiene la Live Activity de una partida de truco: la arranca al entrar, la
 * actualiza con cada toque y la cierra cuando la partida termina.
 */
export function useTrucoLiveActivity(game: TrucoGame | null) {
  const encendidas = useSettings((s) => s.liveActivities);
  const arrancada = useRef(false);

  useEffect(() => {
    if (!game || !encendidas || !soportado()) return;

    if (game.finishedAt) {
      if (arrancada.current) {
        terminarTruco(game.id);
        arrancada.current = false;
      }
      return;
    }

    if (arrancada.current) actualizarTruco(estadoDe(game));
    else arrancada.current = iniciarTruco(estadoDe(game)) !== null;
  }, [game, encendidas]);

  // Apagarlas desde Perfil tiene que cerrar la que esté abierta ahora.
  useEffect(() => {
    if (encendidas || !arrancada.current) return;
    terminarTruco(null);
    arrancada.current = false;
  }, [encendidas]);
}

/**
 * Aplica lo que se apretó en los botones de la pantalla bloqueada. Vive en el
 * layout de la app y no en la pantalla de truco: el toque puede haber pasado
 * con la app cerrada, y al volver lo más probable es caer en Inicio.
 */
export function usePendientesDeTruco() {
  const addMove = useGames((s) => s.addTrucoMove);
  const undo = useGames((s) => s.undoRound);

  const aplicar = useCallback(() => {
    if (!soportado()) return;
    const { partidaId, acciones } = tomarPendientes();
    if (!partidaId || acciones.length === 0) return;
    for (const accion of acciones) {
      if (accion.tipo === 'sumar') addMove(partidaId, { team: accion.equipo === 1 ? 1 : 0, delta: 1 });
      else undo(partidaId);
    }
  }, [addMove, undo]);

  useEffect(() => {
    aplicar();
    const sub = AppState.addEventListener('change', (estado) => {
      if (estado === 'active') aplicar();
    });
    return () => sub.remove();
  }, [aplicar]);
}
