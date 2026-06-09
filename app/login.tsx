import React, { useState } from 'react';
import {
  View, Text, TextInput, TouchableOpacity, StyleSheet,
  KeyboardAvoidingView, Platform, ScrollView, ActivityIndicator,
  Alert, StatusBar,
} from 'react-native';
import { signIn, signUp } from '../lib/auth';
import { useAuth } from '../context/AuthContext';
import { useRouter } from 'expo-router';

export default function LoginScreen() {
  const [mode, setMode] = useState<'login' | 'register'>('login');
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [name, setName] = useState('');
  const [loading, setLoading] = useState(false);
  const [showPassword, setShowPassword] = useState(false);
  const { refreshSession } = useAuth();
  const router = useRouter();

  const handleSubmit = async () => {
    if (!username || !password) { Alert.alert('Error', 'Username and password are required'); return; }
    if (mode === 'register' && !name) { Alert.alert('Error', 'Name is required'); return; }
    setLoading(true);
    try {
      if (mode === 'login') {
        const { error } = await signIn(username, password);
        if (error) { Alert.alert('Login Failed', error.message); return; }
      } else {
        const { error } = await signUp(username, password, name);
        if (error) { Alert.alert('Registration Failed', error.message); return; }
      }
      await refreshSession();
      router.replace('/');
    } catch (e: any) {
      Alert.alert('Error', e.message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <KeyboardAvoidingView style={C.screen} behavior={Platform.OS === 'ios' ? 'padding' : 'height'}>
      <StatusBar barStyle="dark-content" backgroundColor="#EDEBDE" />
      <ScrollView contentContainerStyle={C.scroll} keyboardShouldPersistTaps="handled">
        {/* Branding */}
        <View style={C.brandSection}>
          <View style={C.ballIcon}>
            <Text style={{ fontSize: 36 }}>🏏</Text>
          </View>
          <Text style={C.brand}>TURF</Text>
          <Text style={C.brandSub}>Cricket Score Pro</Text>
          <Text style={C.tagline}>Score. Watch. Celebrate.</Text>
        </View>

        {/* Card */}
        <View style={C.card}>
          {/* Tab Toggle */}
          <View style={C.toggle}>
            {(['login', 'register'] as const).map(m => (
              <TouchableOpacity key={m} style={[C.toggleBtn, mode === m && C.toggleActive]} onPress={() => setMode(m)}>
                <Text style={[C.toggleText, mode === m && C.toggleTextActive]}>
                  {m === 'login' ? 'Sign In' : 'Register'}
                </Text>
              </TouchableOpacity>
            ))}
          </View>

          {mode === 'register' && (
            <View style={C.field}>
              <Text style={C.label}>YOUR NAME</Text>
              <TextInput
                style={C.input} value={name} onChangeText={setName}
                placeholder="e.g. Virat Kohli" placeholderTextColor="#9A9390"
                autoCapitalize="words"
              />
            </View>
          )}

          <View style={C.field}>
            <Text style={C.label}>USERNAME</Text>
            <TextInput
              style={C.input} value={username} onChangeText={setUsername}
              placeholder="shree_116" placeholderTextColor="#9A9390"
              autoCapitalize="none"
            />
          </View>

          <View style={C.field}>
            <Text style={C.label}>PASSWORD</Text>
            <View style={C.passwordRow}>
              <TextInput
                style={C.passwordInput} value={password} onChangeText={setPassword}
                placeholder="••••••••" placeholderTextColor="#9A9390"
                secureTextEntry={!showPassword}
              />
              <TouchableOpacity style={C.eyeBtn} onPress={() => setShowPassword(!showPassword)}>
                <Text style={C.eyeText}>{showPassword ? 'Hide' : 'Show'}</Text>
              </TouchableOpacity>
            </View>
          </View>

          <TouchableOpacity style={C.submitBtn} onPress={handleSubmit} disabled={loading} activeOpacity={0.85}>
            {loading ? (
              <ActivityIndicator color="#FFFFFF" />
            ) : (
              <Text style={C.submitText}>{mode === 'login' ? 'Sign In →' : 'Create Account →'}</Text>
            )}
          </TouchableOpacity>
        </View>

        <Text style={C.footer}>© 2025 Turf Cricket · Built for real cricketers</Text>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const C = StyleSheet.create({
  screen: { flex: 1, backgroundColor: '#EDEBDE' },
  scroll: { flexGrow: 1, justifyContent: 'center', padding: 24, paddingTop: 72 },

  brandSection: { alignItems: 'center', marginBottom: 36 },
  ballIcon: { width: 72, height: 72, borderRadius: 36, backgroundColor: '#810100', alignItems: 'center', justifyContent: 'center', marginBottom: 16, shadowColor: '#810100', shadowOffset: { width: 0, height: 8 }, shadowOpacity: 0.3, shadowRadius: 16, elevation: 8 },
  brand: { fontSize: 48, fontFamily: 'Outfit_900Black', color: '#1B1716', letterSpacing: 6, marginBottom: 2 },
  brandSub: { fontSize: 13, color: '#9A9390', fontFamily: 'Outfit_600SemiBold', letterSpacing: 1.5, textTransform: 'uppercase', marginBottom: 12 },
  tagline: { color: '#810100', fontSize: 15, fontFamily: 'Outfit_700Bold' },

  card: { backgroundColor: '#FFFFFF', borderRadius: 24, padding: 20, shadowColor: '#1B1716', shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.08, shadowRadius: 20, elevation: 4 },

  toggle: { flexDirection: 'row', backgroundColor: '#F5F3EC', borderRadius: 14, padding: 4, marginBottom: 20 },
  toggleBtn: { flex: 1, paddingVertical: 10, borderRadius: 10, alignItems: 'center' },
  toggleActive: { backgroundColor: '#810100', shadowColor: '#810100', shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.2, shadowRadius: 8, elevation: 3 },
  toggleText: { color: '#9A9390', fontFamily: 'Outfit_700Bold', fontSize: 14 },
  toggleTextActive: { color: '#FFFFFF', fontFamily: 'Outfit_800ExtraBold', fontSize: 14 },

  field: { marginBottom: 16 },
  label: { color: '#9A9390', fontFamily: 'Outfit_700Bold', fontSize: 11, letterSpacing: 1, textTransform: 'uppercase', marginBottom: 8 },
  input: { backgroundColor: '#F5F3EC', borderRadius: 12, padding: 15, color: '#1B1716', fontFamily: 'Outfit_600SemiBold', fontSize: 15, borderWidth: 1, borderColor: 'rgba(99,1,2,0.08)' },

  passwordRow: { flexDirection: 'row', alignItems: 'center', backgroundColor: '#F5F3EC', borderRadius: 12, borderWidth: 1, borderColor: 'rgba(99,1,2,0.08)' },
  passwordInput: { flex: 1, padding: 15, color: '#1B1716', fontFamily: 'Outfit_600SemiBold', fontSize: 15 },
  eyeBtn: { padding: 15 },
  eyeText: { color: '#810100', fontFamily: 'Outfit_700Bold', fontSize: 13 },

  submitBtn: { backgroundColor: '#810100', borderRadius: 14, padding: 18, alignItems: 'center', marginTop: 8, shadowColor: '#810100', shadowOffset: { width: 0, height: 6 }, shadowOpacity: 0.25, shadowRadius: 12, elevation: 5 },
  submitText: { color: '#FFFFFF', fontFamily: 'Outfit_800ExtraBold', fontSize: 17 },

  footer: { textAlign: 'center', color: '#9A9390', fontSize: 12, fontFamily: 'Outfit_400Regular', marginTop: 32 },
});
