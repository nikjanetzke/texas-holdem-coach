import type { Card } from './deck';
import { rankValue } from './deck';

// What hands an opponent is LIKELY to hold, given how they've bet. Judging your
// hand against random cards made both the bots and the coach far too willing
// to call: top pair beats a random hand ~85% of the time, but a player who
// bets the pot rarely holds a random hand. In simulated games the bots folded
// to only 15-35% of bets after the flop, so bluffing almost never worked —
// the wrong lesson for a beginner.

// All 169 starting hands, strongest first. Ranked by simulated equity (a blend
// of heads-up and three-way, so suited and connected hands aren't undervalued).
const RANKING =
  'AA KK QQ JJ TT 99 88 AKs AQs AJs AKo 77 AQo ATs KQs AJo KJs A9s KTs A8s ATo 66 KQo QJs A7s KJo KTo A9o QTs K9s A5s QJo A8o 55 A4s JTs Q9s QTo A6s K8s A7o K7s A3s K9o Q8s J9s A2s A6o A5o 44 JTo K6s Q9o A4o K5s K8o K4s T9s A3o T8s J8s A2o Q6s J9o Q7s J7s K2s K7o Q8o K3s Q5s K6o T9o 98s Q4s 33 K5o T7s K4o Q3s J8o Q7o T8o 97s K3o J6s T6s 87s J5s Q6o J7o Q5o 98o Q2s 96s K2o 22 Q4o J4s 86s T5s Q3o J3s 76s J6o T7o J2s 97o T3s T4s T6o 85s J4o 95s 75s 65s J5o 87o Q2o J3o 84s T2s 96o 94s T5o 86o 93s 76o 64s 54s J2o 74s 95o T4o 53s 83s 73s 92s 63s 75o 85o 65o 82s T3o 43s 94o T2o 93o 64o 62s 72s 84o 52s 92o 54o 74o 83o 42s 73o 32s 53o 82o 63o 43o 52o 72o 62o 42o 32o';

const ORDER = 'AKQJT98765432';

/** "AKs" / "T9o" / "77" for two hole cards. */
export function handClass(a: Card, b: Card): string {
  const [hi, lo] = ORDER.indexOf(a.rank) <= ORDER.indexOf(b.rank) ? [a, b] : [b, a];
  if (hi.rank === lo.rank) return hi.rank + lo.rank;
  return hi.rank + lo.rank + (hi.suit === lo.suit ? 's' : 'o');
}

// Percentile of each class: the share of all 1,326 two-card combinations that
// are at least this strong (AA = 0.45%, 32o = 100%).
const PERCENTILE: Record<string, number> = (() => {
  const out: Record<string, number> = {};
  let combos = 0;
  for (const c of RANKING.split(' ')) {
    combos += c.length === 2 ? 6 : c.endsWith('s') ? 4 : 12;
    out[c] = combos / 1326;
  }
  return out;
})();

/** 0 (best) .. 1 (worst): where these two cards rank among all starting hands. */
export function startingHandPercentile(a: Card, b: Card): number {
  return PERCENTILE[handClass(a, b)] ?? 1;
}

/**
 * Does this hand have a real piece of the board? A pair or better that uses a
 * hole card (including a pocket pair), or a flush or open-ended straight draw.
 * Cheap on purpose: it runs inside the equity simulation.
 */
export function connectsWithBoard(hole: Card[], board: Card[]): boolean {
  if (board.length < 3) return true;
  const [a, b] = hole;
  if (a.rank === b.rank) return true; // pocket pair
  for (const c of board) if (c.rank === a.rank || c.rank === b.rank) return true;
  if (board.length >= 5) return false; // no draws left on the river
  // Flush draw (or better): four of a suit, at least one from the hand.
  for (const suit of new Set([a.suit, b.suit])) {
    let n = (a.suit === suit ? 1 : 0) + (b.suit === suit ? 1 : 0);
    for (const c of board) if (c.suit === suit) n++;
    if (n >= 4) return true;
  }
  // Open-ended straight draw (or better): four in a row using a hole card.
  const ranks = new Set<number>();
  for (const c of [...hole, ...board]) {
    const v = rankValue(c.rank);
    ranks.add(v);
    if (v === 14) ranks.add(1);
  }
  const holeVals = new Set(hole.flatMap((c) => (rankValue(c.rank) === 14 ? [14, 1] : [rankValue(c.rank)])));
  for (let lo = 1; lo <= 11; lo++) {
    let run = 0;
    let usesHole = false;
    for (let v = lo; v < lo + 4; v++) {
      if (!ranks.has(v)) break;
      run++;
      if (holeVals.has(v)) usesHole = true;
    }
    if (run === 4 && usesHole) return true;
  }
  return false;
}

/** The hands an opponent is assumed to hold in the equity simulation. */
export interface OpponentRange {
  /** Only starting hands in the top fraction (0-1] of all hands. */
  preflopTop?: number;
  /** After the flop: chance an opponent's hand must connect with the board (the rest are bluffs/air). */
  connectShare?: number;
}

export interface BettingSpot {
  communityCards: Card[];
  /** Chips you must add to call (0 = nobody has bet). */
  amountToCall: number;
  /** The pot before your decision (not counting your call). */
  potBeforeAction: number;
  bigBlind?: number;
}

/**
 * Read likely ranges from the betting: one for the player who bet or raised,
 * one for everyone else still in (who only called, or hasn't acted yet).
 * Deliberately simple and readable:
 *   before the flop — no raise: anything; facing a raise, the raiser holds the
 *   top 30% of hands (top 18% for a big raise, top 10% for a re-raise or
 *   all-in); the others hold anything.
 *   after the flop — players still in played their hand before the flop (top
 *   55%); a bettor usually connects with the board, more so the bigger the
 *   bet and the later the street.
 * Returns undefined when everyone may hold anything.
 */
export function likelyRange(spot: BettingSpot): OpponentRanges | undefined {
  const bb = spot.bigBlind ?? Math.max(1, Math.round(spot.potBeforeAction / 3));
  if (spot.communityCards.length === 0) {
    if (spot.amountToCall <= bb) return undefined;
    const raiseBBs = spot.amountToCall / bb;
    return { bettor: { preflopTop: raiseBBs <= 3 ? 0.3 : raiseBBs <= 8 ? 0.18 : 0.1 } };
  }
  const stillIn: OpponentRange = { preflopTop: 0.55 };
  if (spot.amountToCall <= 0) return { bettor: stillIn, others: stillIn };
  const betFrac = Math.min(1.5, spot.amountToCall / Math.max(1, spot.potBeforeAction));
  const river = spot.communityCards.length >= 5 ? 0.05 : 0;
  return { bettor: { preflopTop: 0.55, connectShare: Math.min(0.88, 0.55 + 0.25 * Math.min(1, betFrac) + river) }, others: stillIn };
}

/** Ranges for the opponents: the bettor's, and everyone else's (absent = any hand). */
export interface OpponentRanges {
  bettor: OpponentRange;
  others?: OpponentRange;
}

/** Does this pair of hole cards fit the range? `roll` is a uniform random number. */
export function fitsRange(hole: Card[], board: Card[], range: OpponentRange, roll: number): boolean {
  if (range.preflopTop != null && startingHandPercentile(hole[0], hole[1]) > range.preflopTop) return false;
  if (range.connectShare != null && roll < range.connectShare && !connectsWithBoard(hole, board)) return false;
  return true;
}

/** The assumption behind a range, in plain English (for the coach's "show the math"). */
export function describeRange(ranges: OpponentRanges | undefined, onBoard: boolean, river = false): string | undefined {
  if (!ranges) return undefined;
  const range = ranges.bettor;
  const top = range.preflopTop != null ? Math.round(range.preflopTop * 100) : null;
  if (!onBoard) {
    return `They raised, so they probably hold one of the best ${top}% of starting hands. The coach deals the raiser hands like that, not random cards.`;
  }
  if (range.connectShare == null) {
    return `Players still in the hand usually started with a decent hand (roughly the best ${top}% of starting hands), so the coach deals them hands like that.`;
  }
  return `They bet, so about ${Math.round(range.connectShare * 100)}% of the time they'll have a piece of the board — ${river ? 'a pair or better' : 'a pair or a draw'} — and the rest are bluffs. The coach deals the bettor hands like that, not random cards.`;
}
