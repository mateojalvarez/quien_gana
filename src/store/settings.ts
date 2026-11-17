import AsyncStorage from '@react-native-async-storage/async-storage';
import { create } from 'zustand';
import { createJSONStorage, persist } from 'zustand/middleware';

export type ThemePref = 'system' | 'light' | 'dark';

type SettingsState = {
  theme: ThemePref;
  haptics: boolean;
  setTheme: (t: ThemePref) => void;
  setHaptics: (v: boolean) => void;
};

export const useSettings = create<SettingsState>()(
  persist(
    (set) => ({
      theme: 'system',
      haptics: true,
      setTheme: (theme) => set({ theme }),
      setHaptics: (haptics) => set({ haptics }),
    }),
    { name: 'qg-settings', storage: createJSONStorage(() => AsyncStorage) },
  ),
);
