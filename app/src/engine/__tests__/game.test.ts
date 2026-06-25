import { describe, expect, it } from 'vitest';
import { HandEngine } from '../game';

function fixedRng(seed: number) {
  let value = seed;
  return () => {
    value = (value * 1103515245 + 12345) % 2147483648;
    return value / 2147483648;
  };
}

describe('HandEngine', () => {
  it('posts blinds correctly for a 3-player hand', () => {
    const engine = new HandEngine({
      players: [
        { id: 'a', name: 'A', stack: 1000 },
        { id: 'b', name: 'B', stack: 1000 },
        { id: 'c', name: 'C', stack: 1000 },
      ],
      dealerSeat: 0,
      smallBlind: 5,
      bigBlind: 10,
      rng: fixedRng(42),
    });

    expect(engine.players[1].streetContributed).toBe(5); // SB
    expect(engine.players[2].streetContributed).toBe(10); // BB
    expect(engine.getCurrentActorId()).toBe('a'); // UTG acts first preflop
  });

  it('deals two hole cards to every active player', () => {
    const engine = new HandEngine({
      players: [
        { id: 'a', name: 'A', stack: 1000 },
        { id: 'b', name: 'B', stack: 1000 },
      ],
      dealerSeat: 0,
      smallBlind: 5,
      bigBlind: 10,
      rng: fixedRng(7),
    });
    for (const p of engine.players) {
      expect(p.holeCards).toHaveLength(2);
    }
  });

  it('plays a full hand to showdown with all calls and determines a winner', () => {
    const engine = new HandEngine({
      players: [
        { id: 'a', name: 'A', stack: 1000 },
        { id: 'b', name: 'B', stack: 1000 },
        { id: 'c', name: 'C', stack: 1000 },
      ],
      dealerSeat: 0,
      smallBlind: 5,
      bigBlind: 10,
      rng: fixedRng(123),
    });

    // Preflop: everyone calls/checks around.
    while (engine.street === 'preflop') {
      const actorId = engine.getCurrentActorId()!;
      const valid = engine.getValidActions(actorId);
      engine.act(actorId, valid.types.includes('call') ? 'call' : 'check');
    }

    for (const street of ['flop', 'turn', 'river']) {
      while (engine.street === street) {
        const actorId = engine.getCurrentActorId();
        if (!actorId) break;
        engine.act(actorId, 'check');
      }
    }

    expect(engine.street).toBe('showdown');
    expect(engine.communityCards).toHaveLength(5);
    expect(engine.showdownResult).not.toBeNull();
    const totalPayout = Object.values(engine.showdownResult!.payouts).reduce((a, b) => a + b, 0);
    expect(totalPayout).toBe(30); // 3 players x 10 each since all checked after blinds
  });

  it('awards the pot to the last player when everyone else folds', () => {
    const engine = new HandEngine({
      players: [
        { id: 'a', name: 'A', stack: 1000 },
        { id: 'b', name: 'B', stack: 1000 },
        { id: 'c', name: 'C', stack: 1000 },
      ],
      dealerSeat: 0,
      smallBlind: 5,
      bigBlind: 10,
      rng: fixedRng(99),
    });

    engine.act('a', 'fold');
    engine.act('b', 'fold');

    expect(engine.street).toBe('showdown');
    expect(engine.showdownResult!.payouts['c']).toBe(15);
  });

  it('creates a side pot when a short stack goes all-in and others continue betting', () => {
    const engine = new HandEngine({
      players: [
        { id: 'a', name: 'A', stack: 50 },
        { id: 'b', name: 'B', stack: 1000 },
        { id: 'c', name: 'C', stack: 1000 },
      ],
      dealerSeat: 0,
      smallBlind: 5,
      bigBlind: 10,
      rng: fixedRng(55),
    });

    // a is UTG and goes all-in for the rest of their stack.
    engine.act('a', 'all-in');
    engine.act('b', 'call');
    engine.act('c', 'call');

    expect(engine.players[0].allIn).toBe(true);
    expect(engine.players[0].stack).toBe(0);

    while (engine.street !== 'showdown') {
      const actorId = engine.getCurrentActorId();
      if (!actorId) {
        // No one left to act on this street (everyone all-in/folded); engine should auto-advance.
        break;
      }
      engine.act(actorId, 'check');
    }

    expect(engine.street).toBe('showdown');
    expect(engine.showdownResult).not.toBeNull();
    const pots = engine.showdownResult!.pots;
    expect(pots.length).toBeGreaterThanOrEqual(1);
    const totalPotAmount = pots.reduce((sum, p) => sum + p.amount, 0);
    const totalPayout = Object.values(engine.showdownResult!.payouts).reduce((a, b) => a + b, 0);
    expect(totalPayout).toBe(totalPotAmount);
  });
});
