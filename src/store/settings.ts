import AsyncStorage from '@react-native-async-storage/async-storage';
import { create } from 'zustand';
import { createJSONStorage, persist } from 'zustand/middleware';

export type ThemePref = 'system' | 'light' | 'dark';

type SettingsState = {
  theme: ThemePref;
  haptics: boolean;
  /** Las Live Activities del diseño: se pueden apagar desde Perfil. */
  liveActivities: boolean;
  setTheme: (t: ThemePref) => void;
  setHaptics: (v: boolean) => void;
  setLiveActivities: (v: boolean) => void;
};

export const useSettings = create<SettingsState>()(
  persist(
    (set) => ({
      theme: 'system',
      haptics: true,
      liveActivities: true,
      setTheme: (theme) => set({ theme }),
      setHaptics: (haptics) => set({ haptics }),
      setLiveActivities: (liveActivities) => set({ liveActivities }),
    }),
    { name: 'qg-settings', storage: createJSONStorage(() => AsyncStorage) },
  ),
);
