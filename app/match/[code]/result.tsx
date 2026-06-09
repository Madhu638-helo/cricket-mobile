import React, { useEffect, useState } from 'react';
import {
  View, Text, StyleSheet, SafeAreaView, TouchableOpacity,
  ScrollView, StatusBar, Share, Clipboard,
} from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useRealtimeMatch } from '../../../lib/hooks/useRealtimeMatch';
import { useAuth } from '../../../context/AuthContext';
import { supabase } from '../../../lib/supabase';
import { Ionicons } from '@expo/vector-icons';
import LoadingScreen from '../../../components/LoadingScreen';

function formatOvers(balls: number) {
  return `${Math.floor(balls / 6)}.${balls % 6}`;
}

interface PlayerStat {
  name: string;
  runs: number;
  balls: number;
  fours: number;
  sixes: number;
  wickets: number;
  eco: number;
  runsBowled: number;
}

export default function MatchResultScreen() {
  const { code } = useLocalSearchParams<{ code: string }>();
  const router = useRouter();
  const { session, match, innings, teams, loading } = useRealtimeMatch(code);
  const { user } = useAuth();
  const [batStats, setBatStats] = useState<Record<string, PlayerStat>>({});
  const [bowlStats, setBowlStats] = useState<Record<string, PlayerStat>>({});
  const [players, setPlayers] = useState<any[]>([]);
  const [shareLoading, setShareLoading] = useState(false);

  useEffect(() => {
    if (match && innings.length > 0) loadStats();
  }, [match, innings]);

  const loadStats = async () => {
    // Only fetch balls for THIS match's innings — no cross-match contamination
    const inningsIds = innings.map(i => i.id);
    if (inningsIds.length === 0) return;
    const { data: balls } = await (supabase.from('balls') as any)
      .select('batsman_id, bowler_id, runs_off_bat, extras, is_wicket, wicket_type, extra_type, innings_id')
      .in('innings_id', inningsIds);
    const { data: ps } = await (supabase.from('players') as any)
      .select('id, name, user_id').in('session_id', [match?.session_id].filter(Boolean));

    setPlayers(ps ?? []);
    const batMap: Record<string, PlayerStat> = {};
    const bowlMap: Record<string, PlayerStat> = {};

    for (const b of balls ?? []) {
      const pName = (ps ?? []).find((p: any) => p.id === b.batsman_id)?.name ?? 'Unknown';
      const bName = (ps ?? []).find((p: any) => p.id === b.bowler_id)?.name ?? 'Unknown';

      if (b.batsman_id && b.extra_type !== 'wide') {
        if (!batMap[b.batsman_id]) batMap[b.batsman_id] = { name: pName, runs: 0, balls: 0, fours: 0, sixes: 0, wickets: 0, eco: 0, runsBowled: 0 };
        batMap[b.batsman_id].runs += b.runs_off_bat ?? 0;
        batMap[b.batsman_id].balls += 1;
        if ((b.runs_off_bat ?? 0) === 4) batMap[b.batsman_id].fours++;
        if ((b.runs_off_bat ?? 0) === 6) batMap[b.batsman_id].sixes++;
      }
      if (b.bowler_id) {
        if (!bowlMap[b.bowler_id]) bowlMap[b.bowler_id] = { name: bName, runs: 0, balls: 0, fours: 0, sixes: 0, wickets: 0, eco: 0, runsBowled: 0 };
        bowlMap[b.bowler_id].runsBowled += (b.runs_off_bat ?? 0) + (b.extras ?? 0);
        if (b.extra_type !== 'wide' && b.extra_type !== 'noball') bowlMap[b.bowler_id].balls++;
        if (b.is_wicket && b.wicket_type !== 'runout' && b.wicket_type !== 'retiredhurt') bowlMap[b.bowler_id].wickets++;
      }
    }
    for (const v of Object.values(bowlMap)) {
      v.eco = v.balls > 0 ? Math.round((v.runsBowled / (v.balls / 6)) * 100) / 100 : 0;
    }
    setBatStats(batMap);
    setBowlStats(bowlMap);
  };

  // Player of the Match — highest impact score (weighted runs + wickets*30)
  const getPOM = () => {
    const combined: { name: string; score: number }[] = [];
    for (const [id, s] of Object.entries(batStats)) {
      combined.push({ name: s.name, score: s.runs + (bowlStats[id]?.wickets ?? 0) * 30 });
    }
    for (const [id, s] of Object.entries(bowlStats)) {
      if (!batStats[id]) combined.push({ name: s.name, score: s.wickets * 30 });
    }
    return combined.sort((a, b) => b.score - a.score)[0];
  };

  const handleShare = async () => {
    setShareLoading(true);
    try {
      const url = `https://yourapp.com/watch/${code}`;
      await Share.share({ message: `🏏 Watch the match: ${match?.result || 'TURF Live Match'}\n${url}`, url });
    } finally { setShareLoading(false); }
  };

  if (loading) {
    return <LoadingScreen message="Loading Result..." />;
  }

  if (!match || match.status !== 'result') {
    return (
      <View style={C.center}>
        <Text style={C.notReadyText}>Match result not ready yet.</Text>
        <TouchableOpacity style={C.dashBtn} onPress={() => router.replace('/(tabs)')}>
          <Text style={C.dashBtnText}>Dashboard</Text>
        </TouchableOpacity>
      </View>
    );
  }

  const inn1 = innings.find(i => i.innings_number === 1);
  const inn2 = innings.find(i => i.innings_number === 2);
  const team1 = teams.find(t => t.id === inn1?.team_id);
  const team2 = teams.find(t => t.id === inn2?.team_id);
  const isOwner = session?.owner_id === user?.id;
  const pom = getPOM();

  const topBatters = Object.values(batStats).sort((a, b) => b.runs - a.runs).slice(0, 5);
  const topBowlers = Object.values(bowlStats).filter(s => s.wickets > 0 || s.balls > 0).sort((a, b) => b.wickets - a.wickets || a.eco - b.eco).slice(0, 5);

  return (
    <View style={C.screen}>
      <StatusBar barStyle="dark-content" backgroundColor="#EDEBDE" />
      <SafeAreaView style={C.safe}>
        <ScrollView contentContainerStyle={C.content} showsVerticalScrollIndicator={false}>

          {/* Trophy header */}
          <View style={C.trophySection}>
            <Text style={C.trophyEmoji}>🏆</Text>
            <Text style={C.resultLabel}>MATCH RESULT</Text>
            <Text style={C.resultText}>{match.result || 'Match Completed'}</Text>
            <TouchableOpacity style={C.shareBtn} onPress={handleShare}>
              <Ionicons name="share-outline" size={18} color="#810100" />
              <Text style={C.shareBtnText}>Share Result</Text>
            </TouchableOpacity>
          </View>

          {/* Innings Scores */}
          <View style={C.inningsRow}>
            {inn1 && team1 && (
              <View style={[C.inningsCard, { borderTopColor: '#810100' }]}>
                <Text style={C.inningsTeam}>{team1.name}</Text>
                <Text style={C.inningsLabel}>INNINGS 1</Text>
                <Text style={C.inningsScore}>{inn1.total_runs}/{inn1.total_wickets}</Text>
                <Text style={C.inningsOvers}>({formatOvers(inn1.total_balls)} ov)</Text>
              </View>
            )}
            {inn2 && team2 && (
              <View style={[C.inningsCard, { borderTopColor: '#0071e3' }]}>
                <Text style={C.inningsTeam}>{team2.name}</Text>
                <Text style={C.inningsLabel}>INNINGS 2</Text>
                <Text style={C.inningsScore}>{inn2.total_runs}/{inn2.total_wickets}</Text>
                <Text style={C.inningsOvers}>({formatOvers(inn2.total_balls)} ov)</Text>
              </View>
            )}
          </View>

          {/* Player of the Match */}
          {pom && (
            <View style={C.pomCard}>
              <View style={C.pomLeft}>
                <Text style={C.pomBadge}>⭐ PLAYER OF THE MATCH</Text>
                <Text style={C.pomName}>{pom.name}</Text>
              </View>
              <View style={C.pomAvatar}>
                <Text style={C.pomAvatarText}>
                  {pom.name.split(' ').map((n: string) => n[0]).join('').slice(0, 2).toUpperCase()}
                </Text>
              </View>
            </View>
          )}

          {/* Batting Scorecard */}
          {topBatters.length > 0 && (
            <View style={C.tableCard}>
              <Text style={C.tableTitle}>🏏 BATTING</Text>
              <View style={C.tableHeader}>
                <Text style={[C.thText, { flex: 3 }]}>BATTER</Text>
                <Text style={C.thText}>R</Text>
                <Text style={C.thText}>B</Text>
                <Text style={C.thText}>4s</Text>
                <Text style={C.thText}>6s</Text>
                <Text style={C.thText}>SR</Text>
              </View>
              {topBatters.map((b, i) => (
                <View key={i} style={[C.tableRow, i % 2 === 0 && C.tableRowAlt]}>
                  <Text style={[C.tdName, { flex: 3 }]} numberOfLines={1}>{b.name}</Text>
                  <Text style={[C.tdStat, { color: '#1a8a3e', fontFamily: 'Outfit_800ExtraBold' }]}>{b.runs}</Text>
                  <Text style={C.tdStat}>{b.balls}</Text>
                  <Text style={[C.tdStat, { color: '#b8860b' }]}>{b.fours}</Text>
                  <Text style={[C.tdStat, { color: '#7030a0' }]}>{b.sixes}</Text>
                  <Text style={C.tdStat}>{b.balls > 0 ? (b.runs / b.balls * 100).toFixed(0) : '—'}</Text>
                </View>
              ))}
            </View>
          )}

          {/* Bowling Scorecard */}
          {topBowlers.length > 0 && (
            <View style={C.tableCard}>
              <Text style={C.tableTitle}>⚾ BOWLING</Text>
              <View style={C.tableHeader}>
                <Text style={[C.thText, { flex: 3 }]}>BOWLER</Text>
                <Text style={C.thText}>W</Text>
                <Text style={C.thText}>R</Text>
                <Text style={C.thText}>ECO</Text>
                <Text style={C.thText}>Ov</Text>
              </View>
              {topBowlers.map((b, i) => (
                <View key={i} style={[C.tableRow, i % 2 === 0 && C.tableRowAlt]}>
                  <Text style={[C.tdName, { flex: 3 }]} numberOfLines={1}>{b.name}</Text>
                  <Text style={[C.tdStat, { color: '#ef4444', fontFamily: 'Outfit_800ExtraBold' }]}>{b.wickets}</Text>
                  <Text style={C.tdStat}>{b.runsBowled}</Text>
                  <Text style={C.tdStat}>{b.eco}</Text>
                  <Text style={C.tdStat}>{formatOvers(b.balls)}</Text>
                </View>
              ))}
            </View>
          )}

          <View style={{ height: 16 }} />
        </ScrollView>

        {/* Footer */}
        <View style={C.footer}>
          {isOwner && (
            <TouchableOpacity style={[C.actionBtn, C.nextBtn]} onPress={() => router.push(`/match/${code}/next` as any)}>
              <Ionicons name="refresh-outline" size={20} color="#FFFFFF" />
              <Text style={C.actionBtnText}>Start Next Match</Text>
            </TouchableOpacity>
          )}
          <TouchableOpacity style={C.actionBtn} onPress={() => router.replace('/(tabs)')}>
            <Ionicons name="home-outline" size={20} color="#FFFFFF" />
            <Text style={C.actionBtnText}>Back to Dashboard</Text>
          </TouchableOpacity>
        </View>
      </SafeAreaView>
    </View>
  );
}

const C = StyleSheet.create({
  screen: { flex: 1, backgroundColor: '#EDEBDE' },
  safe: { flex: 1 },
  center: { flex: 1, backgroundColor: '#EDEBDE', alignItems: 'center', justifyContent: 'center', gap: 16 },
  content: { padding: 16, gap: 16 },

  notReadyText: { color: '#1B1716', fontFamily: 'Outfit_600SemiBold', fontSize: 15 },
  dashBtn: { backgroundColor: '#810100', paddingHorizontal: 24, paddingVertical: 12, borderRadius: 12 },
  dashBtnText: { color: '#FFFFFF', fontFamily: 'Outfit_700Bold', fontSize: 15 },

  trophySection: { alignItems: 'center', paddingVertical: 20, gap: 8 },
  trophyEmoji: { fontSize: 72 },
  resultLabel: { color: '#9A9390', fontFamily: 'Outfit_800ExtraBold', fontSize: 11, letterSpacing: 2 },
  resultText: { color: '#1B1716', fontFamily: 'Outfit_800ExtraBold', fontSize: 20, textAlign: 'center', lineHeight: 28 },
  shareBtn: { flexDirection: 'row', alignItems: 'center', gap: 6, paddingHorizontal: 16, paddingVertical: 8, backgroundColor: '#FFFFFF', borderRadius: 20, borderWidth: 1, borderColor: 'rgba(99,1,2,0.15)', marginTop: 8 },
  shareBtnText: { color: '#810100', fontFamily: 'Outfit_700Bold', fontSize: 13 },

  inningsRow: { flexDirection: 'row', gap: 12 },
  inningsCard: { flex: 1, backgroundColor: '#FFFFFF', borderRadius: 16, padding: 16, borderTopWidth: 3, shadowColor: '#1B1716', shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.06, shadowRadius: 8, elevation: 2 },
  inningsTeam: { color: '#1B1716', fontFamily: 'Outfit_700Bold', fontSize: 13, marginBottom: 2 },
  inningsLabel: { color: '#9A9390', fontFamily: 'Outfit_700Bold', fontSize: 10, letterSpacing: 1, marginBottom: 8 },
  inningsScore: { color: '#1B1716', fontFamily: 'Outfit_900Black', fontSize: 30, letterSpacing: -0.5 },
  inningsOvers: { color: '#9A9390', fontFamily: 'Outfit_600SemiBold', fontSize: 12, marginTop: 2 },

  pomCard: { flexDirection: 'row', alignItems: 'center', backgroundColor: '#810100', borderRadius: 18, padding: 18, shadowColor: '#810100', shadowOffset: { width: 0, height: 6 }, shadowOpacity: 0.3, shadowRadius: 16, elevation: 6 },
  pomLeft: { flex: 1 },
  pomBadge: { color: 'rgba(255,255,255,0.7)', fontFamily: 'Outfit_700Bold', fontSize: 10, letterSpacing: 1.5, marginBottom: 6 },
  pomName: { color: '#FFFFFF', fontFamily: 'Outfit_900Black', fontSize: 22 },
  pomAvatar: { width: 56, height: 56, borderRadius: 28, backgroundColor: 'rgba(255,255,255,0.2)', alignItems: 'center', justifyContent: 'center', borderWidth: 2, borderColor: 'rgba(255,255,255,0.4)' },
  pomAvatarText: { color: '#FFFFFF', fontFamily: 'Outfit_900Black', fontSize: 18 },

  tableCard: { backgroundColor: '#FFFFFF', borderRadius: 18, overflow: 'hidden', shadowColor: '#1B1716', shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.06, shadowRadius: 8, elevation: 2 },
  tableTitle: { color: '#1B1716', fontFamily: 'Outfit_800ExtraBold', fontSize: 13, letterSpacing: 0.5, padding: 14, borderBottomWidth: 1, borderBottomColor: 'rgba(99,1,2,0.08)' },
  tableHeader: { flexDirection: 'row', paddingHorizontal: 14, paddingVertical: 8, backgroundColor: '#F5F3EC' },
  thText: { flex: 1, color: '#9A9390', fontFamily: 'Outfit_700Bold', fontSize: 9, letterSpacing: 0.8, textTransform: 'uppercase', textAlign: 'right' },
  tableRow: { flexDirection: 'row', paddingHorizontal: 14, paddingVertical: 10, alignItems: 'center' },
  tableRowAlt: { backgroundColor: '#FAFAF8' },
  tdName: { color: '#1B1716', fontFamily: 'Outfit_600SemiBold', fontSize: 13 },
  tdStat: { flex: 1, color: '#5C5552', fontFamily: 'Outfit_600SemiBold', fontSize: 13, textAlign: 'right' },

  footer: { padding: 16, gap: 10, borderTopWidth: 1, borderTopColor: 'rgba(99,1,2,0.08)' },
  actionBtn: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, backgroundColor: '#810100', padding: 16, borderRadius: 14, shadowColor: '#810100', shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.2, shadowRadius: 10, elevation: 4 },
  nextBtn: { backgroundColor: '#630102' },
  actionBtnText: { color: '#FFFFFF', fontFamily: 'Outfit_800ExtraBold', fontSize: 16 },
});
