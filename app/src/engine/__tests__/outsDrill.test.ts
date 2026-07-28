import { describe, expect, it } from 'vitest';
import { ALL_DRAWS, comeDescription, generateOutsScenario } from '../outsDrill';
import { cardToString, makeDeck, rankValue } from '../deck';
import type { Card } from '../deck';
import { HandRank, compareHandValues, evaluateBestHand } from '../evaluator';

// Ground truth for "how many outs does this scenario really have?" — deals
// every remaining card and asks the real hand evaluator whether it completes
// the intended hand. This is how the "missing outs" bug was actually found:
// the gutshot generator's claimed 4 outs was sometimes really 8 (a kicker
// card let a *different* drawn card complete an unrelated second straight,
// including the classic wheel A-2-3-4-5 trap), and separately the board
// shown didn't match the "cards to come" the drill stated (a pure flop board
// while claiming only the river was left).
function trueOutsCount(hero: Card[], board: Card[], drawType: string): number {
  const used = new Set([...hero, ...board].map(cardToString));
  const remaining = makeDeck().filter((c) => !used.has(cardToString(c)));
  const heroVals = hero.map((c) => rankValue(c.rank));
  let count = 0;
  for (const cand of remaining) {
    const after = evaluateBestHand([...hero, ...board, cand]);
    let hit: boolean;
    if (drawType === 'flush') hit = after.rank >= HandRank.Flush;
    else if (drawType === 'oesd' || drawType === 'gutshot') hit = after.rank === HandRank.Straight || after.rank === HandRank.StraightFlush;
    else if (drawType === 'combo') hit = after.rank === HandRank.Straight || after.rank >= HandRank.Flush;
    else hit = after.rank === HandRank.OnePair && heroVals.includes(after.tiebreakers[0]);
    if (hit) count++;
  }
  return count;
}

describe('outs drill', () => {
  it('every draw type reports the true out count (verified against the hand evaluator)', () => {
    for (const type of ALL_DRAWS) {
      for (let i = 0; i < 60; i++) {
        const s = generateOutsScenario([type]);
        const trueOuts = trueOutsCount(s.hero, s.board, s.drawType);
        expect(trueOuts, `${type} #${i}: claimed ${s.outs} outs, actually ${trueOuts}`).toBe(s.outs);
      }
    }
  });

  it('the board shown always matches the stated cards-to-come', () => {
    // cardsToCome=2 (flop, turn+river left) -> 3-card board.
    // cardsToCome=1 (turn dealt, river left) -> 4-card board.
    // Previously the board was always 3 cards regardless, so "one card left
    // (the river)" was shown with a 3-card flop board instead of the correct
    // 4-card post-turn board.
    for (const type of ALL_DRAWS) {
      for (let i = 0; i < 40; i++) {
        const s = generateOutsScenario([type]);
        const expectedBoardSize = s.cardsToCome === 2 ? 3 : 4;
        expect(s.board.length, `${type} #${i}: cardsToCome=${s.cardsToCome}`).toBe(expectedBoardSize);
      }
    }
  });

  it('never deals the same card twice within a scenario', () => {
    for (const type of ALL_DRAWS) {
      for (let i = 0; i < 40; i++) {
        const s = generateOutsScenario([type]);
        const all = [...s.hero, ...s.board].map(cardToString);
        expect(new Set(all).size, `${type} #${i}`).toBe(all.length);
      }
    }
  });

  it('describes cards-to-come consistently', () => {
    expect(comeDescription(2)).toMatch(/turn and river/i);
    expect(comeDescription(1)).toMatch(/river/i);
  });
});

describe('outs that only improve the shared board', () => {
  // A card that completes the hand on the BOARD is not an out: every player
  // holds the identical five cards, so you win nothing and at best chop.
  // Reported from real play — a board running 4-5-6-7 was presented as an
  // 8-out open-ender, but the cards completing it put the straight on the
  // board itself, shared by the whole table.
  function genuineOuts(hero: Card[], board: Card[], drawType: string): number {
    const used = new Set([...hero, ...board].map(cardToString));
    const remaining = makeDeck().filter((c) => !used.has(cardToString(c)));
    const heroVals = hero.map((c) => rankValue(c.rank));
    let n = 0;
    for (const cand of remaining) {
      const fullBoard = [...board, cand];
      const after = evaluateBestHand([...hero, ...fullBoard]);
      let hit: boolean;
      if (drawType === 'flush') hit = after.rank >= HandRank.Flush;
      else if (drawType === 'oesd' || drawType === 'gutshot')
        hit = after.rank === HandRank.Straight || after.rank === HandRank.StraightFlush;
      else if (drawType === 'combo') hit = after.rank === HandRank.Straight || after.rank >= HandRank.Flush;
      else hit = after.rank === HandRank.OnePair && heroVals.includes(after.tiebreakers[0]);
      // Beat the board, or it isn't an out.
      if (hit && fullBoard.length >= 5 && compareHandValues(after, evaluateBestHand(fullBoard)) <= 0) hit = false;
      if (hit) n++;
    }
    return n;
  }

  it('never claims outs that merely put the hand on the board', () => {
    for (let i = 0; i < 400; i++) {
      const s = generateOutsScenario(ALL_DRAWS);
      expect(
        genuineOuts(s.hero, s.board, s.drawType),
        `${s.drawType}: hero ${s.hero.map(cardToString).join(' ')} board ${s.board.map(cardToString).join(' ')}`,
      ).toBe(s.outs);
    }
  });

  it('rejects a gutshot whose only completing card makes a board straight', () => {
    // Board 3-4-6-2 with a 5 arriving reads 2-3-4-5-6 — the whole table has it.
    const hero = [
      { rank: '2', suit: 'c' },
      { rank: 'T', suit: 's' },
    ] as Card[];
    const board = [
      { rank: '3', suit: 's' },
      { rank: '4', suit: 'h' },
      { rank: '6', suit: 'd' },
      { rank: '2', suit: 's' },
    ] as Card[];
    expect(genuineOuts(hero, board, 'gutshot')).toBe(0);
  });
});
