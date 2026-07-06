import { describe, expect, it } from 'vitest';
import { HandEngine } from '../../engine/game';
import { describeHumanPosition } from '../position';

function engineWith(humanSeat: number, numPlayers: number, dealerSeat: number, stacks?: number[]): HandEngine {
  const players = Array.from({ length: numPlayers }, (_, i) => ({
    id: i === humanSeat ? 'human' : `ai-${i}`,
    name: i === humanSeat ? 'You' : `AI ${i}`,
    stack: stacks?.[i] ?? 1000,
  }));
  return new HandEngine({ players, dealerSeat, smallBlind: 5, bigBlind: 10 });
}

describe('describeHumanPosition', () => {
  it('identifies the button as the best seat', () => {
    const info = describeHumanPosition(engineWith(0, 6, 0))!;
    expect(info.key).toBe('button');
    expect(info.tone).toBe('green');
  });

  it('identifies the blinds', () => {
    // Dealer at 5 → SB seat 0, BB seat 1 in a 6-max ring.
    expect(describeHumanPosition(engineWith(0, 6, 5))!.key).toBe('sb');
    expect(describeHumanPosition(engineWith(1, 6, 5))!.key).toBe('bb');
  });

  it('marks first-to-act as early/red with the right players-after count', () => {
    // Dealer 0 → SB 1, BB 2, UTG 3 in 6-max.
    const info = describeHumanPosition(engineWith(3, 6, 0))!;
    expect(info.key).toBe('early');
    expect(info.tone).toBe('red');
    // UTG in 6-max acts before everyone: all 5 other players are behind.
    expect(info.playersAfter).toBe(5);
  });

  it('marks the cutoff as late/green', () => {
    // Dealer 0 → non-blind order is 3 (UTG), 4, 5 (cutoff), 0 (button).
    const info = describeHumanPosition(engineWith(5, 6, 0))!;
    expect(info.key).toBe('late');
    expect(info.tone).toBe('green');
  });

  it('treats the heads-up dealer as the button/best seat and the other as big blind', () => {
    expect(describeHumanPosition(engineWith(0, 2, 0))!.key).toBe('headsup-btn');
    expect(describeHumanPosition(engineWith(1, 2, 0))!.key).toBe('bb');
  });

  it('skips busted seats when working out the order', () => {
    // 4 live players out of 6; human at seat 4 with seats 1 and 3 busted.
    // Dealer 0 → SB 2, BB 4... human IS the big blind once dead seats are skipped.
    const info = describeHumanPosition(engineWith(4, 6, 0, [1000, 0, 1000, 0, 1000, 1000]))!;
    expect(info.key).toBe('bb');
  });

  it('returns null when the human has busted', () => {
    expect(describeHumanPosition(engineWith(2, 6, 0, [1000, 1000, 0, 1000, 1000, 1000]))).toBeNull();
  });
});
