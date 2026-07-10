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

  it('collects antes as dead money without affecting the amount owed to call the blind', () => {
    const engine = new HandEngine({
      players: [
        { id: 'a', name: 'A', stack: 1000 },
        { id: 'b', name: 'B', stack: 1000 },
        { id: 'c', name: 'C', stack: 1000 },
      ],
      dealerSeat: 0,
      smallBlind: 5,
      bigBlind: 10,
      ante: 2,
      rng: fixedRng(42),
    });

    // Every active player posts the ante into the pot (totalContributed) but it is
    // not counted toward the current bet (streetContributed).
    for (const p of engine.players) {
      expect(p.totalContributed).toBeGreaterThanOrEqual(2);
    }
    expect(engine.players[0].totalContributed).toBe(2); // dealer: ante only
    expect(engine.players[1].streetContributed).toBe(5); // SB still owes only the blind
    expect(engine.players[1].totalContributed).toBe(7); // ante + SB
    expect(engine.players[2].streetContributed).toBe(10); // BB
    expect(engine.players[2].totalContributed).toBe(12); // ante + BB
    expect(engine.currentBet).toBe(10);

    // Pot already contains the three antes plus the blinds.
    const pot = engine.players.reduce((sum, p) => sum + p.totalContributed, 0);
    expect(pot).toBe(2 * 3 + 5 + 10);
  });

  it('conserves chips through a hand played with antes', () => {
    const engine = new HandEngine({
      players: [
        { id: 'a', name: 'A', stack: 1000 },
        { id: 'b', name: 'B', stack: 1000 },
        { id: 'c', name: 'C', stack: 1000 },
      ],
      dealerSeat: 0,
      smallBlind: 5,
      bigBlind: 10,
      ante: 5,
      rng: fixedRng(123),
    });

    while (engine.street !== 'showdown') {
      const actorId = engine.getCurrentActorId();
      if (!actorId) break;
      const valid = engine.getValidActions(actorId);
      engine.act(actorId, valid.types.includes('check') ? 'check' : 'call');
    }

    expect(engine.street).toBe('showdown');
    const totalChips = engine.players.reduce((sum, p) => sum + p.stack, 0);
    expect(totalChips).toBe(3000); // no chips created or destroyed
  });

  // Regression test for a real bug: after one player shoves all-in, the
  // other player (who has NOT matched the bet, is not folded, and is not
  // all-in) was skipped entirely — the engine went straight to showdown
  // without ever giving them the chance to call, re-raise (all-in for
  // less), or fold. Reported as "pot not awarded on an all-in win" and
  // "stack didn't decrease enough on an all-in loss" — because the second
  // player's money was never actually put at risk despite the hand playing
  // out as if it had been.
  it('gives the second player a real chance to respond to an all-in raise', () => {
    const engine = new HandEngine({
      players: [
        { id: 'a', name: 'A', stack: 867 },
        { id: 'b', name: 'B', stack: 511 },
      ],
      dealerSeat: 0,
      smallBlind: 25,
      bigBlind: 50,
      rng: fixedRng(1962 * 31 + 7),
    });

    // A (dealer/SB) shoves all-in over the top preflop.
    expect(engine.getCurrentActorId()).toBe('a');
    engine.act('a', 'raise', 867);

    // B must still get to act — the hand must NOT already be over.
    expect(engine.isHandOver()).toBe(false);
    expect(engine.getCurrentActorId()).toBe('b');
    const valid = engine.getValidActions('b');
    expect(valid.types).not.toContain('call'); // can't fully call, stack < owed
    expect(valid.types).toContain('raise'); // all-in for less is offered as a raise

    engine.act('b', 'raise', 511); // B's own all-in for their remaining stack

    expect(engine.isHandOver()).toBe(true);
    const b = engine.players.find((p) => p.id === 'b')!;
    expect(b.allIn).toBe(true);
    expect(b.totalContributed).toBe(511); // B's whole stack was genuinely at risk

    // Whole-total math still holds: nobody's chips vanished or were created.
    const total = engine.players.reduce((sum, p) => sum + p.stack, 0);
    expect(total).toBe(867 + 511);
  });
});
