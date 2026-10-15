import { describe, expect, it } from 'vitest';
import type { Card } from '../deck';
import { estimateEquity } from '../equity';
import { connectsWithBoard, describeRange, fitsRange, likelyRange, startingHandPercentile } from '../ranges';
import { decideAIAction } from '../../ai/decide';
import { CHARACTERS } from '../../ai/characters';

const C = (s: string): Card => ({ rank: s.slice(0, -1) as Card['rank'], suit: s.slice(-1) as Card['suit'] });
const H = (spec: string) => spec.split(' ').map(C);
function seeded(seed: number) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
const eq = (r: ReturnType<typeof estimateEquity>) => (r.winProbability + r.tieProbability / 2) * 100;

describe('starting hand ranking', () => {
  it('ranks hands sensibly', () => {
    expect(startingHandPercentile(C('Ah'), C('As'))).toBeCloseTo(6 / 1326, 5); // the best 6 combinations
    expect(startingHandPercentile(C('3h'), C('2d'))).toBe(1);
    expect(startingHandPercentile(C('Ah'), C('Kh'))).toBeLessThan(startingHandPercentile(C('Ah'), C('Kd')));
    expect(startingHandPercentile(C('Qh'), C('Qd'))).toBeLessThan(0.03);
    expect(startingHandPercentile(C('7h'), C('2d'))).toBeGreaterThan(0.95);
  });
});

describe('connects with the board', () => {
  const board = H('Kh 7h 2c');
  it('pairs, pocket pairs, flush and straight draws count; air does not', () => {
    expect(connectsWithBoard(H('Ks 4d'), board)).toBe(true); // top pair
    expect(connectsWithBoard(H('5s 5d'), board)).toBe(true); // pocket pair
    expect(connectsWithBoard(H('Ah 9h'), board)).toBe(true); // flush draw
    expect(connectsWithBoard(H('6s 5d'), H('4h 3c Kd'))).toBe(true); // open-ended straight draw
    expect(connectsWithBoard(H('Qs Jd'), board)).toBe(false); // nothing
    expect(connectsWithBoard(H('Ah 9h'), H('Kh 7h 2c 4d 3s'))).toBe(false); // river: a missed draw is air
  });
});

describe('likely ranges from the betting', () => {
  it('no raise before the flop: anything goes', () => {
    expect(likelyRange({ communityCards: [], amountToCall: 50, potBeforeAction: 75, bigBlind: 50 })).toBeUndefined();
  });
  it('bigger raises mean stronger hands', () => {
    const top = (toCall: number) => likelyRange({ communityCards: [], amountToCall: toCall, potBeforeAction: 200, bigBlind: 50 })!.bettor.preflopTop!;
    expect(top(150)).toBeGreaterThan(top(400));
    expect(top(400)).toBeGreaterThan(top(1000));
  });
  it('after the flop, bigger bets connect with the board more often', () => {
    const share = (toCall: number) => likelyRange({ communityCards: H('Kh 7h 2c'), amountToCall: toCall, potBeforeAction: 300, bigBlind: 50 })!.bettor.connectShare!;
    expect(share(300)).toBeGreaterThan(share(100));
    expect(likelyRange({ communityCards: H('Kh 7h 2c'), amountToCall: 0, potBeforeAction: 300 })!.bettor.connectShare).toBeUndefined();
  });
  it('explains the assumption in plain English', () => {
    expect(describeRange(likelyRange({ communityCards: [], amountToCall: 150, potBeforeAction: 75, bigBlind: 50 }), false)).toMatch(/best 30% of starting hands/);
    expect(describeRange(likelyRange({ communityCards: H('Kh 7h 2c'), amountToCall: 300, potBeforeAction: 300 }), true)).toMatch(/piece of the board/);
  });
  it('fitsRange filters as described', () => {
    expect(fitsRange(H('7h 2d'), [], { preflopTop: 0.3 }, 0.5)).toBe(false);
    expect(fitsRange(H('Ah Kd'), [], { preflopTop: 0.3 }, 0.5)).toBe(true);
    expect(fitsRange(H('Qs Jd'), H('Kh 7h 2c'), { connectShare: 0.8 }, 0.5)).toBe(false); // must connect this time
    expect(fitsRange(H('Qs Jd'), H('Kh 7h 2c'), { connectShare: 0.8 }, 0.9)).toBe(true); // a bluff
  });
});

describe('equity against a likely range', () => {
  it('top pair is worth much less against a pot-size bet than against random cards', () => {
    const board = H('Ks 7h 2c');
    const random = eq(estimateEquity(H('Kd 9c'), board, 1, 4000, seeded(1)));
    const vsBet = eq(estimateEquity(H('Kd 9c'), board, 1, 4000, seeded(1), likelyRange({ communityCards: board, amountToCall: 300, potBeforeAction: 300 })));
    expect(random).toBeGreaterThan(75);
    expect(vsBet).toBeLessThan(random - 10);
  });
  it('a medium pair is behind against a big re-raise', () => {
    const vsRaise = eq(estimateEquity(H('8h 8d'), [], 1, 4000, seeded(2), likelyRange({ communityCards: [], amountToCall: 1000, potBeforeAction: 1200, bigBlind: 50 })));
    expect(vsRaise).toBeLessThan(55);
    expect(eq(estimateEquity(H('8h 8d'), [], 1, 4000, seeded(2)))).toBeGreaterThan(65);
  });
  it('without a range nothing changes: aces win ~85% heads-up', () => {
    expect(eq(estimateEquity(H('Ah As'), [], 1, 6000, seeded(3)))).toBeGreaterThan(83);
    expect(eq(estimateEquity(H('Ah As'), [], 1, 6000, seeded(3)))).toBeLessThan(87.5);
  });
});

describe('bots respect bets', () => {
  it('a careful bot usually folds bottom pair to a pot-size bet (it used to call)', () => {
    const professor = CHARACTERS.find((c) => c.id === 'professor')!;
    let folds = 0;
    for (let seed = 1; seed <= 20; seed++) {
      const d = decideAIAction({
        holeCards: H('2s 9d'),
        communityCards: H('Kh Qh 2c'),
        numOpponents: 1,
        potBeforeAction: 300,
        amountToCall: 300,
        stack: 5000,
        currentBet: 300,
        minRaiseTo: 600,
        validActions: ['fold', 'call', 'raise'],
        profile: professor,
        bigBlind: 50,
        rng: seeded(seed),
      });
      if (d.type === 'fold') folds++;
    }
    expect(folds).toBeGreaterThanOrEqual(14);
  });
});
