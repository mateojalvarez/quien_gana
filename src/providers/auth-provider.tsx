import type { Session } from '@supabase/supabase-js';
import { createContext, useContext, useEffect, useState, type ReactNode } from 'react';

import { localGamesArePreserved } from '@/lib/session-flags';
import { isSupabaseConfigured, supabase } from '@/lib/supabase';
import { useGames } from '@/store/games';

type AuthState = {
  session: Session | null;
  loading: boolean;
  configured: boolean;
};

const AuthContext = createContext<AuthState>({ session: null, loading: true, configured: false });

export function AuthProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<Session | null>(null);
  const [loading, setLoading] = useState(isSupabaseConfigured);

  useEffect(() => {
    if (!isSupabaseConfigured) return;
    supabase.auth.getSession().then(({ data }) => {
      setSession(data.session);
      setLoading(false);
    });
    const { data: sub } = supabase.auth.onAuthStateChange((event, next) => {
      setSession(next);
      // En un merge el SIGNED_OUT es un paso intermedio: no borramos lo local.
      if (event === 'SIGNED_OUT' && !localGamesArePreserved()) useGames.getState().reset();
    });
    return () => sub.subscription.unsubscribe();
  }, []);

  return (
    <AuthContext.Provider value={{ session, loading, configured: isSupabaseConfigured }}>
      {children}
    </AuthContext.Provider>
  );
}

export const useAuth = () => useContext(AuthContext);
