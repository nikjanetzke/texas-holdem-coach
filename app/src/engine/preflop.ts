import type { Card } from './deck';
import { rankValue } from './deck';

// "Card-luck" bands used to bias a player's starting hand for practice scenarios.
export type LuckBand = 'hot' | 'normal' | 'cold';

// Chen-formula point value for a single card (A=10, K=8, Q=7, J=6, else rank/2).
function chenCardPoints(value: number): number {
  if (value === 14) return 10;
  if (value === 13) return 8;
  if (value === 12) return 7;
  if (value === 11) return 6;
  return value / 2;
}

/**
 * The Chen formula: a cheap, well-known preflop hand-strength score. Good enough
 * for rejection-sampling a starting hand into a "hot"/"cold" band without the cost
 * of a full equity simulation. Premium hands score ~10+, trash hands score ~0-2.
 */
export function chenScore(holeCards: Card[]): number {
  if (holeCards.length < 2) return 0;
  const [a, b] = holeCards;
  const va = rankValue(a.rank);
  const vb = rankValue(b.rank);
  const high = Math.max(va, vb);
  const low = Math.min(va, vb);

  let score = chenCardPoints(high);

  if (va === vb) {
    // Pairs: double the single-card value, minimum 5.
    score = Math.max(score * 2, 5);
  } else {
    if (a.suit === b.suit) score += 2;
    const gap = high - low - 1;
    if (gap === 1) score -= 1;
    else if (gap === 2) score -= 2;
    else if (gap === 3) score -= 4;
    else if (gap >= 4) score -= 5;
    // Straight bonus: 0/1-gap connectors below Q.
    if (gap <= 1 && high < 12) score += 1;
  }

  return Math.round(Math.max(0, score));
}

export interface ChenStep {
  /** Short description of the rule applied. */
  label: string;
  /** The point change this step contributed, formatted (e.g. "+2", "×2", "0"). */
  delta: string;
  /** Running subtotal after this step. */
  running: number;
}

/**
 * The same Chen calculation as `chenScore`, but recording each step so it can be
 * taught/explained. Kept deliberately in lock-step with `chenScore` above —
 * if you change one, change the other.
 */
export function chenBreakdown(holeCards: Card[]): { score: number; steps: ChenStep[] } {
  const steps: ChenStep[] = [];
  if (holeCards.length < 2) return { score: 0, steps };
  const [a, b] = holeCards;
  const va = rankValue(a.rank);
  const vb = rankValue(b.rank);
  const high = Math.max(va, vb);
  const low = Math.min(va, vb);
  const highRank = va >= vb ? a.rank : b.rank;

  let score = chenCardPoints(high);
  steps.push({ label: `High card (${highRank}) base points`, delta: `${score}`, running: score });

  if (va === vb) {
    const doubled = Math.max(score * 2, 5);
    steps.push({ label: 'Pair: double the points (minimum 5)', delta: '×2', running: doubled });
    score = doubled;
  } else {
    if (a.suit === b.suit) {
      score += 2;
      steps.push({ label: 'Suited bonus', delta: '+2', running: score });
    }
    const gap = high - low - 1;
    let penalty = 0;
    if (gap === 1) penalty = 1;
    else if (gap === 2) penalty = 2;
    else if (gap === 3) penalty = 4;
    else if (gap >= 4) penalty = 5;
    if (penalty > 0) {
      score -= penalty;
      steps.push({ label: `Gap of ${gap} card${gap === 1 ? '' : 's'} penalty`, delta: `-${penalty}`, running: score });
    }
    if (gap <= 1 && high < 12) {
      score += 1;
      steps.push({ label: 'Straight bonus (0–1 gap, both below Q)', delta: '+1', running: score });
    }
  }

  const final = Math.round(Math.max(0, score));
  if (final !== score) steps.push({ label: 'Round to nearest (and floor at 0)', delta: '≈', running: final });
  return { score: final, steps };
}

export function bandFor(band: LuckBand): { min: number; max: number } {
  if (band === 'hot') return { min: 8, max: Infinity };
  if (band === 'cold') return { min: 0, max: 4 };
  return { min: 0, max: Infinity };
}
