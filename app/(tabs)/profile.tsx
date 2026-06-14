import React, { useState, useEffect } from 'react';
import {
  View, Text, StyleSheet, TouchableOpacity, ScrollView,
  SafeAreaView, Alert, ActivityIndicator, StatusBar, Share, RefreshControl, Switch, Modal
} from 'react-native';
import ViewShot from 'react-native-view-shot';
import * as Sharing from 'expo-sharing';
import { useRouter } from 'expo-router';
import { useAuth } from '../../context/AuthContext';
import { supabase } from '../../lib/supabase';
import { signOut } from '../../lib/auth';
import { isBiometricEnabled, setBiometricEnabled, getBiometricLabel, isBiometricAvailable } from '../../utils/biometric';
import { Ionicons } from '@expo/vector-icons';
import LoadingScreen from '../../components/LoadingScreen';

function initials(name: string) {
  return name.split(' ').map(n => n[0]).join('').slice(0, 2).toUpperCase();
}

function formatBowling(wickets: number, runs: number) {
  return `${wickets}/${runs}`;
}

export default function ProfileScreen() {
  const { user, userName, refreshSession } = useAuth();
  const router = useRouter();
  const [stats, setStats] = useState({
    runs: 0, wickets: 0, catches: 0, drops: 0, runOuts: 0, stumpings: 0, matches: 0, wins: 0, mvps: 0,
    highestScore: 0, bestBowlingWkts: 0, bestBowlingRuns: 0, fifties: 0, sixes: 0, fours: 0, strikeRate: 0, economy: 0,
  });
  const [recentMatches, setRecentMatches] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [bioEnabled, setBioEnabled] = useState(false);
  const [bioAvailable, setBioAvailable] = useState(false);
  const [bioLabel, setBioLabel] = useState('Face ID');
  const viewShotRef = React.useRef<any>(null);
  const [exportModalVisible, setExportModalVisible] = useState(false);
  const [sharing, setSharing] = useState(false);
  const [exportData, setExportData] = useState<any>(null);

  useEffect(() => { 
    loadProfile(); 
    isBiometricAvailable().then(avail => {
      setBioAvailable(avail);
      if (avail) {
        getBiometricLabel().then(setBioLabel);
        isBiometricEnabled().then(setBioEnabled);
      }
    });
  }, [user]);

  const toggleBiometric = async (val: boolean) => {
    setBioEnabled(val);
    await setBiometricEnabled(val);
  };

  const onRefresh = async () => {
    setRefreshing(true);
    await loadProfile();
    setRefreshing(false);
  };

  const loadProfile = async () => {
    if (!user) return;
    setLoading(true);
    try {
      // Fetch recent matches
      const { data: playerSessions } = await (supabase.from('players') as any)
        .select('id, session_id').eq('user_id', user.id);
      const sessionIds = (playerSessions ?? []).map((p: any) => p.session_id);

      const { data: matchData } = await (supabase.from('matches') as any)
        .select('*, sessions(name, code)').in('session_id', sessionIds)
        .order('created_at', { ascending: false }).limit(10);
        
      const { count: totalMatches } = await (supabase.from('matches') as any)
        .select('*', { count: 'exact', head: true }).in('session_id', sessionIds);

      setRecentMatches(matchData ?? []);

      // Fetch pre-calculated career stats
      const [{ data: userRec }, { data: batStat }, { data: bowlStat }, { data: fieldStat }] = await Promise.all([
        (supabase.from('users') as any).select('*').eq('id', user.id).maybeSingle(),
        (supabase.from('batting_career_stats') as any).select('*').eq('user_id', user.id).maybeSingle(),
        (supabase.from('bowling_career_stats') as any).select('*').eq('user_id', user.id).maybeSingle(),
        (supabase.from('fielding_career_stats') as any).select('*').eq('user_id', user.id).maybeSingle(),
      ]);

      setStats({
        runs: batStat?.runs ?? 0, 
        wickets: bowlStat?.wickets ?? 0, 
        catches: fieldStat?.catches ?? 0,
        drops: fieldStat?.dropped_catches ?? 0,
        runOuts: fieldStat?.run_outs ?? 0,
        stumpings: fieldStat?.stumpings ?? 0,
        matches: totalMatches ?? userRec?.matches_played ?? 0, 
        wins: userRec?.matches_won ?? 0,
        mvps: userRec?.mvps ?? 0,
        highestScore: batStat?.highest_score ?? 0, 
        fifties: batStat?.fifties ?? 0,
        bestBowlingWkts: bowlStat?.best_bowling_wickets ?? 0, 
        bestBowlingRuns: bowlStat?.best_bowling_runs ?? 0,
        sixes: batStat?.sixes ?? 0, 
        fours: batStat?.fours ?? 0,
        strikeRate: batStat?.balls > 0 ? ((batStat?.runs || 0) / batStat.balls * 100).toFixed(1) : 0,
        economy: bowlStat?.legal_balls > 0 ? ((bowlStat?.runs || 0) / (bowlStat.legal_balls / 6)).toFixed(1) : 0,
      });
    } catch (e) { console.error(e); }
    finally { setLoading(false); }
  };

  const handleSignOut = async () => {
    Alert.alert('Sign Out', 'Are you sure?', [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Sign Out', style: 'destructive', onPress: async () => { 
        await signOut(); 
        await refreshSession(); 
      } },
    ]);
  };

  const handleExport = async () => {
    setExportData({ player: { name: userName, mvps: stats.mvps }, stats, daily: { date: new Date().toISOString() } });
    setExportModalVisible(true);
  };

  const executeExport = async () => {
    if (sharing) return;
    setSharing(true);
    setTimeout(async () => {
      try {
        if (viewShotRef.current) {
          const uri = await viewShotRef.current.capture();
          await Sharing.shareAsync(uri, { dialogTitle: 'Share Turf Titans Stats' });
          setExportModalVisible(false);
        }
      } catch (e) {
        console.error(e);
        Alert.alert("Export Failed", "Could not generate the image.");
      } finally {
        setSharing(false);
      }
    }, 100);
  };

  if (loading) {
    return <LoadingScreen />;
  }

  return (
    <View style={C.screen}>
      <StatusBar barStyle="dark-content" backgroundColor="#EDEBDE" />

      {/* Visible Export Modal to prevent iOS culling */}
      <Modal visible={exportModalVisible} transparent={true} animationType="slide">
        <View style={{ flex: 1, backgroundColor: 'rgba(0,0,0,0.9)' }}>
          <SafeAreaView style={{ flex: 1 }}>
            <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', padding: 20 }}>
              <TouchableOpacity onPress={() => setExportModalVisible(false)} style={{ padding: 8 }}>
                <Text style={{ color: '#fff', fontSize: 18 }}>Cancel</Text>
              </TouchableOpacity>
              <Text style={{ color: '#fff', fontSize: 16, fontWeight: 'bold' }}>Export Preview</Text>
              <TouchableOpacity onPress={executeExport} disabled={sharing} style={{ padding: 8, backgroundColor: '#f97316', borderRadius: 8 }}>
                {sharing ? <ActivityIndicator size="small" color="#fff" /> : <Text style={{ color: '#fff', fontSize: 16, fontWeight: 'bold' }}>Share</Text>}
              </TouchableOpacity>
            </View>
            <ScrollView contentContainerStyle={{ padding: 20, alignItems: 'center', paddingBottom: 60 }}>
              {exportData && (
                <ViewShot ref={viewShotRef} options={{ format: 'png', quality: 1.0, result: 'tmpfile' }}>
                  <View style={{ width: 400, backgroundColor: '#0a0a0a', padding: 24, borderRadius: 20, borderColor: 'rgba(249,115,22, 0.4)', borderWidth: 2 }}>
                    <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 24 }}>
                      <View>
                        <Text style={{ color: '#f97316', fontSize: 14, fontWeight: 'bold', letterSpacing: 2 }}>{exportData.player.name.toUpperCase()}</Text>
                        <Text style={{ color: '#FFFFFF', fontSize: 32, fontWeight: '900', fontFamily: 'Outfit_900Black', marginTop: 4 }}>PLAYER STATS</Text>
                      </View>
                      <View style={{ alignItems: 'center' }}>
                        <Text style={{ fontSize: 32 }}>🏆</Text>
                        <Text style={{ color: '#fbbf24', fontSize: 12, fontWeight: 'bold', marginTop: 4 }}>{Array(exportData.player.mvps).fill('★').join('') || 'PLAYER'}</Text>
                      </View>
                    </View>

                    <View style={{ flexDirection: 'row', gap: 12, marginBottom: 12 }}>
                      <View style={{ flex: 1, backgroundColor: 'rgba(255,255,255,0.05)', padding: 16, borderRadius: 16 }}>
                        <Text style={{ color: '#aaa', fontSize: 12, fontWeight: 'bold', marginBottom: 4 }}>MATCHES</Text>
                        <Text style={{ color: '#fff', fontSize: 28, fontWeight: '900' }}>{exportData.stats.matches}</Text>
                      </View>
                      <View style={{ flex: 1, backgroundColor: 'rgba(255,255,255,0.05)', padding: 16, borderRadius: 16 }}>
                        <Text style={{ color: '#aaa', fontSize: 12, fontWeight: 'bold', marginBottom: 4 }}>WIN RATE</Text>
                        <Text style={{ color: '#fff', fontSize: 28, fontWeight: '900' }}>
                          {exportData.stats.matches > 0 ? Math.round((exportData.stats.wins / exportData.stats.matches) * 100) : 0}%
                        </Text>
                      </View>
                    </View>

                    <Text style={{ color: '#fff', fontSize: 20, fontWeight: 'bold', marginTop: 12, marginBottom: 12, borderLeftWidth: 4, borderLeftColor: '#30d158', paddingLeft: 8 }}>BATTING</Text>
                    <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 12, marginBottom: 24 }}>
                      <View style={{ flexBasis: '47%', backgroundColor: 'rgba(48,209,88,0.1)', padding: 16, borderRadius: 16 }}>
                        <Text style={{ color: '#30d158', fontSize: 11, fontWeight: 'bold', marginBottom: 4 }}>RUNS</Text>
                        <Text style={{ color: '#fff', fontSize: 24, fontWeight: '900' }}>{exportData.stats.runs}</Text>
                      </View>
                      <View style={{ flexBasis: '47%', backgroundColor: 'rgba(48,209,88,0.1)', padding: 16, borderRadius: 16 }}>
                        <Text style={{ color: '#30d158', fontSize: 11, fontWeight: 'bold', marginBottom: 4 }}>STRIKE RATE</Text>
                        <Text style={{ color: '#fff', fontSize: 24, fontWeight: '900' }}>{exportData.stats.strikeRate || 0}</Text>
                      </View>
                      <View style={{ flexBasis: '47%', backgroundColor: 'rgba(48,209,88,0.1)', padding: 16, borderRadius: 16 }}>
                        <Text style={{ color: '#30d158', fontSize: 11, fontWeight: 'bold', marginBottom: 4 }}>BOUNDARIES</Text>
                        <Text style={{ color: '#fff', fontSize: 24, fontWeight: '900' }}>{exportData.stats.fours}x4 / {exportData.stats.sixes}x6</Text>
                      </View>
                    </View>

                    <Text style={{ color: '#fff', fontSize: 20, fontWeight: 'bold', marginBottom: 12, borderLeftWidth: 4, borderLeftColor: '#f87171', paddingLeft: 8 }}>BOWLING</Text>
                    <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 12, marginBottom: 8 }}>
                      <View style={{ flexBasis: '47%', backgroundColor: 'rgba(248,113,113,0.1)', padding: 16, borderRadius: 16 }}>
                        <Text style={{ color: '#f87171', fontSize: 11, fontWeight: 'bold', marginBottom: 4 }}>WICKETS</Text>
                        <Text style={{ color: '#fff', fontSize: 24, fontWeight: '900' }}>{exportData.stats.wickets}</Text>
                      </View>
                      <View style={{ flexBasis: '47%', backgroundColor: 'rgba(248,113,113,0.1)', padding: 16, borderRadius: 16 }}>
                        <Text style={{ color: '#f87171', fontSize: 11, fontWeight: 'bold', marginBottom: 4 }}>ECONOMY</Text>
                        <Text style={{ color: '#fff', fontSize: 24, fontWeight: '900' }}>{exportData.stats.economy || 0}</Text>
                      </View>
                    </View>
                  </View>
                </ViewShot>
              )}
            </ScrollView>
          </SafeAreaView>
        </View>
      </Modal>

      <SafeAreaView style={[C.safe, { backgroundColor: '#EDEBDE', flex: 1 }]}>
        <ScrollView 
          showsVerticalScrollIndicator={false} 
          contentContainerStyle={{ paddingBottom: 40 }}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor="#810100" colors={['#810100']} />}
        >

          {/* Header */}
          <View style={C.headerRow}>
            <Text style={C.headerTitle}>Profile</Text>
            <View style={{ flexDirection: 'row', gap: 8 }}>
              <TouchableOpacity style={C.signOutBtn} onPress={handleExport}>
                <Ionicons name="share-outline" size={20} color="#810100" />
              </TouchableOpacity>
              <TouchableOpacity style={C.signOutBtn} onPress={handleSignOut}>
                <Ionicons name="log-out-outline" size={20} color="#810100" />
              </TouchableOpacity>
            </View>
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
            <View style={{ flexDirection: 'row', alignItems: 'center', marginBottom: 16 }}>
              <Text style={C.emailText}>{user?.email}</Text>
              {stats.mvps > 0 && <Text style={{ marginLeft: 8, fontSize: 14, color: '#fbbf24', marginBottom: 16 }}>{Array(stats.mvps).fill('★').join('')}</Text>}
            </View>
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

          <View style={C.section}>
            <Text style={C.sectionTitle}>CAREER FIELDING</Text>
            <View style={C.statsGrid}>
              {[
                { icon: '🤲', label: 'Catches', value: stats.catches, color: '#1a8a3e' },
                { icon: '💔', label: 'Drops', value: stats.drops, color: '#ef4444' },
                { icon: '🏃', label: 'Run Outs', value: stats.runOuts, color: '#b8860b' },
                { icon: '🧤', label: 'Stumpings', value: stats.stumpings, color: '#7030a0' },
              ].map(s => (
                <View key={s.label} style={C.statCard}>
                  <Text style={{ fontSize: 22, marginBottom: 6 }}>{s.icon}</Text>
                  <Text style={[C.statVal, { color: s.color }]}>{s.value}</Text>
                  <Text style={C.statLbl}>{s.label}</Text>
                </View>
              ))}
            </View>
          </View>

          {/* Security */}
          <View style={[C.section, { marginBottom: 30 }]}>
            <Text style={C.sectionTitle}>SECURITY</Text>
            
            <TouchableOpacity style={C.settingsRow} onPress={() => router.push('/update-password')}>
              <View style={C.settingsInfo}>
                <Text style={C.settingsLabel}>Update Password</Text>
                <Text style={C.settingsDesc}>Change your account login password</Text>
              </View>
              <Ionicons name="chevron-forward" size={20} color="#9A9390" />
            </TouchableOpacity>

            {bioAvailable && (
              <>
                <View style={C.heroMiniDivider} />
                <View style={C.settingsRow}>
                  <View style={C.settingsInfo}>
                    <Text style={C.settingsLabel}>Unlock with {bioLabel}</Text>
                    <Text style={C.settingsDesc}>Sign in instantly without a password</Text>
                  </View>
                  <Switch
                    value={bioEnabled}
                    onValueChange={toggleBiometric}
                    trackColor={{ false: '#D9D5CD', true: '#810100' }}
                    thumbColor={'#FFFFFF'}
                  />
                </View>
              </>
            )}
          </View>

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

  settingsRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', backgroundColor: '#FFFFFF', padding: 16, borderRadius: 16, shadowColor: '#1B1716', shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.05, shadowRadius: 8, elevation: 1 },
  settingsInfo: { flex: 1, paddingRight: 16 },
  settingsLabel: { color: '#1B1716', fontSize: 16, fontFamily: 'Outfit_700Bold', marginBottom: 2 },
  settingsDesc: { color: '#9A9390', fontSize: 13, fontFamily: 'Outfit_400Regular' },
});
