import React, { useState, useEffect } from 'react';
import { View, Text, TouchableOpacity, StyleSheet, SafeAreaView, ActivityIndicator, Alert, ScrollView } from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { supabase } from '../../../lib/supabase';
import { useRealtimeMatch } from '../../../lib/hooks/useRealtimeMatch';
import { useAuth } from '../../../context/AuthContext';
import { authHeaders } from '../../../lib/auth';
import { Ionicons } from '@expo/vector-icons';
import LoadingScreen from '../../../components/LoadingScreen';

export default function TossScreen() {
  const { code } = useLocalSearchParams<{ code: string }>();
  const router = useRouter();
  const { user } = useAuth();
  const { session, match, teams, players, loading } = useRealtimeMatch(code);
  const [tossWinnerId, setTossWinnerId] = useState('');
  const [decision, setDecision] = useState<'bat' | 'bowl' | ''>('');
  const [saving, setSaving] = useState(false);

  const isOwner = session?.owner_id === user?.id;
  const tossWinner = teams.find(t => t.id === tossWinnerId);
  const oppositeTeam = teams.find(t => t.id !== tossWinnerId);

  // Auto-navigate when toss is confirmed (realtime push)
  useEffect(() => {
    if (match?.status === 'innings_1' || match?.status === 'innings_2') {
      router.replace(`/match/${code}`);
    }
  }, [match?.status]);

  // Polling fallback for non-owners — in case realtime misses the update
  useEffect(() => {
    if (isOwner || !match?.id) return;
    const interval = setInterval(async () => {
      try {
        const { data } = await (supabase.from('matches') as any)
          .select('status')
          .eq('id', match.id)
          .single();
        if (data?.status === 'innings_1' || data?.status === 'innings_2') {
          router.replace(`/match/${code}`);
        }
      } catch {}
    }, 3000);
    return () => clearInterval(interval);
  }, [isOwner, match?.id, code]);



  const handleConfirmToss = async () => {
    if (!tossWinnerId || !decision) {
      Alert.alert('Incomplete', 'Please select the toss winner and their decision');
      return;
    }
    if (!match) return;
    setSaving(true);
    try {
      const headers = await authHeaders();
      const res = await fetch(`${process.env.EXPO_PUBLIC_API_URL}/match/${code}/action`, {
        method: 'POST',
        headers,
        body: JSON.stringify({
          action: 'set_toss',
          data: { tossWinnerId, decision, matchId: match.id }
        })
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Failed to confirm toss');
      router.replace(`/match/${code}`);
    } catch (e: any) {
      Alert.alert('Error', e.message);
    } finally {
      setSaving(false);
    }
  };

  if (loading || !match || teams.length < 2) {
    return <LoadingScreen message="Loading Toss..." />;
  }

  // ── Non-owner waiting screen ──────────────────────────────────────────────
  if (!isOwner) {
    // Show toss result if the owner has already confirmed the toss
    const tossWinnerTeam = match?.toss_winner_id ? teams.find(t => t.id === match.toss_winner_id) : null;
    const tossDecision = (match as any)?.toss_decision as 'bat' | 'bowl' | undefined;
    const otherTeam = tossWinnerTeam ? teams.find(t => t.id !== tossWinnerTeam.id) : null;
    const tossConfirmed = !!(tossWinnerTeam && tossDecision);

    return (
      <View style={S.screen}>
        <SafeAreaView style={S.safe}>
          <View style={S.header}>
            <View style={{ width: 40 }} />
            <Text style={S.title}>Toss</Text>
            <View style={{ width: 40 }} />
          </View>
          <View style={S.waitingContainer}>
            <View style={S.coinCircle}>
              <Text style={S.coinEmoji}>🪙</Text>
            </View>

            {!tossConfirmed ? (
              <>
                <Text style={S.waitingTitle}>Toss in progress…</Text>
                <Text style={S.waitingSubtitle}>The match owner is deciding who bats first.</Text>
                <View style={S.teamPreview}>
                  {teams.map((t, i) => (
                    <View key={t.id} style={[S.teamChip, { borderColor: i === 0 ? '#81010033' : '#0a84ff33' }]}>
                      <Text style={[S.teamChipText, { color: i === 0 ? '#810100' : '#0a84ff' }]}>{t.name}</Text>
                    </View>
                  ))}
                </View>
                <ActivityIndicator color="#810100" style={{ marginTop: 24 }} />
              </>
            ) : (
              <>
                <Text style={S.waitingTitle}>Toss Result 🏆</Text>
                <View style={S.tossResultCard}>
                  <Text style={S.tossResultLine}>
                    <Text style={S.tossResultBold}>{tossWinnerTeam?.name}</Text>
                    {' '}won the toss and elected to{' '}
                    <Text style={S.tossResultBold}>{tossDecision === 'bat' ? 'BAT' : 'BOWL'} first</Text>
                  </Text>
                  {otherTeam && (
                    <Text style={S.tossResultSub}>
                      {otherTeam.name} will {tossDecision === 'bat' ? 'bowl' : 'bat'} first
                    </Text>
                  )}
                </View>
                <View style={S.waitingRow}>
                  <ActivityIndicator color="#810100" />
                  <Text style={S.waitingSubtitle}>  Starting innings…</Text>
                </View>
              </>
            )}
          </View>
        </SafeAreaView>
      </View>
    );
  }

  // ── Owner toss form ───────────────────────────────────────────────────────
  return (
    <View style={S.screen}>
      <SafeAreaView style={S.safe}>
        <View style={S.header}>
          <TouchableOpacity onPress={() => router.back()} style={S.backBtn}>
            <Ionicons name="arrow-back" size={22} color="#810100" />
          </TouchableOpacity>
          <Text style={S.title}>Toss</Text>
          <View style={{ width: 40 }} />
        </View>

        <ScrollView contentContainerStyle={S.content} showsVerticalScrollIndicator={false}>

          {/* Coin */}
          <View style={S.coinArea}>
            <View style={S.coinCircle}>
              <Text style={S.coinEmoji}>🪙</Text>
            </View>
            <Text style={S.coinLabel}>Who won the toss?</Text>
          </View>

          {/* Toss winner */}
          <Text style={S.label}>TOSS WINNER</Text>
          <View style={S.teamRow}>
            {teams.map((team, i) => {
              const color = i === 0 ? '#810100' : '#0a84ff';
              const active = tossWinnerId === team.id;
              return (
                <TouchableOpacity
                  key={team.id}
                  style={[S.teamBtn, active && { backgroundColor: `${color}12`, borderColor: color }]}
                  onPress={() => setTossWinnerId(team.id)}
                  activeOpacity={0.75}
                >
                  {active && <Ionicons name="checkmark-circle" size={18} color={color} style={{ marginBottom: 4 }} />}
                  <Text style={[S.teamBtnText, active && { color, fontFamily: 'Outfit_800ExtraBold' }]}>
                    {team.name}
                  </Text>
                  <Text style={S.teamPlayerCount}>
                    {players.filter(p => p.team_id === team.id).length} players
                  </Text>
                </TouchableOpacity>
              );
            })}
          </View>

          {/* Decision — only show after toss winner selected */}
          {tossWinnerId !== '' && (
            <>
              <Text style={S.label}>{tossWinner?.name} CHOSE TO…</Text>
              <View style={S.decisionRow}>
                <TouchableOpacity
                  style={[S.decisionBtn, decision === 'bat' && S.decisionBtnBat]}
                  onPress={() => setDecision('bat')}
                  activeOpacity={0.75}
                >
                  <Text style={S.decisionEmoji}>🏏</Text>
                  <Text style={[S.decisionText, decision === 'bat' && { color: '#1a8a3e', fontFamily: 'Outfit_800ExtraBold' }]}>BAT FIRST</Text>
                </TouchableOpacity>
                <TouchableOpacity
                  style={[S.decisionBtn, decision === 'bowl' && S.decisionBtnBowl]}
                  onPress={() => setDecision('bowl')}
                  activeOpacity={0.75}
                >
                  <Text style={S.decisionEmoji}>🎳</Text>
                  <Text style={[S.decisionText, decision === 'bowl' && { color: '#0a84ff', fontFamily: 'Outfit_800ExtraBold' }]}>BOWL FIRST</Text>
                </TouchableOpacity>
              </View>
            </>
          )}

          {/* Summary card */}
          {tossWinnerId && decision && (
            <View style={S.summaryCard}>
              <Text style={S.summaryTitle}>📋 Summary</Text>
              <Text style={S.summaryLine}>
                <Text style={S.summaryBold}>{tossWinner?.name}</Text>
                {' '}won the toss and elected to{' '}
                <Text style={S.summaryBold}>{decision === 'bat' ? 'bat' : 'bowl'} first</Text>.
              </Text>
              <Text style={S.summaryLine2}>
                {oppositeTeam?.name} will {decision === 'bat' ? 'bowl' : 'bat'} first.
              </Text>
            </View>
          )}

          {/* Confirm */}
          <TouchableOpacity
            style={[S.confirmBtn, (!tossWinnerId || !decision || saving) && S.confirmBtnDisabled]}
            onPress={handleConfirmToss}
            disabled={!tossWinnerId || !decision || saving}
            activeOpacity={0.85}
          >
            {saving
              ? <ActivityIndicator color="#FFFFFF" />
              : <Text style={S.confirmBtnText}>Confirm & Start Innings 1 →</Text>}
          </TouchableOpacity>

        </ScrollView>
      </SafeAreaView>
    </View>
  );
}

const S = StyleSheet.create({
  screen: { flex: 1, backgroundColor: '#EDEBDE' },
  safe: { flex: 1 },
  center: { flex: 1, backgroundColor: '#EDEBDE', alignItems: 'center', justifyContent: 'center' },

  header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 16, paddingVertical: 12, borderBottomWidth: 1, borderBottomColor: 'rgba(99,1,2,0.08)' },
  backBtn: { width: 40, height: 40, alignItems: 'center', justifyContent: 'center' },
  title: { color: '#1B1716', fontFamily: 'Outfit_700Bold', fontSize: 18 },

  // Waiting (non-owner)
  waitingContainer: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 32, gap: 12 },
  waitingTitle: { color: '#1B1716', fontFamily: 'Outfit_800ExtraBold', fontSize: 22, marginTop: 8 },
  waitingSubtitle: { color: '#9A9390', fontFamily: 'Outfit_600SemiBold', fontSize: 15, textAlign: 'center' },
  waitingRow: { flexDirection: 'row', alignItems: 'center', marginTop: 8 },
  teamPreview: { flexDirection: 'row', gap: 10, marginTop: 8 },
  teamChip: { borderWidth: 1.5, borderRadius: 20, paddingHorizontal: 16, paddingVertical: 8 },
  teamChipText: { fontFamily: 'Outfit_800ExtraBold', fontSize: 14 },
  tossResultCard: { backgroundColor: '#FFFFFF', borderRadius: 14, padding: 18, borderWidth: 1.5, borderColor: '#ffd60a55', alignItems: 'center', gap: 6, marginTop: 8, width: '100%' },
  tossResultLine: { color: '#1B1716', fontFamily: 'Outfit_600SemiBold', fontSize: 16, textAlign: 'center', lineHeight: 24 },
  tossResultBold: { color: '#810100', fontFamily: 'Outfit_800ExtraBold' },
  tossResultSub: { color: '#9A9390', fontFamily: 'Outfit_400Regular', fontSize: 13, textAlign: 'center' },


  // Owner form
  content: { padding: 20, gap: 14 },
  coinArea: { alignItems: 'center', paddingVertical: 20 },
  coinCircle: { width: 90, height: 90, borderRadius: 45, backgroundColor: '#ffd60a20', alignItems: 'center', justifyContent: 'center', borderWidth: 2, borderColor: '#ffd60a55', marginBottom: 14 },
  coinEmoji: { fontSize: 44 },
  coinLabel: { color: '#1B1716', fontFamily: 'Outfit_800ExtraBold', fontSize: 17 },

  label: { color: '#9A9390', fontFamily: 'Outfit_700Bold', fontSize: 11, letterSpacing: 1, textTransform: 'uppercase' },
  teamRow: { flexDirection: 'row', gap: 10 },
  teamBtn: { flex: 1, backgroundColor: '#FFFFFF', borderRadius: 14, padding: 16, alignItems: 'center', borderWidth: 1.5, borderColor: 'rgba(99,1,2,0.08)', gap: 4, shadowColor: '#1B1716', shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.06, shadowRadius: 8, elevation: 2 },
  teamBtnText: { color: '#5C5552', fontFamily: 'Outfit_700Bold', fontSize: 15 },
  teamPlayerCount: { color: '#9A9390', fontFamily: 'Outfit_400Regular', fontSize: 11 },

  decisionRow: { flexDirection: 'row', gap: 12 },
  decisionBtn: { flex: 1, backgroundColor: '#FFFFFF', borderRadius: 14, padding: 20, alignItems: 'center', borderWidth: 1.5, borderColor: 'rgba(99,1,2,0.08)', gap: 8, shadowColor: '#1B1716', shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.06, shadowRadius: 8, elevation: 2 },
  decisionBtnBat: { backgroundColor: 'rgba(26,138,62,0.07)', borderColor: '#1a8a3e' },
  decisionBtnBowl: { backgroundColor: 'rgba(10,132,255,0.07)', borderColor: '#0a84ff' },
  decisionEmoji: { fontSize: 36 },
  decisionText: { color: '#5C5552', fontFamily: 'Outfit_700Bold', fontSize: 13, letterSpacing: 0.5 },

  summaryCard: { backgroundColor: '#FFFFFF', borderRadius: 14, padding: 16, borderWidth: 1, borderColor: 'rgba(129,1,0,0.12)', gap: 6 },
  summaryTitle: { color: '#1B1716', fontFamily: 'Outfit_800ExtraBold', fontSize: 14, marginBottom: 4 },
  summaryLine: { color: '#1B1716', fontFamily: 'Outfit_600SemiBold', fontSize: 15, lineHeight: 22 },
  summaryBold: { color: '#810100', fontFamily: 'Outfit_800ExtraBold' },
  summaryLine2: { color: '#9A9390', fontFamily: 'Outfit_400Regular', fontSize: 13 },

  confirmBtn: { backgroundColor: '#810100', borderRadius: 14, padding: 18, alignItems: 'center', marginTop: 4, shadowColor: '#810100', shadowOffset: { width: 0, height: 6 }, shadowOpacity: 0.25, shadowRadius: 12, elevation: 5 },
  confirmBtnDisabled: { backgroundColor: '#D1CBCA', shadowOpacity: 0 },
  confirmBtnText: { color: '#FFFFFF', fontFamily: 'Outfit_800ExtraBold', fontSize: 17 },
});
