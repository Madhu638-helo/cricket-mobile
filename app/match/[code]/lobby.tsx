import React, { useState, useCallback, useEffect } from 'react';
import {
  View, Text, TouchableOpacity, StyleSheet, SafeAreaView, ScrollView,
  ActivityIndicator, Alert, Share, Modal, TextInput, TouchableWithoutFeedback, RefreshControl,
} from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { supabase } from '../../../lib/supabase';
import { useAuth } from '../../../context/AuthContext';
import { useRealtimeMatch } from '../../../lib/hooks/useRealtimeMatch';
import { Ionicons } from '@expo/vector-icons';
import LoadingScreen from '../../../components/LoadingScreen';

function initials(name: string) {
  return name.split(' ').map(n => n[0]).join('').slice(0, 2).toUpperCase();
}

type PlayerMenuAction = 'team_a' | 'team_b' | 'joker' | 'scorer' | 'captain';

export default function LobbyScreen() {
  const { code } = useLocalSearchParams<{ code: string }>();
  const router = useRouter();
  const { user } = useAuth();
  const { session, match, players, teams, loading, refetch } = useRealtimeMatch(code);
  const [starting, setStarting] = useState(false);
  const [overInput, setOverInput] = useState('');
  const [editingOvers, setEditingOvers] = useState(false);
  const [savingOvers, setSavingOvers] = useState(false);
  const [refreshing, setRefreshing] = useState(false);

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    await refetch();
    setRefreshing(false);
  }, [refetch]);

  // Player action sheet
  const [selectedPlayer, setSelectedPlayer] = useState<any | null>(null);
  const [playerMenuVisible, setPlayerMenuVisible] = useState(false);
  const [actionLoading, setActionLoading] = useState(false);

  const isOwner = session?.owner_id === user?.id;
  const teamA = teams[0];
  const teamB = teams[1];
  const teamAPlayers = players.filter(p => p.team_id === teamA?.id);
  const teamBPlayers = players.filter(p => p.team_id === teamB?.id);
  const jokers = players.filter(p => p.is_joker);
  const unassigned = players.filter(p => !p.team_id && !p.is_joker);

  useEffect(() => {
    if (match?.overs) setOverInput(String(match.overs));
  }, [match?.overs]);

  // Auto-navigate when match starts (realtime push)
  useEffect(() => {
    if (match?.status === 'toss') router.replace(`/match/${code}/toss`);
    if (match?.status === 'innings_1' || match?.status === 'innings_2') router.replace(`/match/${code}`);
  }, [match?.status]);

  // Polling fallback for non-owners — catches realtime misses every 3s
  useEffect(() => {
    if (isOwner) return;
    const interval = setInterval(async () => {
      try {
        const { data: sess } = await (supabase.from('sessions') as any)
          .select('id').eq('code', code).single();
        if (!sess) return;
        const { data: m } = await (supabase.from('matches') as any)
          .select('status').eq('session_id', sess.id)
          .order('match_number', { ascending: false }).limit(1).single();
        if (!m) return;
        if (m.status === 'toss') router.replace(`/match/${code}/toss`);
        else if (m.status === 'innings_1' || m.status === 'innings_2') router.replace(`/match/${code}`);
      } catch {}
    }, 3000);
    return () => clearInterval(interval);
  }, [isOwner, code]);

  const handleStart = async () => {
    if (!match || !session) return;
    setStarting(true);
    try {
      await (supabase.from('matches') as any).update({ status: 'toss' }).eq('id', match.id);
      router.replace(`/match/${code}/toss`);
    } catch {
      Alert.alert('Error', 'Failed to start match');
    } finally {
      setStarting(false);
    }
  };

  const handleSaveOvers = async () => {
    const overs = parseInt(overInput);
    if (isNaN(overs) || overs < 1 || overs > 50) {
      Alert.alert('Invalid', 'Overs must be between 1 and 50');
      return;
    }
    setSavingOvers(true);
    try {
      await (supabase.from('matches') as any).update({ overs }).eq('id', match!.id);
      setEditingOvers(false);
    } catch {
      Alert.alert('Error', 'Failed to update overs');
    } finally {
      setSavingOvers(false);
    }
  };

  const handleShare = async () => {
    try {
      const url = `cricpro://match/${code}`;
      await Share.share({ message: `Join my cricket match on CricPro! Code: ${code}` });
    } catch (e: any) {
      console.log(e.message);
    }
  };

  const openPlayerMenu = (player: any) => {
    if (!isOwner) return;
    setSelectedPlayer(player);
    setPlayerMenuVisible(true);
  };

  const executePlayerAction = useCallback(async (action: PlayerMenuAction) => {
    if (!selectedPlayer || !teamA || !teamB) return;
    setActionLoading(true);
    try {
      let update: any = {};
      if (action === 'team_a') {
        update = { team_id: teamA.id, is_joker: false };
      } else if (action === 'team_b') {
        update = { team_id: teamB.id, is_joker: false };
      } else if (action === 'joker') {
        update = { team_id: null, is_joker: true };
      } else if (action === 'scorer') {
        // Remove scorer from all players in same team first
        const sameTeamPlayers = players.filter(p => p.team_id === selectedPlayer.team_id && p.id !== selectedPlayer.id);
        for (const p of sameTeamPlayers) {
          await (supabase.from('players') as any).update({ is_scorer: false }).eq('id', p.id);
        }
        update = { is_scorer: !selectedPlayer.is_scorer };
      } else if (action === 'captain') {
        // Remove captain from all players in same team first
        const sameTeamPlayers = players.filter(p => p.team_id === selectedPlayer.team_id && p.id !== selectedPlayer.id);
        for (const p of sameTeamPlayers) {
          await (supabase.from('players') as any).update({ is_captain: false }).eq('id', p.id);
        }
        update = { is_captain: !selectedPlayer.is_captain };
      }

      const { error } = await (supabase.from('players') as any).update(update).eq('id', selectedPlayer.id);
      if (error) throw error;
      await refetch();
    } catch (e: any) {
      Alert.alert('Error', e.message);
    } finally {
      setActionLoading(false);
      setPlayerMenuVisible(false);
      setSelectedPlayer(null);
    }
  }, [selectedPlayer, teamA, teamB, players, refetch]);

  if (loading) {
    return <LoadingScreen message="Loading Lobby..." />;
  }

  const renderPlayerRow = (p: any, color: string) => (
    <TouchableOpacity
      key={p.id}
      style={S.playerRow}
      onPress={() => openPlayerMenu(p)}
      activeOpacity={isOwner ? 0.6 : 1}
    >
      <View style={[S.avatar, { backgroundColor: color }]}>
        <Text style={S.avatarText}>{initials(p.name)}</Text>
      </View>
      <Text style={S.playerName} numberOfLines={1}>{p.name}</Text>
      <View style={S.badges}>
        {p.is_scorer && <View style={S.badge}><Text style={[S.badgeText, { color: '#810100' }]}>SCR</Text></View>}
        {p.is_captain && <View style={[S.badge, { backgroundColor: 'rgba(184,134,11,0.12)' }]}><Text style={[S.badgeText, { color: '#b8860b' }]}>CAP</Text></View>}
      </View>
      {isOwner && <Ionicons name="ellipsis-horizontal" size={16} color="#9A9390" />}
    </TouchableOpacity>
  );

  return (
    <View style={S.screen}>
      <SafeAreaView style={S.safe}>
        {/* Header */}
        <View style={S.header}>
          <TouchableOpacity onPress={() => router.back()} style={S.backBtn}>
            <Ionicons name="arrow-back" size={22} color="#810100" />
          </TouchableOpacity>
          <View style={{ alignItems: 'center' }}>
            <Text style={S.title}>Lobby</Text>
            <Text style={S.codeText}>{code}</Text>
          </View>
          <TouchableOpacity style={S.shareBtn} onPress={handleShare}>
            <Ionicons name="share-outline" size={20} color="#810100" />
          </TouchableOpacity>
        </View>

        <ScrollView 
          contentContainerStyle={S.content} 
          showsVerticalScrollIndicator={false}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor="#810100" colors={['#810100']} />}
        >

          {/* ── Match Format Card ── */}
          <View style={S.card}>
            <View style={S.cardRow}>
              <View>
                <Text style={S.cardLabel}>MATCH FORMAT</Text>
                <Text style={S.cardValue}>{match?.overs ?? '—'} Overs</Text>
                <Text style={S.cardSub}>{players.length} players joined</Text>
              </View>
              {isOwner && !editingOvers && (
                <TouchableOpacity style={S.editBtn} onPress={() => setEditingOvers(true)}>
                  <Ionicons name="pencil" size={14} color="#810100" />
                  <Text style={S.editBtnText}>Edit</Text>
                </TouchableOpacity>
              )}
            </View>
            {isOwner && editingOvers && (
              <View style={S.overEditRow}>
                <TextInput
                  style={S.overInput}
                  value={overInput}
                  onChangeText={setOverInput}
                  keyboardType="numeric"
                  maxLength={2}
                  autoFocus
                  placeholder="Overs"
                  placeholderTextColor="#9A9390"
                />
                <TouchableOpacity style={S.saveBtn} onPress={handleSaveOvers} disabled={savingOvers}>
                  {savingOvers
                    ? <ActivityIndicator size="small" color="#fff" />
                    : <Text style={S.saveBtnText}>Save</Text>}
                </TouchableOpacity>
                <TouchableOpacity style={S.cancelBtn} onPress={() => { setEditingOvers(false); setOverInput(String(match?.overs ?? '')); }}>
                  <Text style={S.cancelBtnText}>Cancel</Text>
                </TouchableOpacity>
              </View>
            )}
          </View>

          {isOwner && (
            <View style={S.ownerHint}>
              <Ionicons name="information-circle-outline" size={14} color="#810100" />
              <Text style={S.ownerHintText}>Tap any player to assign team, scorer, captain or joker</Text>
            </View>
          )}

          {/* ── Team A ── */}
          {teamA && (
            <View style={[S.teamCard, { borderColor: '#81010022' }]}>
              <View style={[S.teamHeader, { backgroundColor: '#81010012' }]}>
                <Text style={[S.teamName, { color: '#810100' }]}>{teamA.name}</Text>
                <Text style={S.teamCount}>{teamAPlayers.length} players</Text>
              </View>
              {teamAPlayers.length === 0
                ? <Text style={S.emptyTeam}>No players assigned yet</Text>
                : teamAPlayers.map(p => renderPlayerRow(p, '#810100'))}
            </View>
          )}

          {/* ── Team B ── */}
          {teamB && (
            <View style={[S.teamCard, { borderColor: '#0a84ff22' }]}>
              <View style={[S.teamHeader, { backgroundColor: '#0a84ff12' }]}>
                <Text style={[S.teamName, { color: '#0a84ff' }]}>{teamB.name}</Text>
                <Text style={S.teamCount}>{teamBPlayers.length} players</Text>
              </View>
              {teamBPlayers.length === 0
                ? <Text style={S.emptyTeam}>No players assigned yet</Text>
                : teamBPlayers.map(p => renderPlayerRow(p, '#0a84ff'))}
            </View>
          )}

          {/* ── Jokers ── */}
          {jokers.length > 0 && (
            <View style={[S.teamCard, { borderColor: '#b8860b22' }]}>
              <View style={[S.teamHeader, { backgroundColor: '#b8860b12' }]}>
                <Text style={[S.teamName, { color: '#b8860b' }]}>🃏 Jokers</Text>
                <Text style={S.teamCount}>{jokers.length}</Text>
              </View>
              {jokers.map(p => renderPlayerRow(p, '#b8860b'))}
            </View>
          )}

          {/* ── Unassigned ── */}
          {unassigned.length > 0 && (
            <View style={[S.teamCard, { borderColor: '#9A939022' }]}>
              <View style={[S.teamHeader, { backgroundColor: '#9A939012' }]}>
                <Text style={[S.teamName, { color: '#9A9390' }]}>Unassigned</Text>
                <Text style={S.teamCount}>{unassigned.length}</Text>
              </View>
              {unassigned.map(p => renderPlayerRow(p, '#9A9390'))}
            </View>
          )}

          {!isOwner && (
            <View style={S.waitingCard}>
              <ActivityIndicator color="#810100" style={{ marginRight: 10 }} />
              <Text style={S.waitingText}>Waiting for the owner to start...</Text>
            </View>
          )}
        </ScrollView>

        {/* ── Start button (owner only) ── */}
        {isOwner && (
          <View style={S.footer}>
            <TouchableOpacity style={S.startBtn} onPress={handleStart} disabled={starting} activeOpacity={0.85}>
              {starting
                ? <ActivityIndicator color="#fff" />
                : <Text style={S.startBtnText}>Start Match →</Text>}
            </TouchableOpacity>
          </View>
        )}
      </SafeAreaView>

      {/* ── Player Action Modal ── */}
      <Modal visible={playerMenuVisible} transparent animationType="slide">
        <TouchableWithoutFeedback onPress={() => setPlayerMenuVisible(false)}>
          <View style={S.modalOverlay}>
            <TouchableWithoutFeedback>
              <View style={S.modalSheet}>
                <View style={S.modalHandle} />
                <View style={S.modalHeader}>
                  <View style={[S.modalAvatar, { backgroundColor: '#810100' }]}>
                    <Text style={S.avatarText}>{selectedPlayer ? initials(selectedPlayer.name) : ''}</Text>
                  </View>
                  <View>
                    <Text style={S.modalPlayerName}>{selectedPlayer?.name}</Text>
                    <Text style={S.modalPlayerSub}>
                      {selectedPlayer?.is_joker ? '🃏 Joker'
                        : selectedPlayer?.team_id === teamA?.id ? `${teamA?.name}`
                        : selectedPlayer?.team_id === teamB?.id ? `${teamB?.name}`
                        : 'Unassigned'}
                    </Text>
                  </View>
                </View>

                <Text style={S.modalSectionLabel}>ASSIGN TEAM</Text>
                <View style={S.modalRow}>
                  <TouchableOpacity
                    style={[S.modalAction, selectedPlayer?.team_id === teamA?.id && S.modalActionActive]}
                    onPress={() => executePlayerAction('team_a')}
                    disabled={actionLoading}
                  >
                    <Text style={[S.modalActionText, { color: '#810100' }]}>{teamA?.name ?? 'Team A'}</Text>
                  </TouchableOpacity>
                  <TouchableOpacity
                    style={[S.modalAction, selectedPlayer?.team_id === teamB?.id && S.modalActionActive]}
                    onPress={() => executePlayerAction('team_b')}
                    disabled={actionLoading}
                  >
                    <Text style={[S.modalActionText, { color: '#0a84ff' }]}>{teamB?.name ?? 'Team B'}</Text>
                  </TouchableOpacity>
                  <TouchableOpacity
                    style={[S.modalAction, selectedPlayer?.is_joker && S.modalActionActive]}
                    onPress={() => executePlayerAction('joker')}
                    disabled={actionLoading}
                  >
                    <Text style={[S.modalActionText, { color: '#b8860b' }]}>🃏 Joker</Text>
                  </TouchableOpacity>
                </View>

                <Text style={S.modalSectionLabel}>ASSIGN ROLE</Text>
                <View style={S.modalRow}>
                  <TouchableOpacity
                    style={[S.modalAction, selectedPlayer?.is_scorer && S.modalActionActive]}
                    onPress={() => executePlayerAction('scorer')}
                    disabled={actionLoading}
                  >
                    <Ionicons name="create-outline" size={16} color="#810100" />
                    <Text style={[S.modalActionText, { color: '#810100', marginLeft: 4 }]}>
                      {selectedPlayer?.is_scorer ? 'Remove Scorer' : 'Make Scorer'}
                    </Text>
                  </TouchableOpacity>
                  <TouchableOpacity
                    style={[S.modalAction, selectedPlayer?.is_captain && S.modalActionActive]}
                    onPress={() => executePlayerAction('captain')}
                    disabled={actionLoading}
                  >
                    <Text style={[S.modalActionText, { color: '#b8860b' }]}>
                      {selectedPlayer?.is_captain ? 'Remove Captain' : '⭐ Captain'}
                    </Text>
                  </TouchableOpacity>
                </View>

                {actionLoading && <ActivityIndicator color="#810100" style={{ marginTop: 12 }} />}

                <TouchableOpacity style={S.modalClose} onPress={() => setPlayerMenuVisible(false)}>
                  <Text style={S.modalCloseText}>Cancel</Text>
                </TouchableOpacity>
              </View>
            </TouchableWithoutFeedback>
          </View>
        </TouchableWithoutFeedback>
      </Modal>
    </View>
  );
}

const S = StyleSheet.create({
  screen: { flex: 1, backgroundColor: '#EDEBDE' },
  safe: { flex: 1 },
  center: { flex: 1, backgroundColor: '#EDEBDE', alignItems: 'center', justifyContent: 'center' },

  // Header
  header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 16, paddingVertical: 12, borderBottomWidth: 1, borderBottomColor: 'rgba(99,1,2,0.08)' },
  backBtn: { width: 40, height: 40, alignItems: 'center', justifyContent: 'center' },
  shareBtn: { width: 40, height: 40, alignItems: 'center', justifyContent: 'center', backgroundColor: '#fff', borderRadius: 20 },
  title: { color: '#1B1716', fontFamily: 'Outfit_700Bold', fontSize: 16 },
  codeText: { color: '#810100', fontSize: 13, fontFamily: 'Outfit_800ExtraBold', letterSpacing: 2 },

  content: { padding: 16, gap: 12, paddingBottom: 20 },

  // Match format card
  card: { backgroundColor: '#FFFFFF', borderRadius: 16, padding: 16, shadowColor: '#1B1716', shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.06, shadowRadius: 8, elevation: 2 },
  cardRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  cardLabel: { color: '#9A9390', fontFamily: 'Outfit_700Bold', fontSize: 10, letterSpacing: 1, textTransform: 'uppercase' },
  cardValue: { color: '#1B1716', fontFamily: 'Outfit_900Black', fontSize: 26, marginTop: 2 },
  cardSub: { color: '#5C5552', fontFamily: 'Outfit_600SemiBold', fontSize: 12, marginTop: 2 },
  editBtn: { flexDirection: 'row', alignItems: 'center', gap: 4, backgroundColor: 'rgba(129,1,0,0.08)', paddingHorizontal: 12, paddingVertical: 8, borderRadius: 10 },
  editBtnText: { color: '#810100', fontFamily: 'Outfit_700Bold', fontSize: 13 },
  overEditRow: { flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: 12 },
  overInput: { flex: 1, backgroundColor: '#F5F3EC', borderRadius: 10, padding: 12, color: '#1B1716', fontFamily: 'Outfit_700Bold', fontSize: 18, textAlign: 'center', borderWidth: 1, borderColor: 'rgba(99,1,2,0.1)' },
  saveBtn: { backgroundColor: '#810100', borderRadius: 10, paddingHorizontal: 16, paddingVertical: 12 },
  saveBtnText: { color: '#fff', fontFamily: 'Outfit_800ExtraBold', fontSize: 14 },
  cancelBtn: { backgroundColor: '#F5F3EC', borderRadius: 10, paddingHorizontal: 14, paddingVertical: 12 },
  cancelBtnText: { color: '#5C5552', fontFamily: 'Outfit_700Bold', fontSize: 14 },

  ownerHint: { flexDirection: 'row', alignItems: 'center', gap: 6, backgroundColor: 'rgba(129,1,0,0.06)', borderRadius: 10, padding: 10 },
  ownerHintText: { color: '#810100', fontFamily: 'Outfit_600SemiBold', fontSize: 12, flex: 1 },

  // Team cards
  teamCard: { backgroundColor: '#FFFFFF', borderRadius: 16, overflow: 'hidden', borderWidth: 1, shadowColor: '#1B1716', shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.04, shadowRadius: 6, elevation: 1 },
  teamHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', padding: 12, paddingHorizontal: 14 },
  teamName: { fontSize: 15, fontFamily: 'Outfit_800ExtraBold' },
  teamCount: { color: '#9A9390', fontFamily: 'Outfit_600SemiBold', fontSize: 12 },
  emptyTeam: { color: '#9A9390', fontFamily: 'Outfit_400Regular', fontSize: 13, padding: 16, textAlign: 'center' },

  // Player row
  playerRow: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 12, paddingVertical: 10, gap: 10, borderTopWidth: 1, borderTopColor: 'rgba(0,0,0,0.04)' },
  avatar: { width: 32, height: 32, borderRadius: 16, alignItems: 'center', justifyContent: 'center' },
  avatarText: { color: '#FFFFFF', fontFamily: 'Outfit_700Bold', fontSize: 11 },
  playerName: { flex: 1, color: '#1B1716', fontFamily: 'Outfit_600SemiBold', fontSize: 14 },
  badges: { flexDirection: 'row', gap: 4 },
  badge: { backgroundColor: 'rgba(129,1,0,0.08)', paddingHorizontal: 6, paddingVertical: 2, borderRadius: 4 },
  badgeText: { fontSize: 9, fontFamily: 'Outfit_800ExtraBold' },

  waitingCard: { flexDirection: 'row', alignItems: 'center', backgroundColor: '#FFFFFF', borderRadius: 14, padding: 16 },
  waitingText: { color: '#5C5552', fontFamily: 'Outfit_600SemiBold', fontSize: 14 },

  footer: { padding: 16, paddingBottom: 28, borderTopWidth: 1, borderTopColor: 'rgba(99,1,2,0.08)', backgroundColor: '#EDEBDE' },
  startBtn: { backgroundColor: '#810100', borderRadius: 14, padding: 18, alignItems: 'center', shadowColor: '#810100', shadowOffset: { width: 0, height: 6 }, shadowOpacity: 0.25, shadowRadius: 12, elevation: 5 },
  startBtnText: { color: '#FFFFFF', fontFamily: 'Outfit_800ExtraBold', fontSize: 18 },

  // Player action modal
  modalOverlay: { flex: 1, backgroundColor: 'rgba(27,23,22,0.45)', justifyContent: 'flex-end' },
  modalSheet: { backgroundColor: '#FFFFFF', borderTopLeftRadius: 24, borderTopRightRadius: 24, padding: 20, paddingBottom: 36 },
  modalHandle: { width: 40, height: 4, backgroundColor: '#E0DDD8', borderRadius: 2, alignSelf: 'center', marginBottom: 16 },
  modalHeader: { flexDirection: 'row', alignItems: 'center', gap: 12, marginBottom: 20 },
  modalAvatar: { width: 44, height: 44, borderRadius: 22, alignItems: 'center', justifyContent: 'center' },
  modalPlayerName: { color: '#1B1716', fontFamily: 'Outfit_800ExtraBold', fontSize: 18 },
  modalPlayerSub: { color: '#9A9390', fontFamily: 'Outfit_600SemiBold', fontSize: 13, marginTop: 1 },
  modalSectionLabel: { color: '#9A9390', fontFamily: 'Outfit_700Bold', fontSize: 10, letterSpacing: 1, textTransform: 'uppercase', marginBottom: 8, marginTop: 4 },
  modalRow: { flexDirection: 'row', gap: 8, flexWrap: 'wrap', marginBottom: 12 },
  modalAction: { flexDirection: 'row', alignItems: 'center', backgroundColor: '#F5F3EC', borderRadius: 10, paddingHorizontal: 14, paddingVertical: 10, borderWidth: 1, borderColor: 'transparent' },
  modalActionActive: { backgroundColor: 'rgba(129,1,0,0.08)', borderColor: 'rgba(129,1,0,0.2)' },
  modalActionText: { fontFamily: 'Outfit_700Bold', fontSize: 13 },
  modalClose: { marginTop: 8, backgroundColor: '#F5F3EC', borderRadius: 12, padding: 14, alignItems: 'center' },
  modalCloseText: { color: '#5C5552', fontFamily: 'Outfit_700Bold', fontSize: 15 },
});
