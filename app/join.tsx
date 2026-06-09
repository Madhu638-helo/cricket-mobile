import React, { useState } from 'react';
import { View, Text, TextInput, TouchableOpacity, StyleSheet, SafeAreaView, Alert, ActivityIndicator } from 'react-native';
import { useRouter, useLocalSearchParams } from 'expo-router';
import { supabase } from '../lib/supabase';
import { useAuth } from '../context/AuthContext';

export default function JoinScreen() {
  const router = useRouter();
  const { code: paramCode } = useLocalSearchParams<{ code: string }>();
  const { user, userName } = useAuth();
  const [code, setCode] = useState(paramCode ?? '');
  const [loading, setLoading] = useState(false);

  const handleJoin = async () => {
    if (code.length < 4) { Alert.alert('Error', 'Enter a valid match code'); return; }
    if (!user) { Alert.alert('Error', 'Not logged in'); return; }
    setLoading(true);
    try {
      const { data: sess, error } = await (supabase
        .from('sessions') as any).select('*').eq('code', code.toUpperCase()).single();
      if (error || !sess) { Alert.alert('Not Found', 'No match found with that code'); return; }

      // Add as player if not already in
      const { data: existing } = await (supabase
        .from('players') as any).select('id').eq('session_id', sess.id).eq('user_id', user.id).single();
      if (!existing) {
        await (supabase.from('players') as any).insert({
          session_id: sess.id,
          user_id: user.id,
          name: userName || 'Player',
          is_scorer: false,
          is_joker: false,
          is_captain: false });
      }

      // Check if match is in lobby or already started
      const { data: match } = await (supabase
        .from('matches') as any).select('status').eq('session_id', sess.id)
        .order('match_number', { ascending: false }).limit(1).single();

      if (match?.status === 'innings_1' || match?.status === 'innings_2') {
        router.replace(`/match/${code.toUpperCase()}`);
      } else {
        router.replace(`/match/${code.toUpperCase()}/lobby`);
      }
    } catch (e: any) {
      Alert.alert('Error', e.message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <View style={styles.screen}>
      <SafeAreaView style={styles.safe}>
        <View style={styles.header}>
          <TouchableOpacity onPress={() => router.back()} style={styles.backBtn}>
            <Text style={styles.backText}>←</Text>
          </TouchableOpacity>
          <Text style={styles.title}>Join Match</Text>
          <View style={{ width: 40 }} />
        </View>
        <View style={styles.content}>
          <Text style={styles.label}>MATCH CODE</Text>
          <TextInput
            style={styles.codeInput}
            value={code}
            onChangeText={t => setCode(t.toUpperCase().slice(0, 6))}
            onSubmitEditing={handleJoin}
            placeholder="ABC123"
            placeholderTextColor="#888888"
            autoCapitalize="characters"
            maxLength={6}
            autoFocus
          />
          <TouchableOpacity style={styles.joinBtn} onPress={handleJoin} disabled={loading}>
            {loading ? <ActivityIndicator color="#810100" /> : <Text style={styles.joinBtnText}>Join Match →</Text>}
          </TouchableOpacity>
        </View>
      </SafeAreaView>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: '#EDEBDE' },
  safe: { flex: 1 },
  header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', padding: 16, borderBottomWidth: 1, borderBottomColor: 'rgba(99, 1, 2, 0.1)' },
  backBtn: { width: 40, height: 40, alignItems: 'center', justifyContent: 'center' },
  backText: { color: '#810100', fontSize: 22 },
  title: { color: '#111111', fontFamily: 'Outfit_400Regular', fontSize: 18 },
  content: { flex: 1, padding: 24, justifyContent: 'center', gap: 12 },
  label: { color: '#666666', fontFamily: 'Outfit_400Regular', fontSize: 11, letterSpacing: 1 },
  codeInput: { backgroundColor: '#FFFFFF', borderRadius: 16, padding: 20, color: '#111111', fontFamily: 'Outfit_400Regular', fontSize: 32, letterSpacing: 6, shadowColor: '#630102', shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.05, shadowRadius: 12, elevation: 2, borderWidth: 0, textAlign: 'center' },
  joinBtn: { backgroundColor: '#810100', borderRadius: 14, padding: 18, alignItems: 'center', marginTop: 8 },
  joinBtnText: { color: '#FFFFFF', fontFamily: 'Outfit_900Black', fontSize: 18 } });
