import { View } from 'react-native';

import { RULES } from '@/features/truco/rules';

/**
 * Los puntos del truco como se anotan en papel: cuatro fósforos formando un
 * cuadrado y el quinto cruzado en diagonal. Dibujado, no un ícono.
 */
export function Fosforos({ groups, size = 40, color, off }: { groups: number[]; size?: number; color: string; off: string }) {
  return (
    <View style={{ flexDirection: 'row', gap: 7 }}>
      {groups.map((n, i) => (
        <Grupo key={i} n={n} size={size} color={color} off={off} />
      ))}
    </View>
  );
}

function Grupo({ n, size, color, off }: { n: number; size: number; color: string; off: string }) {
  const grosor = 4;
  const r = grosor / 2;
  const tinta = (i: number) => (i < n ? color : off);
  const faltan = RULES.perGroup - n;

  return (
    <View
      style={{ width: size, height: size }}
      accessibilityLabel={n === 0 ? 'Sin puntos' : `${n} de ${RULES.perGroup}`}
      accessible
      // el grupo entero es una sola cosa para el lector de pantalla
      importantForAccessibility={faltan === RULES.perGroup ? 'no-hide-descendants' : 'yes'}
    >
      {/* izquierda */}
      <View style={{ position: 'absolute', left: 0, top: 3, bottom: 3, width: grosor, borderRadius: r, backgroundColor: tinta(0) }} />
      {/* arriba */}
      <View style={{ position: 'absolute', top: 0, left: 3, right: 3, height: grosor, borderRadius: r, backgroundColor: tinta(1) }} />
      {/* derecha */}
      <View style={{ position: 'absolute', right: 0, top: 3, bottom: 3, width: grosor, borderRadius: r, backgroundColor: tinta(2) }} />
      {/* abajo */}
      <View style={{ position: 'absolute', bottom: 0, left: 3, right: 3, height: grosor, borderRadius: r, backgroundColor: tinta(3) }} />
      {/* el quinto, cruzado */}
      <View
        style={{
          position: 'absolute',
          left: -size * 0.125,
          top: size / 2 - r,
          width: size * 1.25,
          height: grosor,
          borderRadius: r,
          backgroundColor: tinta(4),
          transform: [{ rotate: '45deg' }],
        }}
      />
    </View>
  );
}
