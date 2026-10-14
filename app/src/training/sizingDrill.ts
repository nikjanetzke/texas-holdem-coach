import type { Card, Rank } from '../engine/deck';
import { RANKS, SUITS, makeDeck, rankValue, shuffle } from '../engine/deck';
import { HandRank, evaluateBestHand } from '../engine/evaluator';

// Bet sizing with a strong hand, taught through the one idea that matters
// most for beginners: what PRICE does your bet give the other player?
//
//   price they need = bet ÷ (pot + bet + their call)  =  f ÷ (1 + 2f)
//   ⅓ pot → 20%   ½ pot → 25%   ¾ pot → 30%   pot → 33%
//
// A flush draw hits about 20% of the time on the next card. So:
//   • Board full of draws  → bet BIG (¾ pot+). A small bet hands draws a fair
//     price to chase the cards that beat you.
//   • Dry board, no draws  → bet SMALL (⅓–½ pot). There's nothing to charge;
//     a big bet only scares off the worse hands that would have paid you.
//
// Only clearly draw-heavy or clearly dry boards are used — "in-between" boards
// are where good players genuinely disagree, and a drill shouldn't grade those.

export type SizeId = 'third' | 'half' | 'threeQuarter' | 'pot';
export const SIZES: { id: SizeId; label: string; frac: number }[] = [
  { id: 'third', label: '⅓ pot', frac: 1 / 3 },
  { id: 'half', label: '½ pot', frac: 1 / 2 },
  { id: 'threeQuarter', label: '¾ pot', frac: 3 / 4 },
  { id: 'pot', label: 'Pot', frac: 1 },
];

/** % an opponent must win to call a bet of `frac` × pot. */
export function priceForCaller(frac: number): number {
  return (frac / (1 + 2 * frac)) * 100;
}

/** Roughly how often a flush draw (9 outs) hits on the very next card. */
export const FLUSH_DRAW_NEXT_CARD = 20;

export type Texture = 'wet' | 'dry' | 'mixed';

const vals = (cards: Card[]) => [...new Set(cards.map((c) => rankValue(c.rank)))];

// Rank gaps count an ace as low too (A-2-3-4-5 straights).
function minRankGap(cards: Card[]): number {
  const v = vals(cards);
  if (v.includes(14)) v.push(1);
  let gap = Infinity;
  for (let i = 0; i < v.length; i++) for (let j = i + 1; j < v.length; j++) {
    const d = Math.abs(v[i] - v[j]);
    if (d > 0) gap = Math.min(gap, d);
  }
  return gap;
}

/**
 * Classifies a flop/turn board.
 *  wet = a flush draw is possible (exactly two of one suit, no flush made yet)
 *        AND two cards are close enough for straight draws (within 2 ranks).
 *  dry = all different suits AND no two cards within 3 ranks (e.g. K-7-2).
 */
export function boardTexture(board: Card[]): Texture {
  const suitCounts: Record<string, number> = {};
  for (const c of board) suitCounts[c.suit] = (suitCounts[c.suit] ?? 0) + 1;
  const maxSuit = Math.max(...Object.values(suitCounts));
  const gap = minRankGap(board);
  if (maxSuit === 2 && gap <= 2) return 'wet';
  if (maxSuit === 1 && gap > 3) return 'dry';
  return 'mixed';
}

export function correctSizes(texture: 'wet' | 'dry'): SizeId[] {
  return texture === 'wet' ? ['threeQuarter', 'pot'] : ['third', 'half'];
}

export type StrongHandType = 'set' | 'overpair' | 'toppair';
const HAND_LABEL: Record<StrongHandType, string> = {
  set: 'Three of a kind (a “set”)',
  overpair: 'An overpair — a pocket pair above every board card',
  toppair: 'Top pair with a top kicker',
};

export interface SizingQuestion {
  hero: Card[];
  board: Card[];
  texture: 'wet' | 'dry';
  handType: StrongHandType;
  handLabel: string;
  pot: number;
  opponents: number;
}

const key = (c: Card) => `${c.rank}${c.suit}`;

function buildHero(board: Card[], type: StrongHandType, rng: () => number): Card[] | null {
  const used = new Set(board.map(key));
  const free = (rank: Rank) => SUITS.map((suit) => ({ rank, suit })).filter((c) => !used.has(key(c)));
  const boardVals = board.map((c) => rankValue(c.rank));
  const high = Math.max(...boardVals);
  const pick = <T,>(xs: T[]) => xs[Math.floor(rng() * xs.length)];
  if (type === 'set') {
    const rank = pick(board).rank;
    const cards = shuffle(free(rank), rng);
    return cards.length >= 2 ? cards.slice(0, 2) : null;
  }
  if (type === 'overpair') {
    const above = RANKS.filter((r) => rankValue(r) > high);
    if (above.length === 0) return null;
    const cards = shuffle(free(pick(above)), rng);
    return cards.slice(0, 2);
  }
  // Top pair, top kicker: one card matching the highest board card plus an
  // ace (or king, when the board's top card is the ace) that isn't on the board.
  const highRank = board.find((c) => rankValue(c.rank) === high)!.rank;
  const kickerRank: Rank = highRank === 'A' ? 'K' : 'A';
  if (boardVals.includes(rankValue(kickerRank))) return null;
  const pairCard = shuffle(free(highRank), rng)[0];
  const kicker = shuffle(free(kickerRank), rng)[0];
  return pairCard && kicker ? [pairCard, kicker] : null;
}

export function generateSizingQuestion(rng: () => number = Math.random): SizingQuestion {
  // Texture is chosen ONCE, then boards are searched until one matches. Rolling
  // it inside the loop biased the drill to whichever texture is easier to deal
  // (draw-heavy boards: 95% of questions in testing).
  const texture: 'wet' | 'dry' = rng() < 0.5 ? 'wet' : 'dry';
  for (let tries = 0; tries < 4000; tries++) {
    const board = shuffle(makeDeck(), rng).slice(0, 3);
    if (boardTexture(board) !== texture) continue;
    // Paired boards make "top pair" / "set" ambiguous for a beginner; skip them.
    if (new Set(board.map((c) => c.rank)).size < 3) continue;
    const types: StrongHandType[] = ['set', 'overpair', 'toppair'];
    const handType = types[Math.floor(rng() * types.length)];
    const hero = buildHero(board, handType, rng);
    if (!hero) continue;
    // Sanity: the hero hand really is what it claims (and not, say, a flush).
    const best = evaluateBestHand([...hero, ...board]);
    const expected = handType === 'set' ? HandRank.ThreeOfAKind : HandRank.OnePair;
    if (best.rank !== expected) continue;
    const pot = 100 + Math.floor(rng() * 21) * 25; // 100..600
    return {
      hero,
      board,
      texture,
      handType,
      handLabel: HAND_LABEL[handType],
      pot,
      opponents: rng() < 0.6 ? 1 : 2,
    };
  }
  throw new Error('could not generate a sizing question');
}

export function sizingQuestionId(q: SizingQuestion): string {
  return `${q.hero.map(key).join('')}|${q.board.map(key).join('')}`;
}

export function explainSizing(q: SizingQuestion): string {
  if (q.texture === 'wet') {
    return `This board is full of draws — two cards of one suit (a flush draw) and connected cards (straight draws). You're ahead now, but plenty of cards can beat you. Bet big so chasing those cards is a mistake for them: at ¾ pot they need ${Math.round(
      priceForCaller(0.75),
    )}% to call, more than the ~${FLUSH_DRAW_NEXT_CARD}% a flush draw hits next card. At ⅓ pot they'd need only ${Math.round(
      priceForCaller(1 / 3),
    )}% — you'd be giving them a fair price to outdraw you. Even ½ pot (${Math.round(
      priceForCaller(0.5),
    )}%) is too cheap: on the flop a draw has the turn AND the river to hit (about 35% for a flush draw), and wins extra chips from you when it does.`;
  }
  return `This board is dry — all different suits and spread-out cards, so there are almost no draws to charge. Your real goal is to get paid by worse hands. A big bet makes them fold; a small bet (⅓–½ pot) keeps them calling, and costs you almost nothing since few cards can beat you.`;
}

/** In-game check: a strong hand bet small on a draw-heavy board. Returns a note or null. */
export function sizingNote(args: {
  board: Card[];
  betAmount: number;
  potBefore: number;
  equityPercent: number;
}): string | null {
  const { board, betAmount, potBefore, equityPercent } = args;
  if (board.length < 3 || board.length > 4 || potBefore <= 0) return null;
  if (equityPercent < 60 || boardTexture(board) !== 'wet') return null;
  const frac = betAmount / potBefore;
  if (frac >= 0.5) return null;
  const price = Math.round(priceForCaller(frac));
  return `Bet sizing: your ${Math.round(frac * 100)}%-of-pot bet with a strong hand on a board full of draws let them call needing only ${price}% — about what a flush draw hits next card. Here, bet ¾ pot or more.`;
}
