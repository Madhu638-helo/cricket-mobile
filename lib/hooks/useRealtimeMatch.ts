import { useEffect, useState, useCallback, useRef } from 'react';
import { supabase } from '../supabase';
import type { Ball, Innings, Match, Player, Team } from '../../types/cricket';

export interface RealtimeMatchData {
  session: any | null;
  match: Match | null;
  innings: Innings[];
  balls: Ball[];
  players: Player[];
  teams: Team[];
  loading: boolean;
  error: string | null;
  sendScoreUpdate: (inningsId: string, runs: number, wickets: number, balls: number, ball?: any) => void;
  refetch: () => void;
}

// Stable dedup key for a ball: innings_id + delivery_number uniquely identifies a delivery.
// We use this to merge tmp_ broadcast balls with real DB-inserted balls without duplicates.
function ballKey(b: { innings_id: string; delivery_number: number }) {
  return `${b.innings_id}::${b.delivery_number}`;
}

// Merge a new ball into an existing list, replacing any existing entry with the same key.
// Prefer the real DB record (has a UUID id) over a tmp_ broadcast record.
function mergeBall(prev: Ball[], newBall: Ball): Ball[] {
  const key = ballKey(newBall as any);
  const idx = prev.findIndex(b => ballKey(b as any) === key);
  if (idx === -1) return [...prev, newBall];
  const existing = prev[idx];
  // Keep the real DB record (non-tmp id) if we already have it
  const existingIsReal = !String(existing.id).startsWith('tmp_');
  const newIsReal = !String(newBall.id).startsWith('tmp_');
  if (existingIsReal && !newIsReal) return prev; // already have real, don't downgrade
  const updated = [...prev];
  updated[idx] = newBall;
  return updated;
}

export function useRealtimeMatch(matchCode: string): RealtimeMatchData {
  const channelRef = useRef<ReturnType<typeof supabase.channel> | null>(null);

  const [session, setSession] = useState<any | null>(null);
  const [match, setMatch] = useState<Match | null>(null);
  const [innings, setInnings] = useState<Innings[]>([]);
  const [balls, setBalls] = useState<Ball[]>([]);
  const [players, setPlayers] = useState<Player[]>([]);
  const [teams, setTeams] = useState<Team[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const sessionIdRef = useRef<string>('');
  const matchIdRef = useRef<string>('');

  const fetchInitial = useCallback(async () => {
    const { data: sess, error: se } = await (supabase
      .from('sessions').select('*').eq('code', matchCode).single() as any);
    if (se || !sess) { setLoading(false); setError('Session not found'); return; }

    sessionIdRef.current = sess.id;
    setSession(sess);

    const { data: m } = await (supabase
      .from('matches').select('*').eq('session_id', sess.id)
      .order('match_number', { ascending: false }).limit(1).single() as any);
    if (!m) { setSession(sess); setLoading(false); return; }

    matchIdRef.current = m.id;

    const { data: inn } = await supabase.from('innings').select('*').eq('match_id', m.id);
    const inningsIds = (inn ?? []).map((i: Innings) => i.id);
    const [{ data: b }, { data: p }, { data: t }] = await Promise.all([
      inningsIds.length
        ? supabase.from('balls').select('*').in('innings_id', inningsIds).order('delivery_number', { ascending: true })
        : { data: [] as Ball[] },
      supabase.from('players').select('*').eq('session_id', sess.id),
      supabase.from('teams').select('*').eq('session_id', sess.id),
    ]);

    setMatch(m);
    setInnings(inn ?? []);
    setBalls(b ?? []);
    setPlayers(p ?? []);
    setTeams(t ?? []);
    setLoading(false);
    setError(null);
  }, [matchCode]);

  // Always keep ref pointing to latest fetchInitial
  const fetchInitialRef = useRef(fetchInitial);
  fetchInitialRef.current = fetchInitial;

  useEffect(() => {
    // Kick off initial data load
    fetchInitialRef.current();

    const CHANNEL = `match:${matchCode}`;

    // Remove stale channels with this name
    supabase.getChannels()
      .filter(ch => ch.topic === `realtime:${CHANNEL}`)
      .forEach(ch => supabase.removeChannel(ch));

    const channel = supabase.channel(CHANNEL, {
      config: { broadcast: { self: true } },  // scorer receives own broadcasts for dedup
    })

      // ── Live ball-by-ball broadcast from scorer ─────────────────────────────
      .on('broadcast', { event: 'score_update' }, (payload: any) => {
        const { innings_id, runs, wickets, balls: totalBalls, ball } = payload.payload ?? {};
        console.log('[BROADCAST RX] innings_id:', innings_id, 'runs:', runs, 'balls:', totalBalls, 'ball_dn:', ball?.delivery_number, 'ball_on:', ball?.over_number);
        if (!innings_id) return;

        // Update innings totals (never regress)
        setInnings(prev => {
          const matched = prev.some(i => i.id === innings_id);
          if (!matched) console.warn('[BROADCAST RX] innings_id NOT IN STATE — known ids:', prev.map(i => i.id));
          return prev.map(i =>
            i.id === innings_id
              ? {
                  ...i,
                  total_runs: Math.max(i.total_runs, runs ?? 0),
                  total_wickets: Math.max(i.total_wickets, wickets ?? 0),
                  total_balls: Math.max(i.total_balls, totalBalls ?? 0),
                }
              : i
          );
        });

        // Add ball using dedup-merge (tmp_ id, will be upgraded by DB INSERT listener)
        if (ball?.innings_id && typeof ball.delivery_number === 'number') {
          setBalls(prev => mergeBall(prev, {
            ...ball,
            id: `tmp_${ball.innings_id}::${ball.delivery_number}`,
          } as Ball));
        } else {
          console.warn('[BROADCAST RX] ball missing or bad delivery_number:', ball);
        }
      })

      // ── DB: match status changes ──────────────────────────────────────────
      .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'matches' }, (payload: any) => {
        if (sessionIdRef.current && payload.new?.session_id !== sessionIdRef.current) return;
        setMatch(prev => {
          if (prev?.id === payload.new?.id) return { ...prev, ...payload.new } as Match;
          if (!prev) fetchInitialRef.current();
          return prev;
        });
      })

      // ── DB: new match created ─────────────────────────────────────────────
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'matches' }, (payload: any) => {
        if (sessionIdRef.current && payload.new?.session_id !== sessionIdRef.current) return;
        fetchInitialRef.current();
      })

      // ── DB: innings totals updated (end of over / innings start) ──────────
      .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'innings' }, (payload: any) => {
        if (matchIdRef.current && payload.new?.match_id !== matchIdRef.current) return;
        setInnings(prev => prev.map(i => {
          if (i.id !== payload.new?.id) return i;
          return {
            ...i,
            ...payload.new,
            // Never regress scores that already arrived via faster broadcast
            total_runs: Math.max(i.total_runs, payload.new.total_runs ?? 0),
            total_balls: Math.max(i.total_balls, payload.new.total_balls ?? 0),
            total_wickets: Math.max(i.total_wickets, payload.new.total_wickets ?? 0),
          } as Innings;
        }));
      })

      // ── DB: new innings started ───────────────────────────────────────────
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'innings' }, (payload: any) => {
        if (matchIdRef.current && payload.new?.match_id !== matchIdRef.current) return;
        fetchInitialRef.current();
      })

      // ── DB: individual ball inserted (per-ball real-time) ─────────────────
      // Upgrades the tmp_ broadcast entry with the real DB record (with UUID id).
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'balls' }, (payload: any) => {
        const newBall = payload.new as Ball;
        if (!newBall?.innings_id || typeof (newBall as any).delivery_number !== 'number') return;
        setBalls(prev => mergeBall(prev, newBall));
      })

      // ── DB: score_tickers — undo/bowler-change signals ────────────────────
      // Used by undo_last_over and change_bowler_mid_over to tell clients to refetch.
      .on('postgres_changes', { event: '*', schema: 'public', table: 'score_tickers' }, (payload: any) => {
        if (sessionIdRef.current && payload.new?.session_id !== sessionIdRef.current) return;
        const { reload_balls } = payload.new?.data || {};
        if (reload_balls) {
          fetchInitialRef.current();
        }
      })

      // ── DB: player list changes ───────────────────────────────────────────
      .on('postgres_changes', { event: '*', schema: 'public', table: 'players' }, async (payload: any) => {
        if (sessionIdRef.current && payload.new?.session_id !== sessionIdRef.current) return;
        const [{ data: p }, { data: t }] = await Promise.all([
          supabase.from('players').select('*').eq('session_id', sessionIdRef.current),
          supabase.from('teams').select('*').eq('session_id', sessionIdRef.current),
        ]);
        if (p) setPlayers(p);
        if (t) setTeams(t);
      })

      .subscribe();

    channelRef.current = channel;

    return () => {
      supabase.removeChannel(channel);
      channelRef.current = null;
    };
  }, [matchCode]);

  const sendScoreUpdate = useCallback((inningsId: string, runs: number, wickets: number, totalBalls: number, ball?: any) => {
    channelRef.current?.send({
      type: 'broadcast',
      event: 'score_update',
      payload: { innings_id: inningsId, runs, wickets, balls: totalBalls, ball },
    });
  }, []);

  return { session, match, innings, balls, players, teams, loading, error, sendScoreUpdate, refetch: fetchInitial };
}
