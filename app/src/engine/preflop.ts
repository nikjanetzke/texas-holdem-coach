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

export function bandFor(band: LuckBand): { min: number; max: number } {
  if (band === 'hot') return { min: 8, max: Infinity };
  if (band === 'cold') return { min: 0, max: 4 };
  return { min: 0, max: Infinity };
}
