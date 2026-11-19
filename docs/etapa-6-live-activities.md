# Etapa 6 — Live Activities

Pantalla 20 del canvas.

## Estado

**Truco anda de punta a punta**: la actividad aparece en la pantalla bloqueada y
en la Dynamic Island (compacta, mínima y expandida), los tres botones funcionan
con la app cerrada y lo que se toca afuera entra a la partida al volver.

Faltan **Reloj**, **Corazones** y **Generala**: la plomería (target, módulo,
App Group, cola de acciones) ya está, falta la cara de cada uno y su estado.

Lo de abajo es el plan con el que se construyó, y sigue valiendo para lo que
falta.

## 1. Qué dice el diseño

Cuatro actividades, una por juego, con reglas comunes:

1. Como mucho dos botones, sólo para la acción más frecuente.
2. Nunca suena ni vibra: sólo avisa cuando termina la partida.
3. Se cierra sola tras 2 horas sin cambios.
4. Se activa por partida y se puede apagar desde Configurar.

| Juego | Pantalla bloqueada | Compacta | Mínima | Botones |
|---|---|---|---|---|
| **Truco** | `Truco · a 30`, `mano: Ellos`, Nosotros **18** buenas / Ellos **11** malas | ícono + `18 · 11` | `18` | `+1 Nos`, `+1 Ellos`, deshacer (círculo) |
| **Corazones** | `Corazones · ronda 8 de 10`, pastilla `×2`, `Reparte Lu`, `Lu 168 · Teo 152 · Caro 131` | `R8 ×2` | ícono | `Cargar ronda 8` → abre la app |
| **Generala** | `Generala · ronda 4 de 11`, `Turno de Lu`, `tiro 2 de 3`, los 5 dados de la última tirada (fijos rellenos, libres con contorno), `Full`, totales | `Lu · 2/3` | ícono | ninguno |
| **Reloj** | `Reloj · turno de Teo`, `2:41` sobre `de 5:00`, barra de progreso | ícono + `2:41` | anillo con `2:41` | `Pausa`, `+30 s` |

Expandida (Dynamic Island abierta): Truco muestra `Nos 18 · faltan 12 · 11 Ellos`
y los dos botones de +1; Corazones, `Ronda 8 · reparte Lu`, `Va ganando Lu por 16`
y el botón; Generala, `Turno de Lu`, `después: Santi` y los dados con `Full · 30`;
Reloj, `2:41`, `turno de Teo` y los dos botones.

Paleta: fondo tinta `#151110` sobre `#3A322D`, texto marfil `#FBF8F2`, apagado
`#B4A79C`, acento mostaza `#F4B740`, tomate `#EF7A57` para "Ellos". Jost, los
mismos pesos que la app. Números con `monospacedDigit()`.

## 2. Qué hay que agregar al proyecto

Hoy la app no tiene nada nativo propio: `ios/` está en el `.gitignore` y se
regenera con `expo prebuild`. Una Live Activity necesita dos piezas nativas que
sobrevivan a ese prebuild.

### a. Un target de widget

Con [`@bacons/apple-targets`](https://github.com/EvanBacon/expo-apple-targets)
(v5.0.0, peer `expo >=52`), que agrega targets de Xcode en cada prebuild:

```
targets/quiengana-widget/
  expo-target.config.js     # type: "widget", frameworks: WidgetKit, SwiftUI, ActivityKit, AppIntents
  QuienGanaWidgets.swift    # el bundle de widgets
  Atributos.swift           # los ActivityAttributes, compartidos con la app
  TrucoActivity.swift
  CorazonesActivity.swift
  GeneralaActivity.swift
  RelojActivity.swift
  Intents.swift             # los App Intents de los botones
```

Un target nuevo es un **bundle id nuevo** (`com.mateoalvarez.quiengana.widget`),
así que pide su propio perfil de aprovisionamiento. Es exactamente el problema
que nos frenó el build de anoche: el primer build con esto va a necesitar
`eas credentials` interactivo.

### b. Un módulo local para hablar con ActivityKit

`modules/live-activity/` (`npx create-expo-module --local`), en Swift:

```ts
soportado(): boolean          // ActivityAuthorizationInfo().areActivitiesEnabled
iniciar(kind, estado): string // devuelve el id de la actividad
actualizar(id, estado): void
terminar(id, final?): void
terminarTodas(): void
pendientes(): Accion[]        // lo que apretaron en los botones mientras la app no estaba
```

No uso un paquete de npm genérico porque las cuatro actividades tienen
disposiciones distintas; un paquete que sólo pasa texto no alcanza.

### c. El ida y vuelta de los botones

Los botones corren en el proceso del widget, no en el de la app, así que no
pueden tocar Zustand. El camino:

1. El `LiveActivityIntent` escribe la acción en un **App Group**
   (`group.com.mateoalvarez.quiengana`) y actualiza la actividad al toque, para
   que el número cambie sin esperar a nadie.
2. Cuando la app vuelve a primer plano, el módulo entrega esa cola y el store
   la aplica sobre el estado real.

El riesgo conocido es que las dos cuentas se separen (apretar `+1` cinco veces
con la app cerrada). Lo acoto haciendo que la cola guarde **movimientos**, no
totales: en Truco ya existen (`TrucoMove`), y el `undo` es sacar el último.
Corazones no tiene acción afuera justamente por esto: el diseño sólo pone un
enlace para abrir la app.

### d. Config de Expo

- `NSSupportsLiveActivities: true` en `ios.infoPlist`.
- `ios.entitlements["com.apple.security.application-groups"]` con el App Group
  (el plugin lo copia al target solo).
- `expo-build-properties` para subir `ios.deploymentTarget` (ver decisión 1).
- `teamId: "X77V463WTL"` en el plugin, para que firme el target.

## 3. Del lado de JS

- `src/features/live-activity/` con un `useLiveActivity(game)` que arranca la
  actividad al empezar la partida, la actualiza cuando cambia el estado
  (con `throttle`, ActivityKit tiene presupuesto de actualizaciones) y la
  termina al terminar la partida, con `staleDate` a 2 horas y
  `dismissalPolicy: .after(...)`.
- Un mapeo por juego de `Game` → el estado que ve el widget. Nada de mandar la
  partida entera: sólo los campos de la tabla de arriba.
- En Perfil, un interruptor propio (`Toggle`, nada nativo) para apagarlas, y el
  valor en `src/store/settings.ts`.

## 4. Verificación

1. `npx expo prebuild --clean` y `npm run ios` sobre el iPhone 17 Pro: la
   Dynamic Island existe en el simulador.
2. Por juego: empezar partida → aparece; cambiar el marcador → se actualiza;
   terminar → se cierra.
3. Botones: `+1 Nos` con la app en segundo plano, volver y ver que el marcador
   coincide; `Pausa` y `+30 s` en el reloj.
4. Las tres presentaciones (bloqueada, compacta, mínima, expandida) y el modo
   oscuro del teléfono.
5. Apagar el interruptor de Perfil: no arranca ninguna.

## 5. Lo que no entra

- **Push updates.** Todo local (`pushType: nil`). Actualizar desde el servidor
  pediría APNs y un endpoint; no hace falta para un juego de mesa presencial.
- **Android.** No tiene equivalente; las notificaciones persistentes son otra
  cosa y no están en el diseño.
- **watchOS.**

## 6. Decisiones tomadas

1. **Mínimo de iOS: 17.0.** Los botones (App Intents) lo piden. Un solo camino
   de código, sin `@available` ni dos variantes que probar. Deja afuera los
   teléfonos que no pasan de iOS 16 (iPhone 8, X).
2. **Primero Truco.** Es el que más usa la plomería: los tres botones del
   diseño y la cola de acciones del App Group. Si anda Truco, lo demás es
   repetir el patrón con otra cara. Freno ahí para que se pruebe, y después van
   Reloj, Corazones y Generala.
