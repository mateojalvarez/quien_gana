/**
 * Banderas de sesión sin dependencias: las comparten el proveedor de auth y los
 * flujos de vinculación sin crear ciclos de importación entre módulos.
 */

let keepLocalGames = false;

/**
 * Durante un merge cerramos la sesión de invitado para entrar a la cuenta que
 * ya existía. Ese SIGNED_OUT es intermedio: las partidas locales tienen que
 * sobrevivir para volver a subirse bajo el nuevo user_id.
 */
export function withLocalGamesPreserved<T>(fn: () => Promise<T>): Promise<T> {
  keepLocalGames = true;
  return fn().finally(() => {
    keepLocalGames = false;
  });
}

export const localGamesArePreserved = () => keepLocalGames;
