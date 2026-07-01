import type { Card, Rank, Suit } from './deck';
import { RANKS, SUITS, shuffle } from './deck';

// A drill that teaches counting "outs" (cards that improve your hand) and
// converting them to a rough win % via the rule of 2 & 4. Rather than detect
// draws in arbitrary hands (error-prone), we *construct* a hand that contains a
// known draw with a textbook out count, so the answer and explanation are exact.

export type DrawType = 'flush' | 'oesd' | 'gutshot' | 'overcards' | 'combo';

export const DRAW_LABELS: Record<DrawType, string> = {
  flush: 'Flush draw',
  oesd: 'Open-ended straight',
  gutshot: 'Gutshot straight',
  overcards: 'Two overcards',
  combo: 'Flush + straight',
};

export const ALL_DRAWS: DrawType[] = ['flush', 'oesd', 'gutshot', 'overcards', 'combo'];

export interface OutsScenario {
  hero: Card[];
  board: Card[];
  drawType: DrawType;
  drawName: string;
  outs: number;
  cardsToCome: 1 | 2;
  steps: string[];
}

const rnd = (n: number) => Math.floor(Math.random() * n);
const pick = <T>(a: T[]): T => a[rnd(a.length)];
const idxAll = () => Array.from({ length: 13 }, (_, i) => i);
const rl = (r: Rank) => (r === 'T' ? '10' : r);
const card = (i: number, s: Suit): Card => ({ rank: RANKS[i] as Rank, suit: s });
function countSuits(cards: Card[]): Record<string, number> {
  const m: Record<string, number> = {};
  cards.forEach((c) => (m[c.suit] = (m[c.suit] ?? 0) + 1));
  return m;
}
const comeText = (n: 1 | 2) => (n === 1 ? 'One more card to come (the river).' : 'Two more cards to come (turn and river).');

// True if any 5-rank window contains 4+ of these rank indices (i.e. a straight
// draw exists) — used to keep a "pure" flush draw from also being a straight draw.
function hasStraightDraw(idxs: number[]): boolean {
  const set = new Set(idxs);
  for (let s = 0; s <= 8; s++) {
    let n = 0;
    for (let r = s; r < s + 5; r++) if (set.has(r)) n++;
    if (n >= 4) return true;
  }
  return false;
}

function genFlush(): OutsScenario {
  const suit = pick(SUITS);
  const others = SUITS.filter((s) => s !== suit);
  let suitedIdx: number[] = [];
  let blankIdx = 0;
  // Retry until the five ranks form no straight draw, so the only draw is the flush.
  for (let tries = 0; tries < 50; tries++) {
    suitedIdx = shuffle(idxAll()).slice(0, 4).sort((a, b) => a - b);
    blankIdx = shuffle(idxAll().filter((i) => !suitedIdx.includes(i)))[0];
    if (!hasStraightDraw([...suitedIdx, blankIdx])) break;
  }
  const suited = suitedIdx.map((i) => card(i, suit));
  const blank = card(blankIdx, pick(others));
  return {
    hero: [suited[3], suited[2]],
    board: [suited[1], suited[0], blank],
    drawType: 'flush',
    drawName: 'Flush draw',
    outs: 9,
    cardsToCome: pick([1, 2]) as 1 | 2,
    steps: [
      `You hold two ${suit === 's' ? '♠' : suit === 'h' ? '♥' : suit === 'd' ? '♦' : '♣'} and two more are on the board — four of one suit.`,
      'A suit has 13 cards; you can already see 4, so 13 − 4 = 9 are left.',
      'Flush draw = 9 outs.',
    ],
  };
}

function genOESD(): OutsScenario {
  const base = 1 + rnd(8); // ranks base..base+3, both ends open
  const suits = shuffle([...SUITS]);
  const seq = [0, 1, 2, 3].map((k) => card(base + k, suits[k])); // 4 distinct suits → no flush draw
  const banned = new Set([base - 1, base, base + 1, base + 2, base + 3, base + 4]);
  const blankIdx = shuffle(idxAll().filter((i) => !banned.has(i)))[0];
  const sc = countSuits(seq);
  const blankSuit = SUITS.find((s) => (sc[s] ?? 0) < 2) ?? pick(SUITS);
  const blank = card(blankIdx, blankSuit);
  const all = [...seq, blank];
  return {
    hero: [all[0], all[4]],
    board: [all[1], all[2], all[3]],
    drawType: 'oesd',
    drawName: 'Open-ended straight draw',
    outs: 8,
    cardsToCome: pick([1, 2]) as 1 | 2,
    steps: [
      `You have four in a row: ${rl(RANKS[base] as Rank)}-${rl(RANKS[base + 1] as Rank)}-${rl(RANKS[base + 2] as Rank)}-${rl(RANKS[base + 3] as Rank)}.`,
      `Either end completes the straight: a ${rl(RANKS[base - 1] as Rank)} or a ${rl(RANKS[base + 4] as Rank)}.`,
      '4 of each rank = 8 outs.',
    ],
  };
}

function genGutshot(): OutsScenario {
  const i = rnd(9); // ranks i, i+1, i+2, i+4 — missing i+3
  const idxs = [i, i + 1, i + 2, i + 4];
  const suits = shuffle([...SUITS]);
  const cards = idxs.map((ix, k) => card(ix, suits[k]));
  const banned = new Set([i - 1, i, i + 1, i + 2, i + 3, i + 4, i + 5]);
  const blankIdx = shuffle(idxAll().filter((x) => !banned.has(x)))[0];
  const sc = countSuits(cards);
  const blankSuit = SUITS.find((s) => (sc[s] ?? 0) < 2) ?? pick(SUITS);
  const blank = card(blankIdx, blankSuit);
  const all = [...cards, blank];
  return {
    hero: [all[0], all[4]],
    board: [all[1], all[2], all[3]],
    drawType: 'gutshot',
    drawName: 'Gutshot straight draw',
    outs: 4,
    cardsToCome: pick([1, 2]) as 1 | 2,
    steps: [
      `You have ${rl(RANKS[i] as Rank)}-${rl(RANKS[i + 1] as Rank)}-${rl(RANKS[i + 2] as Rank)} and ${rl(RANKS[i + 4] as Rank)} — a straight with a hole in the middle.`,
      `Only a ${rl(RANKS[i + 3] as Rank)} fills it.`,
      `4 ${rl(RANKS[i + 3] as Rank)}s = 4 outs.`,
    ],
  };
}

function genOvercards(): OutsScenario {
  const heroIdx = shuffle([9, 10, 11, 12]).slice(0, 2); // J,Q,K,A
  const boardIdx = shuffle([0, 1, 2, 3, 4, 5, 6]).slice(0, 3); // 2..8 (well below hero)
  const heroSuits = shuffle([...SUITS]).slice(0, 2);
  const boardSuits = shuffle([...SUITS]).slice(0, 3); // 3 distinct → no flush draw
  const hero = heroIdx.map((ix, k) => card(ix, heroSuits[k]));
  const board = boardIdx.map((ix, k) => card(ix, boardSuits[k]));
  return {
    hero,
    board,
    drawType: 'overcards',
    drawName: 'Two overcards',
    outs: 6,
    cardsToCome: pick([1, 2]) as 1 | 2,
    steps: [
      'Both your cards are higher than everything on the board.',
      'Pairing either one likely makes the best pair.',
      '3 cards left to pair each → 3 + 3 = 6 outs.',
    ],
  };
}

function genCombo(): OutsScenario {
  const suit = pick(SUITS);
  const others = SUITS.filter((s) => s !== suit);
  const base = 1 + rnd(8); // 4-straight base..base+3, all in `suit`
  const seq = [0, 1, 2, 3].map((k) => card(base + k, suit));
  const banned = new Set([base - 1, base, base + 1, base + 2, base + 3, base + 4]);
  const blankIdx = shuffle(idxAll().filter((i) => !banned.has(i)))[0];
  const blank = card(blankIdx, pick(others));
  return {
    hero: [seq[3], seq[2]],
    board: [seq[1], seq[0], blank],
    drawType: 'combo',
    drawName: 'Flush + open-ended straight',
    outs: 15,
    cardsToCome: pick([1, 2]) as 1 | 2,
    steps: [
      `Four of one suit = a flush draw (9 outs), and ${rl(RANKS[base] as Rank)}-${rl(RANKS[base + 1] as Rank)}-${rl(RANKS[base + 2] as Rank)}-${rl(RANKS[base + 3] as Rank)} = an open-ended straight draw (8 outs).`,
      'Two straight cards are also that suit (already counted in the 9), so 9 + 8 − 2 = 15.',
      'A monster draw = 15 outs.',
    ],
  };
}

const GENERATORS: Record<DrawType, () => OutsScenario> = {
  flush: genFlush,
  oesd: genOESD,
  gutshot: genGutshot,
  overcards: genOvercards,
  combo: genCombo,
};

export function generateOutsScenario(enabled: DrawType[]): OutsScenario {
  const types = enabled.length > 0 ? enabled : ALL_DRAWS;
  return GENERATORS[pick(types)]();
}

// Rule of 2 & 4: outs × 4 on the flop (two cards to come), × 2 on the turn.
export function hitPercent(outs: number, cardsToCome: 1 | 2): number {
  return outs * (cardsToCome === 2 ? 4 : 2);
}

export function comeDescription(n: 1 | 2): string {
  return comeText(n);
}

// Multiple-choice out counts: the correct answer plus plausible distractors.
export function outsOptions(correct: number): number[] {
  const pool = [4, 6, 8, 9, 12, 15];
  const distractors = shuffle(pool.filter((n) => n !== correct)).slice(0, 3);
  return shuffle([correct, ...distractors]);
}
