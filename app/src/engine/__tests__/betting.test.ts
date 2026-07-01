import { describe, expect, it } from 'vitest';
import { applyAction, computeSidePots } from '../betting';
import type { PlayerBetState } from '../betting';

describe('computeSidePots', () => {
  it('returns a single pot when everyone contributed equally', () => {
    const pots = computeSidePots([
      { id: 'a', totalContributed: 100, folded: false },
      { id: 'b', totalContributed: 100, folded: false },
      { id: 'c', totalContributed: 100, folded: false },
    ]);
    expect(pots).toEqual([{ amount: 300, eligiblePlayerIds: ['a', 'b', 'c'], payerIds: ['a', 'b', 'c'] }]);
  });

  it('builds a side pot when one player is short-stacked all-in', () => {
    // a all-in for 50, b and c put in 200 each.
    const pots = computeSidePots([
      { id: 'a', totalContributed: 50, folded: false },
      { id: 'b', totalContributed: 200, folded: false },
      { id: 'c', totalContributed: 200, folded: false },
    ]);
    expect(pots).toEqual([
      { amount: 150, eligiblePlayerIds: ['a', 'b', 'c'], payerIds: ['a', 'b', 'c'] },
      { amount: 300, eligiblePlayerIds: ['b', 'c'], payerIds: ['b', 'c'] },
    ]);
  });

  it('excludes folded players from eligibility but keeps their chips in the pot', () => {
    const pots = computeSidePots([
      { id: 'a', totalContributed: 100, folded: true },
      { id: 'b', totalContributed: 100, folded: false },
      { id: 'c', totalContributed: 100, folded: false },
    ]);
    expect(pots).toEqual([{ amount: 300, eligiblePlayerIds: ['b', 'c'], payerIds: ['a', 'b', 'c'] }]);
  });

  it('handles multiple all-in levels creating multiple side pots', () => {
    const pots = computeSidePots([
      { id: 'a', totalContributed: 10, folded: false },
      { id: 'b', totalContributed: 30, folded: false },
      { id: 'c', totalContributed: 60, folded: false },
      { id: 'd', totalContributed: 60, folded: false },
    ]);
    expect(pots).toEqual([
      { amount: 40, eligiblePlayerIds: ['a', 'b', 'c', 'd'], payerIds: ['a', 'b', 'c', 'd'] },
      { amount: 60, eligiblePlayerIds: ['b', 'c', 'd'], payerIds: ['b', 'c', 'd'] },
      { amount: 60, eligiblePlayerIds: ['c', 'd'], payerIds: ['c', 'd'] },
    ]);
  });
});

describe('applyAction', () => {
  const base = (overrides: Partial<PlayerBetState> = {}): PlayerBetState => ({
    id: 'p1',
    stack: 1000,
    streetContributed: 0,
    totalContributed: 0,
    folded: false,
    allIn: false,
    ...overrides,
  });

  it('handles a call that is less than the player stack', () => {
    const { state, delta } = applyAction(base(), 'call', undefined, 100, 20);
    expect(delta).toBe(100);
    expect(state.stack).toBe(900);
    expect(state.streetContributed).toBe(100);
  });

  it('caps a call at the player stack and marks all-in', () => {
    const { state, delta } = applyAction(base({ stack: 40 }), 'call', undefined, 100, 20);
    expect(delta).toBe(40);
    expect(state.allIn).toBe(true);
    expect(state.stack).toBe(0);
  });

  it('rejects a raise below the minimum raise size', () => {
    expect(() => applyAction(base(), 'raise', 110, 100, 20)).toThrow();
  });

  it('allows an all-in raise smaller than the minimum raise', () => {
    const { state } = applyAction(base({ stack: 105 }), 'raise', 105, 100, 20);
    expect(state.allIn).toBe(true);
    expect(state.streetContributed).toBe(105);
  });

  it('rejects a check when facing a bet', () => {
    expect(() => applyAction(base(), 'check', undefined, 100, 20)).toThrow();
  });

  it('allows a check when nothing is owed', () => {
    const { delta } = applyAction(base({ streetContributed: 50 }), 'check', undefined, 50, 20);
    expect(delta).toBe(0);
  });
});
