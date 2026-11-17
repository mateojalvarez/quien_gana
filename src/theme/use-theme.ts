import { useColorScheme } from 'react-native';

import { useSettings } from '@/store/settings';
import { colors, type ColorScheme } from './tokens';

export function useScheme(): ColorScheme {
  const system = useColorScheme();
  const pref = useSettings((s) => s.theme);
  if (pref === 'system') return system === 'dark' ? 'dark' : 'light';
  return pref;
}

export function useTheme() {
  const scheme = useScheme();
  return { scheme, c: colors[scheme] };
}
