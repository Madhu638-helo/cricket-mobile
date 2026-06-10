import React, { useState } from 'react';
import {
  View, Text, TextInput, TouchableOpacity, StyleSheet,
  ScrollView, SafeAreaView, Alert, ActivityIndicator } from 'react-native';
import { useRouter } from 'expo-router';
import { supabase } from '../lib/supabase';
import { useAuth } from '../context/AuthContext';

export default function CreateMatchScreen() {
  const router = useRouter();
  const { user, userName } = useAuth();
  const [sessionName, setSessionName] = useState('');
  const [overs, setOvers] = useState('10');
  const [team1, setTeam1] = useState('');
  const [team2, setTeam2] = useState('');
  const [loading, setLoading] = useState(false);

  const generateCode = () => {
    const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
    return Array.from({ length: 6 }, () => chars[Math.floor(Math.random() * chars.length)]).join('');
  };

  const handleCreate = async () => {
    if (!team1 || !team2) { Alert.alert('Error', 'Enter both team names'); return; }
    if (!user) { Alert.alert('Error', 'Not logged in'); return; }
    const oversNum = parseInt(overs);
    if (isNaN(oversNum) || oversNum < 1 || oversNum > 50) { Alert.alert('Error', 'Overs must be between 1 and 50'); return; }

    setLoading(true);
    try {
      const code = generateCode();

      // 1. Create session
      const { data: sess, error: sessErr } = await supabase.from('sessions').insert({
        code,
        name: sessionName || `${team1} vs ${team2}`,
        status: 'active',
        owner_id: user.id }).select().single();
      if (sessErr || !sess) throw new Error(sessErr?.message || 'Failed to create session');

      // 2. Create teams
      const { data: t1 } = await supabase.from('teams').insert({ session_id: sess.id, name: team1 }).select().single();
      const { data: t2 } = await supabase.from('teams').insert({ session_id: sess.id, name: team2 }).select().single();
      if (!t1 || !t2) throw new Error('Failed to create teams');

      // 3. Join as a player
      await supabase.from('players').insert({
        session_id: sess.id,
        user_id: user.id,
        name: userName || 'Owner',
        is_scorer: true,
        is_joker: false,
        is_captain: false,
        team_id: t1.id });

      // 4. Create match
      const { data: match } = await supabase.from('matches').insert({
        session_id: sess.id,
        match_number: 1,
        status: 'setup',
        overs: oversNum,
        team1_id: t1.id,
        team2_id: t2.id,
        is_paused: false }).select().single();

      if (!match) throw new Error('Failed to create match');

      router.replace(`/match/${code}/lobby`);
    } catch (e: any) {
      Alert.alert('Error', e.message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <View style={styles.screen}>
      <SafeAreaView style={styles.safeArea}>
        <View style={styles.header}>
          <TouchableOpacity onPress={() => router.back()} style={styles.backBtn}>
            <Text style={styles.backText}>←</Text>
          </TouchableOpacity>
          <Text style={styles.title}>New Match</Text>
          <View style={{ width: 40 }} />
        </View>
        <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
          <Text style={styles.sectionLabel}>SESSION NAME (Optional)</Text>
          <TextInput
            style={styles.input}
            value={sessionName}
            onChangeText={setSessionName}
            placeholder="e.g. Friday T10 League"
            placeholderTextColor="rgba(237, 235, 222, 0.5)"
          />

          <Text style={styles.sectionLabel}>OVERS</Text>
          <View style={styles.oversRow}>
            {[5, 6, 10, 15, 20].map(o => (
              <TouchableOpacity
                key={o}
                style={[styles.oversChip, overs === String(o) && styles.oversChipActive]}
                onPress={() => setOvers(String(o))}
              >
                <Text style={[styles.oversChipText, overs === String(o) && styles.oversChipTextActive]}>{o}</Text>
              </TouchableOpacity>
            ))}
            <TextInput
              style={[styles.oversInput, !([5, 6, 10, 15, 20].map(String).includes(overs)) && styles.oversChipActive]}
              value={[5, 6, 10, 15, 20].map(String).includes(overs) ? '' : overs}
              onChangeText={setOvers}
              placeholder="Custom"
              placeholderTextColor="rgba(237, 235, 222, 0.5)"
              keyboardType="number-pad"
              maxLength={2}
            />
          </View>

          <Text style={styles.sectionLabel}>TEAM 1</Text>
          <TextInput
            style={styles.input}
            value={team1}
            onChangeText={setTeam1}
            placeholder="e.g. Team Alpha"
            placeholderTextColor="rgba(237, 235, 222, 0.5)"
          />

          <Text style={styles.sectionLabel}>TEAM 2</Text>
          <TextInput
            style={styles.input}
            value={team2}
            onChangeText={setTeam2}
            placeholder="e.g. Team Beta"
            placeholderTextColor="rgba(237, 235, 222, 0.5)"
          />

          <TouchableOpacity style={styles.createBtn} onPress={handleCreate} disabled={loading}>
            {loading ? <ActivityIndicator color="#810100" /> : <Text style={styles.createBtnText}>Create Match →</Text>}
          </TouchableOpacity>
        </ScrollView>
      </SafeAreaView>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: '#EDEBDE' },
  safeArea: { flex: 1 },
  header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', padding: 16, borderBottomWidth: 1, borderBottomColor: 'rgba(99, 1, 2, 0.1)' },
  backBtn: { width: 40, height: 40, alignItems: 'center', justifyContent: 'center' },
  backText: { color: '#810100', fontSize: 22 },
  title: { color: '#111111', fontFamily: 'Outfit_400Regular', fontSize: 18 },
  content: { padding: 20, gap: 8 },
  sectionlabel: { color: '#FFFFFF', fontFamily: 'Outfit_400Regular', fontSize: 11, letterSpacing: 1, textTransform: 'uppercase', marginTop: 12, marginBottom: 4 },
  input: { backgroundColor: '#FFFFFF', borderRadius: 12, padding: 14, color: '#111111', fontFamily: 'Outfit_400Regular', fontSize: 15, shadowColor: '#630102', shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.05, shadowRadius: 12, elevation: 2, borderWidth: 0 },
  oversRow: { flexDirection: 'row', gap: 8, flexWrap: 'wrap', marginBottom: 4 },
  oversChip: { paddingHorizontal: 16, paddingVertical: 10, backgroundColor: '#FFFFFF', borderRadius: 10, shadowColor: '#630102', shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.05, shadowRadius: 12, elevation: 2, borderWidth: 0 },
  oversChipActive: { backgroundColor: 'rgba(129, 1, 0, 0.1)', borderColor: '#E5E5EA' },
  oversChipText: { color: '#666666', fontFamily: 'Outfit_700Bold', fontSize: 14 },
  oversChipTextActive: { color: '#810100' },
  oversInput: { paddingHorizontal: 12, paddingVertical: 10, backgroundColor: '#FFFFFF', borderRadius: 10, shadowColor: '#630102', shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.05, shadowRadius: 12, elevation: 2, borderWidth: 0, color: '#111111', fontFamily: 'Outfit_700Bold', fontSize: 14, width: 70 },
  createBtn: { backgroundColor: '#810100', borderRadius: 14, padding: 18, alignItems: 'center', marginTop: 24 },
  createBtnText: { color: '#FFFFFF', fontFamily: 'Outfit_900Black', fontSize: 18 } });
