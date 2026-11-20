import ActivityKit
import AppIntents
import SwiftUI
import WidgetKit
#if canImport(AlarmKit)
import AlarmKit
#endif

/// Los colores son los mismos de `src/theme/tokens.ts`. La Live Activity se
/// pinta siempre oscura: en la pantalla bloqueada no hay modo claro.
enum Paleta {
  static let tinta = Color(red: 0x15 / 255, green: 0x11 / 255, blue: 0x10 / 255)
  static let marfil = Color(red: 0xFB / 255, green: 0xF8 / 255, blue: 0xF2 / 255)
  static let mostaza = Color(red: 0xF4 / 255, green: 0xB7 / 255, blue: 0x40 / 255)
  static let tomate = Color(red: 0xEF / 255, green: 0x7A / 255, blue: 0x57 / 255)
  static let apagado = Color(red: 0xB4 / 255, green: 0xA7 / 255, blue: 0x9C / 255)
}

@main
struct QuienGanaWidgets: WidgetBundle {
  var body: some Widget {
    TrucoLiveActivity()
    // iOS 17–25. En el Apple Watch aparece sola en el Smart Stack (watchOS 11+),
    // armada con la vista compacta de la isla.
    RelojLiveActivity()
    #if canImport(AlarmKit)
    // iOS 26+: el reloj es una alarma de AlarmKit, con vista propia en el Watch.
    if #available(iOS 26.0, *) {
      RelojAlarmaLiveActivity()
    }
    #endif
  }
}

// MARK: - Truco

struct TrucoLiveActivity: Widget {
  var body: some WidgetConfiguration {
    ActivityConfiguration(for: TrucoAttributes.self) { contexto in
      TrucoPantallaBloqueada(contexto: contexto)
        .activityBackgroundTint(Paleta.tinta)
        .activitySystemActionForegroundColor(Paleta.marfil)
    } dynamicIsland: { contexto in
      DynamicIsland {
        DynamicIslandExpandedRegion(.center) {
          HStack(alignment: .firstTextBaseline) {
            MarcadorChico(nombre: contexto.attributes.nombreNos, puntos: contexto.state.nosotros, alineado: .leading)
            Spacer(minLength: 8)
            Text("faltan \(faltanDelPuntero(contexto))")
              .font(.system(size: 12, weight: .semibold))
              .foregroundStyle(Paleta.mostaza)
            Spacer(minLength: 8)
            MarcadorChico(nombre: contexto.attributes.nombreEllos, puntos: contexto.state.ellos, alineado: .trailing)
          }
        }
        DynamicIslandExpandedRegion(.bottom) {
          HStack(spacing: 6) {
            BotonSumar(equipo: 0, texto: "+1 \(corto(contexto.attributes.nombreNos))", color: Paleta.mostaza)
            BotonSumar(equipo: 1, texto: "+1 \(corto(contexto.attributes.nombreEllos))", color: Paleta.tomate)
          }
        }
      } compactLeading: {
        ClayCartaEspada(lado: 22)
      } compactTrailing: {
        HStack(spacing: 3) {
          Text("\(contexto.state.nosotros)").foregroundStyle(Paleta.mostaza)
          Text("·").foregroundStyle(Paleta.apagado)
          Text("\(contexto.state.ellos)")
        }
        .font(.system(size: 14, weight: .bold).monospacedDigit())
      } minimal: {
        Text("\(contexto.state.nosotros)")
          .font(.system(size: 13, weight: .bold).monospacedDigit())
          .foregroundStyle(Paleta.mostaza)
      }
      .keylineTint(Paleta.mostaza)
    }
  }
}

private struct TrucoPantallaBloqueada: View {
  let contexto: ActivityViewContext<TrucoAttributes>

  var body: some View {
    VStack(alignment: .leading, spacing: 10) {
      HStack(spacing: 8) {
        ClayCartaEspada(lado: 24)
        Text("Truco · a \(contexto.attributes.target)")
          .font(.system(size: 13, weight: .semibold))
        Spacer()
        Text("faltan \(faltanDelPuntero(contexto))")
          .font(.system(size: 12, weight: .semibold).monospacedDigit())
          .foregroundStyle(Paleta.apagado)
      }

      HStack(spacing: 0) {
        Marcador(
          nombre: contexto.attributes.nombreNos,
          puntos: contexto.state.nosotros,
          target: contexto.attributes.target
        )
        Marcador(
          nombre: contexto.attributes.nombreEllos,
          puntos: contexto.state.ellos,
          target: contexto.attributes.target
        )
      }

      HStack(spacing: 6) {
        BotonSumar(equipo: 0, texto: "+1 \(corto(contexto.attributes.nombreNos))", color: Paleta.mostaza)
        BotonSumar(equipo: 1, texto: "+1 \(corto(contexto.attributes.nombreEllos))", color: Paleta.tomate)
        Button(intent: Deshacer()) {
          Image(systemName: "arrow.uturn.backward")
            .font(.system(size: 14, weight: .bold))
            .frame(width: 36, height: 36)
            .overlay(Circle().strokeBorder(Paleta.marfil, lineWidth: 1.5))
        }
        .buttonStyle(.plain)
        .foregroundStyle(Paleta.marfil)
        .opacity(contexto.state.puedeDeshacer ? 1 : 0.35)
        .disabled(!contexto.state.puedeDeshacer)
      }
    }
    .padding(.horizontal, 14)
    .padding(.vertical, 12)
    .foregroundStyle(Paleta.marfil)
  }
}

private struct Marcador: View {
  let nombre: String
  let puntos: Int
  let target: Int

  var body: some View {
    VStack(alignment: .leading, spacing: 0) {
      Text(nombre)
        .font(.system(size: 12))
        .foregroundStyle(Paleta.apagado)
        .lineLimit(1)
      HStack(alignment: .firstTextBaseline, spacing: 5) {
        Text("\(puntos)")
          .font(.system(size: 34, weight: .heavy).monospacedDigit())
        if target == 30 {
          Text(enBuenas(puntos, target) ? "buenas" : "malas")
            .font(.system(size: 12, weight: .semibold))
            .foregroundStyle(enBuenas(puntos, target) ? Paleta.mostaza : Paleta.apagado)
        }
      }
    }
    .frame(maxWidth: .infinity, alignment: .leading)
  }
}

private struct MarcadorChico: View {
  let nombre: String
  let puntos: Int
  let alineado: HorizontalAlignment

  var body: some View {
    HStack(spacing: 5) {
      if alineado == .trailing {
        Text("\(puntos)").font(.system(size: 26, weight: .heavy).monospacedDigit())
        Text(corto(nombre)).font(.system(size: 13)).foregroundStyle(Paleta.apagado)
      } else {
        Text(corto(nombre)).font(.system(size: 13)).foregroundStyle(Paleta.apagado)
        Text("\(puntos)").font(.system(size: 26, weight: .heavy).monospacedDigit())
      }
    }
  }
}

private struct BotonSumar: View {
  let equipo: Int
  let texto: String
  let color: Color

  var body: some View {
    Button(intent: SumarPunto(equipo: equipo)) {
      Text(texto)
        .font(.system(size: 14, weight: .bold))
        .lineLimit(1)
        .frame(maxWidth: .infinity)
        .frame(height: 36)
        .background(color, in: Capsule())
        .foregroundStyle(Paleta.tinta)
    }
    .buttonStyle(.plain)
  }
}

/// La arcilla del truco: el as de espadas, que es la carta que corresponde a la
/// baraja española. Va suelta en la carpeta del target, no en el catálogo: el
/// imageset que genera el plugin declara 2x y 3x sin archivo y sale gris.
private struct ClayCartaEspada: View {
  let lado: CGFloat

  var body: some View {
    if let imagen = UIImage(named: "carta-espada") {
      Image(uiImage: imagen)
        .renderingMode(.original)
        .resizable()
        .scaledToFit()
        .frame(width: lado, height: lado)
    }
  }
}

/// "Nosotros" no entra en un botón: el diseño lo corta a "Nos".
private func corto(_ nombre: String) -> String {
  nombre.count <= 5 ? nombre : String(nombre.prefix(3))
}

private func faltanDelPuntero(_ contexto: ActivityViewContext<TrucoAttributes>) -> Int {
  let puntero = max(contexto.state.nosotros, contexto.state.ellos)
  return faltan(puntero, contexto.attributes.target)
}

// MARK: - Reloj

struct RelojLiveActivity: Widget {
  var body: some WidgetConfiguration { relojConfiguracion() }
}

private func relojConfiguracion() -> some WidgetConfiguration {
  ActivityConfiguration(for: RelojAttributes.self) { contexto in
      RelojVista(
        fin: contexto.state.fin,
        restante: contexto.state.restante,
        duracion: contexto.attributes.duracion,
        pausado: contexto.state.pausado,
        terminado: contexto.state.terminado
      )
      .activityBackgroundTint(Paleta.tinta)
      .activitySystemActionForegroundColor(Paleta.marfil)
    } dynamicIsland: { contexto in
      relojIsla(
        fin: contexto.state.fin,
        restante: contexto.state.restante,
        duracion: contexto.attributes.duracion,
        pausado: contexto.state.pausado,
        terminado: contexto.state.terminado
      )
    }
}

#if canImport(AlarmKit)
/// La misma vista, pero alimentada por la alarma de AlarmKit (iOS 26+).
@available(iOS 26.0, *)
struct RelojAlarmaLiveActivity: Widget {
  var body: some WidgetConfiguration {
    ActivityConfiguration(for: AlarmAttributes<RelojMetadata>.self) { contexto in
      let e = EstadoAlarma(contexto.state.mode)
      RelojVista(fin: e.fin, restante: e.restante, duracion: e.duracion, pausado: e.pausado, terminado: e.terminado)
        .activityBackgroundTint(Paleta.tinta)
        .activitySystemActionForegroundColor(Paleta.marfil)
    } dynamicIsland: { contexto in
      let e = EstadoAlarma(contexto.state.mode)
      return relojIsla(fin: e.fin, restante: e.restante, duracion: e.duracion, pausado: e.pausado, terminado: e.terminado)
    }
    .supplementalActivityFamilies([.small, .medium])
  }
}

@available(iOS 26.0, *)
private struct EstadoAlarma {
  var fin = Date()
  var restante: TimeInterval = 0
  var duracion: TimeInterval = 1
  var pausado = false
  var terminado = false

  init(_ modo: AlarmPresentationState.Mode) {
    switch modo {
    case .countdown(let c):
      fin = c.fireDate
      duracion = c.totalCountdownDuration
      restante = max(0, c.fireDate.timeIntervalSinceNow)
    case .paused(let p):
      duracion = p.totalCountdownDuration
      restante = max(0, p.totalCountdownDuration - p.previouslyElapsedDuration)
      pausado = true
    case .alert:
      terminado = true
    @unknown default:
      terminado = true
    }
  }
}
#endif

/// Lo que queda, como "1:05", para cuando está pausado.
private func mmss(_ segundos: TimeInterval) -> String {
  let s = Int(segundos.rounded(.up))
  return String(format: "%d:%02d", s / 60, s % 60)
}

private func relojIsla(
  fin: Date, restante: TimeInterval, duracion: TimeInterval, pausado: Bool, terminado: Bool
) -> DynamicIsland {
  DynamicIsland {
    DynamicIslandExpandedRegion(.leading) {
      Image(systemName: "hourglass")
        .font(.system(size: 22, weight: .bold))
        .foregroundStyle(Paleta.mostaza)
        .padding(.leading, 6)
    }
    DynamicIslandExpandedRegion(.trailing) {
      Cuenta(fin: fin, restante: restante, pausado: pausado, terminado: terminado, tamano: 28)
        .padding(.trailing, 6)
    }
    DynamicIslandExpandedRegion(.bottom) {
      Progreso(fin: fin, restante: restante, duracion: duracion, pausado: pausado, terminado: terminado)
        .padding(.horizontal, 6)
    }
  } compactLeading: {
    Image(systemName: terminado ? "bell.fill" : "hourglass")
      .foregroundStyle(Paleta.mostaza)
  } compactTrailing: {
    Cuenta(fin: fin, restante: restante, pausado: pausado, terminado: terminado, tamano: 14)
      .frame(maxWidth: 52)
  } minimal: {
    Image(systemName: terminado ? "bell.fill" : "hourglass")
      .foregroundStyle(Paleta.mostaza)
  }
  .keylineTint(Paleta.mostaza)
}

private struct RelojVista: View {
  let fin: Date
  let restante: TimeInterval
  let duracion: TimeInterval
  let pausado: Bool
  let terminado: Bool

  var body: some View {
    if #available(iOS 18.0, *) {
      RelojVistaConFamilia(fin: fin, restante: restante, duracion: duracion, pausado: pausado, terminado: terminado)
    } else {
      RelojGrande(fin: fin, restante: restante, duracion: duracion, pausado: pausado, terminado: terminado)
    }
  }
}

/// En el Apple Watch (`.small`) va sólo el número grande y la barra.
@available(iOS 18.0, *)
private struct RelojVistaConFamilia: View {
  @Environment(\.activityFamily) private var familia
  let fin: Date
  let restante: TimeInterval
  let duracion: TimeInterval
  let pausado: Bool
  let terminado: Bool

  var body: some View {
    if familia == .small {
      VStack(alignment: .leading, spacing: 4) {
        Cuenta(fin: fin, restante: restante, pausado: pausado, terminado: terminado, tamano: 30)
        Progreso(fin: fin, restante: restante, duracion: duracion, pausado: pausado, terminado: terminado)
      }
      .padding(8)
      .foregroundStyle(Paleta.marfil)
    } else {
      RelojGrande(fin: fin, restante: restante, duracion: duracion, pausado: pausado, terminado: terminado)
    }
  }
}

private struct RelojGrande: View {
  let fin: Date
  let restante: TimeInterval
  let duracion: TimeInterval
  let pausado: Bool
  let terminado: Bool

  var body: some View {
    VStack(alignment: .leading, spacing: 10) {
      HStack(spacing: 8) {
        Image(systemName: terminado ? "bell.fill" : "hourglass")
          .foregroundStyle(Paleta.mostaza)
        Text(terminado ? "¡Tiempo!" : pausado ? "Reloj · en pausa" : "Reloj")
          .font(.system(size: 13, weight: .semibold))
        Spacer()
        Cuenta(fin: fin, restante: restante, pausado: pausado, terminado: terminado, tamano: 36)
      }
      Progreso(fin: fin, restante: restante, duracion: duracion, pausado: pausado, terminado: terminado)
    }
    .padding(.horizontal, 16)
    .padding(.vertical, 14)
    .foregroundStyle(Paleta.marfil)
  }
}

/// La cuenta regresiva. Corriendo la dibuja el sistema y avanza sola.
private struct Cuenta: View {
  let fin: Date
  let restante: TimeInterval
  let pausado: Bool
  let terminado: Bool
  let tamano: CGFloat

  var body: some View {
    Group {
      if terminado {
        Text("0:00")
      } else if pausado || fin <= Date() {
        Text(mmss(restante))
      } else {
        Text(timerInterval: Date()...fin, countsDown: true)
      }
    }
    .font(.system(size: tamano, weight: .heavy).monospacedDigit())
    .multilineTextAlignment(.trailing)
    .foregroundStyle(terminado ? Paleta.tomate : Paleta.marfil)
  }
}

private struct Progreso: View {
  let fin: Date
  let restante: TimeInterval
  let duracion: TimeInterval
  let pausado: Bool
  let terminado: Bool

  var body: some View {
    Group {
      if terminado || pausado || fin <= Date() {
        ProgressView(value: terminado ? 0 : max(0, min(1, restante / max(duracion, 1))))
      } else {
        ProgressView(
          timerInterval: fin.addingTimeInterval(-max(duracion, 1))...fin,
          countsDown: true,
          label: { EmptyView() },
          currentValueLabel: { EmptyView() }
        )
      }
    }
    .progressViewStyle(.linear)
    .tint(terminado ? Paleta.tomate : Paleta.mostaza)
  }
}
