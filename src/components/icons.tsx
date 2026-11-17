import Svg, { Circle, Path, Rect } from 'react-native-svg';

/**
 * Íconos propios, trazo 2px redondeado, igual que el mockup.
 * Nada de íconos del sistema: todo dibujado acá.
 */
export type IconName =
  | 'chevronLeft'
  | 'chevronRight'
  | 'arrowRight'
  | 'check'
  | 'close'
  | 'plus'
  | 'minus'
  | 'home'
  | 'grid'
  | 'bars'
  | 'user'
  | 'sliders'
  | 'grip'
  | 'undo'
  | 'trash'
  | 'flag'
  | 'play'
  | 'pause'
  | 'dice'
  | 'clock';

type Props = { name: IconName; size?: number; color?: string; strokeWidth?: number };

export function Icon({ name, size = 20, color = '#151110', strokeWidth = 2 }: Props) {
  const stroke = {
    stroke: color,
    strokeWidth,
    strokeLinecap: 'round' as const,
    strokeLinejoin: 'round' as const,
    fill: 'none' as const,
  };
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24">
      {name === 'chevronLeft' && <Path d="M15 5l-7 7 7 7" {...stroke} strokeWidth={strokeWidth + 0.2} />}
      {name === 'chevronRight' && <Path d="M9 5l7 7-7 7" {...stroke} strokeWidth={strokeWidth + 0.2} />}
      {name === 'arrowRight' && <Path d="M5 12h14M13 6l6 6-6 6" {...stroke} strokeWidth={strokeWidth + 0.2} />}
      {name === 'check' && <Path d="M5 12l5 5 9-10" {...stroke} strokeWidth={strokeWidth + 0.8} />}
      {name === 'close' && <Path d="M6 6l12 12M18 6L6 18" {...stroke} />}
      {name === 'plus' && <Path d="M12 5v14M5 12h14" {...stroke} strokeWidth={strokeWidth + 0.4} />}
      {name === 'minus' && <Path d="M5 12h14" {...stroke} strokeWidth={strokeWidth + 0.4} />}
      {name === 'home' && <Path d="M3 11l9-7 9 7v9a1 1 0 0 1-1 1h-5v-6h-6v6H4a1 1 0 0 1-1-1z" {...stroke} />}
      {name === 'grid' && (
        <>
          <Rect x={4} y={4} width={6} height={6} rx={1.5} {...stroke} />
          <Rect x={14} y={4} width={6} height={6} rx={1.5} {...stroke} />
          <Rect x={4} y={14} width={6} height={6} rx={1.5} {...stroke} />
          <Rect x={14} y={14} width={6} height={6} rx={1.5} {...stroke} />
        </>
      )}
      {name === 'bars' && <Path d="M5 20V12M10 20V8M15 20v-5M20 20V5" {...stroke} />}
      {name === 'user' && (
        <>
          <Circle cx={12} cy={8} r={4} {...stroke} />
          <Path d="M4 21c1.5-4 4.5-6 8-6s6.5 2 8 6" {...stroke} />
        </>
      )}
      {name === 'sliders' && (
        <>
          <Path d="M4 7h10M18 7h2M4 17h4M12 17h8" {...stroke} />
          <Circle cx={16} cy={7} r={2} {...stroke} />
          <Circle cx={10} cy={17} r={2} {...stroke} />
        </>
      )}
      {name === 'grip' && (
        <>
          {[5, 12, 19].map((y) => (
            <Circle key={`l${y}`} cx={9} cy={y} r={1.6} fill={color} />
          ))}
          {[5, 12, 19].map((y) => (
            <Circle key={`r${y}`} cx={15} cy={y} r={1.6} fill={color} />
          ))}
        </>
      )}
      {name === 'undo' && <Path d="M4 9h11a5 5 0 1 1 0 10H8M4 9l4-4M4 9l4 4" {...stroke} />}
      {name === 'trash' && <Path d="M5 7h14M9 7V5h6v2M7 7l1 13h8l1-13M11 11v6M14 11v6" {...stroke} />}
      {name === 'flag' && <Path d="M6 21V4h9l-1.5 4L15 12H6" {...stroke} />}
      {name === 'play' && <Path d="M8 5.5l11 6.5-11 6.5z" {...stroke} />}
      {name === 'pause' && <Path d="M9 5v14M15 5v14" {...stroke} strokeWidth={strokeWidth + 0.6} />}
      {name === 'dice' && (
        <>
          <Rect x={4} y={4} width={16} height={16} rx={4} {...stroke} />
          <Circle cx={9} cy={9} r={1.4} fill={color} />
          <Circle cx={15} cy={15} r={1.4} fill={color} />
          <Circle cx={12} cy={12} r={1.4} fill={color} />
        </>
      )}
      {name === 'clock' && (
        <>
          <Circle cx={12} cy={12} r={8} {...stroke} />
          <Path d="M12 8v4.5l3 2" {...stroke} />
        </>
      )}
    </Svg>
  );
}
