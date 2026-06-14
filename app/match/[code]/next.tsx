import React, { useState } from 'react';
import {
  View, Text, TextInput, TouchableOpacity, StyleSheet,
  SafeAreaView, Alert, ActivityIndicator } from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useRealtimeMatch } from '../../../lib/hooks/useRealtimeMatch';
import { useAuth } from '../../../context/AuthContext';
import { supabase } from '../../../lib/supabase';

export default function NextMatchScreen() {
  const { code } = useLocalSearchParams<{ code: string }>();
  const router = useRouter();
  const { user } = useAuth();
  const { session, teams, loading } = useRealtimeMatch(code);

  const [overs, setOvers] = useState('10');
  const [rearrange, setRearrange] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  const handleStart = async () => {
    if (!session) return;
    if (session.owner_id !== user?.id) {
      Alert.alert('Error', 'Only the session owner can start the next match.');
      return;
    }
    const oversNum = parseInt(overs);
    if (isNaN(oversNum) || oversNum < 1 || oversNum > 50) { 
      Alert.alert('Error', 'Overs must be between 1 and 50'); 
      return; 
    }

    setSubmitting(true);
    try {
      if (teams.length < 2) throw new Error('Not enough teams in this session.');

      // Get highest match number
      const { data: latestMatch, error: latestErr } = await (supabase.from('matches') as any)
        .select('match_number').eq('session_id', session.id)
        .order('match_number', { ascending: false }).limit(1).single();
      
      const nextMatchNumber = (latestMatch?.match_number || 1) + 1;

      // Create new match directly via Supabase
      const { data: newMatch, error: insertErr } = await (supabase.from('matches') as any).insert({
        session_id: session.id,
        match_number: nextMatchNumber,
        overs: oversNum,
        team1_id: teams[0].id,
        team2_id: teams[1].id,
        status: rearrange ? 'setup' : 'toss',
      }).select().single();

      if (insertErr || !newMatch) throw new Error(insertErr?.message || 'Failed to start next match');

      // Go to Lobby for rearrangements, or Toss if keeping same teams
      router.replace(rearrange ? `/match/${code}/lobby` : `/match/${code}/toss`);
    } catch (e: any) {
      Alert.alert('Error', e.message);
    } finally {
      setSubmitting(false);
    }
  };

  if (loading) {
    return (
      <View style={styles.center}>
        <ActivityIndicator color="#810100" size="large" />
      </View>
    );
  }

  return (
    <View style={styles.screen}>
      <SafeAreaView style={styles.safeArea}>
        <View style={styles.header}>
          <TouchableOpacity onPress={() => router.back()} style={styles.backBtn}>
            <Text style={styles.backText}>←</Text>
          </TouchableOpacity>
          <Text style={styles.title}>Start Next Match</Text>
          <View style={{ width: 40 }} />
        </View>
        <View style={styles.content}>
          <Text style={styles.infoText}>
            You are extending the {session?.name || 'current'} session. The same players and teams will be used.
          </Text>

          <Text style={styles.sectionLabel}>MATCH OVERS</Text>
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

          <View style={styles.teamsBox}>
            <Text style={styles.teamsTitle}>Teams Participating</Text>
            {teams.map((t, idx) => (
              <Text key={t.id} style={styles.teamName}>• {t.name}</Text>
            ))}
          </View>

          <Text style={styles.sectionLabel}>TEAM SETUP</Text>
          <View style={styles.rearrangeRow}>
            <TouchableOpacity 
              style={[styles.rearrangeBtn, !rearrange && styles.rearrangeBtnActive]} 
              onPress={() => setRearrange(false)}
            >
              <Text style={[styles.rearrangeBtnText, !rearrange && styles.rearrangeBtnTextActive]}>Same Teams</Text>
            </TouchableOpacity>
            <TouchableOpacity 
              style={[styles.rearrangeBtn, rearrange && styles.rearrangeBtnActive]} 
              onPress={() => setRearrange(true)}
            >
              <Text style={[styles.rearrangeBtnText, rearrange && styles.rearrangeBtnTextActive]}>Rearrange Teams</Text>
            </TouchableOpacity>
          </View>

          <TouchableOpacity style={styles.createBtn} onPress={handleStart} disabled={submitting}>
            {submitting ? <ActivityIndicator color="#FFFFFF" /> : <Text style={styles.createBtnText}>{rearrange ? 'Create & Proceed to Lobby →' : 'Create & Proceed to Toss →'}</Text>}
          </TouchableOpacity>
        </View>
      </SafeAreaView>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: '#EDEBDE' },
  safeArea: { flex: 1 },
  center: { flex: 1, backgroundColor: '#EDEBDE', alignItems: 'center', justifyContent: 'center' },
  header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', padding: 16, borderBottomWidth: 1, borderBottomColor: 'rgba(99, 1, 2, 0.1)' },
  backBtn: { width: 40, height: 40, alignItems: 'center', justifyContent: 'center' },
  backText: { color: '#810100', fontSize: 22 },
  title: { color: '#111111', fontFamily: 'Outfit_400Regular', fontSize: 18 },
  content: { padding: 20, gap: 16 },
  infoText: { color: '#aaa', fontSize: 14, lineHeight: 20, marginBottom: 12 },
  sectionLabel: { color: '#FFFFFF', fontFamily: 'Outfit_400Regular', fontSize: 11, letterSpacing: 1, textTransform: 'uppercase', marginBottom: 4 },
  oversRow: { flexDirection: 'row', gap: 8, flexWrap: 'wrap', marginBottom: 16 },
  oversChip: { paddingHorizontal: 16, paddingVertical: 10, backgroundColor: '#FFFFFF', borderRadius: 10, shadowColor: '#630102', shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.05, shadowRadius: 12, elevation: 2, borderWidth: 0 },
  oversChipActive: { backgroundColor: 'rgba(129, 1, 0, 0.1)', borderColor: '#E5E5EA' },
  oversChipText: { color: '#666666', fontFamily: 'Outfit_700Bold', fontSize: 14 },
  oversChipTextActive: { color: '#810100' },
  oversInput: { paddingHorizontal: 12, paddingVertical: 10, backgroundColor: '#FFFFFF', borderRadius: 10, shadowColor: '#630102', shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.05, shadowRadius: 12, elevation: 2, borderWidth: 0, color: '#111111', fontFamily: 'Outfit_700Bold', fontSize: 14, width: 70 },
  teamsBox: { backgroundColor: '#FFFFFF', padding: 16, borderRadius: 12, shadowColor: '#630102', shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.05, shadowRadius: 12, elevation: 2, borderWidth: 0, marginBottom: 24 },
  teamsTitle: { color: '#666666', fontFamily: 'Outfit_400Regular', fontSize: 12, textTransform: 'uppercase', marginBottom: 8 },
  teamName: { color: '#111111', fontFamily: 'Outfit_400Regular', fontSize: 16, marginBottom: 4 },
  rearrangeRow: { flexDirection: 'row', gap: 12, marginBottom: 24 },
  rearrangeBtn: { flex: 1, paddingVertical: 14, backgroundColor: '#FFFFFF', borderRadius: 12, alignItems: 'center', shadowColor: '#630102', shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.05, shadowRadius: 12, elevation: 2 },
  rearrangeBtnActive: { backgroundColor: '#810100' },
  rearrangeBtnText: { color: '#666666', fontFamily: 'Outfit_700Bold', fontSize: 15 },
  rearrangeBtnTextActive: { color: '#FFFFFF' },
  createBtn: { backgroundColor: '#0a84ff', borderRadius: 14, padding: 18, alignItems: 'center' },
  createBtnText: { color: '#FFFFFF', fontFamily: 'Outfit_900Black', fontSize: 18 } });
