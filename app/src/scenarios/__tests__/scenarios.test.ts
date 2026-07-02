import { describe, expect, it } from 'vitest';
import { SCENARIOS } from '../scenarios';
import { HandEngine } from '../../engine/game';
import { chenScore } from '../../engine/preflop';

function fixedRng(seed: number) {
  let value = seed >>> 0;
  return () => {
    value = (value * 1103515245 + 12345) % 2147483648;
    return value / 2147483648;
  };
}

// Play a hand out with pseudo-random legal actions (same helper style as the
// conservation test) so we can drive full scenario games without a UI.
function playRandomHand(engine: HandEngine, rng: () => number) {
  let guard = 0;
  while (!engine.isHandOver() && guard++ < 500) {
    const actorId = engine.getCurrentActorId();
    if (!actorId) break;
    const valid = engine.getValidActions(actorId);
    const player = engine.players.find((p) => p.id === actorId)!;
    const r = rng();
    let type = valid.types[Math.floor(r * valid.types.length)] ?? 'fold';
    if (rng() < 0.25 && valid.types.includes('raise')) type = 'raise';
    let amount: number | undefined;
    if (type === 'call') amount = valid.callAmount + player.streetContributed;
    else if (type === 'bet' || type === 'raise') {
      amount = rng() < 0.5 ? player.streetContributed + player.stack : valid.minRaiseTo;
    }
    try {
      engine.act(actorId, type, amount);
    } catch {
      engine.act(actorId, valid.types.includes('check') ? 'check' : 'fold');
    }
  }
}

describe('scenarios', () => {
  it('every scenario builds a valid, playable setup', () => {
    for (const scenario of SCENARIOS) {
      const setup = scenario.build();
      expect(setup.seats.length, `${scenario.id} needs 2+ seats`).toBeGreaterThanOrEqual(2);
      // Exactly one human seat.
      expect(setup.seats.filter((s) => s.isHuman).length, `${scenario.id} human count`).toBe(1);
      // Every seat has a positive stack and a unique id.
      const ids = new Set<string>();
      for (const seat of setup.seats) {
        const stack = seat.stack ?? setup.startingStack;
        expect(stack, `${scenario.id} seat ${seat.id} stack`).toBeGreaterThan(0);
        expect(ids.has(seat.id), `${scenario.id} duplicate id ${seat.id}`).toBe(false);
        ids.add(seat.id);
        // Non-human seats must carry an AI profile so the auto-play driver can act.
        if (!seat.isHuman) expect(seat.profile, `${scenario.id} ai ${seat.id} needs profile`).toBeTruthy();
      }
    }
  });

  it('plays a full scenario game to completion with no chip drift', () => {
    for (const scenario of SCENARIOS) {
      const setup = scenario.build();
      let stacks = Object.fromEntries(setup.seats.map((s) => [s.id, s.stack ?? setup.startingStack]));
      const total = Object.values(stacks).reduce((a, b) => a + b, 0);
      let dealer = 0;
      const rng = fixedRng(1234);
      for (let hand = 0; hand < 60; hand++) {
        const solventIds = setup.seats.filter((s) => stacks[s.id] > 0);
        if (solventIds.length < 2) break;
        const engine = new HandEngine({
          players: setup.seats.map((s) => ({ id: s.id, name: s.name, stack: stacks[s.id] })),
          dealerSeat: dealer % setup.seats.length,
          smallBlind: 5,
          bigBlind: 10,
          holeCardBias:
            setup.cardLuck && setup.cardLuck !== 'normal' ? { playerId: 'human', band: setup.cardLuck } : undefined,
          rng,
        });
        playRandomHand(engine, rng);
        expect(engine.isHandOver(), `${scenario.id} hand ${hand} did not finish`).toBe(true);
        stacks = Object.fromEntries(engine.players.map((p) => [p.id, p.stack]));
        const sum = Object.values(stacks).reduce((a, b) => a + b, 0);
        expect(sum, `${scenario.id} hand ${hand} chip drift`).toBe(total);
        dealer++;
      }
    }
  });

  it('card-luck bias skews the human hand strength as advertised', () => {
    // The two luck scenarios bias the human's starting hand. Average the human's
    // Chen score over many deals and confirm cold < normal-ish < hot.
    const sample = (band: 'hot' | 'cold') => {
      const rng = fixedRng(band === 'hot' ? 7 : 99);
      let sum = 0;
      const n = 60;
      for (let i = 0; i < n; i++) {
        const engine = new HandEngine({
          players: [
            { id: 'human', name: 'You', stack: 1000 },
            { id: 'ai', name: 'AI', stack: 1000 },
          ],
          dealerSeat: i % 2,
          smallBlind: 5,
          bigBlind: 10,
          holeCardBias: { playerId: 'human', band },
          rng,
        });
        const human = engine.players.find((p) => p.id === 'human')!;
        sum += chenScore(human.holeCards);
      }
      return sum / n;
    };
    const hotAvg = sample('hot');
    const coldAvg = sample('cold');
    // Hot deals (Chen >= 8) should clearly out-score cold deals (Chen <= 4).
    expect(hotAvg).toBeGreaterThan(7);
    expect(coldAvg).toBeLessThan(5);
    expect(hotAvg).toBeGreaterThan(coldAvg + 3);
  });
});
