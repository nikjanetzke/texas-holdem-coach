import type { DrillId } from '../persistence/drillStats';
import type { MistakeKind } from './mistakes';

// The end-of-session report: what happened, the two biggest leaks, and a
// button straight to the drill that fixes each one. Built from THIS sitting
// only — a restored game's older hands don't count.

export interface SessionHand {
  /** Did the player voluntarily put chips in before the flop (not just a blind)? */
  vpip: boolean;
  won: boolean;
}

export interface SessionData {
  hands: SessionHand[];
  decisionScores: number[];
  netChips: number;
  /** Clear-cut errors saved this session, by kind. */
  mistakes: Record<MistakeKind, number>;
  /** Strong hands bet too small on draw-heavy boards. */
  smallValueBets: number;
}

export interface ReportLeak {
  id: string;
  title: string;
  detail: string;
  count: number;
  drill: DrillId;
  drillLabel: string;
}

export interface SessionReport {
  handsPlayed: number;
  handsWon: number;
  netChips: number;
  avgScore: number | null;
  vpipPercent: number | null;
  leaks: ReportLeak[];
  savedMistakes: number;
}

// VPIP (how often you play a hand) outside these bounds is a leak, but only
// judged once there are enough hands for it to mean something.
export const VPIP_MIN_HANDS = 8;
export const VPIP_TOO_LOOSE = 45;
export const VPIP_TOO_TIGHT = 12;

export function buildSessionReport(s: SessionData): SessionReport {
  const handsPlayed = s.hands.length;
  const vpipPercent = handsPlayed ? Math.round((s.hands.filter((h) => h.vpip).length / handsPlayed) * 100) : null;
  const avgScore = s.decisionScores.length
    ? Math.round((s.decisionScores.reduce((a, b) => a + b, 0) / s.decisionScores.length) * 10) / 10
    : null;

  const leaks: ReportLeak[] = [];
  const add = (l: ReportLeak) => l.count > 0 && leaks.push(l);
  const plural = (n: number, w: string) => `${n} ${w}${n === 1 ? '' : 's'}`;

  add({
    id: 'overcall',
    title: 'Calling without the odds',
    detail: `${plural(s.mistakes.overcall, 'time')} you called when the price needed a much better chance of winning than your hand had.`,
    count: s.mistakes.overcall,
    drill: 'potodds',
    drillLabel: 'Fold, call or raise',
  });
  add({
    id: 'overfold',
    title: 'Folding hands worth playing',
    detail: `${plural(s.mistakes.overfold, 'time')} you folded while a clear favourite at a cheap price.`,
    count: s.mistakes.overfold,
    drill: 'potodds',
    drillLabel: 'Fold, call or raise',
  });
  add({
    id: 'freefold',
    title: 'Folding when you could check',
    detail: `${plural(s.mistakes.freefold, 'time')} you folded when checking was free. Always check if no one has bet.`,
    count: s.mistakes.freefold,
    drill: 'mistakes',
    drillLabel: 'Practise your mistakes',
  });
  add({
    id: 'sizing',
    title: 'Betting too small with strong hands',
    detail: `${plural(s.smallValueBets, 'time')} a small bet on a board full of draws gave them a cheap price to outdraw you.`,
    count: s.smallValueBets,
    drill: 'sizing',
    drillLabel: 'Bet sizing',
  });
  if (vpipPercent != null && handsPlayed >= VPIP_MIN_HANDS) {
    if (vpipPercent > VPIP_TOO_LOOSE) {
      add({
        id: 'loose',
        title: 'Playing too many starting hands',
        detail: `You played ${vpipPercent}% of hands before the flop. Solid players at a 6-player table play roughly 20–30% — fold the weak ones, especially from early seats.`,
        // Weight by how far over the line, so it competes fairly with counts.
        count: Math.max(1, Math.round(((vpipPercent - VPIP_TOO_LOOSE) / 100) * handsPlayed) + 2),
        drill: 'position',
        drillLabel: 'Play or fold by seat',
      });
    } else if (vpipPercent < VPIP_TOO_TIGHT) {
      add({
        id: 'tight',
        title: 'Folding too many starting hands',
        detail: `You only played ${vpipPercent}% of hands. Waiting for perfect cards lets the blinds eat your stack — open more hands from late seats.`,
        count: 2,
        drill: 'position',
        drillLabel: 'Play or fold by seat',
      });
    }
  }

  leaks.sort((a, b) => b.count - a.count);
  // Two leaks that point at the same drill read as one problem — keep the bigger.
  const seenDrill = new Set<DrillId>();
  const top: ReportLeak[] = [];
  for (const l of leaks) {
    if (seenDrill.has(l.drill)) continue;
    seenDrill.add(l.drill);
    top.push(l);
    if (top.length === 2) break;
  }

  return {
    handsPlayed,
    handsWon: s.hands.filter((h) => h.won).length,
    netChips: s.netChips,
    avgScore,
    vpipPercent,
    leaks: top,
    savedMistakes: s.mistakes.freefold + s.mistakes.overfold + s.mistakes.overcall,
  };
}
