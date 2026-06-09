import type { Ball, BatsmanStats, BowlerStats, OverSummary, BallSummary, Player } from '../../types/cricket';

// ── Formatting helpers ────────────────────────────────────────

/** Convert total legal balls to display overs: "3.4" means 3 overs + 4 balls */
export function ballsToOvers(balls: number): number {
  const fullOvers = Math.floor(balls / 6);
  const rem = balls % 6;
  return parseFloat(`${fullOvers}.${rem}`);
}

/** "3.4" → display string */
export function formatOvers(balls: number): string {
  const fullOvers = Math.floor(balls / 6);
  const rem = balls % 6;
  return `${fullOvers}.${rem}`;
}

// ── Core stat calculations ────────────────────────────────────

export function calcStrikeRate(runs: number, balls: number): number {
  if (balls === 0) return 0;
  return Math.round((runs / balls) * 1000) / 10; // 1 decimal
}

export function calcEconomy(runs: number, legalBalls: number): number {
  if (legalBalls === 0) return 0;
  return Math.round((runs / (legalBalls / 6)) * 100) / 100;
}

export function calcCRR(totalRuns: number, totalBalls: number): number {
  if (totalBalls === 0) return 0;
  return Math.round((totalRuns / (totalBalls / 6)) * 100) / 100;
}

export function calcRRR(target: number, currentRuns: number, totalOvers: number, usedBalls: number): number {
  const ballsLeft = totalOvers * 6 - usedBalls;
  if (ballsLeft <= 0) return Infinity;
  const needed = target - currentRuns;
  if (needed <= 0) return 0;
  return Math.round((needed / (ballsLeft / 6)) * 100) / 100;
}

export function calcNRR(
  runsFor: number, ballsFor: number, maxBalls: number,
  runsAgainst: number, ballsAgainst: number
): number {
  const effectiveBallsFor = Math.min(ballsFor, maxBalls);
  const effectiveBallsAgainst = Math.min(ballsAgainst, maxBalls);
  if (effectiveBallsFor === 0 || effectiveBallsAgainst === 0) return 0;
  const rateFor = runsFor / (effectiveBallsFor / 6);
  const rateAgainst = runsAgainst / (effectiveBallsAgainst / 6);
  return Math.round((rateFor - rateAgainst) * 1000) / 1000;
}

export function calcProjectedScore(totalRuns: number, totalBalls: number, totalOvers: number): number {
  if (totalBalls === 0) return 0;
  const crr = totalRuns / (totalBalls / 6);
  return Math.round(crr * totalOvers);
}

// ── Per-batsman stats from ball ledger ────────────────────────

export function calcBatsmanStats(
  player: Player,
  balls: Ball[],
  onStrike: boolean,
  dismissalBall?: Ball
): BatsmanStats {
  const faced = balls.filter(
    b => b.batsman_id === player.id && b.extra_type !== 'wide'
  );
  const runs = faced.reduce((s, b) => s + b.runs_off_bat, 0);
  const fours = faced.filter(b => b.runs_off_bat === 4).length;
  const sixes = faced.filter(b => b.runs_off_bat === 6).length;

  let dismissal: string | null = null;
  if (dismissalBall?.is_wicket) {
    dismissal = formatDismissal(dismissalBall);
  }

  return {
    player,
    runs,
    balls: faced.length,
    fours,
    sixes,
    strikeRate: calcStrikeRate(runs, faced.length),
    isOut: !!dismissalBall?.is_wicket,
    dismissal,
    isOnStrike: onStrike,
  };
}

function formatDismissal(ball: Ball): string {
  switch (ball.wicket_type) {
    case 'bowled':      return 'b';
    case 'lbw':         return 'lbw b';
    case 'caught':      return 'c & b';
    case 'runout':      return 'run out';
    case 'stumped':     return 'st b';
    case 'hitwicket':   return 'hit wicket b';
    case 'retiredhurt': return 'retired hurt';
    default:            return 'out';
  }
}

// ── Per-bowler stats from ball ledger ─────────────────────────

export function calcBowlerStats(player: Player, balls: Ball[]): BowlerStats {
  const bowled = balls.filter(b => b.bowler_id === player.id);
  const legal = bowled.filter(b => !b.extra_type || (b.extra_type !== 'wide' && b.extra_type !== 'noball'));
  const runs = bowled.reduce((s, b) => s + b.runs_off_bat + b.extras, 0);
  const wickets = bowled.filter(b =>
    b.is_wicket && b.wicket_type !== 'runout' && b.wicket_type !== 'retiredhurt'
  ).length;
  const wides = bowled.filter(b => b.extra_type === 'wide').length;
  const noBalls = bowled.filter(b => b.extra_type === 'noball').length;

  // Maiden over detection: group by over, check 0 runs
  const overGroups = new Map<number, Ball[]>();
  bowled.forEach(b => {
    const arr = overGroups.get(b.over_number) ?? [];
    arr.push(b);
    overGroups.set(b.over_number, arr);
  });
  let maidens = 0;
  overGroups.forEach((overBalls, _) => {
    const legalInOver = overBalls.filter(b => !b.extra_type || (b.extra_type !== 'wide' && b.extra_type !== 'noball'));
    if (legalInOver.length === 6) {
      const runsInOver = overBalls.reduce((s, b) => s + b.runs_off_bat + b.extras, 0);
      if (runsInOver === 0) maidens++;
    }
  });

  return {
    player,
    overs: ballsToOvers(legal.length),
    maidens,
    runs,
    wickets,
    economy: calcEconomy(runs, legal.length),
    noBalls,
    wides,
  };
}

// ── Over history builder ──────────────────────────────────────

export function buildOverHistory(balls: Ball[]): OverSummary[] {
  const overMap = new Map<number, Ball[]>();
  balls.forEach(b => {
    const arr = overMap.get(b.over_number) ?? [];
    arr.push(b);
    overMap.set(b.over_number, arr);
  });

  const summaries: OverSummary[] = [];
  overMap.forEach((overBalls, overNum) => {
    overBalls.sort((a, b) => a.delivery_number - b.delivery_number);
    const runs = overBalls.reduce((s, b) => s + b.runs_off_bat + b.extras, 0);
    const wickets = overBalls.filter(b => b.is_wicket).length;
    const extras = overBalls.reduce((s, b) => s + b.extras, 0);
    const legal = overBalls.filter(b => b.extra_type !== 'wide' && b.extra_type !== 'noball');
    const isMaiden = legal.length === 6 && runs === 0;

    summaries.push({
      overNumber: overNum + 1,
      runs,
      wickets,
      extras,
      isMaiden,
      balls: overBalls.map(ballToSummary),
    });
  });

  return summaries.sort((a, b) => a.overNumber - b.overNumber);
}

export function ballToSummary(ball: Ball): BallSummary {
  const isWide = ball.extra_type === 'wide';
  const isNoBall = ball.extra_type === 'noball';
  const isSix = ball.runs_off_bat === 6;
  const isBoundary = ball.runs_off_bat === 4 || isSix;

  let label: string;
  if (ball.is_wicket) label = 'W';
  else if (isWide) label = 'Wd';
  else if (isNoBall) label = `NB${ball.runs_off_bat > 0 ? `+${ball.runs_off_bat}` : ''}`;
  else if (isSix) label = '6';
  else if (ball.runs_off_bat === 4) label = '4';
  else if (ball.runs_off_bat === 0) label = '·';
  else label = String(ball.runs_off_bat);

  return {
    runsOffBat: ball.runs_off_bat,
    extras: ball.extras,
    extraType: ball.extra_type,
    isWicket: ball.is_wicket,
    isWide,
    isNoBall,
    isBoundary,
    isSix,
    isFreehit: ball.is_free_hit,
    label,
  };
}

// ── Milestone detection ───────────────────────────────────────

export type Milestone =
  | { type: 'batting'; runs: number; player: string }
  | { type: 'bowling'; wickets: number; player: string }
  | { type: 'hatTrick'; player: string }
  | { type: 'partnership'; runs: number };

export function detectMilestone(
  prevBalls: Ball[],
  newBall: Ball,
  players: Player[]
): Milestone | null {
  // Batting milestones
  const batsmanBalls = prevBalls.filter(
    b => b.batsman_id === newBall.batsman_id && b.extra_type !== 'wide'
  );
  const prevRuns = batsmanBalls.reduce((s, b) => s + b.runs_off_bat, 0);
  const newRuns = prevRuns + newBall.runs_off_bat;
  const batsmanPlayer = players.find(p => p.id === newBall.batsman_id);
  for (const milestone of [50, 100, 150, 200]) {
    if (prevRuns < milestone && newRuns >= milestone) {
      return { type: 'batting', runs: milestone, player: batsmanPlayer?.name ?? 'Batsman' };
    }
  }

  // Hat-trick: 3 CONSECUTIVE wicket deliveries by same bowler
  if (newBall.is_wicket && newBall.wicket_type !== 'runout' && newBall.wicket_type !== 'retiredhurt') {
    const bowlerWickets = prevBalls
      .filter(b => b.bowler_id === newBall.bowler_id && b.is_wicket && b.wicket_type !== 'runout')
      .sort((a, b) => a.delivery_number - b.delivery_number);
    const last2 = bowlerWickets.slice(-2);
    // Require all 3 deliveries to be consecutive (delivery_number forms a contiguous run)
    if (
      last2.length === 2 &&
      last2[1].delivery_number === last2[0].delivery_number + 1 &&
      newBall.delivery_number === last2[1].delivery_number + 1
    ) {
      const bowlerPlayer = players.find(p => p.id === newBall.bowler_id);
      return { type: 'hatTrick', player: bowlerPlayer?.name ?? 'Bowler' };
    }

    // 5-wicket haul
    const total5 = prevBalls.filter(
      b => b.bowler_id === newBall.bowler_id && b.is_wicket && b.wicket_type !== 'runout'
    ).length;
    if (total5 === 4) { // about to become 5
      const bowlerPlayer = players.find(p => p.id === newBall.bowler_id);
      return { type: 'bowling', wickets: 5, player: bowlerPlayer?.name ?? 'Bowler' };
    }
  }

  return null;
}

// ── Code generator ────────────────────────────────────────────

export function generateMatchCode(): string {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  let code = '';
  for (let i = 0; i < 6; i++) {
    code += chars[Math.floor(Math.random() * chars.length)];
  }
  return code;
}
