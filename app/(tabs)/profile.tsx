import React, { useState, useEffect } from 'react';
import {
  View, Text, StyleSheet, TouchableOpacity, ScrollView,
  SafeAreaView, Alert, ActivityIndicator, StatusBar, Share, RefreshControl,
} from 'react-native';
import { useRouter } from 'expo-router';
import { useAuth } from '../../context/AuthContext';
import { supabase } from '../../lib/supabase';
import { signOut } from '../../lib/auth';
import { Ionicons } from '@expo/vector-icons';
import LoadingScreen from '../../components/LoadingScreen';

function initials(name: string) {
  return name.split(' ').map(n => n[0]).join('').slice(0, 2).toUpperCase();
}

function formatBowling(wickets: number, runs: number) {
  return `${wickets}/${runs}`;
}

export default function ProfileScreen() {
  const { user, userName } = useAuth();
  const router = useRouter();
  const [stats, setStats] = useState({
    runs: 0, wickets: 0, catches: 0, matches: 0,
    highestScore: 0, bestBowlingWkts: 0, bestBowlingRuns: 0, fifties: 0, sixes: 0, fours: 0,
  });
  const [recentMatches, setRecentMatches] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  useEffect(() => { loadProfile(); }, [user]);

  const onRefresh = async () => {
    setRefreshing(true);
    await loadProfile();
    setRefreshing(false);
  };

  const loadProfile = async () => {
    if (!user) return;
    setLoading(true);
    try {
      const { data: playerSessions } = await (supabase.from('players') as any)
        .select('session_id').eq('user_id', user.id);
      const sessionIds = (playerSessions ?? []).map((p: any) => p.session_id);

      const { data: matchData } = await (supabase.from('matches') as any)
        .select('*, sessions(name, code)').in('session_id', sessionIds)
        .order('created_at', { ascending: false }).limit(10);

      setRecentMatches(matchData ?? []);

      // Aggregate ball-by-ball stats
      const { data: battingBalls } = await (supabase.from('balls') as any)
        .select('runs_off_bat, is_wicket, extra_type, innings_id, over_number')
        .eq('batsman_id', user.id);

      const { data: bowlingBalls } = await (supabase.from('balls') as any)
        .select('runs_off_bat, extras, is_wicket, wicket_type, extra_type, innings_id, bowler_id')
        .eq('bowler_id', user.id);

      let totalRuns = 0, totalFours = 0, totalSixes = 0, highestScore = 0, fifties = 0;
      // Group by innings to find highest score
      const inningsMap: Record<string, number> = {};
      for (const b of battingBalls ?? []) {
        if (b.extra_type !== 'wide') {
          const r = b.runs_off_bat ?? 0;
          totalRuns += r;
          if (r === 4) totalFours++;
          if (r === 6) totalSixes++;
          inningsMap[b.innings_id] = (inningsMap[b.innings_id] ?? 0) + r;
        }
      }
      highestScore = Math.max(0, ...Object.values(inningsMap));
      fifties = Object.values(inningsMap).filter(s => s >= 50).length;

      let totalWickets = 0, bestW = 0, bestR = 999;
      const bowlInningsMap: Record<string, { w: number; r: number }> = {};
      for (const b of bowlingBalls ?? []) {
        const isWkt = b.is_wicket && b.wicket_type !== 'runout' && b.wicket_type !== 'retiredhurt';
        const runs = (b.runs_off_bat ?? 0) + (b.extras ?? 0);
        if (!bowlInningsMap[b.innings_id]) bowlInningsMap[b.innings_id] = { w: 0, r: 0 };
        bowlInningsMap[b.innings_id].r += runs;
        if (isWkt) { bowlInningsMap[b.innings_id].w++; totalWickets++; }
      }
      for (const v of Object.values(bowlInningsMap)) {
        if (v.w > bestW || (v.w === bestW && v.r < bestR)) { bestW = v.w; bestR = v.r; }
      }

      setStats({
        runs: totalRuns, wickets: totalWickets, catches: 0,
        matches: (matchData ?? []).length, highestScore, fifties,
        bestBowlingWkts: bestW, bestBowlingRuns: bestR === 999 ? 0 : bestR,
        sixes: totalSixes, fours: totalFours,
      });
    } catch (e) { console.error(e); }
    finally { setLoading(false); }
  };

  const handleSignOut = async () => {
    Alert.alert('Sign Out', 'Are you sure?', [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Sign Out', style: 'destructive', onPress: async () => { await signOut(); router.replace('/login'); } },
    ]);
  };

  if (loading) {
    return <LoadingScreen />;
  }

  return (
    <View style={C.screen}>
      <StatusBar barStyle="dark-content" backgroundColor="#EDEBDE" />
      <SafeAreaView style={C.safe}>
        <ScrollView 
          showsVerticalScrollIndicator={false} 
          contentContainerStyle={{ paddingBottom: 40 }}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor="#810100" colors={['#810100']} />}
        >

          {/* Header */}
          <View style={C.headerRow}>
            <Text style={C.headerTitle}>Profile</Text>
            <TouchableOpacity style={C.signOutBtn} onPress={handleSignOut}>
              <Ionicons name="log-out-outline" size={20} color="#810100" />
            </TouchableOpacity>
          </View>

          {/* Hero Card */}
          <View style={C.heroCard}>
            <View style={C.avatarWrap}>
              <View style={C.avatar}>
                <Text style={C.avatarText}>{userName ? initials(userName) : '?'}</Text>
              </View>
              <TouchableOpacity style={C.editBadge} onPress={() => router.push('/edit-profile')}>
                <Ionicons name="pencil" size={12} color="#FFFFFF" />
              </TouchableOpacity>
            </View>
            <Text style={C.nameText}>{userName || 'Player'}</Text>
            <Text style={C.emailText}>{user?.email}</Text>
            <View style={C.heroDivider} />
            <View style={C.heroMiniStats}>
              <View style={C.heroMiniStat}>
                <Text style={C.heroMiniVal}>{stats.matches}</Text>
                <Text style={C.heroMiniLbl}>Matches</Text>
              </View>
              <View style={C.heroMiniDivider} />
              <View style={C.heroMiniStat}>
                <Text style={C.heroMiniVal}>{stats.fifties}</Text>
                <Text style={C.heroMiniLbl}>Fifties</Text>
              </View>
              <View style={C.heroMiniDivider} />
              <View style={C.heroMiniStat}>
                <Text style={C.heroMiniVal}>{stats.wickets}</Text>
                <Text style={C.heroMiniLbl}>Wickets</Text>
              </View>
            </View>
          </View>

          {/* Career Stats */}
          <View style={C.section}>
            <Text style={C.sectionTitle}>CAREER BATTING</Text>
            <View style={C.statsGrid}>
              {[
                { icon: '🏏', label: 'Runs', value: stats.runs, color: '#1a8a3e' },
                { icon: '📈', label: 'Highest', value: stats.highestScore, color: '#810100' },
                { icon: '4️⃣', label: 'Fours', value: stats.fours, color: '#b8860b' },
                { icon: '6️⃣', label: 'Sixes', value: stats.sixes, color: '#7030a0' },
              ].map(s => (
                <View key={s.label} style={C.statCard}>
                  <Text style={{ fontSize: 22, marginBottom: 6 }}>{s.icon}</Text>
                  <Text style={[C.statVal, { color: s.color }]}>{s.value}</Text>
                  <Text style={C.statLbl}>{s.label}</Text>
                </View>
              ))}
            </View>
          </View>

          <View style={C.section}>
            <Text style={C.sectionTitle}>CAREER BOWLING</Text>
            <View style={[C.statsGrid, { flexWrap: 'nowrap' }]}>
              <View style={[C.statCard, { flex: 1 }]}>
                <Text style={{ fontSize: 22, marginBottom: 6 }}>⚾</Text>
                <Text style={[C.statVal, { color: '#ef4444' }]}>{stats.wickets}</Text>
                <Text style={C.statLbl}>Wickets</Text>
              </View>
              <View style={[C.statCard, { flex: 2 }]}>
                <Text style={{ fontSize: 22, marginBottom: 6 }}>🏆</Text>
                <Text style={[C.statVal, { color: '#810100', fontSize: 22 }]}>
                  {stats.bestBowlingWkts > 0 ? formatBowling(stats.bestBowlingWkts, stats.bestBowlingRuns) : '—'}
                </Text>
                <Text style={C.statLbl}>Best Bowling</Text>
              </View>
            </View>
          </View>

          {/* Recent Matches */}
          <View style={C.section}>
            <Text style={C.sectionTitle}>RECENT MATCHES</Text>
            {recentMatches.length === 0 ? (
              <View style={C.emptyCard}>
                <Text style={{ fontSize: 32, marginBottom: 8 }}>🎯</Text>
                <Text style={C.emptyTitle}>No matches yet</Text>
                <Text style={C.emptyDesc}>Join or create a match to get started.</Text>
              </View>
            ) : (
              recentMatches.map(m => (
                <TouchableOpacity
                  key={m.id}
                  style={C.matchRow}
                  onPress={() => router.push(`/match/${m.sessions?.code ?? ''}`)}
                >
                  <View style={C.matchIconBox}>
                    <Text style={C.matchIconText}>{m.sessions?.code?.substring(0, 2) || 'VS'}</Text>
                  </View>
                  <View style={C.matchInfo}>
                    <Text style={C.matchName}>{m.sessions?.name || 'Match'}</Text>
                    <Text style={C.matchCode}>#{m.sessions?.code}</Text>
                  </View>
                  <View style={[C.matchBadge, m.status === 'result' ? C.badgeDone : C.badgeLive]}>
                    <Text style={[C.matchBadgeText, m.status === 'result' ? { color: '#5C5552' } : { color: '#810100' }]}>
                      {m.status === 'result' ? 'Done' : 'Live'}
                    </Text>
                  </View>
                </TouchableOpacity>
              ))
            )}
          </View>

        </ScrollView>
      </SafeAreaView>
    </View>
  );
}

const C = StyleSheet.create({
  screen: { flex: 1, backgroundColor: '#EDEBDE' },
  safe: { flex: 1 },
  center: { flex: 1, backgroundColor: '#EDEBDE', alignItems: 'center', justifyContent: 'center' },

  headerRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingHorizontal: 20, paddingTop: 8, paddingBottom: 12 },
  headerTitle: { color: '#1B1716', fontSize: 28, fontFamily: 'Outfit_900Black' },
  signOutBtn: { padding: 8, backgroundColor: '#FFFFFF', borderRadius: 12, shadowColor: '#1B1716', shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.06, shadowRadius: 6, elevation: 1 },

  heroCard: { marginHorizontal: 16, backgroundColor: '#FFFFFF', borderRadius: 24, padding: 24, alignItems: 'center', shadowColor: '#1B1716', shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.08, shadowRadius: 16, elevation: 4, marginBottom: 20 },
  avatarWrap: { position: 'relative', marginBottom: 12 },
  avatar: { width: 88, height: 88, borderRadius: 44, backgroundColor: '#810100', alignItems: 'center', justifyContent: 'center', shadowColor: '#810100', shadowOffset: { width: 0, height: 6 }, shadowOpacity: 0.25, shadowRadius: 12, elevation: 5 },
  avatarText: { color: '#FFFFFF', fontSize: 30, fontFamily: 'Outfit_900Black' },
  editBadge: { position: 'absolute', bottom: 0, right: 0, backgroundColor: '#630102', width: 28, height: 28, borderRadius: 14, alignItems: 'center', justifyContent: 'center', borderWidth: 3, borderColor: '#FFFFFF' },
  nameText: { color: '#1B1716', fontSize: 22, fontFamily: 'Outfit_800ExtraBold', marginBottom: 4 },
  emailText: { color: '#9A9390', fontSize: 13, fontFamily: 'Outfit_400Regular', marginBottom: 16 },
  heroDivider: { width: '100%', height: 1, backgroundColor: 'rgba(99,1,2,0.08)', marginBottom: 16 },
  heroMiniStats: { flexDirection: 'row', width: '100%', justifyContent: 'space-around' },
  heroMiniStat: { alignItems: 'center' },
  heroMiniVal: { color: '#1B1716', fontSize: 20, fontFamily: 'Outfit_900Black' },
  heroMiniLbl: { color: '#9A9390', fontSize: 11, fontFamily: 'Outfit_600SemiBold', textTransform: 'uppercase', letterSpacing: 0.5 },
  heroMiniDivider: { width: 1, backgroundColor: 'rgba(99,1,2,0.08)', marginVertical: 4 },

  section: { paddingHorizontal: 16, marginBottom: 20 },
  sectionTitle: { color: '#9A9390', fontSize: 11, fontFamily: 'Outfit_800ExtraBold', letterSpacing: 1.5, textTransform: 'uppercase', marginBottom: 12 },
  statsGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 10 },
  statCard: { flex: 1, minWidth: '45%', backgroundColor: '#FFFFFF', borderRadius: 18, padding: 16, shadowColor: '#1B1716', shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.05, shadowRadius: 8, elevation: 2 },
  statVal: { fontSize: 28, fontFamily: 'Outfit_900Black', marginBottom: 2 },
  statLbl: { color: '#9A9390', fontSize: 11, fontFamily: 'Outfit_700Bold', textTransform: 'uppercase', letterSpacing: 0.5 },

  emptyCard: { backgroundColor: '#FFFFFF', borderRadius: 18, padding: 32, alignItems: 'center', shadowColor: '#1B1716', shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.05, shadowRadius: 8, elevation: 1 },
  emptyTitle: { color: '#1B1716', fontSize: 16, fontFamily: 'Outfit_700Bold', marginBottom: 4 },
  emptyDesc: { color: '#9A9390', fontSize: 13, fontFamily: 'Outfit_400Regular' },

  matchRow: { flexDirection: 'row', alignItems: 'center', backgroundColor: '#FFFFFF', borderRadius: 16, padding: 14, gap: 12, marginBottom: 8, shadowColor: '#1B1716', shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.05, shadowRadius: 8, elevation: 1 },
  matchIconBox: { width: 44, height: 44, borderRadius: 12, backgroundColor: '#EDEBDE', alignItems: 'center', justifyContent: 'center' },
  matchIconText: { color: '#810100', fontFamily: 'Outfit_800ExtraBold', fontSize: 13 },
  matchInfo: { flex: 1 },
  matchName: { color: '#1B1716', fontSize: 14, fontFamily: 'Outfit_700Bold', marginBottom: 2 },
  matchCode: { color: '#9A9390', fontSize: 12, fontFamily: 'Outfit_600SemiBold', letterSpacing: 1 },
  matchBadge: { paddingHorizontal: 10, paddingVertical: 5, borderRadius: 10 },
  badgeDone: { backgroundColor: '#F5F3EC' },
  badgeLive: { backgroundColor: 'rgba(129,1,0,0.08)' },
  matchBadgeText: { fontSize: 11, fontFamily: 'Outfit_800ExtraBold', textTransform: 'uppercase', letterSpacing: 0.5 },
});
