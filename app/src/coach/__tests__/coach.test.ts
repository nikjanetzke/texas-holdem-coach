import { describe, expect, it } from 'vitest';
import type { Card } from '../../engine/deck';
import { generateAdvice, LeakTracker, scoreDecision, suggestionLabel } from '../coach';

function cards(spec: string): Card[] {
  return spec.trim().split(/\s+/).map((token) => ({
    rank: token.slice(0, -1) as Card['rank'],
    suit: token.slice(-1) as Card['suit'],
  }));
}

describe('generateAdvice', () => {
  it('suggests folding a weak hand facing a large bet', () => {
    const advice = generateAdvice({
      holeCards: cards('7c 2d'),
      communityCards: cards('Ah Kd Qs'),
      numOpponents: 1,
      potBeforeAction: 100,
      amountToCall: 100,
      position: 'Early',
    });
    expect(advice.suggestedAction).toBe('fold');
    expect(advice.reasoning.length).toBeGreaterThan(0);
  });

  it('suggests betting a very strong hand when checked to', () => {
    const advice = generateAdvice({
      holeCards: cards('As Ad'),
      communityCards: cards('Ah Kd 2s'),
      numOpponents: 1,
      potBeforeAction: 50,
      amountToCall: 0,
      position: 'Late',
    });
    expect(advice.suggestedAction).toBe('bet');
  });

  it("big blind's option: suggests raise (the button you'll see), and check with a weak hand", () => {
    const strong = generateAdvice({
      holeCards: cards('As Ad'),
      communityCards: [],
      numOpponents: 1,
      potBeforeAction: 20,
      amountToCall: 0,
      position: 'Big Blind',
    });
    expect(strong.suggestedAction).toBe('raise');
    const weak = generateAdvice({
      holeCards: cards('7c 2d'),
      communityCards: [],
      numOpponents: 1,
      potBeforeAction: 20,
      amountToCall: 0,
      position: 'Big Blind',
    });
    expect(weak.suggestedAction).toBe('check');
  });

  it('warns about a possible flush on a 3-flush board', () => {
    const advice = generateAdvice({
      holeCards: cards('Ac Kd'),
      communityCards: cards('2h 5h 9h'),
      numOpponents: 1,
      potBeforeAction: 50,
      amountToCall: 0,
      position: 'Late',
    });
    expect(advice.warnings.some((w) => w.toLowerCase().includes('flush'))).toBe(true);
  });
});

describe('scoreDecision', () => {
  it('gives a high score when the action matches the suggestion', () => {
    const result = scoreDecision({ actualAction: 'fold', suggestedAction: 'fold', equityPercent: 10, potOddsPercent: 40, position: 'Early' });
    expect(result.score).toBe(9);
  });

  it('gives a low score for a clearly bad fold', () => {
    const result = scoreDecision({ actualAction: 'fold', suggestedAction: 'call', equityPercent: 70, potOddsPercent: 30, position: 'Early' });
    expect(result.score).toBeLessThanOrEqual(3);
  });
});

describe('LeakTracker', () => {
  it('tracks overcalling as a leak when calls are made with insufficient equity', () => {
    const tracker = new LeakTracker();
    tracker.record({ actualAction: 'call', suggestedAction: 'fold', equityPercent: 15, potOddsPercent: 40, position: 'Middle' });
    tracker.record({ actualAction: 'call', suggestedAction: 'fold', equityPercent: 10, potOddsPercent: 40, position: 'Middle' });
    const leaks = tracker.topLeaks();
    expect(leaks[0].leak).toBe('overcalling');
    expect(leaks[0].count).toBe(2);
  });

  describe('short stack (all-in or fold)', () => {
    // Heads-up small blind, 25/50 blinds, ~12 big blinds, nobody has raised.
    const hu = (hand: string, extra: Partial<Parameters<typeof generateAdvice>[0]> = {}) =>
      generateAdvice({
        holeCards: cards(hand),
        communityCards: [],
        numOpponents: 1,
        potBeforeAction: 75,
        amountToCall: 25,
        position: 'Late',
        bigBlind: 50,
        effectiveStack: 600,
        stackBehind: 575,
        ...extra,
      });

    it('goes all-in with hands from the short-stack chart', () => {
      for (const h of ['Kh 8d', 'Ah 2d', 'Qh Td', 'Jh 8h', '2h 2d']) {
        const a = hu(h);
        expect(a.suggestedAction, h).toBe('raise');
        expect(a.allIn, h).toBe(true);
        expect(suggestionLabel(a)).toBe('all in');
      }
    });

    it('folds hands below the chart instead of calling', () => {
      for (const h of ['7h 2d', 'Jh 4d', '9h 4d']) {
        const a = hu(h);
        expect(a.suggestedAction, h).toBe('fold');
        expect(a.allIn).toBe(false);
      }
    });

    it('checks a weak hand when it can see the flop for free', () => {
      expect(hu('7h 2d', { amountToCall: 0, position: 'Big Blind' }).suggestedAction).toBe('check');
    });

    it('a pair goes in even with five opponents left; a weak ace does not', () => {
      const six = { numOpponents: 5, position: 'Early' as const };
      expect(hu('2h 2d', six).allIn).toBe(true);
      expect(hu('Ah 5d', six).suggestedAction).toBe('fold');
    });

    it('facing a raise: continue by going all-in, not calling', () => {
      const a = hu('Ah Ad', { amountToCall: 100, potBeforeAction: 175 });
      expect(a.suggestedAction).toBe('raise');
      expect(a.allIn).toBe(true);
      // ...unless calling already puts every chip in.
      const c = hu('Ah Ad', { amountToCall: 575, potBeforeAction: 650 });
      expect(c.suggestedAction).toBe('call');
      expect(c.allIn).toBe(false);
    });

    it('deep stacks keep the normal advice', () => {
      const a = hu('Kh 8d', { effectiveStack: 5000, stackBehind: 4975 });
      expect(a.allIn).toBe(false);
    });

    it('going all-in when the coach says all in scores 9/10', () => {
      const a = hu('Kh 8d');
      const r = scoreDecision({ actualAction: 'raise', suggestedAction: a.suggestedAction, equityPercent: a.equityPercent, potOddsPercent: a.potOddsPercent, position: a.position });
      expect(r.score).toBe(9);
    });
  });
});

