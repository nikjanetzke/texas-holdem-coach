import { describe, expect, it } from 'vitest';
import { HandEngine } from '../game';

function fixedRng(seed: number) {
  let value = seed >>> 0;
  return () => {
    value = (value * 1103515245 + 12345) % 2147483648;
    return value / 2147483648;
  };
}

// Play a hand out with pseudo-random legal actions and return the engine.
function playRandomHand(engine: HandEngine, rng: () => number) {
  let guard = 0;
  while (!engine.isHandOver() && guard++ < 500) {
    const actorId = engine.getCurrentActorId();
    if (!actorId) break;
    const valid = engine.getValidActions(actorId);
    const player = engine.players.find((p) => p.id === actorId)!;
    const r = rng();
    let type = valid.types[Math.floor(r * valid.types.length)] ?? 'fold';
    // Bias toward all-ins sometimes to stress the side-pot / all-in paths.
    if (rng() < 0.25 && valid.types.includes('raise')) type = 'raise';
    let amount: number | undefined;
    if (type === 'call') amount = valid.callAmount + player.streetContributed;
    else if (type === 'bet' || type === 'raise') {
      // Frequently jam all-in to exercise the win-crediting code.
      amount = rng() < 0.5 ? player.streetContributed + player.stack : valid.minRaiseTo;
    }
    try {
      engine.act(actorId, type, amount);
    } catch {
      engine.act(actorId, valid.types.includes('check') ? 'check' : 'fold');
    }
  }
}

describe('chip conservation', () => {
  it('total chips are unchanged after any hand (no winnings lost)', () => {
    for (let seed = 1; seed <= 300; seed++) {
      const rng = fixedRng(seed);
      const stacks = [1000, 1000, 1000, 1000, 1000, 1000].slice(0, 2 + (seed % 5));
      const total = stacks.reduce((a, b) => a + b, 0);
      const engine = new HandEngine({
        players: stacks.map((s, i) => ({ id: `p${i}`, name: `P${i}`, stack: s })),
        dealerSeat: seed % stacks.length,
        smallBlind: 5,
        bigBlind: 10,
        rng,
      });
      playRandomHand(engine, rng);
      expect(engine.isHandOver()).toBe(true);
      const after = engine.players.reduce((sum, p) => sum + p.stack, 0);
      expect(after, `seed ${seed} lost/created chips`).toBe(total);
    }
  });

  // Guards the win-crediting path across a hand boundary: the stacks a finished
  // engine reports must feed the next hand unchanged (this is the contract the
  // useGame stacksRef fix relies on — winnings from an all-in must carry over).
  it('winnings carry across consecutive hands with no chip drift', () => {
    for (let seed = 1; seed <= 60; seed++) {
      let stacks = [1000, 1000, 1000, 1000, 1000, 1000].slice(0, 3 + (seed % 4));
      const total = stacks.reduce((a, b) => a + b, 0);
      let dealer = 0;
      const rng = fixedRng(seed * 7 + 1);
      for (let hand = 0; hand < 80; hand++) {
        const active = stacks.filter((s) => s > 0).length;
        if (active < 2) break;
        const engine = new HandEngine({
          players: stacks.map((s, i) => ({ id: `p${i}`, name: `P${i}`, stack: s })),
          // The dealer button rotates even over busted seats, exactly as the hook does.
          dealerSeat: dealer % stacks.length,
          smallBlind: 5,
          bigBlind: 10,
          rng,
        });
        playRandomHand(engine, rng);
        expect(engine.isHandOver()).toBe(true);
        // Thread the credited stacks into the next hand, exactly as nextHand does.
        stacks = engine.players.map((p) => p.stack);
        expect(stacks.reduce((a, b) => a + b, 0), `seed ${seed} hand ${hand} drifted chips`).toBe(total);
        dealer++;
      }
    }
  });

  it('does not drop a live player or lose chips when the button lands on a busted seat', () => {
    // Seats 1 and 3 are busted (0 chips); the button is passed to busted seat 1.
    const engine = new HandEngine({
      players: [
        { id: 'p0', name: 'P0', stack: 2990 },
        { id: 'p1', name: 'P1', stack: 0 },
        { id: 'p2', name: 'P2', stack: 1010 },
        { id: 'p3', name: 'P3', stack: 0 },
      ],
      dealerSeat: 1,
      smallBlind: 5,
      bigBlind: 10,
      rng: fixedRng(3),
    });
    // Both solvent players are actually dealt in (not sitting out).
    expect(engine.players.find((p) => p.id === 'p0')!.sittingOut).toBe(false);
    expect(engine.players.find((p) => p.id === 'p2')!.sittingOut).toBe(false);
    playRandomHand(engine, fixedRng(3));
    const after = engine.players.reduce((sum, p) => sum + p.stack, 0);
    expect(after).toBe(4000);
  });
});
