import type { Card } from './deck';
import { rankValue } from './deck';

export const HandRank = {
  HighCard: 1,
  OnePair: 2,
  TwoPair: 3,
  ThreeOfAKind: 4,
  Straight: 5,
  Flush: 6,
  FullHouse: 7,
  FourOfAKind: 8,
  StraightFlush: 9,
} as const;

export type HandRank = (typeof HandRank)[keyof typeof HandRank];

export const HAND_RANK_NAMES: Record<HandRank, string> = {
  [HandRank.HighCard]: 'High Card',
  [HandRank.OnePair]: 'One Pair',
  [HandRank.TwoPair]: 'Two Pair',
  [HandRank.ThreeOfAKind]: 'Three of a Kind',
  [HandRank.Straight]: 'Straight',
  [HandRank.Flush]: 'Flush',
  [HandRank.FullHouse]: 'Full House',
  [HandRank.FourOfAKind]: 'Four of a Kind',
  [HandRank.StraightFlush]: 'Straight Flush',
};

// A royal flush is just the highest straight flush (A-high), no separate rank needed.
export interface HandValue {
  rank: HandRank;
  // Tiebreak values, high to low significance, used for comparing hands of the same rank.
  tiebreakers: number[];
  cards: Card[];
}

function combinations<T>(items: T[], k: number): T[][] {
  if (k === 0) return [[]];
  if (items.length < k) return [];
  const [head, ...tail] = items;
  const withHead = combinations(tail, k - 1).map((c) => [head, ...c]);
  const withoutHead = combinations(tail, k);
  return [...withHead, ...withoutHead];
}

function evaluateFive(cards: Card[]): HandValue {
  const values = cards.map((c) => rankValue(c.rank)).sort((a, b) => b - a);
  const suits = cards.map((c) => c.suit);
  const isFlush = suits.every((s) => s === suits[0]);

  const counts = new Map<number, number>();
  for (const v of values) counts.set(v, (counts.get(v) ?? 0) + 1);

  // Distinct values sorted by (count desc, value desc) for grouping-based hands.
  const grouped = [...counts.entries()].sort((a, b) => (b[1] - a[1]) || (b[0] - a[0]));

  const uniqueDesc = [...new Set(values)].sort((a, b) => b - a);
  let straightHigh = 0;
  if (uniqueDesc.length >= 5) {
    // Ace-low straight (A-2-3-4-5): treat ace as 1.
    const withAceLow = uniqueDesc.includes(14) ? [...uniqueDesc, 1] : uniqueDesc;
    for (let i = 0; i <= withAceLow.length - 5; i++) {
      const slice = withAceLow.slice(i, i + 5);
      if (slice[0] - slice[4] === 4) {
        straightHigh = slice[0];
        break;
      }
    }
  }

  if (isFlush && straightHigh) {
    return { rank: HandRank.StraightFlush, tiebreakers: [straightHigh], cards };
  }
  if (grouped[0][1] === 4) {
    const kicker = grouped.find(([, c]) => c === 1)![0];
    return { rank: HandRank.FourOfAKind, tiebreakers: [grouped[0][0], kicker], cards };
  }
  if (grouped[0][1] === 3 && grouped[1][1] >= 2) {
    return { rank: HandRank.FullHouse, tiebreakers: [grouped[0][0], grouped[1][0]], cards };
  }
  if (isFlush) {
    return { rank: HandRank.Flush, tiebreakers: values, cards };
  }
  if (straightHigh) {
    return { rank: HandRank.Straight, tiebreakers: [straightHigh], cards };
  }
  if (grouped[0][1] === 3) {
    const kickers = grouped.filter(([, c]) => c === 1).map(([v]) => v);
    return { rank: HandRank.ThreeOfAKind, tiebreakers: [grouped[0][0], ...kickers], cards };
  }
  if (grouped[0][1] === 2 && grouped[1][1] === 2) {
    const pairs = [grouped[0][0], grouped[1][0]].sort((a, b) => b - a);
    const kicker = grouped.find(([, c]) => c === 1)![0];
    return { rank: HandRank.TwoPair, tiebreakers: [...pairs, kicker], cards };
  }
  if (grouped[0][1] === 2) {
    const kickers = grouped.filter(([, c]) => c === 1).map(([v]) => v);
    return { rank: HandRank.OnePair, tiebreakers: [grouped[0][0], ...kickers], cards };
  }
  return { rank: HandRank.HighCard, tiebreakers: values, cards };
}

export function compareHandValues(a: HandValue, b: HandValue): number {
  if (a.rank !== b.rank) return a.rank - b.rank;
  for (let i = 0; i < Math.max(a.tiebreakers.length, b.tiebreakers.length); i++) {
    const av = a.tiebreakers[i] ?? 0;
    const bv = b.tiebreakers[i] ?? 0;
    if (av !== bv) return av - bv;
  }
  return 0;
}

// Finds the best 5-card hand from any 5, 6, or 7 cards.
export function evaluateBestHand(cards: Card[]): HandValue {
  if (cards.length < 5) throw new Error('Need at least 5 cards to evaluate a hand');
  let best: HandValue | null = null;
  for (const five of combinations(cards, 5)) {
    const value = evaluateFive(five);
    if (!best || compareHandValues(value, best) > 0) {
      best = value;
    }
  }
  return best!;
}
