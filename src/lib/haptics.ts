import * as Haptics from 'expo-haptics';
import { Platform } from 'react-native';

import { useSettings } from '@/store/settings';

const enabled = () => Platform.OS !== 'web' && useSettings.getState().haptics;

export const haptic = {
  tap: () => enabled() && Haptics.selectionAsync().catch(() => {}),
  light: () => enabled() && Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {}),
  heavy: () => enabled() && Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Heavy).catch(() => {}),
  success: () =>
    enabled() && Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => {}),
  warning: () =>
    enabled() && Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning).catch(() => {}),
};
