import React, { useState, useEffect, useRef } from 'react';
import {
  View, Text, StyleSheet, TouchableOpacity, ScrollView,
  TextInput, SafeAreaView, RefreshControl, StatusBar, Animated,
} from 'react-native';
import { useRouter } from 'expo-router';
import { LinearGradient } from 'expo-linear-gradient';
import { Ionicons } from '@expo/vector-icons';
import { useAuth } from '../../context/AuthContext';
import { supabase } from '../../lib/supabase';
import { formatOvers } from '../../lib/cricket/engine';
import { EmptyState } from '../../components/EmptyState';
import { Skeleton } from '../../components/Skeleton';

// ── Helpers ────────────────────────────────────────────────────────────────────
function initials(name: string) {
  return name.split(' ').map(n => n[0]).join('').slice(0, 2).toUpperCase();
}
function abbr(name: string) {
  if (!name) return '???';
  const w = name.trim().split(/\s+/);
  return w.length === 1 ? name.slice(0, 3).toUpperCase() : w.map(x => x[0]).join('').toUpperCase().slice(0, 4);
}
function greeting() {
  const hr = new Date().getHours();
  if (hr < 12) return 'Good Morning';
  if (hr < 18) return 'Good Afternoon';
  return 'Good Evening';
}

// ── Animated Counter ───────────────────────────────────────────────────────────
function useCounter(target: number, duration = 800) {
  const [val, setVal] = useState(0);
  useEffect(() => {
    if (target === 0) { setVal(0); return; }
    const steps = 32;
    const interval = duration / steps;
    let step = 0;
    const timer = setInterval(() => {
      step++;
      const p = Math.min(step / steps, 1);
      const eased = 1 - Math.pow(1 - p, 3);
      setVal(Math.round(target * eased));
      if (step >= steps) clearInterval(timer);
    }, interval);
    return () => clearInterval(timer);
  }, [target]);
  return val;
}

// ── Stat Chip ──────────────────────────────────────────────────────────────────
function StatChip({ label, value, color }: { label: string; value: number; color: string }) {
  const displayed = useCounter(value);
  return (
    <View style={[C.statChip, { borderColor: color + '30' }]}>
      <Text style={[C.statChipValue, { color }]}>{displayed}</Text>
      <Text style={C.statChipLabel}>{label}</Text>
    </View>
  );
}

// ── Live Dot ───────────────────────────────────────────────────────────────────
function LiveDot() {
  const anim = useRef(new Animated.Value(1)).current;
  useEffect(() => {
    Animated.loop(
      Animated.sequence([
        Animated.timing(anim, { toValue: 0.3, duration: 700, useNativeDriver: true }),
        Animated.timing(anim, { toValue: 1, duration: 700, useNativeDriver: true }),
      ])
    ).start();
  }, []);
  return <Animated.View style={[C.liveDot, { opacity: anim }]} />;
}

// ── Main Screen ────────────────────────────────────────────────────────────────
export default function HomeScreen() {
  const router = useRouter();
  const { user, userName } = useAuth();
  const [joinCode, setJoinCode] = useState('');
  const [liveMatches, setLiveMatches] = useState<any[]>([]);
  const [upcomingMatches, setUpcomingMatches] = useState<any[]>([]);
  const [recentMatches, setRecentMatches] = useState<any[]>([]);
  const [stats, setStats] = useState({ runs: 0, wickets: 0, catches: 0, mvps: 0 });
  const [refreshing, setRefreshing] = useState(false);
  const [loading, setLoading] = useState(true);
  const scrollY = useRef(new Animated.Value(0)).current;

  // Header Animation Interpolations
  const headerTranslateY = scrollY.interpolate({
    inputRange: [0, 150],
    outputRange: [0, -80],
    extrapolate: 'clamp',
  });
  const heroOpacity = scrollY.interpolate({
    inputRange: [0, 100],
    outputRange: [1, 0],
    extrapolate: 'clamp',
  });

  const loadDashboard = async () => {
    if (!user) return;
    const { data: myPlayers } = await (supabase.from('players') as any)
      .select('session_id, team_id, is_scorer').eq('user_id', user.id);
    const sessionIds = [...new Set((myPlayers ?? []).map((p: any) => p.session_id))];
    if (sessionIds.length === 0) return;
    const { data: sessions } = await (supabase.from('sessions') as any)
      .select('id, code, name, status').in('id', sessionIds);
    const { data: matches } = await (supabase.from('matches') as any)
      .select('*, innings(*)').in('session_id', sessionIds).order('created_at', { ascending: false });
    const { data: teams } = await (supabase.from('teams') as any)
      .select('*').in('session_id', sessionIds);
    const { data: allSessionPlayers } = await (supabase.from('players') as any)
      .select('session_id').in('session_id', sessionIds);

    const live: any[] = [], upcoming: any[] = [], recent: any[] = [];
    for (const m of matches ?? []) {
      const sess = (sessions ?? []).find((s: any) => s.id === m.session_id);
      if (!sess) continue;
      const inn: any[] = m.innings ?? [];
      const activeInn = inn.find((i: any) => i.status === 'active');
      const battingTeam = activeInn ? (teams ?? []).find((t: any) => t.id === activeInn.team_id) : null;
      const bowlingTeamId = activeInn ? (activeInn.team_id === m.team1_id ? m.team2_id : m.team1_id) : null;
      const bowlingTeam = bowlingTeamId ? (teams ?? []).find((t: any) => t.id === bowlingTeamId) : null;
      const crr = activeInn && activeInn.total_balls > 0
        ? Math.round((activeInn.total_runs / (activeInn.total_balls / 6)) * 100) / 100 : 0;

      // Count all players who joined this session
      const playerCount = (allSessionPlayers ?? []).filter((p: any) => p.session_id === sess.id).length;

      if (['innings_1', 'innings_2', 'innings_break'].includes(m.status)) {
        live.push({
          id: m.id, code: sess.code, matchName: sess.name || `Match ${m.match_number}`,
          battingTeamName: battingTeam?.name ?? 'TBD', bowlingTeamName: bowlingTeam?.name ?? 'TBD',
          runs: activeInn?.total_runs ?? 0, wickets: activeInn?.total_wickets ?? 0,
          overs: activeInn ? formatOvers(activeInn.total_balls) : '0.0', crr,
          target: activeInn?.target ?? 0,
        });
      } else if (['toss', 'setup', 'lobby'].includes(m.status) || sess.status === 'lobby') {
        // lobby = session exists but match not started; toss/setup = match started config
        upcoming.push({
          id: m.id, code: sess.code, matchName: sess.name || `Match ${m.match_number}`,
          format: `${m.overs} ov`, playerCount,
          status: m.status === 'toss' ? 'Toss' : m.status === 'setup' ? 'Setup' : 'Lobby',
        });
      } else if (m.status === 'result') {
        // Show completed matches so user can review their score
        const team1 = (teams ?? []).find((t: any) => t.id === m.team1_id);
        const team2 = (teams ?? []).find((t: any) => t.id === m.team2_id);
        const winner = (teams ?? []).find((t: any) => t.id === m.winner_id);
        recent.push({
          id: m.id, code: sess.code, matchName: sess.name || `Match ${m.match_number}`,
          result: m.result ?? (winner ? `${winner.name} won` : 'Completed'),
          team1Name: team1?.name ?? '—', team2Name: team2?.name ?? '—',
        });
      }
    }

    // For sessions that are 'lobby' but have no match yet, still show them
    for (const sess of (sessions ?? [])) {
      const hasEntry = [...live, ...upcoming, ...recent].some(m => m.code === sess.code);
      if (!hasEntry && sess.status === 'lobby') {
        const playerCount = (allSessionPlayers ?? []).filter((p: any) => p.session_id === sess.id).length;
        upcoming.push({
          id: sess.id, code: sess.code, matchName: sess.name || 'Upcoming Match',
          format: '—', playerCount, status: 'Lobby',
        });
      }
    }

    // Deduplicate by id to prevent React key collisions (allows multiple matches per session)
    const dedup = (arr: any[]) => [...new Map(arr.map(m => [m.id, m])).values()];
    setLiveMatches(dedup(live));
    setUpcomingMatches(dedup(upcoming));
    setRecentMatches(dedup(recent));

    // Read directly from the career stats tables which are updated efficiently by the backend
    const [{ data: batStat }, { data: bowlStat }, { data: fieldStat }] = await Promise.all([
      (supabase.from('batting_career_stats') as any).select('runs').eq('user_id', user.id).maybeSingle(),
      (supabase.from('bowling_career_stats') as any).select('wickets').eq('user_id', user.id).maybeSingle(),
      (supabase.from('fielding_career_stats') as any).select('catches').eq('user_id', user.id).maybeSingle(),
    ]);

    setStats({ 
      runs: batStat?.runs ?? 0, 
      wickets: bowlStat?.wickets ?? 0, 
      catches: fieldStat?.catches ?? 0, 
      mvps: 0 
    });
    setLoading(false);
  };

  useEffect(() => { loadDashboard(); }, [user]);

  // Real-time: auto-refresh when any of user's sessions/matches change state
  // Debounce: multiple table changes fire together; only call loadDashboard once
  useEffect(() => {
    if (!user) return;
    let debounceTimer: ReturnType<typeof setTimeout> | null = null;
    const refresh = () => {
      if (debounceTimer) clearTimeout(debounceTimer);
      debounceTimer = setTimeout(() => loadDashboard(), 600);
    };
    const channelName = `home_realtime_${Math.random().toString(36).substring(7)}`;
    const channel = supabase
      .channel(channelName)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'sessions' }, refresh)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'matches' }, refresh)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'innings' }, refresh)
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'players' }, refresh)
      .subscribe();
    return () => {
      if (debounceTimer) clearTimeout(debounceTimer);
      supabase.removeChannel(channel);
    };
  }, [user]);

  // Ball-by-ball broadcast: subscribe to each live match's broadcast channel
  // so the home banner score updates instantly (not just at over boundaries).
  const liveBroadcastRefs = useRef<any[]>([]);
  useEffect(() => {
    // Clean up old channels
    liveBroadcastRefs.current.forEach(ch => supabase.removeChannel(ch));
    liveBroadcastRefs.current = [];

    if (liveMatches.length === 0) return;

    for (const m of liveMatches) {
      // MUST be the same topic the scorer broadcasts on (`match:<code>`) —
      // Supabase broadcast only delivers within the same channel topic. A
      // differently-named channel here receives nothing.
      const channelName = `match:${m.code}`;
      // Don't double-subscribe if a channel with this topic already exists
      const existing = supabase.getChannels().find(ch => ch.topic === `realtime:${channelName}`);
      if (existing) continue;

      const ch = supabase.channel(channelName, {
        config: { broadcast: { self: true } },
      })
        .on('broadcast', { event: 'score_update' }, (payload: any) => {
          const { innings_id, runs, wickets, balls: totalBalls } = payload.payload ?? {};
          if (!innings_id) return;
          // Update the liveMatches state with the new score
          setLiveMatches(prev => prev.map(lm => {
            if (lm.code !== m.code) return lm;
            const newRuns = Math.max(lm.runs, runs ?? 0);
            const newWickets = Math.max(lm.wickets, wickets ?? 0);
            const newBalls = totalBalls ?? lm._totalBalls ?? 0;
            const newCrr = newBalls > 0 ? Math.round((newRuns / (newBalls / 6)) * 100) / 100 : 0;
            return {
              ...lm,
              runs: newRuns,
              wickets: newWickets,
              overs: formatOvers(newBalls),
              crr: newCrr,
              _totalBalls: newBalls,
            };
          }));
        })
        .subscribe();
      liveBroadcastRefs.current.push(ch);
    }

    return () => {
      liveBroadcastRefs.current.forEach(ch => supabase.removeChannel(ch));
      liveBroadcastRefs.current = [];
    };
  }, [liveMatches.map(m => m.code).join(',')]);

  const onRefresh = async () => { setRefreshing(true); await loadDashboard(); setRefreshing(false); };
  const handleJoin = () => { if (joinCode.length >= 4) router.push(`/join?code=${joinCode}`); };

  return (
    <View style={C.screen}>
      <StatusBar barStyle="light-content" backgroundColor="#810100" />
      
      {/* iOS Overscroll red background trick */}
      <View style={{ position: 'absolute', top: -1000, left: 0, right: 0, height: 1000, backgroundColor: '#810100' }} />

      <Animated.ScrollView
        showsVerticalScrollIndicator={false}
        scrollEventThrottle={16}
        onScroll={Animated.event(
          [{ nativeEvent: { contentOffset: { y: scrollY } } }],
          { useNativeDriver: true }
        )}
        refreshControl={
          <RefreshControl 
            refreshing={refreshing} 
            onRefresh={onRefresh} 
            tintColor="#FFFFFF" 
            colors={['#810100']} 
            progressBackgroundColor="#FFFFFF"
          />
        }
      >
        {/* ── Hero ── */}
        <Animated.View style={[C.hero, { transform: [{ translateY: headerTranslateY }] }]}>
          <LinearGradient
            colors={['#810100', '#4A0000']}
            style={StyleSheet.absoluteFillObject}
            start={{ x: 0, y: 0 }}
            end={{ x: 1, y: 1 }}
          />
          <View style={C.heroPattern} />
          
          <SafeAreaView>
            <Animated.View style={[C.heroContent, { opacity: heroOpacity }]}>
              <View style={C.heroTop}>
                <Text style={C.brandBadge}>CRICPRO</Text>
                <TouchableOpacity onPress={() => router.push('/(tabs)/profile')} style={C.avatarBtn}>
                  <Text style={C.avatarText}>{userName ? initials(userName) : '?'}</Text>
                </TouchableOpacity>
              </View>
              <View style={C.heroBottom}>
                <Text style={C.heroGreeting}>{greeting()},</Text>
                <Text style={C.heroName}>{userName || 'Player'} 👋</Text>
              </View>
            </Animated.View>
          </SafeAreaView>
        </Animated.View>

        <View style={C.content}>
          {/* ── CTA Row ── */}
          <View style={C.ctaCard}>
            <TouchableOpacity style={C.newMatchBtn} onPress={() => router.push('/create')}>
              <Text style={C.newMatchPlus}>＋</Text>
              <Text style={C.newMatchText}>New Match</Text>
            </TouchableOpacity>
            <View style={C.joinBox}>
              <TextInput
                style={C.joinInput}
                value={joinCode}
                onChangeText={t => setJoinCode(t.toUpperCase().slice(0, 6))}
                onSubmitEditing={handleJoin}
                placeholder="ENTER CODE"
                placeholderTextColor="#9A9390"
                autoCapitalize="characters"
              />
              <TouchableOpacity
                style={[C.joinArrow, joinCode.length >= 4 && C.joinArrowActive]}
                onPress={handleJoin}
              >
                <Text style={{ color: joinCode.length >= 4 ? '#FFFFFF' : '#9A9390', fontSize: 18, fontFamily: 'Outfit_700Bold' }}>→</Text>
              </TouchableOpacity>
            </View>
          </View>

          {/* ── LIVE ── */}
          <View style={C.section}>
            <View style={C.sectionHeader}>
              <View style={C.liveHeaderLeft}>
                <LiveDot />
                <Text style={C.liveLabel}>LIVE</Text>
                {liveMatches.length > 0 && (
                  <View style={C.liveBadge}><Text style={C.liveBadgeText}>{liveMatches.length}</Text></View>
                )}
              </View>
            </View>

            {loading ? (
              <View>
                <Skeleton height={140} borderRadius={24} style={{ marginBottom: 16 }} />
                <Skeleton height={140} borderRadius={24} style={{ marginBottom: 16 }} />
              </View>
            ) : liveMatches.length === 0 ? (
              <EmptyState 
                icon="radio-outline" 
                title="No live matches" 
                message="Create or join a match to get started." 
              />
            ) : (
              liveMatches.map(m => (
                <TouchableOpacity key={m.id} style={C.liveCard} activeOpacity={0.85}
                  onPress={() => router.push(`/match/${m.code}`)}>
                  <View style={C.liveCardTop}>
                    <View style={C.liveRow}>
                      <LiveDot />
                      <Text style={C.liveLabelSmall}>LIVE</Text>
                      <Text style={C.liveMatchName}> · {m.matchName}</Text>
                    </View>
                    <Text style={C.liveViewText}>View →</Text>
                  </View>
                  <View style={C.liveCardBody}>
                    <View style={C.teamRow}>
                      <View style={C.teamAvatar}>
                        <Text style={C.teamAvatarText}>{abbr(m.battingTeamName)}</Text>
                      </View>
                      <Text style={C.teamName} numberOfLines={1}>{m.battingTeamName}</Text>
                      <View style={C.scoreRight}>
                        <Text style={C.scoreRuns}>{m.runs}</Text>
                        <Text style={C.scoreWkt}>/{m.wickets}</Text>
                        <Text style={C.scoreOv}> ({m.overs})</Text>
                      </View>
                    </View>
                    <View style={C.teamRow}>
                      <View style={[C.teamAvatar, C.teamAvatarGray]}>
                        <Text style={[C.teamAvatarText, { color: '#5C5552' }]}>{abbr(m.bowlingTeamName)}</Text>
                      </View>
                      <Text style={[C.teamName, { color: '#5C5552' }]} numberOfLines={1}>{m.bowlingTeamName}</Text>
                      <View style={C.scoreRight}>
                        <Text style={C.crrLabel}>CRR </Text>
                        <Text style={C.crrValue}>{m.crr.toFixed(2)}</Text>
                        {m.target > 0 && <Text style={C.needText}> · Need {Math.max(0, m.target - m.runs)}</Text>}
                      </View>
                    </View>
                  </View>
                </TouchableOpacity>
              ))
            )}
          </View>

          {/* ── UPCOMING ── */}
          {(loading || upcomingMatches.length > 0) && (
            <View style={C.section}>
              <View style={C.sectionHeader}>
                <Text style={C.sectionLabel}>UPCOMING</Text>
                {upcomingMatches.length > 0 && <View style={C.upcomingBadge}><Text style={C.upcomingBadgeText}>{upcomingMatches.length}</Text></View>}
              </View>
              {loading ? (
                <View>
                  <Skeleton height={80} borderRadius={16} style={{ marginBottom: 12 }} />
                  <Skeleton height={80} borderRadius={16} style={{ marginBottom: 12 }} />
                </View>
              ) : upcomingMatches.length === 0 ? (
                <EmptyState icon="calendar-outline" title="No upcoming matches" message="You haven't joined any matches yet." />
              ) : (
                upcomingMatches.map(m => (
                  <TouchableOpacity key={m.id} style={C.upcomingCard} activeOpacity={0.85}
                    onPress={() => router.push(`/match/${m.code}/lobby`)}>
                    <View style={C.upcomingIcon}>
                      <Text style={{ fontSize: 20 }}>{m.status === 'Toss' ? '🪙' : m.status === 'Lobby' ? '⏳' : '⚙️'}</Text>
                    </View>
                    <View style={C.upcomingBody}>
                      <Text style={C.upcomingName}>{m.matchName}</Text>
                      <View style={C.upcomingMeta}>
                        {m.format !== '—' && <Text style={C.upcomingFormat}>{m.format}</Text>}
                        <View style={[C.upcomingStatusBadge, m.status === 'Toss' ? C.statusToss : m.status === 'Setup' ? C.statusSetup : C.statusLobby]}>
                          <Text style={[C.upcomingStatusText, { color: m.status === 'Toss' ? '#8200c8' : m.status === 'Setup' ? '#0071e3' : '#e67e00' }]}>{m.status}</Text>
                        </View>
                        <Text style={C.upcomingPlayers}>· {m.playerCount} joined</Text>
                      </View>
                    </View>
                    <Text style={C.upcomingArrow}>›</Text>
                  </TouchableOpacity>
                ))
              )}
            </View>
          )}

          {/* ── RECENT ── */}
          {(loading || recentMatches.length > 0) && (
            <View style={C.section}>
              <View style={C.sectionHeader}>
                <Text style={C.sectionLabel}>RECENT</Text>
                {recentMatches.length > 0 && (
                  <View style={[C.upcomingBadge, { backgroundColor: 'rgba(99,1,2,0.08)' }]}>
                    <Text style={[C.upcomingBadgeText, { color: '#810100' }]}>{recentMatches.length}</Text>
                  </View>
                )}
              </View>
              {loading ? (
                <View>
                  <Skeleton height={80} borderRadius={16} style={{ marginBottom: 12 }} />
                  <Skeleton height={80} borderRadius={16} style={{ marginBottom: 12 }} />
                </View>
              ) : recentMatches.length === 0 ? (
                <EmptyState icon="time-outline" title="No recent matches" message="Complete a match to see it here." />
              ) : (
                recentMatches.map(m => (
                  <TouchableOpacity key={m.id} style={[C.upcomingCard, { borderLeftWidth: 3, borderLeftColor: '#1a8a3e' }]} activeOpacity={0.85}
                    onPress={() => router.push(`/match/${m.code}/result` as any)}>
                    <View style={[C.upcomingIcon, { backgroundColor: 'rgba(26,138,62,0.10)' }]}>
                      <Text style={{ fontSize: 20 }}>✅</Text>
                    </View>
                    <View style={C.upcomingBody}>
                      <Text style={C.upcomingName}>{m.matchName}</Text>
                      <Text style={[C.upcomingPlayers, { color: '#1a8a3e', fontFamily: 'Outfit_700Bold' }]}>{m.result}</Text>
                      <Text style={[C.upcomingPlayers, { marginTop: 2 }]}>{m.team1Name} vs {m.team2Name}</Text>
                    </View>
                    <Text style={[C.upcomingArrow, { color: '#1a8a3e' }]}>›</Text>
                  </TouchableOpacity>
                ))
              )}
            </View>
          )}

          {/* ── MY STATS ── */}
          <View style={C.section}>
            <View style={C.sectionHeader}>
              <Text style={C.sectionLabel}>MY STATS</Text>
              <TouchableOpacity onPress={() => router.push('/(tabs)/profile')}>
                <Text style={C.viewAllLink}>View all →</Text>
              </TouchableOpacity>
            </View>
            <View style={C.statsGrid}>
              {[
                { label: 'RUNS', value: stats.runs, color: '#1a8a3e', bg: 'rgba(26,138,62,0.08)' },
                { label: 'WKTS', value: stats.wickets, color: '#ef4444', bg: 'rgba(239,68,68,0.08)' },
                { label: 'CATCHES', value: stats.catches, color: '#0071e3', bg: 'rgba(0,113,227,0.08)' },
                { label: 'MVPs', value: stats.mvps, color: '#b8860b', bg: 'rgba(184,134,11,0.08)' },
              ].map(s => (
                <View key={s.label} style={[C.statCard, { backgroundColor: s.bg, borderColor: s.color + '20' }]}>
                  <Text style={[C.statCardValue, { color: s.color }]}>{s.value}</Text>
                  <Text style={C.statCardLabel}>{s.label}</Text>
                </View>
              ))}
            </View>
          </View>

          <View style={{ height: 24 }} />
        </View>
      </Animated.ScrollView>
    </View>
  );
}

const C = StyleSheet.create({
  screen: { flex: 1, backgroundColor: '#EDEBDE' },

  // Hero
  hero: { paddingTop: 50, paddingBottom: 36, borderBottomLeftRadius: 36, borderBottomRightRadius: 36, overflow: 'hidden', position: 'relative', elevation: 10, shadowColor: '#810100', shadowOffset: { width: 0, height: 10 }, shadowOpacity: 0.3, shadowRadius: 20 },
  heroPattern: { ...StyleSheet.absoluteFillObject, opacity: 0.15, backgroundColor: '#000000' },
  heroContent: { paddingHorizontal: 24, zIndex: 10 },
  heroTop: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 24 },
  brandBadge: { color: 'rgba(255,255,255,0.6)', fontSize: 13, fontFamily: 'Outfit_800ExtraBold', letterSpacing: 3, textTransform: 'uppercase' },
  avatarBtn: { width: 42, height: 42, borderRadius: 21, backgroundColor: '#FFFFFF', alignItems: 'center', justifyContent: 'center', shadowColor: '#000', shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.18, shadowRadius: 6, elevation: 4 },
  avatarText: { color: '#810100', fontFamily: 'Outfit_900Black', fontSize: 14 },
  heroBottom: { marginTop: 4 },
  heroGreeting: { color: 'rgba(255,255,255,0.70)', fontSize: 18, fontFamily: 'Outfit_400Regular', letterSpacing: 0.5, marginBottom: 4 },
  heroName: { color: '#FFFFFF', fontFamily: 'Outfit_800ExtraBold', fontSize: 32, textShadowColor: 'rgba(0,0,0,0.1)', textShadowOffset: { width: 0, height: 2 }, textShadowRadius: 4 },

  // Content
  content: { padding: 16, gap: 20 },

  // CTA
  ctaCard: { flexDirection: 'row', gap: 10 },
  newMatchBtn: { flex: 1, height: 58, backgroundColor: '#810100', borderRadius: 16, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, shadowColor: '#810100', shadowOffset: { width: 0, height: 6 }, shadowOpacity: 0.25, shadowRadius: 14, elevation: 5 },
  newMatchPlus: { color: '#FFFFFF', fontSize: 22, fontFamily: 'Outfit_300Light', lineHeight: 26 },
  newMatchText: { color: '#FFFFFF', fontFamily: 'Outfit_800ExtraBold', fontSize: 16 },
  joinBox: { flex: 1, height: 58, backgroundColor: '#FFFFFF', borderRadius: 16, flexDirection: 'row', alignItems: 'center', paddingHorizontal: 14, shadowColor: '#1B1716', shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.07, shadowRadius: 8, elevation: 2 },
  joinInput: { flex: 1, color: '#1B1716', fontFamily: 'Outfit_800ExtraBold', fontSize: 14, letterSpacing: 2.5 },
  joinArrow: { width: 36, height: 36, borderRadius: 10, backgroundColor: '#F5F3EC', alignItems: 'center', justifyContent: 'center' },
  joinArrowActive: { backgroundColor: '#810100' },

  // Sections
  section: { gap: 10 },
  sectionHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  sectionLabel: { fontSize: 11, fontFamily: 'Outfit_800ExtraBold', color: '#9A9390', letterSpacing: 1.2, textTransform: 'uppercase' },
  viewAllLink: { fontSize: 12, color: '#810100', fontFamily: 'Outfit_700Bold' },

  // Live
  liveHeaderLeft: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  liveDot: { width: 7, height: 7, borderRadius: 4, backgroundColor: '#810100' },
  liveLabel: { fontSize: 11, fontFamily: 'Outfit_800ExtraBold', color: '#810100', letterSpacing: 1.2, textTransform: 'uppercase' },
  liveBadge: { backgroundColor: '#810100', borderRadius: 8, paddingHorizontal: 6, paddingVertical: 1 },
  liveBadgeText: { color: '#FFFFFF', fontFamily: 'Outfit_800ExtraBold', fontSize: 10 },

  // Empty
  emptyCard: { backgroundColor: '#FFFFFF', borderRadius: 18, padding: 36, alignItems: 'center', gap: 8, shadowColor: '#1B1716', shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.06, shadowRadius: 8, elevation: 1 },
  emptyIcon: { fontSize: 40, marginBottom: 4 },
  emptyTitle: { fontSize: 16, fontFamily: 'Outfit_700Bold', color: '#1B1716' },
  emptyDesc: { fontSize: 13, color: '#9A9390', fontFamily: 'Outfit_400Regular', textAlign: 'center' },

  // Live card
  liveCard: { backgroundColor: '#FFFFFF', borderRadius: 18, overflow: 'hidden', borderLeftWidth: 3, borderLeftColor: '#810100', shadowColor: '#810100', shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.08, shadowRadius: 12, elevation: 3 },
  liveCardTop: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', padding: 12, paddingBottom: 8 },
  liveRow: { flexDirection: 'row', alignItems: 'center', gap: 5 },
  liveLabelSmall: { fontSize: 10, fontFamily: 'Outfit_800ExtraBold', color: '#810100', letterSpacing: 0.8 },
  liveMatchName: { fontSize: 11, color: '#9A9390', fontFamily: 'Outfit_600SemiBold' },
  liveViewText: { fontSize: 11, color: '#810100', fontFamily: 'Outfit_700Bold' },
  liveCardBody: { paddingHorizontal: 14, paddingBottom: 14, gap: 10 },
  teamRow: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  teamAvatar: { width: 32, height: 32, borderRadius: 8, backgroundColor: '#810100', alignItems: 'center', justifyContent: 'center' },
  teamAvatarGray: { backgroundColor: '#F5F3EC' },
  teamAvatarText: { fontSize: 10, fontFamily: 'Outfit_800ExtraBold', color: '#FFFFFF' },
  teamName: { flex: 1, fontSize: 14, fontFamily: 'Outfit_700Bold', color: '#1B1716' },
  scoreRight: { flexDirection: 'row', alignItems: 'baseline' },
  scoreRuns: { fontSize: 24, fontFamily: 'Outfit_900Black', color: '#1B1716', letterSpacing: -0.5 },
  scoreWkt: { fontSize: 15, fontFamily: 'Outfit_600SemiBold', color: '#5C5552' },
  scoreOv: { fontSize: 12, color: '#9A9390', fontFamily: 'Outfit_400Regular' },
  crrLabel: { fontSize: 11, color: '#9A9390', fontFamily: 'Outfit_600SemiBold' },
  crrValue: { fontSize: 14, fontFamily: 'Outfit_800ExtraBold', color: '#1a8a3e' },
  needText: { fontSize: 11, color: '#810100', fontFamily: 'Outfit_700Bold' },

  // Upcoming
  upcomingBadge: { backgroundColor: 'rgba(0,113,227,0.12)', borderRadius: 8, paddingHorizontal: 6, paddingVertical: 1 },
  upcomingBadgeText: { color: '#0071e3', fontFamily: 'Outfit_800ExtraBold', fontSize: 10 },
  upcomingCard: { flexDirection: 'row', alignItems: 'center', backgroundColor: '#FFFFFF', borderRadius: 16, padding: 14, gap: 12, shadowColor: '#1B1716', shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.06, shadowRadius: 8, elevation: 1 },
  upcomingIcon: { width: 44, height: 44, borderRadius: 12, backgroundColor: '#F5F3EC', alignItems: 'center', justifyContent: 'center' },
  upcomingBody: { flex: 1, gap: 4 },
  upcomingName: { fontSize: 15, fontFamily: 'Outfit_700Bold', color: '#1B1716' },
  upcomingMeta: { flexDirection: 'row', gap: 6, alignItems: 'center' },
  upcomingFormat: { backgroundColor: 'rgba(0,113,227,0.10)', color: '#0071e3', fontSize: 11, fontFamily: 'Outfit_800ExtraBold', paddingHorizontal: 8, paddingVertical: 2, borderRadius: 6 },
  upcomingPlayers: { fontSize: 12, color: '#9A9390', fontFamily: 'Outfit_600SemiBold' },
  upcomingArrow: { color: '#9A9390', fontSize: 22, fontFamily: 'Outfit_400Regular' },
  upcomingStatusBadge: { paddingHorizontal: 8, paddingVertical: 2, borderRadius: 6 },
  upcomingStatusText: { fontSize: 10, fontFamily: 'Outfit_800ExtraBold' },
  statusLobby: { backgroundColor: 'rgba(230,126,0,0.12)' }, // orange tint for lobby
  statusToss: { backgroundColor: 'rgba(130,0,200,0.10)' },  // purple tint for toss
  statusSetup: { backgroundColor: 'rgba(0,113,227,0.10)' }, // blue tint for setup


  // Stats grid
  statsGrid: { flexDirection: 'row', gap: 8 },
  statCard: { flex: 1, borderRadius: 14, paddingVertical: 14, alignItems: 'center', borderWidth: 1 },
  statCardValue: { fontSize: 26, fontFamily: 'Outfit_900Black', lineHeight: 30, marginBottom: 4 },
  statCardLabel: { fontSize: 9, color: '#9A9390', fontFamily: 'Outfit_700Bold', textTransform: 'uppercase', letterSpacing: 0.8 },

  // Stat chip (used by StatChip component)
  statChip: { backgroundColor: '#FFFFFF', borderRadius: 12, paddingHorizontal: 14, paddingVertical: 10, alignItems: 'center', borderWidth: 1, shadowColor: '#1B1716', shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.05, shadowRadius: 6, elevation: 1 },
  statChipValue: { fontSize: 22, fontFamily: 'Outfit_900Black', lineHeight: 26, marginBottom: 2 },
  statChipLabel: { fontSize: 9, color: '#9A9390', fontFamily: 'Outfit_700Bold', textTransform: 'uppercase', letterSpacing: 0.8 },
});

