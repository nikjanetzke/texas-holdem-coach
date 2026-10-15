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
    expect(valid.types).toEqual(['fold', 'call']); // can't fully call: calling puts everything in
    expect(valid.callAmount).toBe(511 - 50); // the rest of B's stack

    engine.act('b', 'call', valid.callAmount + 50); // B calls all in for less

    expect(engine.isHandOver()).toBe(true);
    const b = engine.players.find((p) => p.id === 'b')!;
    expect(b.allIn).toBe(true);
    expect(b.totalContributed).toBe(511); // B's whole stack was genuinely at risk

    // Whole-total math still holds: nobody's chips vanished or were created.
    const total = engine.players.reduce((sum, p) => sum + p.stack, 0);
    expect(total).toBe(867 + 511);
  });

  // Regression test for a real report: "I went all in and lost against the
  // Professor, but the result said I won $11,519." Betting more than an
  // opponent can cover creates a side pot only the bettor is eligible for.
  // The chips correctly come back to them, but crediting that to `payouts`
  // made losing the hand read as winning your own money back.
  it('reports an uncalled all-in excess as a refund, not as winnings', () => {
    const engine = new HandEngine({
      players: [
        { id: 'big', name: 'Big', stack: 3000 },
        { id: 'small', name: 'Small', stack: 500 },
      ],
      dealerSeat: 0,
      smallBlind: 25,
      bigBlind: 50,
      rng: fixedRng(7),
    });

    engine.act('big', 'raise', 3000); // shove, far more than Small can cover
    engine.act('small', 'raise', 500); // Small all-in for their whole stack

    expect(engine.isHandOver()).toBe(true);
    const sd = engine.showdownResult!;

    // Small could only ever cover 500, so exactly 2500 of Big's bet was never
    // called and must be reported as returned, never as a win.
    expect(sd.refunds['big']).toBe(2500);

    // Whoever lost the showdown must not appear in payouts at all.
    const bigWonShowdown = (sd.payouts['big'] ?? 0) > 0;
    const smallWonShowdown = (sd.payouts['small'] ?? 0) > 0;
    expect(bigWonShowdown && smallWonShowdown).toBe(false);
    if (smallWonShowdown) {
      expect(sd.payouts['big']).toBeUndefined();
      expect(sd.payouts['small']).toBe(1000); // the contested 500 + 500
    }

    // Chips are still conserved regardless of how they're labelled.
    const total = engine.players.reduce((sum, p) => sum + p.stack, 0);
    expect(total).toBe(3500);
    // And the refund really did reach the player's stack.
    expect(engine.players.find((p) => p.id === 'big')!.stack).toBeGreaterThanOrEqual(2500);
  });

  it("big blind's option after limps: offers raise (not bet), and raising and all-in both work", () => {
    const make = () =>
      new HandEngine({
        players: [
          { id: 'a', name: 'A', stack: 1000 },
          { id: 'b', name: 'B', stack: 1000 },
          { id: 'c', name: 'C', stack: 1000 },
        ],
        dealerSeat: 0,
        smallBlind: 5,
        bigBlind: 10,
        rng: fixedRng(3),
      });
    const limpToBigBlind = (engine: HandEngine) => {
      engine.act('a', 'call', 10);
      engine.act('b', 'call', 10);
      expect(engine.getCurrentActorId()).toBe('c');
    };

    const engine = make();
    limpToBigBlind(engine);
    const valid = engine.getValidActions('c');
    expect(valid.types).toContain('check');
    expect(valid.types).toContain('raise');
    expect(valid.types).not.toContain('bet'); // the blind is already a bet
    engine.act('c', 'raise', 40);
    expect(engine.players[2].streetContributed).toBe(40);
    expect(engine.getCurrentActorId()).toBe('a'); // action reopens to the limpers

    const shove = make();
    limpToBigBlind(shove);
    const v = shove.getValidActions('c');
    shove.act('c', 'raise', v.maxRaiseTo); // what the All-in button sends
    expect(shove.players[2].allIn).toBe(true);
  });

  it('a street with no bet yet still offers bet (not raise)', () => {
    const engine = new HandEngine({
      players: [
        { id: 'a', name: 'A', stack: 1000 },
        { id: 'b', name: 'B', stack: 1000 },
      ],
      dealerSeat: 0,
      smallBlind: 5,
      bigBlind: 10,
      rng: fixedRng(5),
    });
    const first = engine.getCurrentActorId()!;
    engine.act(first, 'call', 10);
    engine.act(engine.getCurrentActorId()!, 'check');
    expect(engine.street).toBe('flop');
    const v = engine.getValidActions(engine.getCurrentActorId()!);
    expect(v.types).toContain('bet');
    expect(v.types).not.toContain('raise');
  });

  it('facing a bet bigger than your stack: call (all in for less), never raise', () => {
    const engine = new HandEngine({
      players: [
        { id: 'big', name: 'Big', stack: 5000 },
        { id: 'small', name: 'Small', stack: 300 },
      ],
      dealerSeat: 0,
      smallBlind: 5,
      bigBlind: 10,
      rng: fixedRng(9),
    });
    // Heads-up the dealer (big) is the small blind and acts first preflop.
    engine.act('big', 'raise', 1000);
    const v = engine.getValidActions('small');
    expect(v.types).toEqual(['fold', 'call']);
    expect(v.callAmount).toBe(290); // everything left after the 10 blind
    engine.act('small', 'call', v.callAmount + 10);
    const small = engine.players.find((p) => p.id === 'small')!;
    expect(small.allIn).toBe(true);
    expect(small.totalContributed).toBe(300); // every chip went in
    expect(engine.isHandOver()).toBe(true); // both all in: the board runs out
  });
});

