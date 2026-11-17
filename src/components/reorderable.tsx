import { createContext, type ReactNode, useContext, useMemo } from 'react';
import { type StyleProp, View, type ViewStyle } from 'react-native';
import { Gesture, GestureDetector } from 'react-native-gesture-handler';
import Animated, {
  runOnJS,
  type SharedValue,
  useAnimatedStyle,
  useSharedValue,
  withTiming,
} from 'react-native-reanimated';

import { haptic } from '@/lib/haptics';

/**
 * Lista reordenable: se mantiene apretada una fila y se arrastra a su lugar.
 *
 * Las filas quedan en el flujo normal y sólo se mueven con `transform`, así que
 * el alto del contenedor no cambia mientras se arrastra. Eso obliga a que todas
 * midan lo mismo: el paso entre posiciones es `rowHeight + gap`.
 *
 * El estado del arrastre viaja por contexto y no por props: el React Compiler
 * no deja escribir en un shared value que llegó como prop.
 */

type DragState = { activeIndex: SharedValue<number>; dragY: SharedValue<number> };

const DragCtx = createContext<DragState | null>(null);

type Props<T> = {
  items: T[];
  keyOf: (item: T, index: number) => string;
  /** Alto exacto de cada fila; todas deben medir igual. */
  rowHeight: number;
  gap?: number;
  /** Se llama una vez al soltar, sólo si la posición cambió. */
  onReorder: (from: number, to: number) => void;
  renderItem: (item: T, index: number) => ReactNode;
  /** Cuánto hay que mantener apretado antes de que el arrastre tome el control. */
  longPressMs?: number;
  /** false deja las filas quietas. */
  enabled?: boolean;
  style?: StyleProp<ViewStyle>;
};

export function Reorderable<T>({
  items,
  keyOf,
  rowHeight,
  gap = 0,
  onReorder,
  renderItem,
  longPressMs = 220,
  enabled = true,
  style,
}: Props<T>) {
  const activeIndex = useSharedValue(-1);
  const dragY = useSharedValue(0);
  const drag = useMemo(() => ({ activeIndex, dragY }), [activeIndex, dragY]);

  return (
    <DragCtx.Provider value={drag}>
      <View style={[{ gap }, style]}>
        {items.map((item, i) => (
          <Row
            key={keyOf(item, i)}
            index={i}
            count={items.length}
            step={rowHeight + gap}
            onReorder={onReorder}
            longPressMs={longPressMs}
            enabled={enabled && items.length > 1}
          >
            {renderItem(item, i)}
          </Row>
        ))}
      </View>
    </DragCtx.Provider>
  );
}

type RowProps = {
  index: number;
  count: number;
  step: number;
  onReorder: (from: number, to: number) => void;
  longPressMs: number;
  enabled: boolean;
  children: ReactNode;
};

function Row({ index, count, step, onReorder, longPressMs, enabled, children }: RowProps) {
  const drag = useContext(DragCtx);
  if (!drag) throw new Error('Row de Reorderable usado fuera de la lista');
  const { activeIndex, dragY } = drag;

  const pan = Gesture.Pan()
    .enabled(enabled)
    .activateAfterLongPress(longPressMs)
    // Sin esto, un arrastre lateral queda atrapado acá en vez de pasar al scroll.
    .failOffsetX([-16, 16])
    .onStart(() => {
      activeIndex.set(index);
      dragY.set(0);
      runOnJS(haptic.tap)();
    })
    .onUpdate((e) => {
      // Topes: no tiene sentido arrastrar más allá de los extremos de la lista.
      const min = -index * step;
      const max = (count - 1 - index) * step;
      dragY.set(Math.min(max, Math.max(min, e.translationY)));
    })
    .onEnd(() => {
      const to = Math.min(count - 1, Math.max(0, Math.round(index + dragY.get() / step)));
      // Aterriza en la posición destino y recién ahí se reordena el array, así la
      // fila no salta entre el final del gesto y el render siguiente.
      dragY.set(
        withTiming((to - index) * step, { duration: 140 }, (done) => {
          'worklet';
          if (!done) return;
          activeIndex.set(-1);
          dragY.set(0);
          if (to !== index) runOnJS(onReorder)(index, to);
        }),
      );
    });

  const animated = useAnimatedStyle(() => {
    const active = activeIndex.get();
    const y = dragY.get();

    if (active === index) {
      return { transform: [{ translateY: y }, { scale: 1.02 }], zIndex: 2, opacity: 0.96 };
    }
    if (active === -1) {
      return { transform: [{ translateY: withTiming(0, { duration: 140 }) }, { scale: 1 }], zIndex: 1, opacity: 1 };
    }

    const hover = Math.min(count - 1, Math.max(0, Math.round(active + y / step)));
    let shift = 0;
    if (active < index && index <= hover) shift = -step;
    else if (hover <= index && index < active) shift = step;

    return {
      transform: [{ translateY: withTiming(shift, { duration: 140 }) }, { scale: 1 }],
      zIndex: 1,
      opacity: 1,
    };
  });

  return (
    <GestureDetector gesture={pan}>
      <Animated.View style={animated}>{children}</Animated.View>
    </GestureDetector>
  );
}
