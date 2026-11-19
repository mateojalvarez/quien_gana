import ActivityKit
import AppIntents
import Foundation

/**
 Lo que comparten el widget y la app.

 Los App Intents de una Live Activity corren en el proceso de la APP, no en el
 del widget, así que este archivo tiene que compilar en los dos targets. El
 módulo `modules/live-activity` lo incluye desde su podspec en vez de copiarlo:
 una sola fuente, para que los dos lados no se desincronicen.
 */

public let grupoApp = "group.com.mateoalvarez.quiengana"

// MARK: - Truco

public struct TrucoAttributes: ActivityAttributes {
  public struct ContentState: Codable, Hashable {
    public var nosotros: Int
    public var ellos: Int
    /// A qué equipo fue el último toque, o nil si no hay nada que deshacer.
    /// Guardar el equipo (y no un simple booleano) es lo que le permite al
    /// botón de deshacer bajar el número correcto sin despertar a la app.
    public var ultimoEquipo: Int?

    public init(nosotros: Int, ellos: Int, ultimoEquipo: Int?) {
      self.nosotros = nosotros
      self.ellos = ellos
      self.ultimoEquipo = ultimoEquipo
    }

    public var puedeDeshacer: Bool { ultimoEquipo != nil }
  }

  public var partidaId: String
  public var target: Int
  public var nombreNos: String
  public var nombreEllos: String

  public init(partidaId: String, target: Int, nombreNos: String, nombreEllos: String) {
    self.partidaId = partidaId
    self.target = target
    self.nombreNos = nombreNos
    self.nombreEllos = nombreEllos
  }
}

/// A 15 no hay buenas; a 30 se pasa al superar los quince.
/// Mismo criterio que `enBuenas` en `src/features/truco/rules.ts`.
public func enBuenas(_ puntos: Int, _ target: Int) -> Bool {
  target == 30 && puntos > 15
}

public func faltan(_ puntos: Int, _ target: Int) -> Int {
  max(0, target - puntos)
}

// MARK: - La cola de acciones

/**
 Lo que se aprieta en la pantalla bloqueada no puede tocar el store de la app:
 el intent corre sin que React Native esté vivo. Así que se anota acá y la app
 lo aplica cuando vuelve. Se guardan ACCIONES, no totales: aplicarlas en orden
 da el mismo resultado que haberlas tocado adentro.
 */
public enum AccionPendiente: Codable, Equatable {
  case sumar(equipo: Int)
  case deshacer
}

public enum Cola {
  static let clave = "truco.pendientes"

  static var defaults: UserDefaults? { UserDefaults(suiteName: grupoApp) }

  public static func leer() -> [AccionPendiente] {
    guard let data = defaults?.data(forKey: clave),
          let lista = try? JSONDecoder().decode([AccionPendiente].self, from: data)
    else { return [] }
    return lista
  }

  public static func agregar(_ accion: AccionPendiente) {
    var lista = leer()
    lista.append(accion)
    guardar(lista)
  }

  public static func limpiar() {
    guardar([])
  }

  static func guardar(_ lista: [AccionPendiente]) {
    guard let data = try? JSONEncoder().encode(lista) else { return }
    defaults?.set(data, forKey: clave)
  }
}

/// Lo último que publicó la app. La cola se aplica arriba de esto.
public enum Snapshot {
  static let clave = "truco.estado"

  public static func leer() -> TrucoAttributes.ContentState? {
    guard let data = Cola.defaults?.data(forKey: clave) else { return nil }
    return try? JSONDecoder().decode(TrucoAttributes.ContentState.self, from: data)
  }

  public static func guardar(_ estado: TrucoAttributes.ContentState) {
    guard let data = try? JSONEncoder().encode(estado) else { return }
    Cola.defaults?.set(data, forKey: clave)
  }
}

// MARK: - Los botones

@available(iOS 17.0, *)
public struct SumarPunto: LiveActivityIntent {
  public static var title: LocalizedStringResource = "Sumar un punto"

  @Parameter(title: "Equipo")
  public var equipo: Int

  public init() {}

  public init(equipo: Int) {
    self.equipo = equipo
  }

  public func perform() async throws -> some IntentResult {
    Cola.agregar(.sumar(equipo: equipo))
    await Actividades.refrescarTruco()
    return .result()
  }
}

@available(iOS 17.0, *)
public struct Deshacer: LiveActivityIntent {
  public static var title: LocalizedStringResource = "Deshacer el último toque"

  public init() {}

  public func perform() async throws -> some IntentResult {
    Cola.agregar(.deshacer)
    await Actividades.refrescarTruco()
    return .result()
  }
}

// MARK: - Pintar la actividad con lo que hay en la cola

public enum Actividades {
  /**
   El número tiene que moverse apenas se aprieta, sin esperar a que la app
   despierte. Se recalcula sobre el estado que la app dejó publicado más lo que
   hay en la cola, que es exactamente lo que la app va a aplicar después.
   */
  @available(iOS 17.0, *)
  public static func refrescarTruco() async {
    guard let actividad = Activity<TrucoAttributes>.activities.first else { return }
    let target = actividad.attributes.target
    let base = Snapshot.leer() ?? actividad.content.state

    var nos = base.nosotros
    var ellos = base.ellos
    /// Los toques dados desde acá, para poder deshacerlos en orden.
    var propios: [Int] = []
    /// El de la app, que sólo se puede deshacer una vez: más atrás no sabemos.
    var ultimoDeLaApp = base.ultimoEquipo

    for accion in Cola.leer() {
      switch accion {
      case .sumar(let equipo):
        if equipo == 0 { nos = min(target, nos + 1) } else { ellos = min(target, ellos + 1) }
        propios.append(equipo)
      case .deshacer:
        if let ultimo = propios.popLast() {
          if ultimo == 0 { nos = max(0, nos - 1) } else { ellos = max(0, ellos - 1) }
        } else if let ultimo = ultimoDeLaApp {
          if ultimo == 0 { nos = max(0, nos - 1) } else { ellos = max(0, ellos - 1) }
          ultimoDeLaApp = nil
        }
      }
    }

    let estado = TrucoAttributes.ContentState(
      nosotros: nos,
      ellos: ellos,
      ultimoEquipo: propios.last ?? ultimoDeLaApp
    )
    await actividad.update(
      ActivityContent(state: estado, staleDate: Date().addingTimeInterval(2 * 60 * 60))
    )
  }
}
