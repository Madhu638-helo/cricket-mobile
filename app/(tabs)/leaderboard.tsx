import React, { useState, useEffect } from 'react';
import {
  View, Text, StyleSheet, ScrollView, SafeAreaView,
  ActivityIndicator, TouchableOpacity, StatusBar, RefreshControl
} from 'react-native';
import { supabase } from '../../lib/supabase';
import LoadingScreen from '../../components/LoadingScreen';
import { useAuth } from '../../context/AuthContext';

function initials(name: string) {
  return name ? name.split(' ').map(n => n[0]).join('').slice(0, 2).toUpperCase() : '??';
}

type Tab = 'batting' | 'bowling' | 'champions';

const MEDAL_COLORS = ['#b8860b', '#6C757D', '#8B4513'];
const MEDAL_BG = ['rgba(184,134,11,0.12)', 'rgba(108,117,125,0.10)', 'rgba(139,69,19,0.10)'];

export default function LeaderboardScreen() {
  const { user } = useAuth();
  const [leaders, setLeaders] = useState<any[]>([]);
  const [championsData, setChampionsData] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [tab, setTab] = useState<Tab>('batting');

  useEffect(() => { loadLeaderboard(); }, [tab]);

  const onRefresh = async () => {
    setRefreshing(true);
    await loadLeaderboard();
    setRefreshing(false);
  };

  const loadLeaderboard = async () => {
    setLoading(true);
    try {
      if (tab === 'champions') {
        const [
          { data: teams },
          { data: matches },
          { data: personal },
          { data: highestScoreInning },
          { data: highestRunsPlayer },
          { data: highestWicketsPlayer },
          { data: bestEcoPlayer },
          { data: highestSixesPlayer },
          { data: highestSRPlayer },
          { data: allAdmins }
        ] = await Promise.all([
          supabase.from('teams').select('id, name'),
          supabase.from('matches').select('id, winning_team_id'),
          supabase.from('users').select('matches_played, matches_won, matches_lost, matches_tied').eq('id', user?.id).maybeSingle() as any,
          supabase.from('innings').select('total_runs, total_wickets, total_balls').order('total_runs', { ascending: false }).limit(1).maybeSingle(),
          (supabase.from('batting_career_stats') as any).select('user_id, runs').order('runs', { ascending: false }).limit(1).maybeSingle(),
          (supabase.from('bowling_career_stats') as any).select('user_id, wickets').order('wickets', { ascending: false }).limit(1).maybeSingle(),
          (supabase.from('bowling_career_stats') as any).select('user_id, economy, overs_bowled').gte('overs_bowled', 2).order('economy', { ascending: true }).limit(1).maybeSingle(),
          (supabase.from('batting_career_stats') as any).select('user_id, sixes, fours').order('sixes', { ascending: false }).limit(1).maybeSingle(),
          (supabase.from('batting_career_stats') as any).select('user_id, strike_rate, balls_faced').gte('balls_faced', 10).order('strike_rate', { ascending: false }).limit(1).maybeSingle(),
          (supabase.from('users') as any).select('id, name')
        ]);

        const adminMap = new Map((allAdmins ?? []).map((a: any) => [a.id, a.name]));

        // Calculate team wins
        const teamWins: Record<string, number> = {};
        for (const m of (matches ?? [])) {
          if (m.winning_team_id) {
            const team = teams?.find((t: any) => t.id === m.winning_team_id);
            if (team) {
              teamWins[team.name] = (teamWins[team.name] || 0) + 1;
            }
          }
        }
        
        const sortedTeams = Object.keys(teamWins).sort((a, b) => teamWins[b] - teamWins[a]);
        const teamA = sortedTeams[0] || 'Team A';
        const teamAWins = teamWins[teamA] || 0;
        const teamB = sortedTeams[1] || 'Team B';
        const teamBWins = teamWins[teamB] || 0;

        setChampionsData({
          teamA: { name: teamA, wins: teamAWins },
          teamB: { name: teamB, wins: teamBWins },
          personal: personal ?? { matches_played: 0, matches_won: 0, matches_lost: 0, matches_tied: 0 },
          highestScore: highestScoreInning ? `${highestScoreInning.total_runs}/${highestScoreInning.total_wickets} (${Math.floor(highestScoreInning.total_balls/6)}.${highestScoreInning.total_balls%6} Ov)` : '-',
          highestRuns: { name: adminMap.get(highestRunsPlayer?.user_id) || '-', val: highestRunsPlayer?.runs ?? 0 },
          highestWickets: { name: adminMap.get(highestWicketsPlayer?.user_id) || '-', val: highestWicketsPlayer?.wickets ?? 0 },
          bestEco: { name: adminMap.get(bestEcoPlayer?.user_id) || '-', val: bestEcoPlayer?.economy ?? 0 },
          highestSixes: { name: adminMap.get(highestSixesPlayer?.user_id) || '-', val: `${highestSixesPlayer?.sixes ?? 0} / ${highestSixesPlayer?.fours ?? 0}` },
          highestSR: { name: adminMap.get(highestSRPlayer?.user_id) || '-', val: highestSRPlayer?.strike_rate ?? 0 },
        });
        return;
      }

      const { data: balls } = await (supabase.from('balls') as any)
        .select('batsman_id, bowler_id, runs_off_bat, extras, is_wicket, wicket_type, extra_type');
      if (!balls) return;
      const { data: players } = await (supabase.from('players') as any).select('id, name, user_id');
      if (!players) return;

      if (tab === 'batting') {
        const map: Record<string, any> = {};
        for (const b of balls) {
          if (!b.batsman_id) continue;
          if (!map[b.batsman_id]) {
            const p = players.find((p: any) => p.id === b.batsman_id);
            map[b.batsman_id] = { name: p?.name ?? 'Unknown', runs: 0, balls: 0, fours: 0, sixes: 0 };
          }
          if (b.extra_type !== 'wide') {
            map[b.batsman_id].runs += b.runs_off_bat ?? 0;
            map[b.batsman_id].balls += 1;
            if ((b.runs_off_bat ?? 0) === 4) map[b.batsman_id].fours++;
            if ((b.runs_off_bat ?? 0) === 6) map[b.batsman_id].sixes++;
          }
        }
        const sorted = Object.values(map).sort((a, b) => b.runs - a.runs).slice(0, 20);
        setLeaders(sorted.map(s => ({
          name: s.name,
          primary: s.runs, primaryLabel: 'Runs',
          s2: s.balls > 0 ? (s.runs / s.balls * 100).toFixed(1) : '0.0', s2Label: 'SR',
          s3: `${s.fours}/${s.sixes}`, s3Label: '4s/6s',
        })));
      } else if (tab === 'bowling') {
        const map: Record<string, any> = {};
        for (const b of balls) {
          if (!b.bowler_id) continue;
          if (!map[b.bowler_id]) {
            const p = players.find((p: any) => p.id === b.bowler_id);
            map[b.bowler_id] = { name: p?.name ?? 'Unknown', wickets: 0, legalBalls: 0, runs: 0 };
          }
          map[b.bowler_id].runs += (b.runs_off_bat ?? 0) + (b.extras ?? 0);
          if (b.extra_type !== 'wide' && b.extra_type !== 'noball') map[b.bowler_id].legalBalls++;
          if (b.is_wicket && b.wicket_type !== 'runout' && b.wicket_type !== 'retiredhurt') map[b.bowler_id].wickets++;
        }
        const sorted = Object.values(map).filter(s => s.legalBalls > 0).sort((a, b) => b.wickets - a.wickets).slice(0, 20);
        setLeaders(sorted.map(s => {
          const overs = Math.floor(s.legalBalls / 6) + (s.legalBalls % 6) / 10;
          const eco = s.legalBalls > 0 ? (s.runs / (s.legalBalls / 6)).toFixed(2) : '0.00';
          return {
            name: s.name,
            primary: s.wickets, primaryLabel: 'Wkts',
            s2: eco, s2Label: 'ECO',
            s3: overs.toFixed(1), s3Label: 'Ovs',
          };
        }));
      }
    } catch (e) { console.error(e); }
    finally { setLoading(false); }
  };

  return (
    <View style={C.screen}>
      <StatusBar barStyle="dark-content" backgroundColor="#EDEBDE" />
      <SafeAreaView style={C.safe}>
        {/* Header */}
        <View style={C.header}>
          <Text style={C.title}>Rankings</Text>
          <Text style={C.subtitle}>Season leaders & records</Text>
        </View>

        {/* Tabs */}
        <View style={C.tabBar}>
          {(['batting', 'bowling', 'champions'] as Tab[]).map(t => (
            <TouchableOpacity key={t} style={[C.tab, tab === t && C.tabActive]} onPress={() => setTab(t)}>
              <Text style={[C.tabText, tab === t && C.tabTextActive]}>
                {t === 'batting' ? '🏏 Batting' : t === 'bowling' ? '⚾ Bowling' : '🏆 Champions'}
              </Text>
            </TouchableOpacity>
          ))}
        </View>

        {loading ? (
          <LoadingScreen />
        ) : (
          <ScrollView 
            contentContainerStyle={C.list} 
            showsVerticalScrollIndicator={false}
            refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor="#810100" colors={['#810100']} />}
          >
            {tab === 'champions' && championsData && (
              <View style={{ gap: 16 }}>
                {/* Team Dominance */}
                <View style={C.card}>
                  <Text style={C.cardTitle}>Team Dominance</Text>
                  <View style={{ flexDirection: 'row', alignItems: 'center', marginVertical: 12 }}>
                    <View style={{ flex: championsData.teamA.wins || 1, backgroundColor: '#810100', height: 12, borderTopLeftRadius: 6, borderBottomLeftRadius: 6 }} />
                    <View style={{ flex: championsData.teamB.wins || 1, backgroundColor: '#6C757D', height: 12, borderTopRightRadius: 6, borderBottomRightRadius: 6 }} />
                  </View>
                  <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
                    <Text style={C.cardLabel}>{championsData.teamA.name}: <Text style={{color: '#810100', fontFamily: 'Outfit_800ExtraBold'}}>{championsData.teamA.wins} Wins</Text></Text>
                    <Text style={C.cardLabel}>{championsData.teamB.name}: <Text style={{color: '#6C757D', fontFamily: 'Outfit_800ExtraBold'}}>{championsData.teamB.wins} Wins</Text></Text>
                  </View>
                </View>

                {/* Personal Impact */}
                <View style={C.card}>
                  <Text style={C.cardTitle}>Your Impact</Text>
                  <View style={{ flexDirection: 'row', justifyContent: 'space-between', marginTop: 12 }}>
                    <View style={{ alignItems: 'center', flex: 1 }}>
                      <Text style={{ fontFamily: 'Outfit_900Black', fontSize: 28, color: '#2b8a3e' }}>{championsData.personal.matches_won}</Text>
                      <Text style={C.cardLabel}>Matches Won</Text>
                    </View>
                    <View style={{ width: 1, backgroundColor: '#EDEBDE' }} />
                    <View style={{ alignItems: 'center', flex: 1 }}>
                      <Text style={{ fontFamily: 'Outfit_900Black', fontSize: 28, color: '#c92a2a' }}>{championsData.personal.matches_lost}</Text>
                      <Text style={C.cardLabel}>Matches Lost</Text>
                    </View>
                  </View>
                </View>

                {/* Global Records */}
                <Text style={[C.cardTitle, { marginLeft: 4, marginTop: 8 }]}>Global Records</Text>
                <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 12 }}>
                  <View style={[C.card, { flex: 1, minWidth: '45%' }]}>
                    <Text style={C.cardLabel}>Highest Team Score</Text>
                    <Text style={C.recordVal}>{championsData.highestScore}</Text>
                  </View>
                  <View style={[C.card, { flex: 1, minWidth: '45%' }]}>
                    <Text style={C.cardLabel}>Highest Runs</Text>
                    <Text style={C.recordVal}>{championsData.highestRuns.val}</Text>
                    <Text style={C.recordHolder}>{championsData.highestRuns.name}</Text>
                  </View>
                  <View style={[C.card, { flex: 1, minWidth: '45%' }]}>
                    <Text style={C.cardLabel}>Most Wickets</Text>
                    <Text style={C.recordVal}>{championsData.highestWickets.val}</Text>
                    <Text style={C.recordHolder}>{championsData.highestWickets.name}</Text>
                  </View>
                  <View style={[C.card, { flex: 1, minWidth: '45%' }]}>
                    <Text style={C.cardLabel}>Best Economy</Text>
                    <Text style={C.recordVal}>{championsData.bestEco.val}</Text>
                    <Text style={C.recordHolder}>{championsData.bestEco.name}</Text>
                  </View>
                  <View style={[C.card, { flex: 1, minWidth: '45%' }]}>
                    <Text style={C.cardLabel}>Most 6s / 4s</Text>
                    <Text style={C.recordVal}>{championsData.highestSixes.val}</Text>
                    <Text style={C.recordHolder}>{championsData.highestSixes.name}</Text>
                  </View>
                  <View style={[C.card, { flex: 1, minWidth: '45%' }]}>
                    <Text style={C.cardLabel}>Highest Strike Rate</Text>
                    <Text style={C.recordVal}>{championsData.highestSR.val}</Text>
                    <Text style={C.recordHolder}>{championsData.highestSR.name}</Text>
                  </View>
                </View>
              </View>
            )}

            {tab !== 'champions' && leaders.length >= 3 && (
              <View style={C.podium}>
                {/* 2nd */}
                <View style={[C.podiumItem, { marginTop: 24 }]}>
                  <View style={[C.podiumAvatar, { backgroundColor: '#6C757D' }]}>
                    <Text style={C.podiumAvatarText}>{initials(leaders[1].name)}</Text>
                  </View>
                  <View style={[C.podiumBase, { backgroundColor: MEDAL_BG[1], paddingBottom: 18 }]}>
                    <Text style={[C.podiumMedal]}>🥈</Text>
                    <Text style={[C.podiumName]} numberOfLines={1}>{leaders[1].name.split(' ')[0]}</Text>
                    <Text style={[C.podiumStat, { color: '#6C757D' }]}>{leaders[1].primary} {leaders[1].primaryLabel}</Text>
                  </View>
                </View>
                {/* 1st */}
                <View style={C.podiumItem}>
                  <View style={[C.podiumAvatar, { backgroundColor: '#810100', width: 60, height: 60, borderRadius: 30 }]}>
                    <Text style={[C.podiumAvatarText, { fontSize: 20 }]}>{initials(leaders[0].name)}</Text>
                  </View>
                  <View style={[C.podiumBase, { backgroundColor: MEDAL_BG[0], paddingBottom: 36 }]}>
                    <Text style={C.podiumMedal}>🥇</Text>
                    <Text style={[C.podiumName, { fontSize: 13, fontFamily: 'Outfit_800ExtraBold' }]} numberOfLines={1}>{leaders[0].name.split(' ')[0]}</Text>
                    <Text style={[C.podiumStat, { color: '#b8860b', fontFamily: 'Outfit_800ExtraBold' }]}>{leaders[0].primary} {leaders[0].primaryLabel}</Text>
                  </View>
                </View>
                {/* 3rd */}
                <View style={[C.podiumItem, { marginTop: 40 }]}>
                  <View style={[C.podiumAvatar, { backgroundColor: '#8B4513' }]}>
                    <Text style={C.podiumAvatarText}>{initials(leaders[2].name)}</Text>
                  </View>
                  <View style={[C.podiumBase, { backgroundColor: MEDAL_BG[2], paddingBottom: 10 }]}>
                    <Text style={C.podiumMedal}>🥉</Text>
                    <Text style={C.podiumName} numberOfLines={1}>{leaders[2].name.split(' ')[0]}</Text>
                    <Text style={[C.podiumStat, { color: '#8B4513' }]}>{leaders[2].primary} {leaders[2].primaryLabel}</Text>
                  </View>
                </View>
              </View>
            )}

            {tab !== 'champions' && leaders.slice(3).map((l, i) => (
              <View key={i} style={C.row}>
                <Text style={C.rank}>{i + 4}</Text>
                <View style={C.rowAvatar}>
                  <Text style={C.rowAvatarText}>{initials(l.name)}</Text>
                </View>
                <Text style={C.rowName} numberOfLines={1}>{l.name}</Text>
                <View style={C.rowStats}>
                  <View style={C.rowStat}>
                    <Text style={C.rowStatVal}>{l.primary}</Text>
                    <Text style={C.rowStatLbl}>{l.primaryLabel}</Text>
                  </View>
                  <View style={C.rowStat}>
                    <Text style={C.rowStatVal}>{l.s2}</Text>
                    <Text style={C.rowStatLbl}>{l.s2Label}</Text>
                  </View>
                  <View style={C.rowStat}>
                    <Text style={C.rowStatVal}>{l.s3}</Text>
                    <Text style={C.rowStatLbl}>{l.s3Label}</Text>
                  </View>
                </View>
              </View>
            ))}

            {tab !== 'champions' && leaders.length === 0 && (
              <View style={C.emptyState}>
                <Text style={{ fontSize: 48 }}>📊</Text>
                <Text style={C.emptyTitle}>No stats yet</Text>
                <Text style={C.emptyDesc}>Play some matches to see the rankings!</Text>
              </View>
            )}
            <View style={{ height: 32 }} />
          </ScrollView>
        )}
      </SafeAreaView>
    </View>
  );
}

const C = StyleSheet.create({
  screen: { flex: 1, backgroundColor: '#EDEBDE' },
  safe: { flex: 1 },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  header: { paddingHorizontal: 20, paddingTop: 8, paddingBottom: 12 },
  title: { color: '#1B1716', fontFamily: 'Outfit_900Black', fontSize: 28 },
  subtitle: { color: '#9A9390', fontFamily: 'Outfit_600SemiBold', fontSize: 13, marginTop: 2 },

  tabBar: { flexDirection: 'row', marginHorizontal: 16, backgroundColor: '#FFFFFF', borderRadius: 14, padding: 4, marginBottom: 16, shadowColor: '#1B1716', shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.06, shadowRadius: 8, elevation: 2 },
  tab: { flex: 1, paddingVertical: 10, borderRadius: 10, alignItems: 'center' },
  tabActive: { backgroundColor: '#810100' },
  tabText: { color: '#9A9390', fontFamily: 'Outfit_700Bold', fontSize: 13 },
  tabTextActive: { color: '#FFFFFF', fontFamily: 'Outfit_800ExtraBold', fontSize: 13 },

  list: { paddingHorizontal: 16 },

  // Cards (for Champions tab)
  card: { backgroundColor: '#FFFFFF', borderRadius: 16, padding: 16, shadowColor: '#1B1716', shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.04, shadowRadius: 8, elevation: 2 },
  cardTitle: { color: '#1B1716', fontFamily: 'Outfit_800ExtraBold', fontSize: 16 },
  cardLabel: { color: '#9A9390', fontFamily: 'Outfit_600SemiBold', fontSize: 11, textTransform: 'uppercase', letterSpacing: 0.5 },
  recordVal: { color: '#810100', fontFamily: 'Outfit_900Black', fontSize: 24, marginTop: 4 },
  recordHolder: { color: '#1B1716', fontFamily: 'Outfit_700Bold', fontSize: 13, marginTop: 2 },

  // Podium
  podium: { flexDirection: 'row', justifyContent: 'center', alignItems: 'flex-end', marginBottom: 20, gap: 8, paddingHorizontal: 4 },
  podiumItem: { flex: 1, alignItems: 'center', gap: 0 },
  podiumAvatar: { width: 48, height: 48, borderRadius: 24, backgroundColor: '#810100', alignItems: 'center', justifyContent: 'center', marginBottom: -14, zIndex: 1, borderWidth: 3, borderColor: '#EDEBDE' },
  podiumAvatarText: { color: '#FFFFFF', fontFamily: 'Outfit_800ExtraBold', fontSize: 16 },
  podiumBase: { width: '100%', borderRadius: 12, paddingTop: 18, paddingBottom: 10, alignItems: 'center', gap: 2 },
  podiumMedal: { fontSize: 18, marginBottom: 2 },
  podiumName: { color: '#1B1716', fontFamily: 'Outfit_700Bold', fontSize: 11, textAlign: 'center' },
  podiumStat: { fontFamily: 'Outfit_700Bold', fontSize: 12 },

  // List rows
  row: { flexDirection: 'row', alignItems: 'center', backgroundColor: '#FFFFFF', borderRadius: 14, padding: 12, gap: 10, shadowColor: '#1B1716', shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.05, shadowRadius: 6, elevation: 1, marginBottom: 8 },
  rank: { color: '#9A9390', fontFamily: 'Outfit_700Bold', fontSize: 14, width: 24, textAlign: 'center' },
  rowAvatar: { width: 36, height: 36, borderRadius: 10, backgroundColor: '#810100', alignItems: 'center', justifyContent: 'center' },
  rowAvatarText: { color: '#FFFFFF', fontFamily: 'Outfit_800ExtraBold', fontSize: 12 },
  rowName: { flex: 1, color: '#1B1716', fontFamily: 'Outfit_700Bold', fontSize: 14 },
  rowStats: { flexDirection: 'row', gap: 12 },
  rowStat: { alignItems: 'center', minWidth: 36 },
  rowStatVal: { color: '#1B1716', fontFamily: 'Outfit_800ExtraBold', fontSize: 13 },
  rowStatLbl: { color: '#9A9390', fontFamily: 'Outfit_600SemiBold', fontSize: 9, letterSpacing: 0.5, textTransform: 'uppercase' },

  // Empty
  emptyState: { alignItems: 'center', paddingVertical: 60, gap: 12 },
  emptyTitle: { color: '#1B1716', fontFamily: 'Outfit_700Bold', fontSize: 16 },
  emptyDesc: { color: '#9A9390', fontFamily: 'Outfit_400Regular', fontSize: 14, textAlign: 'center' },
});
