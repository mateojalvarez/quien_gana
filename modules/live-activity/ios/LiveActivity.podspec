Pod::Spec.new do |s|
  s.name           = 'LiveActivity'
  s.version        = '1.0.0'
  s.summary        = 'Live Activities de ¿Quién gana?'
  s.description    = 'Arranca, actualiza y termina las Live Activities, y entrega lo que se apretó en sus botones.'
  s.author         = 'Mateo Álvarez'
  s.homepage       = 'https://quien-gana.app'
  s.license        = { :type => 'MIT' }
  s.platforms      = { :ios => '17.0' }
  s.source         = { git: '' }
  s.static_framework = true

  s.dependency 'ExpoModulesCore'
  # AlarmKit es de iOS 26: enlace débil para que la app siga abriendo en iOS 17–25.
  s.weak_frameworks = 'AlarmKit'

  s.pod_target_xcconfig = {
    'DEFINES_MODULE' => 'YES',
    'SWIFT_COMPILATION_MODE' => 'wholemodule'
  }

  # `Compartido.swift` está acá y el target del widget lo toma por un symlink
  # (targets/quiengana-widget/Compartido.swift). Los App Intents corren en el
  # proceso de la app, así que los dos lados necesitan los mismos tipos; una
  # sola fuente evita que se desfasen. CocoaPods ignora los archivos de afuera
  # del pod, por eso el original vive de este lado.
  s.source_files = '**/*.{h,m,mm,swift,hpp,cpp}'
end
