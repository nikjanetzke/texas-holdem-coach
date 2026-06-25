import { describe, expect, it } from 'vitest';
import type { Card } from '../deck';
import { compareHandValues, evaluateBestHand, HandRank } from '../evaluator';

function cards(spec: string): Card[] {
  // spec like "As Kd Qh Jc Ts"
  return spec.trim().split(/\s+/).map((token) => ({
    rank: token.slice(0, -1) as Card['rank'],
    suit: token.slice(-1) as Card['suit'],
  }));
}

describe('evaluateBestHand', () => {
  it('detects a royal flush as the top straight flush', () => {
    const result = evaluateBestHand(cards('As Ks Qs Js Ts 2h 3d'));
    expect(result.rank).toBe(HandRank.StraightFlush);
    expect(result.tiebreakers[0]).toBe(14);
  });

  it('detects a straight flush', () => {
    const result = evaluateBestHand(cards('9s 8s 7s 6s 5s 2h 3d'));
    expect(result.rank).toBe(HandRank.StraightFlush);
    expect(result.tiebreakers[0]).toBe(9);
  });

  it('detects four of a kind', () => {
    const result = evaluateBestHand(cards('Ah Ad As Ac Kd 2h 3d'));
    expect(result.rank).toBe(HandRank.FourOfAKind);
    expect(result.tiebreakers).toEqual([14, 13]);
  });

  it('detects a full house', () => {
    const result = evaluateBestHand(cards('Ah Ad As Kd Kh 2h 3d'));
    expect(result.rank).toBe(HandRank.FullHouse);
    expect(result.tiebreakers).toEqual([14, 13]);
  });

  it('picks the better full house when two trips are available (7-card case)', () => {
    const result = evaluateBestHand(cards('Ah Ad As Kd Kh Kc 3d'));
    expect(result.rank).toBe(HandRank.FullHouse);
    expect(result.tiebreakers).toEqual([14, 13]);
  });

  it('detects a flush', () => {
    const result = evaluateBestHand(cards('Ah Kh 9h 4h 2h 3d 5c'));
    expect(result.rank).toBe(HandRank.Flush);
  });

  it('detects a normal straight', () => {
    const result = evaluateBestHand(cards('9c 8d 7h 6s 5c 2h 3d'));
    expect(result.rank).toBe(HandRank.Straight);
    expect(result.tiebreakers[0]).toBe(9);
  });

  it('detects the wheel (ace-low straight)', () => {
    const result = evaluateBestHand(cards('Ah 2d 3h 4s 5c Kd 9h'));
    expect(result.rank).toBe(HandRank.Straight);
    expect(result.tiebreakers[0]).toBe(5);
  });

  it('does not wrap a straight around the ace (K-A-2-3-4 is not a straight)', () => {
    const result = evaluateBestHand(cards('Kh Ad 2h 3s 4c 9d 7c'));
    expect(result.rank).not.toBe(HandRank.Straight);
  });

  it('detects three of a kind', () => {
    const result = evaluateBestHand(cards('Ah Ad As Kd 2h 3d 5c'));
    expect(result.rank).toBe(HandRank.ThreeOfAKind);
  });

  it('detects two pair, picking the best two pairs from 7 cards', () => {
    const result = evaluateBestHand(cards('Ah Ad Kh Kd Qh Qd 2c'));
    expect(result.rank).toBe(HandRank.TwoPair);
    expect(result.tiebreakers).toEqual([14, 13, 12]);
  });

  it('detects one pair', () => {
    const result = evaluateBestHand(cards('Ah Ad Kh Qd Jh 9c 2c'));
    expect(result.rank).toBe(HandRank.OnePair);
  });

  it('detects high card', () => {
    const result = evaluateBestHand(cards('Ah Kd 9h 4s 2c 7d Jc'));
    expect(result.rank).toBe(HandRank.HighCard);
  });

  it('ranks a flush above a straight', () => {
    const flush = evaluateBestHand(cards('Ah Kh 9h 4h 2h 3d 5c'));
    const straight = evaluateBestHand(cards('9c 8d 7h 6s 5c 2h 3d'));
    expect(compareHandValues(flush, straight)).toBeGreaterThan(0);
  });

  it('breaks ties on kicker for one pair', () => {
    const better = evaluateBestHand(cards('Ah Ad Kh Qd Jh 9c 2c'));
    const worse = evaluateBestHand(cards('Ah Ad Kh Qd 9h 8c 2c'));
    expect(compareHandValues(better, worse)).toBeGreaterThan(0);
  });

  it('treats equal hands as ties', () => {
    const a = evaluateBestHand(cards('Ah Kd 9h 4s 2c 7d Jc'));
    const b = evaluateBestHand(cards('As Kc 9d 4h 2d 7s Jd'));
    expect(compareHandValues(a, b)).toBe(0);
  });
});
