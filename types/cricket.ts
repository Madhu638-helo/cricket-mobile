// ============================================================
// Cricket Score Pro — TypeScript Types
// ============================================================

export type SessionStatus = 'lobby' | 'active' | 'finished';
export type MatchStatus = 'setup' | 'toss' | 'innings_1' | 'innings_break' | 'innings_2' | 'result';
export type InningsStatus = 'active' | 'complete';
export type TossDecision = 'bat' | 'bowl';
export type ExtraType = 'wide' | 'noball' | 'bye' | 'legbye' | 'penalty';
export type WicketType = 'caught' | 'bowled' | 'lbw' | 'runout' | 'stumped' | 'hitwicket' | 'retiredhurt' | 'retiredout';

export interface Session {
  id: string;
  code: string;
  name: string | null;
  status: SessionStatus;
  owner_id: string | null;
  created_at: string;
}

export interface Team {
  id: string;
  session_id: string;
  name: string;
  created_at: string;
}

export interface Player {
  id: string;
  session_id: string;
  user_id: string | null;
  team_id: string | null;
  name: string;
  is_scorer: boolean;
  is_joker: boolean;
  is_captain: boolean;
  joined_at: string;
}

export interface Match {
  id: string;
  session_id: string;
  match_number: number;
  status: MatchStatus;
  overs: number;
  team1_id: string | null;
  team2_id: string | null;
  toss_winner_id: string | null;
  toss_decision: TossDecision | null;
  batting_first: string | null;
  result: string | null;
  winner_id: string | null;
  created_at: string;
  is_paused: boolean;
}

export interface Innings {
  id: string;
  match_id: string;
  team_id: string;
  innings_number: 1 | 2;
  total_runs: number;
  total_wickets: number;
  total_balls: number;
  total_extras: number;
  status: InningsStatus;
  target: number | null;
  created_at: string;
}

export interface Ball {
  id: string;
  innings_id: string;
  over_number: number;
  ball_number: number;
  delivery_number: number;
  batsman_id: string;
  bowler_id: string;
  non_striker_id: string | null;
  runs_off_bat: number;
  extras: number;
  extra_type: ExtraType | null;
  is_wicket: boolean;
  wicket_type: WicketType | null;
  fielder_id: string | null;
  is_free_hit: boolean;
  created_at: string;
}

export interface Partnership {
  id: string;
  innings_id: string;
  batsman1_id: string;
  batsman2_id: string | null;
  runs: number;
  balls: number;
  wicket_number: number | null;
  created_at: string;
}

// ── Derived / Computed Types ──────────────────────────────────

export interface BatsmanStats {
  player: Player;
  runs: number;
  balls: number;
  fours: number;
  sixes: number;
  strikeRate: number;
  isOut: boolean;
  dismissal: string | null;
  isOnStrike: boolean;
}

export interface BowlerStats {
  player: Player;
  overs: number;        // e.g. 3.4 means 3 overs + 4 balls
  maidens: number;
  runs: number;
  wickets: number;
  economy: number;
  noBalls: number;
  wides: number;
}

export interface OverSummary {
  overNumber: number;   // 1-indexed for display
  runs: number;
  wickets: number;
  extras: number;
  isMaiden: boolean;
  balls: BallSummary[];
}

export interface BallSummary {
  runsOffBat: number;
  extras: number;
  extraType: ExtraType | null;
  isWicket: boolean;
  isWide: boolean;
  isNoBall: boolean;
  isBoundary: boolean; // 4 or 6
  isSix: boolean;
  isFreehit: boolean;
  label: string;       // display label: "W", "4", "6", "1", "·", "wd", "nb"
}

export interface LiveMatchState {
  match: Match;
  session: Session;
  teams: { team1: Team; team2: Team };
  players: Player[];
  currentInnings: Innings | null;
  previousInnings: Innings | null;
  currentBatsmen: [BatsmanStats | null, BatsmanStats | null];
  currentBowler: BowlerStats | null;
  partnerships: Partnership[];
  overHistory: OverSummary[];
  currentOverBalls: BallSummary[];
  allBalls: Ball[];
  // computed
  crr: number;
  rrr: number | null;
  projectedScore: number;
  isFreehitNext: boolean;
}

export interface SessionStanding {
  session_id: string;
  team_id: string;
  played: number;
  won: number;
  lost: number;
  nrr: number;
  points: number;
}

// ── API Payloads ──────────────────────────────────────────────

export interface PostBallPayload {
  runsOffBat: number;
  extraType?: ExtraType;
  extraRuns?: number;
  scorerName: string;
}

export interface PostWicketPayload {
  wicketType: WicketType;
  fielderId?: string;
  scorerName: string;
  runsOffBat?: number;
}

export interface PostActionPayload {
  action: 'over_end' | 'innings_end' | 'new_match' | 'end_session' | 'set_toss' | 'set_teams' | 'lock_teams' | 'start_innings_1' | 'pause_match' | 'resume_match' | 'cancel_match';
  data?: Record<string, unknown>;
}

/** Extended WicketType covering all 10 dismissal types */
export type WicketTypeExtended =
  | 'caught' | 'bowled' | 'lbw' | 'runout' | 'stumped' | 'hitwicket'
  | 'retiredhurt' | 'retiredout' | 'timedout' | 'obstructingfield';


