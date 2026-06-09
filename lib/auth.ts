import AsyncStorage from '@react-native-async-storage/async-storage';
import { supabase } from './supabase';

const API_URL = process.env.EXPO_PUBLIC_API_URL || 'https://cricket.shreephanindra.com/api';

const SESSION_KEY = 'cricket_user_session';
const TOKEN_KEY   = 'cricket_auth_token';

// ── Helpers ──────────────────────────────────────────────────────────────────

export async function getStoredToken(): Promise<string | null> {
  return AsyncStorage.getItem(TOKEN_KEY);
}

/** Returns headers with Bearer token for API calls that need auth */
export async function authHeaders(): Promise<Record<string, string>> {
  const token = await getStoredToken();
  const headers: Record<string, string> = { 'Content-Type': 'application/json' };
  if (token) headers['Authorization'] = `Bearer ${token}`;
  return headers;
}

// ── Auth functions ────────────────────────────────────────────────────────────

export async function signIn(username: string, password: string) {
  try {
    const res = await fetch(`${API_URL}/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ username, password }),
    });
    
    const data = await res.json();
    
    if (!res.ok) {
      return { data: null, error: new Error(data.error || 'Invalid credentials') };
    }

    // Store JWT token if returned (new API version)
    if (data.token) {
      await AsyncStorage.setItem(TOKEN_KEY, data.token);
    }

    // Get user data — returned directly or build minimal from response
    let userData = data.user ?? { username, name: username };

    await AsyncStorage.setItem(SESSION_KEY, JSON.stringify(userData));
    
    return { data: { user: userData }, error: null };
  } catch (error: any) {
    return { data: null, error };
  }
}

export async function signUp(username: string, password: string, name: string) {
  try {
    const res = await fetch(`${API_URL}/auth/signup`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ username, password, name }),
    });
    
    const data = await res.json();
    
    if (!res.ok) {
      return { data: null, error: new Error(data.error || 'Signup failed') };
    }

    if (data.token) {
      await AsyncStorage.setItem(TOKEN_KEY, data.token);
    }

    const userData = data.user ?? { username, name };
    await AsyncStorage.setItem(SESSION_KEY, JSON.stringify(userData));
    
    return { data: { user: userData }, error: null };
  } catch (error: any) {
    return { data: null, error };
  }
}

export async function signOut() {
  await AsyncStorage.multiRemove([SESSION_KEY, TOKEN_KEY]);
  return { error: null };
}

export async function getSession() {
  const sessionStr = await AsyncStorage.getItem(SESSION_KEY);
  if (!sessionStr) return null;
  try {
    const user = JSON.parse(sessionStr);
    return { user };
  } catch {
    return null;
  }
}

export async function getCurrentUser() {
  const session = await getSession();
  return session ? session.user : null;
}

export async function getUserProfile(userId: string) {
  const { data } = await supabase
    .from('players')
    .select('*')
    .eq('user_id', userId)
    .single();
  return data;
}
