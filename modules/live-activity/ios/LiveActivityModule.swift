import ActivityKit
import ExpoModulesCore

/// Lo que la app le manda al widget. Los nombres y el objetivo no cambian
/// durante la partida (van en los attributes); el marcador sí.
struct EstadoTruco: Record {
  @Field var partidaId: String = ""
  @Field var target: Int = 30
  @Field var nombreNos: String = "Nosotros"
  @Field var nombreEllos: String = "Ellos"
  @Field var nosotros: Int = 0
  @Field var ellos: Int = 0
  @Field var ultimoEquipo: Int?
}

public class LiveActivityModule: Module {
  public func definition() -> ModuleDefinition {
    Name("LiveActivity")

    Function("soportado") { () -> Bool in
      if #available(iOS 17.0, *) {
        return ActivityAuthorizationInfo().areActivitiesEnabled
      }
      return false
    }

    /// Arranca la actividad, o actualiza la que ya hay si es la misma partida.
    /// Devuelve el id, o nil si el sistema no la dejó arrancar.
    Function("iniciarTruco") { (estado: EstadoTruco) -> String? in
      guard #available(iOS 17.0, *) else { return nil }
      guard ActivityAuthorizationInfo().areActivitiesEnabled else { return nil }

      // Una partida a la vez: si quedó una vieja abierta, se cierra.
      let abiertas = Activity<TrucoAttributes>.activities
      if let viva = abiertas.first(where: { $0.attributes.partidaId == estado.partidaId }) {
        Self.publicar(estado)
        Task { await viva.update(Self.contenido(estado)) }
        return viva.id
      }
      for vieja in abiertas {
        Task { await vieja.end(nil, dismissalPolicy: .immediate) }
      }

      Cola.limpiar()
      Self.publicar(estado)
      do {
        let actividad = try Activity.request(
          attributes: TrucoAttributes(
            partidaId: estado.partidaId,
            target: estado.target,
            nombreNos: estado.nombreNos,
            nombreEllos: estado.nombreEllos
          ),
          content: Self.contenido(estado),
          pushType: nil
        )
        return actividad.id
      } catch {
        // Sin Live Activities (apagadas en Ajustes, demasiadas abiertas) la
        // partida sigue igual: esto es un extra, nunca un requisito.
        return nil
      }
    }

    Function("actualizarTruco") { (estado: EstadoTruco) -> Void in
      guard #available(iOS 17.0, *) else { return }
      Self.publicar(estado)
      guard let actividad = Activity<TrucoAttributes>.activities
        .first(where: { $0.attributes.partidaId == estado.partidaId }) else { return }
      Task { await actividad.update(Self.contenido(estado)) }
    }

    Function("terminarTruco") { (partidaId: String?) -> Void in
      guard #available(iOS 17.0, *) else { return }
      Cola.limpiar()
      for actividad in Activity<TrucoAttributes>.activities
      where partidaId == nil || actividad.attributes.partidaId == partidaId {
        Task { await actividad.end(nil, dismissalPolicy: .immediate) }
      }
    }

    /// Lo que se apretó en los botones mientras la app no estaba. Vacía la cola:
    /// quien llama se queda con la única copia y tiene que aplicarla. Viene con
    /// la partida a la que pertenece, así la app puede aplicarlo sin tener esa
    /// pantalla abierta.
    Function("tomarPendientes") { () -> [String: Any] in
      guard #available(iOS 17.0, *) else { return ["partidaId": "", "acciones": []] }
      let partidaId = Activity<TrucoAttributes>.activities.first?.attributes.partidaId
      let acciones = Cola.leer()
      Cola.limpiar()
      // Sin actividad viva no hay a qué aplicarlo: la cola se tira.
      guard let partidaId else { return ["partidaId": "", "acciones": []] }
      return [
        "partidaId": partidaId,
        "acciones": acciones.map { accion -> [String: Any] in
          switch accion {
          case .sumar(let equipo): return ["tipo": "sumar", "equipo": equipo]
          case .deshacer: return ["tipo": "deshacer"]
          }
        },
      ]
    }
  }

  @available(iOS 17.0, *)
  private static func contenido(_ estado: EstadoTruco) -> ActivityContent<TrucoAttributes.ContentState> {
    ActivityContent(
      state: TrucoAttributes.ContentState(
        nosotros: estado.nosotros,
        ellos: estado.ellos,
        ultimoEquipo: estado.ultimoEquipo
      ),
      // Regla 3 del diseño: se cierra sola tras dos horas sin cambios.
      staleDate: Date().addingTimeInterval(2 * 60 * 60)
    )
  }

  /// El estado que leen los App Intents para saber desde dónde contar.
  private static func publicar(_ estado: EstadoTruco) {
    Snapshot.guardar(
      TrucoAttributes.ContentState(
        nosotros: estado.nosotros,
        ellos: estado.ellos,
        ultimoEquipo: estado.ultimoEquipo
      )
    )
  }
}
