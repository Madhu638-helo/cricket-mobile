import React, { createContext, useContext, useEffect, useState } from 'react';
import { supabase } from '../lib/supabase';
import { getSession } from '../lib/auth';
import {
  isBiometricEnabled, setBiometricEnabled,
  getBiometricLabel, isBiometricAvailable, 
  wasBiometricSetupShown, markBiometricSetupShown
} from '../utils/biometric';
import { Alert } from 'react-native';
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
  biometricLock: boolean;
  refreshSession: () => Promise<void>;
  unlockWithBiometric: () => Promise<void>;
  disableBiometric: () => Promise<void>;
  promptBiometricSetup: () => Promise<void>;
}

const AuthContext = createContext<AuthContextType>({ 
  session: null, user: null, userName: '', loading: true, biometricLock: false,
  refreshSession: async () => {}, unlockWithBiometric: async () => {}, 
  disableBiometric: async () => {}, promptBiometricSetup: async () => {} 
});

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [session, setSession] = useState<any | null>(null);
  const [user, setUser] = useState<CustomUser | null>(null);
  const [userName, setUserName] = useState('');
  const [loading, setLoading] = useState(true);
  const [biometricLock, setBiometricLock] = useState(false);

  const refreshSession = async () => {
    setLoading(true);
    const s = await getSession();
    
    if (s?.user) {
      const bioEnabled = await isBiometricEnabled();
      if (bioEnabled && !session) {
        setBiometricLock(true);
      } else {
        await loadUserData(s);
      }
    } else {
      setSession(null);
      setUser(null);
      setUserName('');
    }
    setLoading(false);
  };

  const loadUserData = async (s: any) => {
    setSession(s);
    setUser(s?.user ?? null);
    
    // Prioritize the name from the session object
    setUserName(s.user.name || '');
    
    // Optionally fetch from players table if needed
    const { data } = await (supabase.from('players') as any).select('name').eq('user_id', s.user.id).single();
    if (data?.name) {
      setUserName(data.name);
    }
  };

  const unlockWithBiometric = async () => {
    setLoading(true);
    setBiometricLock(false);
    const s = await getSession();
    if (s?.user) {
      await loadUserData(s);
    }
    setLoading(false);
  };

  const disableBiometric = async () => {
    setBiometricLock(false);
    setSession(null);
    setUser(null);
  };

  const promptBiometricSetup = async () => {
    try {
      const already = await wasBiometricSetupShown();
      if (already) return;
      const available = await isBiometricAvailable();
      if (!available) return;

      await markBiometricSetupShown();
      const label = await getBiometricLabel();

      Alert.alert(
        `Enable ${label}?`,
        `Use ${label} to unlock the app — no password needed next time.`,
        [
          { text: 'Not Now', style: 'cancel' },
          {
            text: `Enable ${label}`,
            onPress: () => setBiometricEnabled(true).catch(() => {}),
          },
        ],
      );
    } catch {}
  };

  useEffect(() => {
    refreshSession();
  }, []);

  return <AuthContext.Provider value={{ session, user, userName, loading, biometricLock, refreshSession, unlockWithBiometric, disableBiometric, promptBiometricSetup }}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  return useContext(AuthContext);
}
