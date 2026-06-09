import React, { createContext, useContext, useEffect, useState } from 'react';
import { supabase } from '../lib/supabase';
import { getSession } from '../lib/auth';

interface CustomUser {
  id: string;
  name: string;
  username: string;
  [key: string]: any;
}

interface AuthContextType {
  session: any | null;
  user: CustomUser | null;
  userName: string;
  loading: boolean;
  refreshSession: () => Promise<void>;
}

const AuthContext = createContext<AuthContextType>({ session: null, user: null, userName: '', loading: true, refreshSession: async () => {} });

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [session, setSession] = useState<any | null>(null);
  const [user, setUser] = useState<CustomUser | null>(null);
  const [userName, setUserName] = useState('');
  const [loading, setLoading] = useState(true);

  const refreshSession = async () => {
    setLoading(true);
    const s = await getSession();
    setSession(s);
    setUser(s?.user ?? null);
    
    if (s?.user) {
      // Prioritize the name from the session object
      setUserName(s.user.name);
      
      // Optionally fetch from players table if needed, but not required if session has it
      const { data } = await supabase.from('players').select('name').eq('user_id', s.user.id).single();
      if (data?.name) {
        setUserName(data.name);
      }
    } else {
      setUserName('');
    }
    setLoading(false);
  };

  useEffect(() => {
    refreshSession();
  }, []);

  return <AuthContext.Provider value={{ session, user, userName, loading, refreshSession }}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  return useContext(AuthContext);
}
