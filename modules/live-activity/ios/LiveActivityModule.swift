import ActivityKit
import ExpoModulesCore
import SwiftUI
#if canImport(AlarmKit)
import AlarmKit
#endif

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

/// El reloj (temporizador) como lo ve la pantalla bloqueada.
struct EstadoReloj: Record {
  /// Epoch en ms en que llega a cero (si corre).
  @Field var finMs: Double = 0
  @Field var duracionMs: Double = 60_000
  @Field var restanteMs: Double = 60_000
  @Field var pausado: Bool = false
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

    // MARK: Reloj

    /// iOS 26+: pide permiso para agendar el reloj como alarma (AlarmKit).
    /// Devuelve true si se puede usar; en iOS anteriores, false.
    AsyncFunction("permisoAlarma") { () async -> Bool in
      #if canImport(AlarmKit)
      if #available(iOS 26.0, *) {
        switch AlarmManager.shared.authorizationState {
        case .authorized: return true
        case .denied: return false
        case .notDetermined:
          let estado = try? await AlarmManager.shared.requestAuthorization()
          return estado == .authorized
        @unknown default: return false
        }
      }
      #endif
      return false
    }

    /// Arranca o actualiza el reloj en la pantalla bloqueada. Corriendo en
    /// iOS 26+ con permiso, es una alarma de AlarmKit (suena aunque el teléfono
    /// esté bloqueado o en silencio). Si no, una Live Activity común y la app
    /// agenda una notificación para el final. Devuelve "alarma", "actividad" o "".
    AsyncFunction("reloj") { (estado: EstadoReloj) async -> String in
      guard #available(iOS 17.0, *) else { return "" }
      #if canImport(AlarmKit)
      if #available(iOS 26.0, *), !estado.pausado, AlarmManager.shared.authorizationState == .authorized {
        await Self.terminarActividadReloj()
        if await Self.agendarAlarma(segundos: max(1, estado.finMs / 1000 - Date().timeIntervalSince1970)) {
          return "alarma"
        }
      } else if #available(iOS 26.0, *) {
        Self.cancelarAlarma()
      }
      #endif
      return await Self.actividadReloj(estado) ? "actividad" : ""
    }

    /// Fin del reloj. `enPantalla`: la app está abierta y ya suena su propio
    /// aviso, así que la alarma del sistema se corta. Con el teléfono bloqueado
    /// se deja sonar.
    AsyncFunction("terminarReloj") { (llego: Bool, enPantalla: Bool) async -> Void in
      guard #available(iOS 17.0, *) else { return }
      #if canImport(AlarmKit)
      if #available(iOS 26.0, *), enPantalla || !llego {
        Self.cancelarAlarma()
      }
      #endif
      for actividad in Activity<RelojAttributes>.activities {
        if llego {
          // Avisa una vez (vibra el teléfono y el Apple Watch) y se va sola.
          let fin = RelojAttributes.ContentState(fin: Date(), restante: 0, pausado: false, terminado: true)
          await actividad.update(
            ActivityContent(state: fin, staleDate: nil),
            alertConfiguration: enPantalla
              ? nil
              : AlertConfiguration(title: "¡Tiempo!", body: "Se terminó el reloj.", sound: .default)
          )
          await actividad.end(ActivityContent(state: fin, staleDate: nil), dismissalPolicy: .after(Date().addingTimeInterval(60)))
        } else {
          await actividad.end(nil, dismissalPolicy: .immediate)
        }
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

  // MARK: Reloj (ayudas)

  @available(iOS 17.0, *)
  private static func actividadReloj(_ estado: EstadoReloj) async -> Bool {
    guard ActivityAuthorizationInfo().areActivitiesEnabled else { return false }
    let contenido = ActivityContent(
      state: RelojAttributes.ContentState(
        fin: Date(timeIntervalSince1970: estado.finMs / 1000),
        restante: estado.restanteMs / 1000,
        pausado: estado.pausado,
        terminado: false
      ),
      staleDate: nil
    )
    let duracion = max(1, estado.duracionMs / 1000)
    if let viva = Activity<RelojAttributes>.activities.first, viva.attributes.duracion == duracion {
      await viva.update(contenido)
      return true
    }
    await terminarActividadReloj()
    do {
      _ = try Activity.request(attributes: RelojAttributes(duracion: duracion), content: contenido, pushType: nil)
      return true
    } catch {
      return false
    }
  }

  @available(iOS 17.0, *)
  private static func terminarActividadReloj() async {
    for vieja in Activity<RelojAttributes>.activities {
      await vieja.end(nil, dismissalPolicy: .immediate)
    }
  }

  #if canImport(AlarmKit)
  private static let claveAlarma = "reloj.alarma"

  @available(iOS 26.0, *)
  private static func agendarAlarma(segundos: TimeInterval) async -> Bool {
    cancelarAlarma()
    let tinta = Color(red: 0xF4 / 255, green: 0xB7 / 255, blue: 0x40 / 255)
    // En 26.1 el botón de parar lo pone el sistema; en 26.0 hay que pasarlo.
    let alerta: AlarmPresentation.Alert
    if #available(iOS 26.1, *) {
      alerta = AlarmPresentation.Alert(title: "¡Tiempo!")
    } else {
      alerta = AlarmPresentation.Alert(
        title: "¡Tiempo!",
        stopButton: AlarmButton(text: "Listo", textColor: .black, systemImageName: "stop.fill")
      )
    }
    let presentacion = AlarmPresentation(alert: alerta, countdown: AlarmPresentation.Countdown(title: "Reloj"))
    let atributos = AlarmAttributes<RelojMetadata>(presentation: presentacion, metadata: RelojMetadata(), tintColor: tinta)
    let id = UUID()
    do {
      _ = try await AlarmManager.shared.schedule(
        id: id,
        configuration: .timer(duration: segundos, attributes: atributos)
      )
      UserDefaults(suiteName: grupoApp)?.set(id.uuidString, forKey: claveAlarma)
      return true
    } catch {
      return false
    }
  }

  @available(iOS 26.0, *)
  private static func cancelarAlarma() {
    let defaults = UserDefaults(suiteName: grupoApp)
    guard let texto = defaults?.string(forKey: claveAlarma), let id = UUID(uuidString: texto) else { return }
    try? AlarmManager.shared.stop(id: id)
    try? AlarmManager.shared.cancel(id: id)
    defaults?.removeObject(forKey: claveAlarma)
  }
  #endif

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
