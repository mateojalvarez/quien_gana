import ActivityKit
import AppIntents
import SwiftUI
import WidgetKit

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
        ClayCartaAs(lado: 22)
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
        ClayCartaAs(lado: 24)
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

/// La arcilla del truco. Va suelta en la carpeta del target, no en el catálogo:
/// el imageset que genera el plugin declara 2x y 3x sin archivo y sale gris.
private struct ClayCartaAs: View {
  let lado: CGFloat

  var body: some View {
    if let imagen = UIImage(named: "carta-as") {
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
