import React, { useState, useMemo, useCallback, useEffect } from 'react';
import {
  View, Text, TouchableOpacity, StyleSheet, SafeAreaView, ScrollView,
  Modal, FlatList, ActivityIndicator, Alert, Vibration, RefreshControl } from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useRealtimeMatch } from '../../../lib/hooks/useRealtimeMatch';
import { useAuth } from '../../../context/AuthContext';
import {
  buildOverHistory, calcBowlerStats, calcBatsmanStats, ballToSummary, formatOvers
} from '../../../lib/cricket/engine';
import { supabase } from '../../../lib/supabase';
import type { WicketType, ExtraType } from '../../../types/cricket';
import LoadingScreen from '../../../components/LoadingScreen';
import * as Haptics from 'expo-haptics';
import { sendLocalNotification } from '../../../lib/notifications';

// ─── Helper ──────────────────────────────────────────────────────────────────
function initials(name: string) {
  return name.split(' ').map(n => n[0]).join('').slice(0, 2).toUpperCase();
}

// ─── Sub-components ───────────────────────────────────────────────────────────

function ScoreHeader({ innings, match, crr, rrr, teams }: any) {
  const battingTeam = teams?.find((t: any) => t.id === innings?.team_id);
  const isChase = innings?.innings_number === 2 && innings?.target != null;
  const runsNeeded = isChase ? innings.target - (innings?.total_runs ?? 0) : 0;
  const totalMatchBalls = (match?.overs ?? 0) * 6;
  const ballsRemaining = isChase ? totalMatchBalls - (innings?.total_balls ?? 0) : 0;
  const chaseWon = isChase && runsNeeded <= 0;

  return (
    <View style={headerStyles.container}>
      <Text style={headerStyles.teamName}>{battingTeam?.name ?? '—'}</Text>
      <View style={headerStyles.scoreRow}>
        <Text style={headerStyles.runs}>{innings?.total_runs ?? 0}</Text>
        <Text style={headerStyles.wickets}>/{innings?.total_wickets ?? 0}</Text>
      </View>
      <Text style={headerStyles.overs}>
        {innings ? formatOvers(innings.total_balls) : '0.0'} / {match?.overs ?? 0} ov
      </Text>
      <View style={headerStyles.ratesRow}>
        <Text style={headerStyles.rate}>CRR {crr.toFixed(2)}</Text>
        {rrr !== null && <Text style={headerStyles.rate}>RRR {rrr.toFixed(2)}</Text>}
        {innings?.target && <Text style={headerStyles.target}>Target {innings.target}</Text>}
      </View>
      {isChase && (
        <View style={headerStyles.chaseBar}>
          {chaseWon ? (
            <Text style={headerStyles.chaseWon}>🎉 Target Chased!</Text>
          ) : (
            <Text style={headerStyles.chaseText}>
              Need {runsNeeded} run{runsNeeded !== 1 ? 's' : ''} in {ballsRemaining} ball{ballsRemaining !== 1 ? 's' : ''}
            </Text>
          )}
        </View>
      )}
    </View>
  );
}

function OverDots({ balls }: { balls: ReturnType<typeof ballToSummary>[] }) {
  const getDotStyle = (b: ReturnType<typeof ballToSummary>) => {
    if (b.isWicket) return dotStyles.wicket;
    if (b.isSix) return dotStyles.six;
    if (b.isBoundary) return dotStyles.four;
    if (b.isWide || b.isNoBall) return dotStyles.extra;
    return dotStyles.normal;
  };
  return (
    <View style={dotStyles.row}>
      <Text style={dotStyles.label}>This Over</Text>
      <View style={dotStyles.dots}>
        {balls.map((b, i) => (
          <View key={i} style={[dotStyles.dot, getDotStyle(b)]}>
            <Text style={dotStyles.dotText}>{b.label}</Text>
          </View>
        ))}
        {balls.length === 0 && <Text style={{ color: '#444', fontSize: 13 }}>No balls yet</Text>}
      </View>
    </View>
  );
}

function BatsmanCard({ stats, isStriker }: any) {
  if (!stats) return null;
  return (
    <View style={[batStyles.card, isStriker && batStyles.strikerCard]}>
      <View style={batStyles.nameRow}>
        {isStriker && <View style={batStyles.strikerDot} />}
        <Text style={batStyles.name}>{stats.player.name}</Text>
        {isStriker && <Text style={batStyles.onStrikeText}>*</Text>}
      </View>
      <View style={batStyles.statsRow}>
        <Text style={batStyles.runs}>{stats.runs}</Text>
        <Text style={batStyles.balls}> ({stats.balls})</Text>
      </View>
      <View style={batStyles.extrasRow}>
        <Text style={batStyles.extra}>4s: {stats.fours}</Text>
        <Text style={batStyles.extra}>  6s: {stats.sixes}</Text>
        <Text style={batStyles.extra}>  SR: {stats.strikeRate}</Text>
      </View>
    </View>
  );
}

function BowlerCard({ stats }: any) {
  if (!stats) return null;
  return (
    <View style={bowlStyles.card}>
      <View style={bowlStyles.nameRow}>
        <Text style={bowlStyles.name}>{stats.player.name}</Text>
        <Text style={bowlStyles.economy}>ECO {stats.economy.toFixed(1)}</Text>
      </View>
      <Text style={bowlStyles.line}>
        {formatOvers(Math.floor(stats.overs) * 6 + Math.round((stats.overs % 1) * 10))} - {stats.maidens} - {stats.runs} - {stats.wickets}
      </Text>
    </View>
  );
}

// ─── Player Select Modal ──────────────────────────────────────────────────────
function PlayerSelectModal({ visible, title, players, onSelect, onClose }: any) {
  return (
    <Modal visible={visible} animationType="slide" transparent>
      <View style={modalStyles.overlay}>
        <View style={modalStyles.sheet}>
          <View style={modalStyles.handle} />
          <Text style={modalStyles.title}>{title}</Text>
          <FlatList
            data={players}
            keyExtractor={(p: any) => p.id}
            renderItem={({ item }) => (
              <TouchableOpacity style={modalStyles.playerRow} onPress={() => onSelect(item.id)}>
                <View style={modalStyles.avatar}>
                  <Text style={modalStyles.avatarText}>{initials(item.name)}</Text>
                </View>
                <Text style={modalStyles.playerName}>{item.name}</Text>
              </TouchableOpacity>
            )}
          />
          <TouchableOpacity style={modalStyles.cancelBtn} onPress={onClose}>
            <Text style={modalStyles.cancelText}>Cancel</Text>
          </TouchableOpacity>
        </View>
      </View>
    </Modal>
  );
}

// ─── Wicket Modal ─────────────────────────────────────────────────────────────
const WICKET_TYPES: { type: WicketType; label: string; emoji: string }[] = [
  { type: 'bowled', label: 'Bowled', emoji: '🎯' },
  { type: 'caught', label: 'Caught', emoji: '🤲' },
  { type: 'lbw', label: 'LBW', emoji: '🦵' },
  { type: 'runout', label: 'Run Out', emoji: '🏃' },
  { type: 'stumped', label: 'Stumped', emoji: '🧤' },
  { type: 'hitwicket', label: 'Hit Wicket', emoji: '💥' },
  { type: 'retiredhurt', label: 'Retired Hurt', emoji: '🩹' },
];

function WicketModal({ visible, onSelect, onClose }: any) {
  return (
    <Modal visible={visible} animationType="slide" transparent>
      <View style={modalStyles.overlay}>
        <View style={modalStyles.sheet}>
          <View style={modalStyles.handle} />
          <Text style={modalStyles.title}>How was the batsman out?</Text>
          <View style={wicketStyles.grid}>
            {WICKET_TYPES.map(w => (
              <TouchableOpacity key={w.type} style={wicketStyles.btn} onPress={() => onSelect(w.type)}>
                <Text style={wicketStyles.emoji}>{w.emoji}</Text>
                <Text style={wicketStyles.label}>{w.label}</Text>
              </TouchableOpacity>
            ))}
          </View>
          <TouchableOpacity style={modalStyles.cancelBtn} onPress={onClose}>
            <Text style={modalStyles.cancelText}>Cancel</Text>
          </TouchableOpacity>
        </View>
      </View>
    </Modal>
  );
}

// ─── Run Out Modal ────────────────────────────────────────────────────────────
function RunOutModal({ visible, strikerName, nonStrikerName, bowlingPlayers, onConfirm, onClose }: any) {
  const [runsCompleted, setRunsCompleted] = React.useState(0);
  const [whoIsOut, setWhoIsOut] = React.useState<'striker' | 'nonStriker' | null>(null);
  const [fielderId, setFielderId] = React.useState<string | null>(null);

  React.useEffect(() => {
    if (visible) { setRunsCompleted(0); setWhoIsOut(null); setFielderId(null); }
  }, [visible]);

  const canConfirm = whoIsOut !== null;

  return (
    <Modal visible={visible} animationType="slide" transparent>
      <View style={modalStyles.overlay}>
        <View style={[modalStyles.sheet, { paddingBottom: 32 }]}>
          <View style={modalStyles.handle} />
          <Text style={modalStyles.title}>Run Out Details</Text>

          {/* Runs completed */}
          <Text style={[modalStyles.title, { fontSize: 13, marginBottom: 8, color: '#666' }]}>Runs completed before wicket</Text>
          <View style={{ flexDirection: 'row', gap: 8, justifyContent: 'center', marginBottom: 20 }}>
            {[0, 1, 2, 3, 4].map(r => (
              <TouchableOpacity
                key={r}
                onPress={() => setRunsCompleted(r)}
                style={{
                  width: 48, height: 48, borderRadius: 24,
                  backgroundColor: runsCompleted === r ? '#810100' : '#F5F3EF',
                  alignItems: 'center', justifyContent: 'center',
                  borderWidth: runsCompleted === r ? 0 : 1, borderColor: 'rgba(99,1,2,0.15)'
                }}
              >
                <Text style={{ fontFamily: 'Outfit_700Bold', fontSize: 18, color: runsCompleted === r ? '#FFF' : '#1B1716' }}>{r}</Text>
              </TouchableOpacity>
            ))}
          </View>

          {/* Who is out */}
          <Text style={[modalStyles.title, { fontSize: 13, marginBottom: 8, color: '#666' }]}>Who was run out?</Text>
          <View style={{ flexDirection: 'row', gap: 12, marginBottom: 20, paddingHorizontal: 16 }}>
            <TouchableOpacity
              onPress={() => setWhoIsOut('striker')}
              style={{ flex: 1, padding: 14, borderRadius: 12, borderWidth: 2,
                borderColor: whoIsOut === 'striker' ? '#810100' : 'rgba(99,1,2,0.15)',
                backgroundColor: whoIsOut === 'striker' ? 'rgba(129,1,0,0.06)' : '#FFF',
                alignItems: 'center' }}
            >
              <Text style={{ fontFamily: 'Outfit_700Bold', fontSize: 14, color: whoIsOut === 'striker' ? '#810100' : '#1B1716' }}>
                {strikerName} *
              </Text>
              <Text style={{ fontFamily: 'Outfit_400Regular', fontSize: 11, color: '#9A9390', marginTop: 2 }}>Striker</Text>
            </TouchableOpacity>
            <TouchableOpacity
              onPress={() => setWhoIsOut('nonStriker')}
              style={{ flex: 1, padding: 14, borderRadius: 12, borderWidth: 2,
                borderColor: whoIsOut === 'nonStriker' ? '#810100' : 'rgba(99,1,2,0.15)',
                backgroundColor: whoIsOut === 'nonStriker' ? 'rgba(129,1,0,0.06)' : '#FFF',
                alignItems: 'center' }}
            >
              <Text style={{ fontFamily: 'Outfit_700Bold', fontSize: 14, color: whoIsOut === 'nonStriker' ? '#810100' : '#1B1716' }}>
                {nonStrikerName}
              </Text>
              <Text style={{ fontFamily: 'Outfit_400Regular', fontSize: 11, color: '#9A9390', marginTop: 2 }}>Non-striker</Text>
            </TouchableOpacity>
          </View>

          {/* Fielder (optional) */}
          <Text style={[modalStyles.title, { fontSize: 13, marginBottom: 8, color: '#666' }]}>Fielder (optional)</Text>
          <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ marginBottom: 20, paddingHorizontal: 16 }}>
            {bowlingPlayers.map((p: any) => (
              <TouchableOpacity
                key={p.id}
                onPress={() => setFielderId(prev => prev === p.id ? null : p.id)}
                style={{
                  paddingHorizontal: 14, paddingVertical: 8, borderRadius: 20, marginRight: 8,
                  backgroundColor: fielderId === p.id ? '#810100' : '#F5F3EF',
                  borderWidth: 1, borderColor: fielderId === p.id ? '#810100' : 'rgba(99,1,2,0.15)'
                }}
              >
                <Text style={{ fontFamily: 'Outfit_600SemiBold', fontSize: 13, color: fielderId === p.id ? '#FFF' : '#1B1716' }}>
                  {p.name}
                </Text>
              </TouchableOpacity>
            ))}
          </ScrollView>

          <TouchableOpacity
            style={[modalStyles.cancelBtn, { backgroundColor: canConfirm ? '#810100' : '#ccc', marginTop: 0 }]}
            onPress={() => canConfirm && onConfirm({ runsCompleted, whoIsOut, fielderId })}
            disabled={!canConfirm}
          >
            <Text style={[modalStyles.cancelText, { color: '#FFF', fontFamily: 'Outfit_700Bold' }]}>Confirm Run Out</Text>
          </TouchableOpacity>
          <TouchableOpacity style={modalStyles.cancelBtn} onPress={onClose}>
            <Text style={modalStyles.cancelText}>Cancel</Text>
          </TouchableOpacity>
        </View>
      </View>
    </Modal>
  );
}

// ─── Caught Modal ─────────────────────────────────────────────────────────────
function CaughtModal({ visible, bowlingPlayers, onConfirm, onClose }: any) {
  const [fielderId, setFielderId] = React.useState<string | null>(null);

  React.useEffect(() => {
    if (visible) setFielderId(null);
  }, [visible]);

  return (
    <Modal visible={visible} animationType="slide" transparent>
      <View style={modalStyles.overlay}>
        <View style={[modalStyles.sheet, { paddingBottom: 32 }]}>
          <View style={modalStyles.handle} />
          <Text style={modalStyles.title}>Who caught it?</Text>
          <ScrollView style={{ maxHeight: 300, marginBottom: 20 }}>
            {bowlingPlayers.map((p: any) => (
              <TouchableOpacity
                key={p.id}
                onPress={() => setFielderId(p.id)}
                style={{
                  padding: 16, borderBottomWidth: 1, borderColor: '#EDEBDE',
                  flexDirection: 'row', alignItems: 'center'
                }}
              >
                <View style={{
                  width: 24, height: 24, borderRadius: 12, borderWidth: 2, marginRight: 12,
                  borderColor: fielderId === p.id ? '#810100' : '#D9D5CD',
                  backgroundColor: fielderId === p.id ? '#810100' : 'transparent',
                  alignItems: 'center', justifyContent: 'center'
                }}>
                  {fielderId === p.id && <View style={{ width: 10, height: 10, borderRadius: 5, backgroundColor: '#FFF' }} />}
                </View>
                <Text style={{ fontFamily: 'Outfit_500Medium', fontSize: 16, color: '#1B1716' }}>{p.name}</Text>
              </TouchableOpacity>
            ))}
          </ScrollView>
          <TouchableOpacity
            style={[modalStyles.cancelBtn, { backgroundColor: fielderId ? '#810100' : '#ccc', marginTop: 0 }]}
            onPress={() => fielderId && onConfirm(fielderId)}
            disabled={!fielderId}
          >
            <Text style={[modalStyles.cancelText, { color: '#FFF', fontFamily: 'Outfit_700Bold' }]}>Confirm Catch</Text>
          </TouchableOpacity>
          <TouchableOpacity style={modalStyles.cancelBtn} onPress={onClose}>
            <Text style={modalStyles.cancelText}>Cancel</Text>
          </TouchableOpacity>
        </View>
      </View>
    </Modal>
  );
}

// ─── Dropped Catch Modal ────────────────────────────────────────────────────────
function DroppedCatchModal({ visible, bowlingPlayers, onConfirm, onClose }: any) {
  const [runsScored, setRunsScored] = React.useState(0);
  const [fielderId, setFielderId] = React.useState<string | null>(null);

  React.useEffect(() => {
    if (visible) { setRunsScored(0); setFielderId(null); }
  }, [visible]);

  return (
    <Modal visible={visible} animationType="slide" transparent>
      <View style={modalStyles.overlay}>
        <View style={[modalStyles.sheet, { paddingBottom: 32 }]}>
          <View style={modalStyles.handle} />
          <Text style={[modalStyles.title, { color: '#ef4444' }]}>Dropped Catch 💔</Text>

          <Text style={[modalStyles.title, { fontSize: 13, marginBottom: 8, color: '#666' }]}>Runs scored on this ball?</Text>
          <View style={{ flexDirection: 'row', gap: 8, justifyContent: 'center', marginBottom: 20 }}>
            {[0, 1, 2, 3, 4, 6].map(r => (
              <TouchableOpacity
                key={r}
                onPress={() => setRunsScored(r)}
                style={{
                  width: 44, height: 44, borderRadius: 22,
                  backgroundColor: runsScored === r ? '#810100' : '#F5F3EF',
                  alignItems: 'center', justifyContent: 'center',
                  borderWidth: runsScored === r ? 0 : 1, borderColor: 'rgba(99,1,2,0.15)'
                }}
              >
                <Text style={{ fontFamily: 'Outfit_700Bold', fontSize: 16, color: runsScored === r ? '#FFF' : '#1B1716' }}>{r}</Text>
              </TouchableOpacity>
            ))}
          </View>

          <Text style={[modalStyles.title, { fontSize: 13, marginBottom: 8, color: '#666' }]}>Who dropped it?</Text>
          <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ marginBottom: 20, paddingHorizontal: 16 }}>
            {bowlingPlayers.map((p: any) => (
              <TouchableOpacity
                key={p.id}
                onPress={() => setFielderId(p.id)}
                style={{
                  paddingHorizontal: 14, paddingVertical: 8, borderRadius: 20, marginRight: 8,
                  backgroundColor: fielderId === p.id ? '#810100' : '#F5F3EF',
                  borderWidth: 1, borderColor: fielderId === p.id ? '#810100' : 'rgba(99,1,2,0.15)'
                }}
              >
                <Text style={{ fontFamily: 'Outfit_600SemiBold', fontSize: 13, color: fielderId === p.id ? '#FFF' : '#1B1716' }}>
                  {p.name}
                </Text>
              </TouchableOpacity>
            ))}
          </ScrollView>

          <TouchableOpacity
            style={[modalStyles.cancelBtn, { backgroundColor: fielderId ? '#810100' : '#ccc', marginTop: 0 }]}
            onPress={() => fielderId && onConfirm({ runsScored, fielderId })}
            disabled={!fielderId}
          >
            <Text style={[modalStyles.cancelText, { color: '#FFF', fontFamily: 'Outfit_700Bold' }]}>Confirm Drop</Text>
          </TouchableOpacity>
          <TouchableOpacity style={modalStyles.cancelBtn} onPress={onClose}>
            <Text style={modalStyles.cancelText}>Cancel</Text>
          </TouchableOpacity>
        </View>
      </View>
    </Modal>
  );
}

// ─── Innings Break Modal ──────────────────────────────────────────────────────
function InningsBreakModal({ visible, innings, match, teams, onStartInnings2, onClose, isScorer, onRefresh }: any) {
  const battingTeam = teams?.find((t: any) => t.id === innings?.team_id);
  const target = (innings?.total_runs ?? 0) + 1;
  const [refreshing, setRefreshing] = React.useState(false);
  return (
    <Modal visible={visible} animationType="fade" transparent>
      <View style={modalStyles.overlay}>
        <View style={[modalStyles.sheet, { padding: 24 }]}>
          <Text style={inningsBreakStyles.header}>Innings Complete!</Text>
          <View style={inningsBreakStyles.scoreCard}>
            <Text style={inningsBreakStyles.teamName}>{battingTeam?.name ?? '—'}</Text>
            <Text style={inningsBreakStyles.score}>{innings?.total_runs}/{innings?.total_wickets}</Text>
            <Text style={inningsBreakStyles.overs}>{innings ? formatOvers(innings.total_balls) : '0'} overs</Text>
          </View>
          <View style={inningsBreakStyles.targetCard}>
            <Text style={inningsBreakStyles.targetLabel}>Target</Text>
            <Text style={inningsBreakStyles.targetValue}>{target}</Text>
          </View>
          {isScorer ? (
            <TouchableOpacity style={inningsBreakStyles.startBtn} onPress={onStartInnings2}>
              <Text style={inningsBreakStyles.startBtnText}>Start Innings 2 →</Text>
            </TouchableOpacity>
          ) : (
            <>
              <View style={[inningsBreakStyles.startBtn, { backgroundColor: 'rgba(129,1,0,0.1)' }]}>
                <Text style={[inningsBreakStyles.startBtnText, { color: '#810100' }]}>⏳ Waiting for Innings 2…</Text>
              </View>
              {/* Manual escape hatch — realtime events can be missed while the app
                  is backgrounded, leaving viewers stuck on this modal. */}
              <TouchableOpacity
                style={[inningsBreakStyles.startBtn, { backgroundColor: '#FFFFFF', borderWidth: 1.5, borderColor: 'rgba(129,1,0,0.25)', marginTop: 12 }]}
                disabled={refreshing}
                onPress={async () => {
                  setRefreshing(true);
                  try { await onRefresh?.(); } finally { setRefreshing(false); }
                }}
              >
                <Text style={[inningsBreakStyles.startBtnText, { color: '#810100' }]}>
                  {refreshing ? 'Refreshing…' : '↻ Refresh'}
                </Text>
              </TouchableOpacity>
            </>
          )}
        </View>
      </View>
    </Modal>
  );
}

// ─── MAIN SCORING SCREEN ─────────────────────────────────────────────────────
export default function ScoringScreen() {
  const { code } = useLocalSearchParams<{ code: string }>();
  const router = useRouter();
  const { user } = useAuth();

  const { session, match, innings, balls, players, teams, loading, sendScoreUpdate, refetch } = useRealtimeMatch(code);

  // On-field state
  const [strikerId, setStrikerId] = useState('');
  const [nonStrikerId, setNonStrikerId] = useState('');
  const [bowlerId, setBowlerId] = useState('');
  const [pendingBalls, setPendingBalls] = useState<any[]>([]);
  const [submittedTotal, setSubmittedTotal] = useState<{ runs: number; balls: number; wickets: number } | null>(null);
  const [activeTab, setActiveTab] = useState<'score' | 'scorecard'>('score');
  const [refreshing, setRefreshing] = useState(false);

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    await refetch();
    setRefreshing(false);
  }, [refetch]);
  const submittingOverRef = React.useRef(false); // guard against double-submit
  // Monotonically-increasing delivery counter — updated synchronously in addBall,
  // never derived from inningsBalls.length (which is async/stale between rapid calls).
  const deliveryCounterRef = React.useRef(0);
  const [dismissedIds, setDismissedIds] = React.useState<Set<string>>(new Set());

  // Modal states
  const [showWicket, setShowWicket] = useState(false);
  const [showCaughtWicket, setShowCaughtWicket] = useState(false);
  const [showRunOut, setShowRunOut] = useState(false);
  const [showDroppedCatch, setShowDroppedCatch] = useState(false);
  const [showBatsman, setShowBatsman] = useState(false);
  const [showNonStriker, setShowNonStriker] = useState(false);
  const [showBowler, setShowBowler] = useState(false);
  const [showInningsBreak, setShowInningsBreak] = useState(false);
  const [showSettings, setShowSettings] = useState(false);
  const [showTransferScorer, setShowTransferScorer] = useState(false);
  const [noBallMode, setNoBallMode] = useState(false);
  const [showBowlerOptions, setShowBowlerOptions] = useState<string | null>(null);
  // After a wicket on the LAST ball of an over, we must show batsman modal FIRST
  // and THEN bowler modal. This flag triggers the bowler modal after batsman is picked.
  const [bowlerNeededAfterWicket, setBowlerNeededAfterWicket] = useState(false);
  // After wicket on over-end, new batsman starts as non-striker (over ends, ends swap)
  const [newBatsmanIsNonStriker, setNewBatsmanIsNonStriker] = useState(false);

  // Auth check
  const isOwner = !!(session?.owner_id && session.owner_id === user?.id);
  const myPlayer = players.find(p => p.user_id === user?.id);
  const currentInnings = useMemo(() => innings.find(i => i.status === 'active') ?? null, [innings]);
  const prevInnings = useMemo(() => innings.find(i => i.status === 'complete') ?? null, [innings]);
  // ── ROLE DERIVATION ──
  // The team that bats first is Team A in this context. The team chasing is Team B.
  const battingFirstTeamId = match?.batting_first;
  const chasingTeamId = match?.batting_first === match?.team1_id ? match?.team2_id : match?.team1_id;

  // Only the scorer of the batting team can score
  const isMyTeamBatting = currentInnings?.team_id === myPlayer?.team_id;
  const canScoreNow = (match?.status === 'innings_1' || match?.status === 'innings_2') && !!myPlayer?.is_scorer && isMyTeamBatting;
  
  // Scorer of the chasing team or owner can start second innings
  const isMyTeamChasing = myPlayer?.team_id === chasingTeamId;
  const canStartInnings2 = match?.status === 'innings_break' && ((!!myPlayer?.is_scorer && isMyTeamChasing) || isOwner);

  // We show the scoring screen if you have ANY administrative capability at this moment.
  const showScoringScreen = canScoreNow || canStartInnings2;
  // Fallback for UI components that check "isScorer" generically (like settings gear icon)
  const isScorer = showScoringScreen;


  // Balls computation
  // Deduplicate ALL balls by delivery_number using a Map — this ensures that when
  // both a broadcast tmp_ ball AND the real DB ball arrive, only ONE entry exists.
  // This prevents legalBallCount from doubling when the DB INSERT fires after broadcast.
  const dbBalls = useMemo(() => {
    if (!currentInnings) return [] as any[];
    const inningBalls = balls.filter(b => b.innings_id === currentInnings.id);
    // Map from delivery_number → best ball (prefer real UUID over tmp_)
    const byDelivery = new Map<number, any>();
    for (const b of inningBalls) {
      const dn = (b as any).delivery_number;
      const existing = byDelivery.get(dn);
      if (!existing) {
        byDelivery.set(dn, b);
      } else {
        // Prefer real record (non-tmp id) over broadcast tmp_ record
        const existingIsTmp = String(existing.id).startsWith('tmp_');
        const newIsTmp = String(b.id).startsWith('tmp_');
        if (existingIsTmp && !newIsTmp) byDelivery.set(dn, b);
      }
    }
    return Array.from(byDelivery.values()).sort((a, b) => a.delivery_number - b.delivery_number);
  }, [balls, currentInnings?.id]);

  // inningsBalls = all confirmed balls (deduped by delivery_number from DB/broadcast) + scorer's local pending balls.
  // PendingBalls delivery_numbers are guaranteed > any dbBall delivery_number (added sequentially).
  const pendingOnlyBalls = useMemo(() => {
    const dbDeliveries = new Set(dbBalls.map((b: any) => b.delivery_number));
    return pendingBalls.filter(b => !dbDeliveries.has(b.delivery_number));
  }, [dbBalls, pendingBalls]);

  const inningsBalls = useMemo(() => [...dbBalls, ...pendingOnlyBalls], [dbBalls, pendingOnlyBalls]);

  // legalBallCount: used only for stats that genuinely need ball-object counts (e.g. bowler eco).
  // Do NOT use this for currentOverNum — it's async and lags between rapid addBall calls.
  const legalBallCount = useMemo(() =>
    inningsBalls.filter(b => b.extra_type !== 'wide' && b.extra_type !== 'noball').length,
    [inningsBalls]);

  // currentOverNum: use submittedTotal (SCORER-trusted, always set at innings load) + pendingBalls.
  // For VIEWERS (submittedTotal=null, pendingBalls=[]) fall back to currentInnings.total_balls
  // which is kept current by broadcast Math.max updates.
  // NEVER use currentInnings.total_balls for SCORER — self-broadcast inflates it on every ball.
  const currentOverNum = useMemo(() => {
    // Scorer has submittedTotal initialized; viewer has pendingBalls=[]
    const committedBalls = submittedTotal?.balls ?? (pendingBalls.length > 0 ? 0 : (currentInnings?.total_balls ?? 0));
    const pendingLegalCount = pendingBalls.filter((b: any) => b.extra_type !== 'wide' && b.extra_type !== 'noball').length;
    return Math.floor((committedBalls + pendingLegalCount) / 6);
  }, [submittedTotal, currentInnings?.total_balls, pendingBalls]);

  const currentOverBalls = useMemo(() => inningsBalls.filter(b => (b as any).over_number === currentOverNum).map(b => ballToSummary(b)), [inningsBalls, currentOverNum]);
  // overHistory: exclude the current (incomplete) over so it only shows in OverDots, not duplicated in history
  const overHistory = useMemo(() => buildOverHistory(inningsBalls).filter(o => o.overNumber !== currentOverNum + 1), [inningsBalls, currentOverNum]);


  // Player groups
  const jokerPlayers = useMemo(() => players.filter(p => p.is_joker), [players]);
  const battingPlayers = useMemo(() =>
    currentInnings ? [...players.filter(p => p.team_id === currentInnings.team_id && !p.is_joker), ...jokerPlayers] : [],
    [players, currentInnings?.team_id, jokerPlayers]);
  const bowlingTeamId = useMemo(() => currentInnings
    ? (currentInnings.team_id === match?.team1_id ? match?.team2_id : match?.team1_id)
    : null, [currentInnings, match]);
  const bowlingPlayers = useMemo(() =>
    bowlingTeamId ? [...players.filter(p => p.team_id === bowlingTeamId && !p.is_joker), ...jokerPlayers] : [],
    [players, bowlingTeamId, jokerPlayers]);
  const availableBatsmen = useMemo(() =>
    battingPlayers.filter(p => p.id !== strikerId && p.id !== nonStrikerId && !dismissedIds.has(p.id)),
    [battingPlayers, strikerId, nonStrikerId, dismissedIds]);

  // Live stats
  const striker = useMemo(() => players.find(p => p.id === strikerId), [players, strikerId]);
  const nonStriker = useMemo(() => players.find(p => p.id === nonStrikerId), [players, nonStrikerId]);
  const bowler = useMemo(() => players.find(p => p.id === bowlerId), [players, bowlerId]);
  const strikerStats = useMemo(() => striker ? calcBatsmanStats(striker, inningsBalls, true) : null, [striker, inningsBalls]);
  const nonStrikerStats = useMemo(() => nonStriker ? calcBatsmanStats(nonStriker, inningsBalls, false) : null, [nonStriker, inningsBalls]);
  const bowlerStats = useMemo(() => bowler ? calcBowlerStats(bowler, inningsBalls) : null, [bowler, inningsBalls]);

  // Optimistic live innings
  const pendingRuns = useMemo(() => pendingBalls.reduce((s, b) => s + (b.runs_off_bat ?? 0) + (b.extras ?? 0), 0), [pendingBalls]);
  const pendingWickets = useMemo(() => pendingBalls.filter(b => b.is_wicket).length, [pendingBalls]);
  const pendingLegal = useMemo(() => pendingBalls.filter(b => b.extra_type !== 'wide' && b.extra_type !== 'noball').length, [pendingBalls]);
  const liveInnings = useMemo(() => {
    if (!currentInnings) return null;
    // Use submittedTotal as the base (not currentInnings totals) because self-broadcast inflates
    // currentInnings.total_* via Math.max on every ball the scorer sends.
    // submittedTotal is initialized from DB at innings load and updated only by submitOver.
    const baseRuns    = submittedTotal?.runs    ?? 0;
    const baseBalls   = submittedTotal?.balls   ?? 0;
    const baseWickets = submittedTotal?.wickets ?? 0;
    return {
      ...currentInnings,
      total_runs:    Math.max(baseRuns    + pendingRuns,    currentInnings.total_runs),
      total_wickets: Math.max(baseWickets + pendingWickets, currentInnings.total_wickets),
      total_balls:   Math.max(baseBalls   + pendingLegal,   currentInnings.total_balls),
    };
  }, [currentInnings, pendingRuns, pendingWickets, pendingLegal, submittedTotal]);

  const crr = useMemo(() => liveInnings && liveInnings.total_balls > 0
    ? (liveInnings.total_runs / (liveInnings.total_balls / 6))
    : 0, [liveInnings]);
  const rrr = useMemo(() => liveInnings?.target && liveInnings.total_balls < (match?.overs ?? 0) * 6
    ? ((liveInnings.target - liveInnings.total_runs) / (((match?.overs ?? 0) * 6 - liveInnings.total_balls) / 6))
    : null, [liveInnings, match]);
  const isFreehitNext = useMemo(() => inningsBalls[inningsBalls.length - 1]?.extra_type === 'noball', [inningsBalls]);

  // Sync delivery counter from DB balls so it's always ahead of what's been persisted.
  // This runs whenever new DB balls arrive, ensuring deliveryCounterRef never lags.
  useEffect(() => {
    if (dbBalls.length === 0) return;
    const maxDn = dbBalls.reduce((max: number, b: any) => Math.max(max, b.delivery_number ?? 0), -1);
    // Only advance the counter, never regress it
    if (maxDn + 1 > deliveryCounterRef.current) {
      deliveryCounterRef.current = maxDn + 1;
    }
  }, [dbBalls]);

  // Initialize submittedTotal from the DB innings totals when the scorer first loads.
  // This ensures the base is correct for:
  //   (a) a fresh innings start (total_balls=0 → submittedTotal={balls:0})
  //   (b) a scorer rejoining mid-match (total_balls=12 → submittedTotal={balls:12})
  // After this, submitOver is the ONLY thing that updates submittedTotal.
  // We NEVER use currentInnings.total_balls for scorer maths — self-broadcast inflates it on every ball.
  useEffect(() => {
    if (!showScoringScreen || !currentInnings) return;
    // Only initialize once per innings (when submittedTotal is still null)
    if (submittedTotal !== null) return;
    // Innings totals only update at over boundaries, but every ball is persisted
    // immediately. After an app reload mid-over the balls table is ahead of the
    // innings row — derive from balls too so scoring resumes mid-over, not from
    // the start of the over.
    const ballsLegal = dbBalls.filter((b: any) => b.extra_type !== 'wide' && b.extra_type !== 'noball').length;
    const ballsRuns = dbBalls.reduce((s: number, b: any) => s + (b.runs_off_bat ?? 0) + (b.extras ?? 0), 0);
    const ballsWickets = dbBalls.filter((b: any) => b.is_wicket).length;
    setSubmittedTotal({
      runs:    Math.max(currentInnings.total_runs, ballsRuns),
      balls:   Math.max(currentInnings.total_balls, ballsLegal),
      wickets: Math.max(currentInnings.total_wickets, ballsWickets),
    });
  }, [showScoringScreen, currentInnings?.id, dbBalls]);

  // Sync on-field state from last ball in the DB (confirmed balls only, sorted by delivery_number)
  useEffect(() => {
    if (dbBalls.length === 0) return;
    // dbBalls is already sorted by delivery_number (from the Map dedup)
    const last = dbBalls[dbBalls.length - 1];

    const dbLegal = dbBalls.filter((b: any) => b.extra_type !== 'wide' && b.extra_type !== 'noball').length;
    const dbWickets = dbBalls.filter((b: any) => b.is_wicket).length;
    const isSingleBatting = dbWickets >= (battingPlayers.length || 10) - 1;
    
    const isEndOfOver = dbLegal > 0 && dbLegal % 6 === 0;
    const physicalRuns = (last.runs_off_bat ?? 0) + (['bye', 'legbye'].includes(last.extra_type) ? (last.extras ?? 0) : 0);
    const isOddRuns = last.extra_type !== 'wide' && (physicalRuns % 2 === 1);

    let rotateStrike = false;
    if (isEndOfOver) {
      rotateStrike = !isOddRuns; // Even runs -> rotate
    } else {
      rotateStrike = isOddRuns; // Odd runs -> rotate
    }

    const predictedStriker = (rotateStrike && !isSingleBatting) ? ((last as any).non_striker_id ?? last.batsman_id) : last.batsman_id;
    const predictedNonStriker = (rotateStrike && !isSingleBatting) ? last.batsman_id : ((last as any).non_striker_id ?? '');

    if (isScorer) {
      // Scorer manages these manually via modals — only initialise if not yet set
      if (!strikerId) setStrikerId(predictedStriker);
      if (!nonStrikerId) setNonStrikerId(predictedNonStriker);
      if (!bowlerId) setBowlerId(last.bowler_id);
    } else {
      // Viewers: always derive on-strike from ball data directly.
      setStrikerId(predictedStriker);
      setNonStrikerId(predictedNonStriker);
      setBowlerId(last.bowler_id);
    }
  }, [dbBalls, isScorer]);

  // Navigate when match results
  useEffect(() => {
    if (match?.status === 'result') router.replace(`/match/${code}/result` as any);
  }, [match?.status]);

  // Show setup modals when no players selected.
  // Skipped while any other modal/replacement flow is active — opening a second
  // native Modal on top of an open one freezes touch handling on iOS (the
  // run-out flow clears strikerId/nonStrikerId, which used to trigger this
  // effect while the New Batsman modal was already opening → frozen screen).
  useEffect(() => {
    if (!showScoringScreen || !currentInnings) return;
    if (showWicket || showRunOut || showBatsman || showNonStriker || showBowler ||
        showBowlerOptions || bowlerNeededAfterWicket || newBatsmanIsNonStriker) return;
    if (!strikerId && availableBatsmen.length > 0) setShowBatsman(true);
    else if (!nonStrikerId && availableBatsmen.length > 0) setShowNonStriker(true);
    else if (!bowlerId && bowlingPlayers.length > 0) setShowBowler(true);
  }, [showScoringScreen, currentInnings?.id, strikerId, nonStrikerId, bowlerId,
      showWicket, showRunOut, showBatsman, showNonStriker, showBowler,
      showBowlerOptions, bowlerNeededAfterWicket, newBatsmanIsNonStriker,
      availableBatsmen.length, bowlingPlayers.length]);

  const addBall = useCallback(({ runsOffBat = 0, extraType = null as ExtraType | null, extraRuns = 0, isWicket = false, wicketType = null as WicketType | null, batsmanIdOverride = null as string | null, fielderIdOverride = null as string | null } = {}) => {
    if (!currentInnings || !strikerId || !bowlerId) {
      Alert.alert('Not ready', 'Select batsman and bowler first');
      return;
    }

    const maxBalls = (match?.overs ?? 0) * 6;
    const stableBaseBalls = submittedTotal?.balls ?? 0;
    const baseWicketsChk = submittedTotal?.wickets ?? 0;
    const allOutLimit = battingPlayers.length || 10;
    
    // Prevent logging balls past the maximum overs
    if (maxBalls > 0 && (stableBaseBalls + pendingLegal) >= maxBalls) {
      Alert.alert('Innings Over', `Maximum overs (${match?.overs}) reached.`);
      return;
    }

    // Prevent logging balls if all batsmen are out
    if ((baseWicketsChk + pendingWickets) >= allOutLimit) {
      Alert.alert('Innings Over', 'All batsmen are out.');
      return;
    }

    // Prevent logging balls after the target is already chased.
    // Use the same Math.max as the displayed score — submittedTotal can lag
    // behind broadcast-updated innings totals after a reload mid-innings.
    const displayedRuns = Math.max((submittedTotal?.runs ?? 0) + pendingRuns, currentInnings.total_runs);
    if (currentInnings.innings_number === 2 && currentInnings.target != null && displayedRuns >= currentInnings.target) {
      Alert.alert('Innings Over', 'Target already chased — match is over.');
      if (pendingBalls.length > 0) submitOver(pendingBalls);
      return;
    }

    const isExtra = extraType === 'wide' || extraType === 'noball';
    const dn = deliveryCounterRef.current;
    deliveryCounterRef.current += 1;
    // NEVER use currentInnings.total_balls here — self-broadcast inflates it every ball.
    const stableOverNum = Math.floor((stableBaseBalls + pendingLegal) / 6);
    // Count from inningsBalls (DB + pending), not pendingBalls alone — after a
    // reload mid-over, pendingBalls is empty but the over's balls exist in the DB.
    const ballNumber = inningsBalls.filter((b: any) =>
      b.over_number === stableOverNum && b.extra_type !== 'wide' && b.extra_type !== 'noball'
    ).length;

    const ball = {
      innings_id: currentInnings.id,
      over_number: stableOverNum,
      ball_number: ballNumber,
      delivery_number: dn,
      batsman_id: batsmanIdOverride ?? strikerId,  // run-out NS override
      bowler_id: bowlerId,
      non_striker_id: nonStrikerId || null,
      runs_off_bat: runsOffBat,
      extras: extraType ? (extraRuns || (isExtra ? 1 : 0)) : 0,
      extra_type: extraType,
      is_wicket: isWicket,
      wicket_type: wicketType,
      fielder_id: fielderIdOverride ?? null,
      is_free_hit: isFreehitNext };

    // Track dismissed batsmen so they can't be re-selected after a wicket
    if (isWicket) {
      const dismissedId = batsmanIdOverride ?? strikerId;
      setDismissedIds(prev => new Set([...prev, dismissedId]));
    }

    // Strike rotation logic:
    // Normal ball: rotate on odd runs
    // Last ball of over: rotate on EVEN runs (since bowler changes ends, cancelling the swap)
    // Suppress for run-outs (batsmanIdOverride set)
    // For NB, only rotate on off-bat runs.
    const isExtraRotate = extraType === 'wide' || extraType === 'noball';
    const isLastBallOfOver = !isExtraRotate && (stableBaseBalls + pendingLegal + 1) % 6 === 0;
    const physicalRuns = runsOffBat + (['bye', 'legbye'].includes(extraType as string) ? extraRuns : 0);
    const isOddRuns = physicalRuns % 2 === 1;
    
    let rotateStrike = false;
    if (!batsmanIdOverride && extraType !== 'wide') {
      if (isLastBallOfOver) {
        rotateStrike = !isOddRuns; // Even runs -> 1 rotation (bowler change)
      } else {
        rotateStrike = isOddRuns;  // Odd runs -> 1 rotation (batsmen cross)
      }
    }

    const isSingleBatting = (baseWicketsChk + pendingWickets + (isWicket ? 1 : 0)) >= (battingPlayers.length || 10) - 1;
    if (rotateStrike && !isSingleBatting) {
      setStrikerId(nonStrikerId!);
      setNonStrikerId(strikerId);
    }


    // Total runs for this delivery
    const deliveryRuns = runsOffBat + (extraType ? (extraRuns || (isExtra ? 1 : 0)) : 0);

    if (isWicket) {
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      sendLocalNotification('Wicket! 🏏', `A wicket has fallen. (${currentInnings.total_runs}/${currentInnings.total_wickets + 1})`);
    } else if (runsOffBat >= 4) {
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning);
    } else {
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    }

    Vibration.vibrate(30);
    setNoBallMode(false);
    setPendingBalls(prev => [...prev, ball]);

    // NEVER use currentInnings totals here — self-broadcast inflates them on every ball.
    // submittedTotal is initialized at innings load and only updated by submitOver.
    const baseRuns     = submittedTotal?.runs     ?? 0;
    const baseBalls    = submittedTotal?.balls     ?? 0;
    const baseWickets  = submittedTotal?.wickets   ?? 0;

    // Broadcast the ball immediately to all viewers via the realtime channel
    const broadcastBalls = baseBalls + pendingLegal + (isExtra ? 0 : 1);
    console.log('[SEND] dn:', dn, 'over_number:', stableOverNum, 'ball_number:', ballNumber, 'broadcastBalls:', broadcastBalls);
    sendScoreUpdate(
      currentInnings.id,
      baseRuns    + pendingRuns    + deliveryRuns,
      baseWickets + pendingWickets + (isWicket ? 1 : 0),
      broadcastBalls,
      ball
    );

    // Persist the ball to the DB immediately so viewers also receive it via DB realtime.
    // Don't await — fire-and-forget; submitOver will handle innings totals at over-end.
    (supabase.from('balls') as any).insert({ ...ball, id: undefined }).then(({ error }: any) => {
      if (error) console.warn('Ball insert failed, will retry at submitOver:', error.message);
    });

    const legalAfter = pendingLegal + (isExtra ? 0 : 1);
    // Over completes when the innings-wide legal ball count hits a multiple of 6.
    // Must include stableBaseBalls — after a mid-over reload, pendingLegal alone
    // restarts at 0 and the over would run long.
    const completedOver = !isExtra && (stableBaseBalls + legalAfter) % 6 === 0;

    // Mid-over all-out check: if this was a wicket and there are no more batsmen,
    // force-end the innings immediately without waiting for the over to complete.
    // totalWicketsAfter counts all wickets including this ball.
    if (isWicket && !completedOver) {
      const baseWicketsChk = submittedTotal?.wickets ?? 0;
      const totalWicketsAfter = baseWicketsChk + pendingWickets + 1; // +1 for this ball
      const allOutLimit = battingPlayers.length || 10;
      
      // Single Batting: ONLY end if totalWicketsAfter >= allOutLimit
      if (totalWicketsAfter >= allOutLimit) {
        // Submit the partial over immediately to trigger innings_end
        submitOver([...pendingBalls, ball], legalAfter);
        return;
      }
    }

    // Mid-over TARGET CHASE check (innings 2 only):
    // If total runs >= target, end the innings immediately — the match is won.
    // Math.max against currentInnings.total_runs so the check agrees with the
    // displayed score even when submittedTotal lags after a reload.
    if (!completedOver && currentInnings?.innings_number === 2 && currentInnings.target != null) {
      const totalRunsAfter = Math.max((submittedTotal?.runs ?? 0) + pendingRuns, currentInnings.total_runs) + deliveryRuns;
      if (totalRunsAfter >= currentInnings.target) {
        submitOver([...pendingBalls, ball], legalAfter);
        return;
      }
    }

    if (completedOver) {
      // Pass legalAfter explicitly — pendingLegal is a stale closure value
      // that doesn't include this new ball yet (React batches state updates).
      submitOver([...pendingBalls, ball], legalAfter);
    }
  }, [currentInnings, strikerId, nonStrikerId, bowlerId, currentOverNum, currentOverBalls, inningsBalls, isFreehitNext, pendingBalls, pendingRuns, pendingWickets, pendingLegal, submittedTotal]);


  const submitOver = useCallback(async (overBalls: any[], legalCountOverride?: number) => {
    if (overBalls.length === 0) return;
    // Guard against double-submit (e.g., from rapid double-tap or React StrictMode)
    if (submittingOverRef.current) return;
    submittingOverRef.current = true;

    // Calculate from the passed overBalls array to avoid stale pendingLegal closure.
    // legalCountOverride is passed from addBall which already computed legalAfter correctly.
    const legalInOver = legalCountOverride ??
      overBalls.filter(b => b.extra_type !== 'wide' && b.extra_type !== 'noball').length;
    const runsInOver = overBalls.reduce((s, b) => s + (b.runs_off_bat ?? 0) + (b.extras ?? 0), 0);
    const wicketsInOver = overBalls.filter(b => b.is_wicket).length;

    // Use submittedTotal as the base — it's initialized from DB at innings load and only
    // updated by submitOver itself. NEVER use currentInnings totals here: self-broadcast
    // inflates them via Math.max on every ball, causing double-counting at over boundaries.
    const baseRuns     = submittedTotal?.runs     ?? 0;
    const baseBalls    = submittedTotal?.balls     ?? 0;
    const baseWickets  = submittedTotal?.wickets   ?? 0;

    // Math.max against currentInnings totals: the broadcast handler keeps them
    // current per-ball, so they catch a stale submittedTotal base (reload
    // mid-innings). Without this, a chase could be "won" on screen while the
    // submitted total stays below target and innings_end never fires.
    const totalRunsOpt     = Math.max(baseRuns    + runsInOver,    currentInnings?.total_runs    ?? 0);
    const totalBallsOpt    = Math.max(baseBalls   + legalInOver,   currentInnings?.total_balls   ?? 0);
    const totalWicketsOpt  = Math.max(baseWickets + wicketsInOver, currentInnings?.total_wickets ?? 0);

    setSubmittedTotal({ runs: totalRunsOpt, balls: totalBallsOpt, wickets: totalWicketsOpt });
    setPendingBalls([]);
    // submittingOverRef.current is released in the finally block AFTER DB writes,
    // not here — releasing early would allow a second over to submit mid-write (bug C-2).

    const allOutLimit = battingPlayers.length || 10;
    const targetChased = currentInnings?.innings_number === 2 && currentInnings.target != null && totalRunsOpt >= currentInnings.target;
    const inningsOver = (totalBallsOpt >= (match?.overs ?? 0) * 6) || (totalWicketsOpt >= allOutLimit) || targetChased;

    try {
      if (inningsOver) {
        // Only show innings break modal for innings 1 — innings 2 goes straight to result
        if (currentInnings?.innings_number === 1) {
          setShowInningsBreak(true);
        }
        // Balls already inserted per-ball in addBall — only update innings totals
        if (currentInnings) {
          await (supabase.from('innings') as any).update({
            total_runs: totalRunsOpt,
            total_balls: totalBallsOpt,
            total_wickets: totalWicketsOpt }).eq('id', currentInnings.id);
        }
        await fetch(`${process.env.EXPO_PUBLIC_API_URL}/match/${code}/action`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            action: 'innings_end',
            data: { inningsId: currentInnings?.id, matchId: match?.id }
          })
        });
      } else {
        // Show bowler modal only if the last ball was NOT a wicket.
        // If it was a wicket, bowlerNeededAfterWicket is set by the wicket handler,
        // which opens the bowler modal AFTER the new batsman is selected (prevents freeze).
        const lastBallWasWicket = overBalls[overBalls.length - 1]?.is_wicket;
        if (!lastBallWasWicket) setShowBowler(true);
        // Balls already inserted — only update innings totals
        if (currentInnings) {
          await (supabase.from('innings') as any).update({
            total_runs: totalRunsOpt,
            total_balls: totalBallsOpt,
            total_wickets: totalWicketsOpt }).eq('id', currentInnings.id);
        }
      }
    } catch (e) {
      console.error('submitOver DB write failed:', e);
    } finally {
      // Always release the guard, even on error — the next over must be scoreable.
      submittingOverRef.current = false;
    }
  }, [currentInnings, battingPlayers, availableBatsmen, match, innings, teams, code, submittedTotal]);


  // Fix H-1: prevInnings may be null for up to ~300ms after innings_end API fires,
  // because the DB UPDATE (setting status='complete') hasn't arrived via postgres_changes yet.
  // If prevInnings is null, fall back to liveInnings (optimistic) for the runs total
  // so target is still computed correctly and innings 2 can always start.
  const handleStartInnings2 = async () => {
    setShowInningsBreak(false);
    if (!match) return;
    const innings1Runs = prevInnings?.total_runs ?? liveInnings?.total_runs ?? 0;
    const target = innings1Runs + 1;
    const batting1TeamId = prevInnings?.team_id ?? currentInnings?.team_id ?? '';
    const battingTeamId2 = batting1TeamId === match.team1_id ? match.team2_id : match.team1_id;

    try {
      await fetch(`${process.env.EXPO_PUBLIC_API_URL}/match/${code}/action`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'start_innings_2',
          data: {
            matchId: match.id,
            battingTeamId: battingTeamId2,
            target }
        })
      });
      sendLocalNotification('Innings Break Over', `2nd Innings is starting. Target: ${target} runs`);
      setStrikerId(''); setNonStrikerId(''); setBowlerId('');
      setSubmittedTotal(null); setPendingBalls([]);
      setDismissedIds(new Set());
      // Reset delivery counter — innings 2 starts from 0
      deliveryCounterRef.current = 0;
      refetch();
    } catch (e) {
      console.error('Failed to start innings 2', e);
    }
  };

  // Show innings break for ALL clients when match status transitions to innings_break
  // (scorer sets showInningsBreak directly in submitOver; viewers get it here via postgres_changes)
  useEffect(() => {
    if (match?.status === 'innings_break') {
      setShowInningsBreak(true);
    }
    // Auto-dismiss for ALL clients when innings 2 starts (covers viewers + new scorer).
    // The old scorer already dismissed it in handleStartInnings2; this catches everyone else.
    if (match?.status === 'innings_2' && showInningsBreak) {
      setShowInningsBreak(false);
      // Reset on-field state so the new scorer gets clean selection modals
      setStrikerId(''); setNonStrikerId(''); setBowlerId('');
      setSubmittedTotal(null); setPendingBalls([]);
      setDismissedIds(new Set());
      deliveryCounterRef.current = 0;
    }
  }, [match?.status]);

  // Navigate ALL clients to result screen the moment match.status === 'result'
  useEffect(() => {
    if (match?.status === 'result') {
      router.replace(`/match/${code}/result` as any);
    }
  }, [match?.status]);

  if (loading) {
    return <LoadingScreen message="Loading Match..." />;
  }

  return (
    <View style={styles.screen}>
      <SafeAreaView style={styles.safe}>
        {/* Header */}
        <View style={styles.header}>
          <TouchableOpacity onPress={() => router.back()} style={styles.backBtn}>
            <Text style={styles.backText}>←</Text>
          </TouchableOpacity>
          <Text style={styles.headerCode}>{code}</Text>
          {isScorer ? (
            <TouchableOpacity onPress={() => setShowSettings(true)} style={styles.backBtn}>
              <Text style={{ fontSize: 20 }}>⚙️</Text>
            </TouchableOpacity>
          ) : (
            <View style={{ width: 40 }} />
          )}
        </View>

        {/* Tabs */}
        <View style={styles.tabs}>
          {(['score', 'scorecard'] as const).map(tab => (
            <TouchableOpacity key={tab} style={[styles.tab, activeTab === tab && styles.tabActive]} onPress={() => setActiveTab(tab)}>
              <Text style={[styles.tabText, activeTab === tab && styles.tabTextActive]}>
                {tab === 'score' ? 'Live Score' : 'Scorecard'}
              </Text>
            </TouchableOpacity>
          ))}
        </View>

        <ScrollView 
          style={styles.scroll} 
          showsVerticalScrollIndicator={false}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor="#810100" colors={['#810100']} />}
        >
          {activeTab === 'score' && (
            <>
              <ScoreHeader innings={liveInnings} match={match} crr={crr} rrr={rrr} teams={teams} />
              <OverDots balls={currentOverBalls} />

              {isFreehitNext && (
                <View style={styles.freehitBanner}>
                  <Text style={styles.freehitText}>⚡ FREE HIT</Text>
                </View>
              )}

              <View style={styles.batsmenRow}>
                <BatsmanCard stats={strikerStats} isStriker={true} />
                <BatsmanCard stats={nonStrikerStats} isStriker={false} />
              </View>
              <BowlerCard stats={bowlerStats} />

              {/* Over history */}
              {overHistory.length > 0 && (
                <View style={styles.overHistoryCard}>
                  <Text style={styles.overHistoryTitle}>Over History</Text>
                  {overHistory.slice().reverse().map(ov => (
                    <View key={ov.overNumber} style={styles.overRow}>
                      <Text style={styles.overNum}>Over {ov.overNumber}</Text>
                      <View style={styles.overBalls}>
                        {ov.balls.map((b, i) => (
                          <View key={i} style={[dotStyles.dot, b.isWicket ? dotStyles.wicket : b.isSix ? dotStyles.six : b.isBoundary ? dotStyles.four : b.isWide || b.isNoBall ? dotStyles.extra : dotStyles.normal, { width: 28, height: 28 }]}>
                            <Text style={dotStyles.dotText}>{b.label}</Text>
                          </View>
                        ))}
                      </View>
                      <Text style={styles.overTotal}>{ov.runs} runs</Text>
                    </View>
                  ))}
                </View>
              )}
            </>
          )}

          {activeTab === 'scorecard' && (() => {
            // One scorecard block per innings — both teams, not just the live one
            const sortedInnings = [...innings].sort((a: any, b: any) => (a.innings_number ?? 0) - (b.innings_number ?? 0));
            return sortedInnings.map((inn: any) => {
            const isActiveInn = inn.id === currentInnings?.id;
            const cardBalls = isActiveInn ? inningsBalls : balls.filter(b => b.innings_id === inn.id);
            const cardBattingTeam = teams?.find((t: any) => t.id === inn.team_id);
            const cardBowlTeamId = inn.team_id === match?.team1_id ? match?.team2_id : match?.team1_id;
            const cardBowlingTeam = teams?.find((t: any) => t.id === cardBowlTeamId);
            const cardBattingPlayers = [...players.filter(p => p.team_id === inn.team_id && !p.is_joker), ...jokerPlayers];
            const cardBowlingPlayers = [...players.filter(p => p.team_id === cardBowlTeamId && !p.is_joker), ...jokerPlayers];
            const cardTotals = isActiveInn && liveInnings ? liveInnings : inn;

            // Build dismissal lookup: which ball dismissed each batsman
            const dismissalMap = new Map<string, any>();
            cardBalls.forEach(b => {
              if (b.is_wicket && b.batsman_id) dismissalMap.set(b.batsman_id, b);
            });

            // Extras total
            const extrasTotal = cardBalls.reduce((s, b) => s + (b.extras ?? 0), 0);
            const wides = cardBalls.filter(b => b.extra_type === 'wide').length;
            const noBalls = cardBalls.filter(b => b.extra_type === 'noball').length;
            const byes = cardBalls.filter(b => b.extra_type === 'bye').reduce((s, b) => s + (b.extras ?? 0), 0);
            const legByes = cardBalls.filter(b => b.extra_type === 'legbye').reduce((s, b) => s + (b.extras ?? 0), 0);

            return (
              <View key={inn.id} style={styles.scorecardContainer}>
                {/* ── BATTING ── */}
                <View style={styles.scorecardSection}>
                  <View style={styles.scorecardHeaderRow}>
                    <Text style={[styles.scorecardHeaderName]}>{(cardBattingTeam?.name ?? 'BATTING').toUpperCase()} — BATTING</Text>
                    <Text style={styles.scorecardHeaderStat}>R</Text>
                    <Text style={styles.scorecardHeaderStat}>B</Text>
                    <Text style={styles.scorecardHeaderStat}>4s</Text>
                    <Text style={styles.scorecardHeaderStat}>6s</Text>
                    <Text style={styles.scorecardHeaderStat}>SR</Text>
                  </View>

                  {cardBattingPlayers.map(p => {
                    const isOnStrike = isActiveInn && p.id === strikerId;
                    const isNonStriker = isActiveInn && p.id === nonStrikerId;
                    const dismissalBall = dismissalMap.get(p.id);
                    const st = calcBatsmanStats(p, cardBalls, isOnStrike, dismissalBall);
                    const hasBatted = st.balls > 0 || st.isOut;
                    const isActive = isOnStrike || isNonStriker;
                    const yetToBat = !hasBatted && !isActive;

                    return (
                      <View key={p.id} style={[
                        styles.scorecardRow,
                        isOnStrike && styles.scorecardRowActive,
                        yetToBat && { opacity: 0.5 },
                      ]}>
                        <View style={styles.scorecardNameCol}>
                          <Text style={[
                            styles.scorecardName,
                            isOnStrike && { color: '#810100', fontFamily: 'Outfit_800ExtraBold' },
                            st.isOut && { color: '#9A9390' },
                            yetToBat && { color: '#9A9390' },
                          ]}>
                            {p.name}{isOnStrike ? ' *' : isNonStriker ? ' †' : ''}
                          </Text>
                          {yetToBat && <Text style={styles.scorecardDismissal}>yet to bat</Text>}
                          {st.isOut && st.dismissal && (
                            <Text style={styles.scorecardDismissal}>{st.dismissal}</Text>
                          )}
                          {!st.isOut && hasBatted && !isOnStrike && !isNonStriker && (
                            <Text style={styles.scorecardDismissal}>not out</Text>
                          )}
                        </View>
                        <Text style={[styles.scorecardStatCell, isOnStrike && { color: '#810100', fontFamily: 'Outfit_800ExtraBold' }, (st.isOut || yetToBat) && { color: '#9A9390' }]}>{yetToBat ? '-' : st.runs}</Text>
                        <Text style={[styles.scorecardStatCell, (st.isOut || yetToBat) && { color: '#9A9390' }]}>{yetToBat ? '-' : st.balls}</Text>
                        <Text style={[styles.scorecardStatCell, (st.isOut || yetToBat) && { color: '#9A9390' }]}>{yetToBat ? '-' : st.fours}</Text>
                        <Text style={[styles.scorecardStatCell, (st.isOut || yetToBat) && { color: '#9A9390' }]}>{yetToBat ? '-' : st.sixes}</Text>
                        <Text style={[styles.scorecardStatCell, (st.isOut || yetToBat) && { color: '#9A9390' }]}>{yetToBat ? '-' : st.strikeRate.toFixed(1)}</Text>
                      </View>
                    );
                  })}

                  {/* Extras */}
                  <View style={styles.scorecardExtrasRow}>
                    <Text style={styles.scorecardExtrasLabel}>Extras</Text>
                    <Text style={styles.scorecardExtrasValue}>{extrasTotal}</Text>
                    <Text style={styles.scorecardExtraBreakdown}>
                      (wd {wides}, nb {noBalls}, b {byes}, lb {legByes})
                    </Text>
                  </View>

                  {/* Total */}
                  <View style={styles.scorecardTotalRow}>
                    <Text style={styles.scorecardTotalLabel}>Total</Text>
                    <Text style={styles.scorecardTotalValue}>
                      {cardTotals?.total_runs ?? 0}/{cardTotals?.total_wickets ?? 0}
                      {'  '}
                      <Text style={styles.scorecardTotalOvers}>
                        ({formatOvers(cardTotals?.total_balls ?? 0)} ov)
                      </Text>
                    </Text>
                  </View>
                </View>

                {/* ── BOWLING ── */}
                <View style={[styles.scorecardSection, { marginTop: 12 }]}>
                  <View style={styles.scorecardHeaderRow}>
                    <Text style={styles.scorecardHeaderName}>{(cardBowlingTeam?.name ?? 'BOWLING').toUpperCase()} — BOWLING</Text>
                    <Text style={styles.scorecardHeaderStat}>O</Text>
                    <Text style={styles.scorecardHeaderStat}>M</Text>
                    <Text style={styles.scorecardHeaderStat}>R</Text>
                    <Text style={styles.scorecardHeaderStat}>W</Text>
                    <Text style={styles.scorecardHeaderStat}>ECO</Text>
                  </View>

                  {cardBowlingPlayers.map(p => {
                    const bs = calcBowlerStats(p, cardBalls);
                    const isCurrentBowler = isActiveInn && p.id === bowlerId;
                    // Show all bowlers who have bowled at least 1 ball, plus current bowler
                    if (bs.overs === 0 && !isCurrentBowler) return null;
                    const legalBalls = Math.floor(bs.overs) * 6 + Math.round((bs.overs % 1) * 10);
                    return (
                      <View key={p.id} style={[styles.scorecardRow, isCurrentBowler && styles.scorecardRowActive]}>
                        <View style={styles.scorecardNameCol}>
                          <Text style={[styles.scorecardName, isCurrentBowler && { color: '#810100', fontFamily: 'Outfit_800ExtraBold' }]}>
                            {p.name}{isCurrentBowler ? ' *' : ''}
                          </Text>
                        </View>
                        <Text style={[styles.scorecardStatCell, isCurrentBowler && { color: '#810100' }]}>{formatOvers(legalBalls)}</Text>
                        <Text style={styles.scorecardStatCell}>{bs.maidens}</Text>
                        <Text style={styles.scorecardStatCell}>{bs.runs}</Text>
                        <Text style={[styles.scorecardStatCell, bs.wickets > 0 && { color: '#810100', fontFamily: 'Outfit_700Bold' }]}>{bs.wickets}</Text>
                        <Text style={styles.scorecardStatCell}>{bs.economy.toFixed(1)}</Text>
                      </View>
                    );
                  })}
                </View>
              </View>
            );
            });
          })()}

          <View style={{ height: 200 }} />
        </ScrollView>

        {/* Scoring Pad (scorer only, only during an active innings) */}
        {canScoreNow && activeTab === 'score' && currentInnings && match?.status !== 'innings_break' && match?.status !== 'result' && (
          <View style={styles.pad}>

            {/* NB mode banner */}
            {noBallMode && (
              <View style={styles.noBallBanner}>
                <Text style={styles.noBallBannerText}>⚡ NO BALL — tap runs scored off the bat</Text>
                <TouchableOpacity onPress={() => setNoBallMode(false)}>
                  <Text style={styles.noBallCancel}>Cancel</Text>
                </TouchableOpacity>
              </View>
            )}

            {/* Run buttons & Quick Undo */}
            <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-end', marginBottom: 6 }}>
              <Text style={{ fontFamily: 'Outfit_600SemiBold', fontSize: 12, color: '#9A9390', marginLeft: 4, marginBottom: 2 }}>Runs Off Bat</Text>
              <TouchableOpacity 
                style={{ paddingVertical: 6, paddingHorizontal: 12, backgroundColor: 'rgba(211, 47, 47, 0.08)', borderRadius: 12, borderWidth: 1, borderColor: 'rgba(211, 47, 47, 0.2)' }}
                onPress={async () => {
                  Alert.alert('Confirm Undo', 'Are you sure you want to completely remove the last ball bowled in this innings?', [
                    { text: 'Cancel', style: 'cancel' },
                    { text: 'Undo Ball', style: 'destructive', onPress: async () => {
                        setStrikerId('');
                        setNonStrikerId('');
                        setBowlerId('');
                        if (pendingBalls.length > 0) {
                          const lastPending = pendingBalls[pendingBalls.length - 1];
                          setPendingBalls(prev => prev.slice(0, -1));
                          await (supabase.from('balls') as any).delete()
                            .eq('innings_id', currentInnings?.id)
                            .eq('delivery_number', lastPending.delivery_number);
                          deliveryCounterRef.current = Math.max(0, deliveryCounterRef.current - 1);
                          refetch();
                        } else {
                          await fetch(`${process.env.EXPO_PUBLIC_API_URL}/match/${code}/action`, {
                            method: 'POST',
                            headers: { 'Content-Type': 'application/json' },
                            body: JSON.stringify({ action: 'undo_last_ball', data: { matchId: match?.id, inningsId: currentInnings?.id } })
                          });
                          refetch();
                        }
                    }}
                  ]);
                }}
              >
                <Text style={{ color: '#d32f2f', fontFamily: 'Outfit_800ExtraBold', fontSize: 13 }}>↩️ Undo Last Ball</Text>
              </TouchableOpacity>
            </View>

            <View style={styles.runRow}>
              {[0, 1, 2, 3, 4, 6].map(r => (
                <TouchableOpacity
                  key={r}
                  style={[styles.runBtn,
                    (r === 4 || r === 6) ? styles.boundaryBtn : null,
                    noBallMode ? styles.noBallRunBtn : null]}
                  onPress={() => {
                    if (noBallMode) {
                      // NB + runs off bat (no rotation on NB; rotation handled inside addBall)
                      addBall({ extraType: 'noball', runsOffBat: r });
                    } else {
                      addBall({ runsOffBat: r });
                    }
                  }}
                >
                  <Text style={[styles.runBtnText,
                    (r === 4 || r === 6) ? styles.boundaryBtnText : null,
                    noBallMode ? { color: '#e67e00' } : null]}>
                    {noBallMode ? `NB+${r}` : r}
                  </Text>
                </TouchableOpacity>
              ))}
            </View>

            {/* Action row */}
            <View style={styles.actionRow}>
              <TouchableOpacity style={styles.actionBtn} onPress={() => addBall({ extraType: 'wide' })}>
                <Text style={styles.actionBtnText}>Wd</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.actionBtn, noBallMode && { backgroundColor: 'rgba(230,126,0,0.15)', borderColor: '#e67e00' }]}
                onPress={() => setNoBallMode(m => !m)}
              >
                <Text style={[styles.actionBtnText, noBallMode && { color: '#e67e00', fontFamily: 'Outfit_900Black' }]}>NB</Text>
              </TouchableOpacity>
              <TouchableOpacity style={styles.actionBtn} onPress={() => addBall({ extraType: 'bye', extraRuns: 1 })}>
                <Text style={styles.actionBtnText}>B</Text>
              </TouchableOpacity>
              <TouchableOpacity style={styles.actionBtn} onPress={() => addBall({ extraType: 'legbye', extraRuns: 1 })}>
                <Text style={styles.actionBtnText}>LB</Text>
              </TouchableOpacity>
              <TouchableOpacity style={styles.actionBtn} onPress={() => setShowDroppedCatch(true)}>
                <Text style={[styles.actionBtnText, { color: '#ef4444' }]}>Drop</Text>
              </TouchableOpacity>
              <TouchableOpacity style={styles.wicketBtn} onPress={() => setShowWicket(true)}>
                <Text style={styles.wicketBtnText}>WICKET</Text>
              </TouchableOpacity>
            </View>

            {/* Batsman/Bowler quick swap */}
            <View style={styles.swapRow}>
              <TouchableOpacity style={styles.swapBtn} onPress={() => setShowBatsman(true)}>
                <Text style={styles.swapBtnText}>🏏 {striker?.name ?? 'Striker'}</Text>
              </TouchableOpacity>
              
              <TouchableOpacity style={[styles.swapBtn, { flex: 0, paddingHorizontal: 12, backgroundColor: 'rgba(0,0,0,0.03)' }]} onPress={() => {
                const s = strikerId;
                setStrikerId(nonStrikerId!);
                setNonStrikerId(s);
              }}>
                <Text style={styles.swapBtnText}>🔄</Text>
              </TouchableOpacity>

              <TouchableOpacity style={styles.swapBtn} onPress={() => setShowNonStriker(true)}>
                <Text style={styles.swapBtnText}>🏏 {nonStriker?.name ?? 'Non-Striker'}</Text>
              </TouchableOpacity>

              <TouchableOpacity style={styles.swapBtn} onPress={() => setShowBowler(true)}>
                <Text style={styles.swapBtnText}>🎳 {bowler?.name ?? 'Bowler'}</Text>
              </TouchableOpacity>
            </View>
          </View>
        )}
      </SafeAreaView>

      {/* Modals */}
      <WicketModal
        visible={showWicket}
        onSelect={(type: WicketType) => {
          setShowWicket(false);
          if (type === 'runout') {
            // Run-out needs extra info: runs completed + who is out
            setShowRunOut(true);
          } else if (type === 'caught') {
            // Caught needs fielder selection
            setShowCaughtWicket(true);
          } else {
            // All other wickets: dismissed batsman is always the striker
            const overEnds = ((submittedTotal?.balls ?? 0) + pendingLegal + 1) % 6 === 0;
            addBall({ isWicket: true, wicketType: type });
            if (availableBatsmen.length > 0) {
              // If over ends after this wicket, show batsman modal first
              // then bowler modal afterward (prevents freeze from both opening together).
              // New batsman starts as NON-STRIKER when the over ends (ends swap).
              setBowlerNeededAfterWicket(overEnds);
              setNewBatsmanIsNonStriker(overEnds);
              setShowBatsman(true);
            } else {
              // Single batting: survivor takes strike
              if (nonStrikerId) {
                setStrikerId(nonStrikerId);
                setNonStrikerId('');
              } else {
                setStrikerId('');
              }
              if (overEnds) setShowBowler(true);
            }
          }
        }}
        onClose={() => setShowWicket(false)}
      />

      <RunOutModal
        visible={showRunOut}
        strikerName={striker?.name ?? 'Striker'}
        nonStrikerName={nonStriker?.name ?? 'Non-Striker'}
        bowlingPlayers={bowlingPlayers}
        onConfirm={({ runsCompleted, whoIsOut, fielderId }: any) => {
          setShowRunOut(false);
          // Determine who is dismissed and where the live batsman ends up.
          //
          // Logic:
          //   Even runs completed → batsmen are at original ends
          //     striker out  → live (NS) stays as non-striker; new batsman ON STRIKE
          //     NS out       → live (striker) stays ON STRIKE; new batsman as non-striker
          //   Odd runs completed → batsmen crossed
          //     striker out  → live (NS) is now at striker's end → NS ON STRIKE; new batsman as non-striker
          //     NS out       → live (striker) is now at non-striker's end → new batsman ON STRIKE; striker becomes non-striker
          const crossed = runsCompleted % 2 === 1;
          const strikerIsOut = whoIsOut === 'striker';

          // ID of the dismissed player for the ball record
          const dismissedId = strikerIsOut ? strikerId : nonStrikerId;
          const survivorId = strikerIsOut ? nonStrikerId : strikerId;

          // After this delivery, who is on strike (before new batsman comes in)?
          // 'survivorOnStrike' = true means the survivor is at the striker's end.
          const survivorOnStrike = crossed ? strikerIsOut : !strikerIsOut;
          //   crossed & strikerIsOut  → NS crossed to striker end → survivor (NS) ON STRIKE ✓
          //   crossed & NSIsOut       → striker crossed to NS end → survivor (striker) NOT on strike
          //   not crossed & strikerIsOut → NS still at NS end → survivor NOT on strike
          //   not crossed & NSIsOut   → striker still at striker end → survivor ON STRIKE ✓

          const overEnds = ((submittedTotal?.balls ?? 0) + pendingLegal + 1) % 6 === 0;

          // Record the ball — runs go to the team, dismissal to the correct batsman
          addBall({
            runsOffBat: runsCompleted,
            isWicket: true,
            wicketType: 'runout',
            batsmanIdOverride: dismissedId,  // record the DISMISSED player on the ball
            fielderIdOverride: fielderId,
          });

          const isSingleBatting = (submittedTotal?.wickets ?? 0) + pendingWickets + 1 >= (battingPlayers.length || 10) - 1;

          if (isSingleBatting) {
            // Single Batting: Survivor always takes strike, no ends swap
            setStrikerId(survivorId);
            setNonStrikerId('');
            if (overEnds) setShowBowler(true);
          } else {
            if (survivorOnStrike && !overEnds) {
              // Survivor is on strike
              setStrikerId(survivorId);
              setNonStrikerId(''); // cleared — new batsman will fill the non-striker slot
            } else if (!survivorOnStrike && !overEnds) {
              // Survivor is NOT on strike — they're the non-striker
              setNonStrikerId(survivorId);
              setStrikerId(''); // new batsman is the striker
            } else if (overEnds) {
              // Over just ended — ends swap again for the new over
              // After over: striker's end becomes non-striker's end
              // survivorOnStrike at end of THIS over → they'll be non-striker for next over
              if (survivorOnStrike) {
                setNonStrikerId(survivorId); // currently striker, but over ends → becomes NS
                setStrikerId('');
              } else {
                setStrikerId(survivorId); // currently non-striker, over ends → becomes striker
                setNonStrikerId('');
              }
            }

            // Show new batsman modal
            if (availableBatsmen.length > 0) {
              setBowlerNeededAfterWicket(overEnds);
              setNewBatsmanIsNonStriker(
                overEnds
                  ? !survivorOnStrike  // if survivor is NS after over-end, new batsman is striker
                  : survivorOnStrike   // if survivor is on strike, new batsman is non-striker
              );
              setShowBatsman(true);
            }
          }
        }}
        onClose={() => { setShowRunOut(false); }}
      />

      <CaughtModal
        visible={showCaughtWicket}
        bowlingPlayers={bowlingPlayers}
        onConfirm={(fielderId: string) => {
          setShowCaughtWicket(false);
          const overEnds = ((submittedTotal?.balls ?? 0) + pendingLegal + 1) % 6 === 0;
          addBall({ isWicket: true, wicketType: 'caught', fielderIdOverride: fielderId });
          if (availableBatsmen.length > 0) {
            setBowlerNeededAfterWicket(overEnds);
            setNewBatsmanIsNonStriker(overEnds);
            setShowBatsman(true);
          } else {
            // Single batting: survivor takes strike
            if (nonStrikerId) {
              setStrikerId(nonStrikerId);
              setNonStrikerId('');
            } else {
              setStrikerId('');
            }
            if (overEnds) setShowBowler(true);
          }
        }}
        onClose={() => setShowCaughtWicket(false)}
      />

      <DroppedCatchModal
        visible={showDroppedCatch}
        bowlingPlayers={bowlingPlayers}
        onConfirm={({ runsScored, fielderId }: any) => {
          setShowDroppedCatch(false);
          addBall({ runsOffBat: runsScored, isWicket: false, wicketType: null, fielderIdOverride: fielderId });
        }}
        onClose={() => setShowDroppedCatch(false)}
      />

      <PlayerSelectModal
        visible={showBatsman}
        title={newBatsmanIsNonStriker ? 'Select New Batsman (Non-Striker)' : 'Select New Batsman'}
        players={availableBatsmen}
        onSelect={(id: string) => {
          // Place new batsman at the correct end
          if (newBatsmanIsNonStriker) {
            setNonStrikerId(id);
            // Striker should already be the survivor from run-out or previous logic
          } else {
            setStrikerId(id);
            // For normal wickets, ensure non-striker is set from previous state
          }
          setNewBatsmanIsNonStriker(false);
          setShowBatsman(false);
          // If over ended just before the wicket, now show bowler modal
          if (bowlerNeededAfterWicket) {
            setBowlerNeededAfterWicket(false);
            setShowBowler(true);
          }
        }}
        onClose={() => { setShowBatsman(false); setBowlerNeededAfterWicket(false); setNewBatsmanIsNonStriker(false); }}
      />

      <PlayerSelectModal
        visible={showNonStriker}
        title="Select Non-Striker"
        players={battingPlayers.filter(p => p.id !== strikerId)}
        onSelect={(id: string) => { setNonStrikerId(id); setShowNonStriker(false); }}
        onClose={() => setShowNonStriker(false)}
      />

      <PlayerSelectModal
        visible={showBowler}
        title="Select Bowler"
        players={bowlingPlayers}
        onSelect={(id: string) => { 
          setShowBowler(false); 
          if (pendingBalls.length > 0) {
            setShowBowlerOptions(id);
          } else {
            setBowlerId(id);
          }
        }}
        onClose={() => setShowBowler(false)}
      />

      {/* Bowler Change Options Modal */}
      <Modal visible={!!showBowlerOptions} animationType="slide" transparent>
        <View style={modalStyles.overlay}>
          <View style={[modalStyles.sheet, { padding: 20 }]}>
            <Text style={modalStyles.title}>Bowler Change Options</Text>
            <Text style={{ color: '#aaa', textAlign: 'center', marginBottom: 20 }}>
              You are changing the bowler mid-over. How do you want to handle the {pendingBalls.length} balls bowled so far?
            </Text>
            
            <TouchableOpacity style={[wicketStyles.btn, { backgroundColor: '#FFFFFF', padding: 16, borderRadius: 12, marginBottom: 12, shadowColor: '#630102', shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.05, shadowRadius: 12, elevation: 2, borderWidth: 0 }]} onPress={() => {
              // Continue the over
              setBowlerId(showBowlerOptions!);
              setShowBowlerOptions(null);
            }}>
              <Text style={{ color: '#111111', fontFamily: 'Outfit_400Regular', fontSize: 16 }}>Continue the Over</Text>
              <Text style={{ color: '#666666', fontFamily: 'Outfit_400Regular', fontSize: 12, marginTop: 4 }}>New bowler finishes the remaining balls of this over.</Text>
            </TouchableOpacity>

            <TouchableOpacity style={[wicketStyles.btn, { backgroundColor: '#FFFFFF', padding: 16, borderRadius: 12, marginBottom: 12, shadowColor: '#630102', shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.05, shadowRadius: 12, elevation: 2, borderWidth: 0 }]} onPress={async () => {
              // Wipe runs: delete the already fire-and-forget inserted DB balls for this partial over,
              // then reset local state. Without the DB delete, those balls persist and corrupt career stats.
              const overToWipe = currentOverNum;
              const inningsIdToWipe = currentInnings?.id;
              setPendingBalls([]);
              setSubmittedTotal(null);
              setBowlerId(showBowlerOptions!);
              setShowBowlerOptions(null);
              // Rollback the delivery counter to before these partial-over balls
              const partialCount = pendingBalls.length;
              deliveryCounterRef.current = Math.max(0, deliveryCounterRef.current - partialCount);
              if (inningsIdToWipe) {
                await (supabase.from('balls') as any)
                  .delete()
                  .eq('innings_id', inningsIdToWipe)
                  .eq('over_number', overToWipe);
                refetch();
              }
            }}>
              <Text style={{ color: '#111111', fontFamily: 'Outfit_400Regular', fontSize: 16 }}>Start Fresh Over (Wipe Runs)</Text>
              <Text style={{ color: '#666666', fontFamily: 'Outfit_400Regular', fontSize: 12, marginTop: 4 }}>Discards the balls and runs bowled so far in this over. Starts 0.0 again.</Text>
            </TouchableOpacity>

            <TouchableOpacity style={[wicketStyles.btn, { backgroundColor: '#FFFFFF', padding: 16, borderRadius: 12, marginBottom: 20, shadowColor: '#630102', shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.05, shadowRadius: 12, elevation: 2, borderWidth: 0 }]} onPress={async () => {
              // Start fresh over keep runs
              // To achieve this without API schema changes, we submit the pending runs as Penalty runs (extras) 
              // and wipe the balls, so stats don't count the balls but runs are added to total.
              const runsToKeep = pendingBalls.reduce((s, b) => s + (b.runs_off_bat ?? 0) + (b.extras ?? 0), 0);
              setPendingBalls([]);
              
              if (runsToKeep > 0 && currentInnings) {
                // Submit a dummy ball with penalty runs to keep the score, but 0 legal balls
                await (supabase.from('balls') as any).insert({
                  innings_id: currentInnings.id,
                  over_number: currentOverNum,
                  ball_number: 0,
                delivery_number: deliveryCounterRef.current++,
                  batsman_id: strikerId,
                  bowler_id: showBowlerOptions!,
                  extras: runsToKeep,
                  extra_type: 'penalty',
                  is_wicket: false
                });
                await (supabase.from('innings') as any).update({
                  total_runs: currentInnings.total_runs + runsToKeep,
                  current_bowler_id: showBowlerOptions!
                }).eq('id', currentInnings.id);
                refetch();
              }
              
              setBowlerId(showBowlerOptions!);
              setShowBowlerOptions(null);
            }}>
              <Text style={{ color: '#111111', fontFamily: 'Outfit_400Regular', fontSize: 16 }}>Start Fresh Over (Keep Runs)</Text>
              <Text style={{ color: '#666666', fontFamily: 'Outfit_400Regular', fontSize: 12, marginTop: 4 }}>Converts runs scored so far to Penalty Extras and restarts over at 0.0.</Text>
            </TouchableOpacity>

            <TouchableOpacity style={modalStyles.cancelBtn} onPress={() => setShowBowlerOptions(null)}>
              <Text style={modalStyles.cancelText}>Cancel</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>

      {/* Match Settings Modal */}
      <Modal visible={showSettings} animationType="slide" transparent>
        <View style={modalStyles.overlay}>
          <View style={[modalStyles.sheet, { padding: 20 }]}>
            <Text style={modalStyles.title}>Match Settings</Text>
            
            <TouchableOpacity style={[modalStyles.cancelBtn, { backgroundColor: 'rgba(129, 1, 0, 0.1)', borderColor: '#E5E5EA', borderWidth: 1, marginBottom: 12 }]} onPress={() => {
              Alert.prompt(
                'Change Overs',
                'Enter new total overs for this match:',
                [
                  { text: 'Cancel', style: 'cancel' },
                  { text: 'Update', onPress: async (val) => {
                    const newOvers = parseInt(val ?? '0');
                    if (newOvers > 0 && newOvers <= 50) {
                      await fetch(`${process.env.EXPO_PUBLIC_API_URL}/match/${code}/action`, {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({ action: 'update_match_details', data: { matchId: match?.id, overs: newOvers } })
                      });
                      setShowSettings(false);
                      refetch();
                    } else {
                      Alert.alert('Invalid', 'Overs must be between 1 and 50');
                    }
                  }}
                ],
                'plain-text',
                match?.overs?.toString()
              );
            }}>
              <Text style={{ color: '#810100', fontFamily: 'Outfit_800ExtraBold', fontSize: 16 }}>Edit Overs</Text>
            </TouchableOpacity>

            {/* Transfer Scorer — only for active scorers */}
            {canScoreNow && (
              <TouchableOpacity
                style={[modalStyles.cancelBtn, { backgroundColor: 'rgba(10,132,255,0.08)', borderColor: '#0a84ff33', borderWidth: 1, marginBottom: 12 }]}
                onPress={() => { setShowSettings(false); setShowTransferScorer(true); }}
              >
                <Text style={{ color: '#0a84ff', fontFamily: 'Outfit_800ExtraBold', fontSize: 16 }}>🔄 Transfer Scorer Role</Text>
                <Text style={{ color: '#9A9390', fontFamily: 'Outfit_400Regular', fontSize: 12, marginTop: 2 }}>Assign scoring to a teammate and become a viewer</Text>
              </TouchableOpacity>
            )}

            <TouchableOpacity style={modalStyles.cancelBtn} onPress={() => setShowSettings(false)}>
              <Text style={modalStyles.cancelText}>Close</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>

      {/* Transfer Scorer Modal */}
      <PlayerSelectModal
        visible={showTransferScorer}
        title="Transfer Scorer Role To…"
        players={(() => {
          // List teammates (same team, not self, not joker)
          const myTeamId = myPlayer?.team_id;
          return players.filter(p => p.team_id === myTeamId && p.id !== myPlayer?.id && !p.is_joker);
        })()}
        onSelect={async (newScorerId: string) => {
          setShowTransferScorer(false);
          if (!myPlayer) return;
          try {
            // Remove scorer from current player, grant to new player
            await Promise.all([
              (supabase.from('players') as any).update({ is_scorer: false }).eq('id', myPlayer.id),
              (supabase.from('players') as any).update({ is_scorer: true }).eq('id', newScorerId),
            ]);
            refetch();
            Alert.alert('Done', 'Scorer role transferred! You are now a viewer.');
          } catch (e: any) {
            Alert.alert('Error', e.message);
          }
        }}
        onClose={() => setShowTransferScorer(false)}
      />

      <InningsBreakModal
        visible={showInningsBreak}
        innings={prevInnings ?? liveInnings}
        match={match}
        teams={teams}
        isScorer={canStartInnings2}
        onStartInnings2={handleStartInnings2}
        onClose={() => setShowInningsBreak(false)}
        onRefresh={refetch}
      />
    </View>
  );
}

// ─── Styles ───────────────────────────────────────────────────────────────────
const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: '#EDEBDE' },
  safe: { flex: 1 },
  center: { flex: 1, backgroundColor: '#EDEBDE', alignItems: 'center', justifyContent: 'center' },
  header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', padding: 16, backgroundColor: '#FFFFFF', borderBottomWidth: 1, borderBottomColor: 'rgba(99, 1, 2, 0.08)' },
  backBtn: { width: 40, height: 40, alignItems: 'center', justifyContent: 'center' },
  backText: { color: '#810100', fontSize: 22 },
  headerCode: { color: '#111111', fontFamily: 'Outfit_400Regular', fontSize: 14, letterSpacing: 2 },
  tabs: { flexDirection: 'row', backgroundColor: '#FFFFFF', padding: 4, margin: 12, borderRadius: 14, shadowColor: '#1B1716', shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.05, shadowRadius: 6, elevation: 1 },
  tab: { flex: 1, paddingVertical: 10, borderRadius: 10, alignItems: 'center' },
  tabActive: { backgroundColor: '#810100' },
  tabText: { color: '#9A9390', fontFamily: 'Outfit_700Bold', fontSize: 13 },
  tabTextActive: { color: '#FFFFFF', fontFamily: 'Outfit_800ExtraBold', fontSize: 13 },
  scroll: { flex: 1 },
  freehitBanner: { marginHorizontal: 12, marginBottom: 8, backgroundColor: '#ffd60a20', borderRadius: 8, padding: 10, alignItems: 'center', borderWidth: 1, borderColor: '#ffd60a' },
  freehitText: { color: '#ffd60a', fontFamily: 'Outfit_900Black', fontSize: 15, letterSpacing: 1 },
  batsmenRow: { flexDirection: 'row', gap: 8, paddingHorizontal: 12, marginBottom: 8 },
  overHistoryCard: { backgroundColor: '#FFFFFF', marginHorizontal: 12, borderRadius: 14, padding: 14, marginBottom: 12, shadowColor: '#630102', shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.05, shadowRadius: 12, elevation: 2, borderWidth: 0 },
  overHistoryTitle: { color: '#888888', fontFamily: 'Outfit_400Regular', fontSize: 11, letterSpacing: 1, marginBottom: 10 },
  overRow: { flexDirection: 'row', alignItems: 'center', gap: 8, paddingVertical: 6, borderBottomWidth: 1, borderBottomColor: 'rgba(99, 1, 2, 0.1)' },
  overNum: { color: '#888888', fontFamily: 'Outfit_400Regular', fontSize: 12, width: 50 },
  overBalls: { flex: 1, flexDirection: 'row', gap: 4 },
  overTotal: { color: '#111111', fontFamily: 'Outfit_400Regular', fontSize: 12, width: 50, textAlign: 'right' },
  scorecardContainer: { paddingHorizontal: 12, paddingTop: 8, paddingBottom: 4 },
  scorecardSection: { backgroundColor: '#FFFFFF', borderRadius: 16, overflow: 'hidden', shadowColor: '#630102', shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.06, shadowRadius: 12, elevation: 2 },
  scorecardHeaderRow: { flexDirection: 'row', alignItems: 'center', backgroundColor: '#810100', paddingHorizontal: 14, paddingVertical: 10 },
  scorecardHeaderName: { flex: 1, color: '#FFFFFF', fontFamily: 'Outfit_800ExtraBold', fontSize: 11, letterSpacing: 1.2 },
  scorecardHeaderStat: { width: 38, color: 'rgba(255,255,255,0.8)', fontFamily: 'Outfit_700Bold', fontSize: 11, textAlign: 'right' },
  scorecardRow: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 14, paddingVertical: 10, borderBottomWidth: 1, borderBottomColor: 'rgba(99,1,2,0.06)' },
  scorecardRowActive: { backgroundColor: 'rgba(129,1,0,0.04)' },
  scorecardNameCol: { flex: 1, gap: 2 },
  scorecardName: { color: '#1B1716', fontFamily: 'Outfit_600SemiBold', fontSize: 14 },
  scorecardDismissal: { color: '#9A9390', fontFamily: 'Outfit_400Regular', fontSize: 11 },
  scorecardStatCell: { width: 38, color: '#1B1716', fontFamily: 'Outfit_600SemiBold', fontSize: 14, textAlign: 'right' },
  scorecardExtrasRow: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 14, paddingVertical: 10, borderBottomWidth: 1, borderBottomColor: 'rgba(99,1,2,0.06)', gap: 8 },
  scorecardExtrasLabel: { color: '#9A9390', fontFamily: 'Outfit_600SemiBold', fontSize: 13, width: 60 },
  scorecardExtrasValue: { color: '#1B1716', fontFamily: 'Outfit_700Bold', fontSize: 14, width: 28 },
  scorecardExtraBreakdown: { color: '#9A9390', fontFamily: 'Outfit_400Regular', fontSize: 12, flex: 1 },
  scorecardTotalRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 14, paddingVertical: 12, backgroundColor: 'rgba(129,1,0,0.04)' },
  scorecardTotalLabel: { color: '#810100', fontFamily: 'Outfit_800ExtraBold', fontSize: 14 },
  scorecardTotalValue: { color: '#810100', fontFamily: 'Outfit_800ExtraBold', fontSize: 18 },
  scorecardTotalOvers: { color: '#9A9390', fontFamily: 'Outfit_400Regular', fontSize: 14 },
  // deprecated — kept for reference
  scorecardTitle: { color: '#810100', fontSize: 12, fontFamily: 'Outfit_800ExtraBold', letterSpacing: 1, marginBottom: 8 },
  scorecardStat: { flex: 1, color: '#666666', fontFamily: 'Outfit_400Regular', fontSize: 12, textAlign: 'right' },

  noBallBanner: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', backgroundColor: 'rgba(230,126,0,0.12)', borderRadius: 10, paddingHorizontal: 12, paddingVertical: 8, borderWidth: 1, borderColor: '#e67e0055' },
  noBallBannerText: { color: '#e67e00', fontFamily: 'Outfit_700Bold', fontSize: 13, flex: 1 },
  noBallCancel: { color: '#e67e00', fontFamily: 'Outfit_700Bold', fontSize: 13, paddingLeft: 8 },
  noBallRunBtn: { backgroundColor: 'rgba(230,126,0,0.08)', borderColor: '#e67e0066' },
  pad: { backgroundColor: '#FFFFFF', borderTopWidth: 1, borderTopColor: 'rgba(99,1,2,0.08)', padding: 12, paddingBottom: 24, gap: 10 },
  runRow: { flexDirection: 'row', gap: 8 },
  runBtn: { flex: 1, aspectRatio: 1, backgroundColor: '#F5F3EC', borderRadius: 14, alignItems: 'center', justifyContent: 'center', borderWidth: 1.5, borderColor: 'rgba(99,1,2,0.08)' },
  boundaryBtn: { backgroundColor: 'rgba(184,134,11,0.10)', borderColor: '#b8860b' },
  runBtnText: { fontSize: 22, fontFamily: 'Outfit_900Black', color: '#1B1716' },
  boundaryBtnText: { color: '#b8860b' },
  actionRow: { flexDirection: 'row', gap: 8 },
  actionBtn: { flex: 1, paddingVertical: 14, backgroundColor: '#F5F3EC', borderRadius: 12, alignItems: 'center', borderWidth: 1, borderColor: 'rgba(99,1,2,0.08)' },
  actionBtnText: { color: '#1B1716', fontFamily: 'Outfit_700Bold', fontSize: 13 },
  wicketBtn: { flex: 2, paddingVertical: 14, backgroundColor: 'rgba(239,68,68,0.08)', borderRadius: 12, alignItems: 'center', borderWidth: 1.5, borderColor: '#ef4444' },
  wicketBtnText: { color: '#ef4444', fontFamily: 'Outfit_900Black', fontSize: 14, letterSpacing: 0.5 },
  swapRow: { flexDirection: 'row', gap: 8 },
  swapBtn: { flex: 1, paddingVertical: 10, backgroundColor: '#F5F3EC', borderRadius: 12, alignItems: 'center', borderWidth: 1, borderColor: 'rgba(99,1,2,0.08)' },
  swapBtnText: { color: '#5C5552', fontFamily: 'Outfit_700Bold', fontSize: 12 } });

const headerStyles = StyleSheet.create({
  container: { backgroundColor: '#810100', marginHorizontal: 12, borderRadius: 20, padding: 20, alignItems: 'center', marginBottom: 12, shadowColor: '#810100', shadowOpacity: 0.3, shadowRadius: 16, elevation: 6 },
  teamName: { color: 'rgba(255,255,255,0.75)', fontSize: 11, fontFamily: 'Outfit_800ExtraBold', letterSpacing: 2, textTransform: 'uppercase', marginBottom: 6 },
  scoreRow: { flexDirection: 'row', alignItems: 'baseline' },
  runs: { color: '#FFFFFF', fontFamily: 'Outfit_900Black', fontSize: 60, letterSpacing: -2 },
  wickets: { color: 'rgba(255,255,255,0.65)', fontSize: 32, fontFamily: 'Outfit_700Bold', marginLeft: 4 },
  overs: { color: 'rgba(255,255,255,0.85)', fontFamily: 'Outfit_600SemiBold', fontSize: 15, marginTop: 4 },
  ratesRow: { flexDirection: 'row', gap: 20, marginTop: 6 },
  rate: { color: 'rgba(255,255,255,0.75)', fontSize: 13, fontFamily: 'Outfit_600SemiBold' },
  target: { color: '#FFD60A', fontSize: 13, fontFamily: 'Outfit_800ExtraBold' },
  chaseBar: { marginTop: 10, backgroundColor: 'rgba(255,214,10,0.15)', borderRadius: 10, paddingHorizontal: 14, paddingVertical: 8, borderWidth: 1, borderColor: 'rgba(255,214,10,0.3)' },
  chaseText: { color: '#FFD60A', fontSize: 14, fontFamily: 'Outfit_800ExtraBold', textAlign: 'center' },
  chaseWon: { color: '#4ADE80', fontSize: 16, fontFamily: 'Outfit_900Black', textAlign: 'center' } });

const dotStyles = StyleSheet.create({
  row: { paddingHorizontal: 12, marginBottom: 10 },
  label: { color: '#9A9390', fontFamily: 'Outfit_700Bold', fontSize: 10, letterSpacing: 1.2, textTransform: 'uppercase', marginBottom: 8 },
  dots: { flexDirection: 'row', gap: 6, flexWrap: 'wrap' },
  dot: { width: 34, height: 34, borderRadius: 17, alignItems: 'center', justifyContent: 'center', borderWidth: 1.5, borderColor: 'rgba(99,1,2,0.10)' },
  dotText: { fontFamily: 'Outfit_800ExtraBold', fontSize: 12, color: '#1B1716' },
  normal: { backgroundColor: '#FFFFFF' },
  wicket: { backgroundColor: '#ef4444', borderColor: '#dc2626' },
  four: { backgroundColor: 'rgba(184,134,11,0.15)', borderColor: '#b8860b' },
  six: { backgroundColor: 'rgba(112,48,160,0.15)', borderColor: '#7030a0' },
  extra: { backgroundColor: 'rgba(232,96,10,0.12)', borderWidth: 1.5, borderColor: '#e8600a' } });

const batStyles = StyleSheet.create({
  card: { flex: 1, backgroundColor: '#FFFFFF', borderRadius: 14, padding: 12, shadowColor: '#1B1716', shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.06, shadowRadius: 8, elevation: 2, borderWidth: 1.5, borderColor: 'rgba(99,1,2,0.06)' },
  strikerCard: { borderColor: '#810100', borderWidth: 1.5 },
  nameRow: { flexDirection: 'row', alignItems: 'center', gap: 4, marginBottom: 6 },
  strikerDot: { width: 6, height: 6, borderRadius: 3, backgroundColor: '#810100' },
  name: { color: '#1B1716', fontFamily: 'Outfit_700Bold', fontSize: 13, flex: 1 },
  onStrikeText: { color: '#810100', fontFamily: 'Outfit_900Black', fontSize: 16 },
  statsRow: { flexDirection: 'row', alignItems: 'baseline' },
  runs: { color: '#1B1716', fontFamily: 'Outfit_900Black', fontSize: 26 },
  balls: { color: '#9A9390', fontFamily: 'Outfit_600SemiBold', fontSize: 13 },
  extrasRow: { flexDirection: 'row', marginTop: 4, gap: 8 },
  extra: { color: '#9A9390', fontFamily: 'Outfit_600SemiBold', fontSize: 11 } });

const bowlStyles = StyleSheet.create({
  card: { marginHorizontal: 12, backgroundColor: '#FFFFFF', borderRadius: 14, padding: 14, marginBottom: 8, shadowColor: '#1B1716', shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.06, shadowRadius: 8, elevation: 2, borderWidth: 1, borderColor: 'rgba(99,1,2,0.06)' },
  nameRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 4 },
  name: { color: '#1B1716', fontFamily: 'Outfit_700Bold', fontSize: 14 },
  economy: { color: '#810100', fontSize: 13, fontFamily: 'Outfit_800ExtraBold' },
  line: { color: '#5C5552', fontFamily: 'Outfit_600SemiBold', fontSize: 13 } });

const modalStyles = StyleSheet.create({
  overlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.6)', justifyContent: 'flex-end' },
  sheet: { backgroundColor: '#FFFFFF', borderTopLeftRadius: 24, borderTopRightRadius: 24, maxHeight: '80%', minHeight: 200 },
  handle: { width: 40, height: 4, backgroundColor: '#D1CBCA', borderRadius: 2, alignSelf: 'center', marginTop: 12, marginBottom: 8 },
  title: { color: '#1B1716', fontFamily: 'Outfit_800ExtraBold', fontSize: 16, textAlign: 'center', marginBottom: 16, paddingHorizontal: 20 },
  playerRow: { flexDirection: 'row', alignItems: 'center', padding: 16, borderTopWidth: 1, borderTopColor: 'rgba(99,1,2,0.08)', gap: 12 },
  avatar: { width: 38, height: 38, borderRadius: 10, backgroundColor: '#810100', alignItems: 'center', justifyContent: 'center' },
  avatarText: { color: '#FFFFFF', fontFamily: 'Outfit_800ExtraBold', fontSize: 13 },
  playerName: { color: '#1B1716', fontFamily: 'Outfit_700Bold', fontSize: 15 },
  cancelBtn: { margin: 16, backgroundColor: '#F5F3EC', borderRadius: 14, padding: 16, alignItems: 'center' },
  cancelText: { color: '#5C5552', fontFamily: 'Outfit_700Bold', fontSize: 15 } });

const wicketStyles = StyleSheet.create({
  grid: { flexDirection: 'row', flexWrap: 'wrap', padding: 12, gap: 8 },
  btn: { width: '30%', backgroundColor: '#FFFFFF', borderRadius: 14, padding: 14, alignItems: 'center', gap: 6, shadowColor: '#1B1716', shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.06, shadowRadius: 8, elevation: 2, borderWidth: 1, borderColor: 'rgba(99,1,2,0.08)' },
  emoji: { fontSize: 26 },
  label: { color: '#1B1716', fontFamily: 'Outfit_700Bold', fontSize: 11, textAlign: 'center' } });

const inningsBreakStyles = StyleSheet.create({
  header: { color: '#1B1716', fontFamily: 'Outfit_800ExtraBold', fontSize: 22, textAlign: 'center', marginBottom: 20 },
  scoreCard: { backgroundColor: '#FFFFFF', borderRadius: 18, padding: 20, alignItems: 'center', marginBottom: 16, shadowColor: '#1B1716', shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.06, shadowRadius: 8, elevation: 2 },
  teamName: { color: '#9A9390', fontFamily: 'Outfit_700Bold', fontSize: 11, letterSpacing: 1.5, textTransform: 'uppercase', marginBottom: 4 },
  score: { color: '#1B1716', fontFamily: 'Outfit_900Black', fontSize: 52, letterSpacing: -2 },
  overs: { color: '#5C5552', fontFamily: 'Outfit_600SemiBold', fontSize: 14, marginTop: 4 },
  targetCard: { backgroundColor: '#810100', borderRadius: 18, padding: 18, alignItems: 'center', marginBottom: 20, shadowColor: '#810100', shadowOffset: { width: 0, height: 6 }, shadowOpacity: 0.25, shadowRadius: 14, elevation: 5 },
  targetLabel: { color: 'rgba(255,255,255,0.75)', fontSize: 11, fontFamily: 'Outfit_700Bold', letterSpacing: 1.5, textTransform: 'uppercase', marginBottom: 6 },
  targetValue: { color: '#FFFFFF', fontFamily: 'Outfit_900Black', fontSize: 48 },
  startBtn: { backgroundColor: '#810100', borderRadius: 16, padding: 18, alignItems: 'center', shadowColor: '#810100', shadowOffset: { width: 0, height: 6 }, shadowOpacity: 0.25, shadowRadius: 12, elevation: 5 },
  startBtnText: { color: '#FFFFFF', fontFamily: 'Outfit_800ExtraBold', fontSize: 18 } });
