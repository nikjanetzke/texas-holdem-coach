import type { Card, Rank, Suit } from '../engine/deck';
import { SUITS } from '../engine/deck';
import { SCENARIO_STRATEGIES, expandRange } from '../scenarios/strategy';

// "Play or fold from this seat?" — the same starting hand shown from different
// seats at a 6-player table. Graded against the exact opening chart the
// 6-max scenario guide teaches, so the drill and the guide never disagree:
//   green  = open from any seat
//   amber  = open only from a late seat (the cutoff or the button)
//   other  = fold from every seat

export type SeatId = 'early' | 'middle' | 'cutoff' | 'button';
export type Verdict = 'play' | 'fold';
export type Tier = 'play' | 'maybe' | 'fold';

export interface SeatInfo {
  id: SeatId;
  /** Plain-English first, poker name second — same convention as the in-game badge. */
  label: string;
  pokerName: string;
  playersAfter: number;
  late: boolean;
}

export const SEATS: SeatInfo[] = [
  { id: 'early', label: 'First to act (Early)', pokerName: 'Under the gun', playersAfter: 5, late: false },
  { id: 'middle', label: 'Middle', pokerName: 'Middle position', playersAfter: 4, late: false },
  { id: 'cutoff', label: 'Late — one before the button', pokerName: 'The cutoff', playersAfter: 3, late: true },
  { id: 'button', label: 'Button — best seat', pokerName: 'The button', playersAfter: 2, late: true },
];

const RANK_ORDER: Rank[] = ['A', 'K', 'Q', 'J', 'T', '9', '8', '7', '6', '5', '4', '3', '2'];

/** All 169 starting-hand classes, e.g. "AA", "AKs", "AKo". */
export function allHandClasses(): string[] {
  const out: string[] = [];
  for (let i = 0; i < RANK_ORDER.length; i++) {
    for (let j = i; j < RANK_ORDER.length; j++) {
      if (i === j) out.push(RANK_ORDER[i] + RANK_ORDER[i]);
      else out.push(RANK_ORDER[i] + RANK_ORDER[j] + 's', RANK_ORDER[i] + RANK_ORDER[j] + 'o');
    }
  }
  return out;
}

const range = SCENARIO_STRATEGIES['medium-6max'].range;
const PLAY = expandRange(range.play);
const MAYBE = expandRange(range.maybe);

export function tierOf(handClass: string): Tier {
  if (PLAY.has(handClass)) return 'play';
  if (MAYBE.has(handClass)) return 'maybe';
  return 'fold';
}

export function verdictFor(handClass: string, seat: SeatId): Verdict {
  const tier = tierOf(handClass);
  if (tier === 'play') return 'play';
  if (tier === 'maybe') return SEATS.find((s) => s.id === seat)!.late ? 'play' : 'fold';
  return 'fold';
}

/** Turns a class like "A9s" into two real cards with suitable suits. */
export function cardsFor(handClass: string, rng: () => number = Math.random): Card[] {
  const r1 = handClass[0] as Rank;
  const r2 = handClass[1] as Rank;
  const suits = [...SUITS].sort(() => rng() - 0.5) as Suit[];
  if (handClass.length === 2) return [{ rank: r1, suit: suits[0] }, { rank: r2, suit: suits[1] }];
  if (handClass[2] === 's') return [{ rank: r1, suit: suits[0] }, { rank: r2, suit: suits[0] }];
  return [{ rank: r1, suit: suits[0] }, { rank: r2, suit: suits[1] }];
}

export interface PositionQuestion {
  handClass: string;
  cards: Card[];
  seat: SeatId;
}

// Most of the 169 hands are obvious folds (7-2 offsuit teaches nothing), so
// the drill over-samples where position actually decides the answer: the
// amber hands. Fold hands are drawn from "tempting" ones — an ace, two
// high cards, or suited — that beginners tend to over-play.
const CLASSES = allHandClasses();
const POOL_PLAY = CLASSES.filter((h) => tierOf(h) === 'play');
const POOL_MAYBE = CLASSES.filter((h) => tierOf(h) === 'maybe');
const HIGH = new Set<string>(['A', 'K', 'Q', 'J', 'T']);
const POOL_FOLD = CLASSES.filter(
  (h) => tierOf(h) === 'fold' && (h.endsWith('s') || h[0] === 'A' || (HIGH.has(h[0]) && HIGH.has(h[1]))),
);

export function generatePositionQuestion(rng: () => number = Math.random): PositionQuestion {
  const roll = rng();
  const pool = roll < 0.3 ? POOL_PLAY : roll < 0.75 ? POOL_MAYBE : POOL_FOLD;
  const handClass = pool[Math.floor(rng() * pool.length)];
  const seat = SEATS[Math.floor(rng() * SEATS.length)].id;
  return { handClass, cards: cardsFor(handClass, rng), seat };
}

export function positionQuestionId(q: PositionQuestion): string {
  return `${q.handClass}@${q.seat}`;
}

export function explainVerdict(handClass: string, seat: SeatId): string {
  const tier = tierOf(handClass);
  const s = SEATS.find((x) => x.id === seat)!;
  const after = `${s.playersAfter} player${s.playersAfter === 1 ? '' : 's'} still act after you`;
  if (tier === 'play') {
    return `This is a strong hand — open it from any seat. Even with ${after}, it holds up well.`;
  }
  if (tier === 'maybe') {
    return s.late
      ? `A borderline hand that becomes playable here: only ${after}, and you'll act after most of them on every later street. That edge turns it into a profitable raise.`
      : `A borderline hand. With ${after}, someone is too likely to hold better, and you'd act first on later streets. Fold it here — but raise the same hand from the cutoff or button.`;
  }
  return `Too weak to open from any seat — even from the button it loses money. It can look tempting (${
    handClass[0] === 'A' ? 'an ace' : handClass.endsWith('s') ? 'suited' : 'two high cards'
  }), but that is exactly the hand beginners over-play.`;
}

/** e.g. "A9s" -> "A-9 same suit", "33" -> "A pair of 3s" (sentence case, used as a heading). */
export function describeClass(handClass: string): string {
  const name = (r: string) => (r === 'T' ? '10' : r);
  if (handClass.length === 2) return `A pair of ${name(handClass[0])}s`;
  return `${name(handClass[0])}-${name(handClass[1])} ${handClass[2] === 's' ? 'same suit' : 'different suits'}`;
}
