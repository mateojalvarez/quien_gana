/**
 * Target de widget para las Live Activities. `@bacons/apple-targets` lo
 * engancha al proyecto en cada `expo prebuild`, así que `ios/` sigue siendo
 * descartable.
 *
 * @type {import('@bacons/apple-targets/app.plugin').ConfigFunction}
 */
module.exports = (config) => ({
  type: 'widget',
  name: 'QuienGanaWidgets',
  // Los botones de una Live Activity son App Intents: iOS 17.
  deploymentTarget: '17.0',
  frameworks: ['SwiftUI', 'WidgetKit', 'ActivityKit', 'AppIntents'],
  colors: {
    $accent: '#F4B740',
    $widgetBackground: '#151110',
  },
  // Sin `images`: el plugin arma un imageset que declara 2x y 3x sin archivo, y
  // en un teléfono 3x la imagen sale como un cuadrado gris. El PNG va suelto en
  // esta carpeta (el target la sincroniza entera) y se carga con UIImage(named:).
  entitlements: {
    // El mismo App Group que la app: por ahí viajan los toques de los botones.
    'com.apple.security.application-groups':
      config.ios.entitlements['com.apple.security.application-groups'],
  },
});
