import type { Card, Rank, Suit } from './deck';
import { RANKS, SUITS, cardToString, makeDeck, rankValue, shuffle } from './deck';
import { HandRank, evaluateBestHand } from './evaluator';

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

type WantHit = 'flush' | 'straight' | 'flushOrStraight' | 'overpair';

// Ground truth for "how many outs does this really have?" — deals every
// remaining card and asks the real hand evaluator whether it completes the
// intended hand. This exists because hand-picked "banned rank" windows around
// each generator's blank/kicker cards turned out to miss real cases (e.g. an
// Ace kicker letting a *different* drawn card complete a wheel straight
// A-2-3-4-5, silently doubling a claimed gutshot's true outs from 4 to 8).
// Every generator below verifies its own claimed count against this before
// returning a scenario, so a bad deal gets retried instead of shown to the user.
function trueOutsCount(hero: Card[], board: Card[], want: WantHit): number {
  const used = new Set([...hero, ...board].map(cardToString));
  const remaining = makeDeck().filter((c) => !used.has(cardToString(c)));
  const heroVals = hero.map((c) => rankValue(c.rank));
  let count = 0;
  for (const cand of remaining) {
    const after = evaluateBestHand([...hero, ...board, cand]);
    let hit: boolean;
    if (want === 'flush') hit = after.rank >= HandRank.Flush;
    else if (want === 'straight') hit = after.rank === HandRank.Straight || after.rank === HandRank.StraightFlush;
    else if (want === 'flushOrStraight') hit = after.rank === HandRank.Straight || after.rank >= HandRank.Flush;
    else hit = after.rank === HandRank.OnePair && heroVals.includes(after.tiebreakers[0]);
    if (hit) count++;
  }
  return count;
}

// Draws one more random card (the "turn") not already in use — for scenarios
// where only the river is left to come, the board must show the turn card
// too, or the drill contradicts itself (says "one card left" but shows a
// 3-card flop board). The outer retry-and-verify wrapper rejects any turn
// card that happens to change the true out count.
function drawExtraCard(exclude: Card[]): Card {
  const used = new Set(exclude.map(cardToString));
  const pool = shuffle(makeDeck()).filter((c) => !used.has(cardToString(c)));
  return pool[0];
}

// Wraps a generator attempt with a self-verification retry loop: keep
// re-rolling until the scenario's claimed `outs` matches the real count.
function verified(attempt: () => OutsScenario, want: WantHit): OutsScenario {
  let last: OutsScenario | null = null;
  for (let tries = 0; tries < 200; tries++) {
    const s = attempt();
    last = s;
    if (trueOutsCount(s.hero, s.board, want) === s.outs) return s;
  }
  return last!; // astronomically unlikely to be reached
}

// Randomly decides how many cards are left to come and, when it's only the
// river (1), deals a turn card onto the board so the board shown always
// matches the stated street — previously the board was always a 3-card flop
// even when the drill claimed "one card left" (which implies a 4-card,
// post-turn board), a mismatch players could clearly see on screen.
function finalizeBoard(hero: Card[], flopBoard: Card[]): { board: Card[]; cardsToCome: 1 | 2 } {
  const cardsToCome = pick([1, 2]) as 1 | 2;
  if (cardsToCome === 1) {
    const turn = drawExtraCard([...hero, ...flopBoard]);
    return { board: [...flopBoard, turn], cardsToCome };
  }
  return { board: flopBoard, cardsToCome };
}

function genFlushOnce(): OutsScenario {
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
  const hero = [suited[3], suited[2]];
  const { board, cardsToCome } = finalizeBoard(hero, [suited[1], suited[0], blank]);
  return {
    hero,
    board,
    drawType: 'flush',
    drawName: 'Flush draw',
    outs: 9,
    cardsToCome,
    steps: [
      `You hold two ${suit === 's' ? '♠' : suit === 'h' ? '♥' : suit === 'd' ? '♦' : '♣'} and two more are on the board — four of one suit.`,
      'A suit has 13 cards; you can already see 4, so 13 − 4 = 9 are left.',
      'Flush draw = 9 outs.',
    ],
  };
}
function genFlush(): OutsScenario {
  return verified(genFlushOnce, 'flush');
}

function genOESDOnce(): OutsScenario {
  const base = 1 + rnd(8); // ranks base..base+3, both ends open
  const suits = shuffle([...SUITS]);
  const seq = [0, 1, 2, 3].map((k) => card(base + k, suits[k])); // 4 distinct suits → no flush draw
  const banned = new Set([base - 1, base, base + 1, base + 2, base + 3, base + 4]);
  const blankIdx = shuffle(idxAll().filter((i) => !banned.has(i)))[0];
  const sc = countSuits(seq);
  const blankSuit = SUITS.find((s) => (sc[s] ?? 0) < 2) ?? pick(SUITS);
  const blank = card(blankIdx, blankSuit);
  const all = [...seq, blank];
  const hero = [all[0], all[4]];
  const { board, cardsToCome } = finalizeBoard(hero, [all[1], all[2], all[3]]);
  return {
    hero,
    board,
    drawType: 'oesd',
    drawName: 'Open-ended straight draw',
    outs: 8,
    cardsToCome,
    steps: [
      `You have four in a row: ${rl(RANKS[base] as Rank)}-${rl(RANKS[base + 1] as Rank)}-${rl(RANKS[base + 2] as Rank)}-${rl(RANKS[base + 3] as Rank)}.`,
      `Either end completes the straight: a ${rl(RANKS[base - 1] as Rank)} or a ${rl(RANKS[base + 4] as Rank)}.`,
      '4 of each rank = 8 outs.',
    ],
  };
}
function genOESD(): OutsScenario {
  return verified(genOESDOnce, 'straight');
}

function genGutshotOnce(): OutsScenario {
  const i = rnd(9); // ranks i, i+1, i+2, i+4 — missing i+3
  const idxs = [i, i + 1, i + 2, i + 4];
  const suits = shuffle([...SUITS]);
  const cards = idxs.map((ix, k) => card(ix, suits[k]));
  const banned = new Set([i - 2, i - 1, i, i + 1, i + 2, i + 3, i + 4, i + 5]);
  const blankIdx = shuffle(idxAll().filter((x) => !banned.has(x)))[0];
  const sc = countSuits(cards);
  const blankSuit = SUITS.find((s) => (sc[s] ?? 0) < 2) ?? pick(SUITS);
  const blank = card(blankIdx, blankSuit);
  const all = [...cards, blank];
  const hero = [all[0], all[4]];
  const { board, cardsToCome } = finalizeBoard(hero, [all[1], all[2], all[3]]);
  return {
    hero,
    board,
    drawType: 'gutshot',
    drawName: 'Gutshot straight draw',
    outs: 4,
    cardsToCome,
    steps: [
      `You have ${rl(RANKS[i] as Rank)}-${rl(RANKS[i + 1] as Rank)}-${rl(RANKS[i + 2] as Rank)} and ${rl(RANKS[i + 4] as Rank)} — a straight with a hole in the middle.`,
      `Only a ${rl(RANKS[i + 3] as Rank)} fills it.`,
      `4 ${rl(RANKS[i + 3] as Rank)}s = 4 outs.`,
    ],
  };
}
// The banned-window tightening (excluding i-2) fixes the common case where a
// blank kicker at i-2 lets a different drawn card complete a second straight.
// It doesn't cover every combinatorial trap (e.g. an Ace kicker enabling a
// wheel straight, A-2-3-4-5), so this is also wrapped in `verified` — the
// safety net that actually guarantees the claimed out count is correct.
function genGutshot(): OutsScenario {
  return verified(genGutshotOnce, 'straight');
}

function genOvercardsOnce(): OutsScenario {
  const heroIdx = shuffle([9, 10, 11, 12]).slice(0, 2); // J,Q,K,A
  const boardIdx = shuffle([0, 1, 2, 3, 4, 5, 6]).slice(0, 3); // 2..8 (well below hero)
  const heroSuits = shuffle([...SUITS]).slice(0, 2);
  const boardSuits = shuffle([...SUITS]).slice(0, 3); // 3 distinct → no flush draw
  const hero = heroIdx.map((ix, k) => card(ix, heroSuits[k]));
  const { board, cardsToCome } = finalizeBoard(hero, boardIdx.map((ix, k) => card(ix, boardSuits[k])));
  return {
    hero,
    board,
    drawType: 'overcards',
    drawName: 'Two overcards',
    outs: 6,
    cardsToCome,
    steps: [
      'Both your cards are higher than everything on the board.',
      'Pairing either one likely makes the best pair.',
      '3 cards left to pair each → 3 + 3 = 6 outs.',
    ],
  };
}
function genOvercards(): OutsScenario {
  return verified(genOvercardsOnce, 'overpair');
}

function genComboOnce(): OutsScenario {
  const suit = pick(SUITS);
  const others = SUITS.filter((s) => s !== suit);
  const base = 1 + rnd(8); // 4-straight base..base+3, all in `suit`
  const seq = [0, 1, 2, 3].map((k) => card(base + k, suit));
  const banned = new Set([base - 1, base, base + 1, base + 2, base + 3, base + 4]);
  const blankIdx = shuffle(idxAll().filter((i) => !banned.has(i)))[0];
  const blank = card(blankIdx, pick(others));
  const hero = [seq[3], seq[2]];
  const { board, cardsToCome } = finalizeBoard(hero, [seq[1], seq[0], blank]);
  return {
    hero,
    board,
    drawType: 'combo',
    drawName: 'Flush + open-ended straight',
    outs: 15,
    cardsToCome,
    steps: [
      `Four of one suit = a flush draw (9 outs), and ${rl(RANKS[base] as Rank)}-${rl(RANKS[base + 1] as Rank)}-${rl(RANKS[base + 2] as Rank)}-${rl(RANKS[base + 3] as Rank)} = an open-ended straight draw (8 outs).`,
      'Two straight cards are also that suit (already counted in the 9), so 9 + 8 − 2 = 15.',
      'A monster draw = 15 outs.',
    ],
  };
}
function genCombo(): OutsScenario {
  return verified(genComboOnce, 'flushOrStraight');
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
