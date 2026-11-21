import React, { createContext, useContext, useEffect } from 'react';
import { useResource } from './client';
import type { Session } from './types';

const SessionContext = createContext<{
  session: Session | null;
  loading: boolean;
  error: string | null;
  reload: () => void;
}>({ session: null, loading: true, error: null, reload: () => {} });
export function SessionProvider({ children }: { children: React.ReactNode }) {
  const { data, loading, error, reload, update } = useResource<Session | null>('/auth/session');
  useEffect(() => {
    const receive = (event: Event) => {
      if (event instanceof CustomEvent) update(event.detail);
    };
    window.addEventListener('travel:session', receive);
    return () => window.removeEventListener('travel:session', receive);
  }, [update]);
  return (
    <SessionContext.Provider value={{ session: data?.user ? data : null, loading, error, reload }}>
      {children}
    </SessionContext.Provider>
  );
}
export function useSession() {
  return useContext(SessionContext);
}
