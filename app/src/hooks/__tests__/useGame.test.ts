import { describe, expect, it } from 'vitest';
import { pickRestorableSession } from '../useGame';
import type { GameSetup } from '../useGame';

function headsUpSetup(): GameSetup {
  return {
    seats: [
      { id: 'human', name: 'You', isHuman: true, stack: 600 },
      { id: 'ai-1', name: 'AI', isHuman: false, stack: 2400 },
    ],
    startingStack: 600,
    scheduleId: 'turbo',
  };
}

describe('pickRestorableSession', () => {
  it('restores a genuinely in-progress session (both players solvent)', () => {
    const saved = {
      seatKey: 'human,ai-1',
      stacks: { human: 400, 'ai-1': 2600 },
      dealerSeat: 1,
      handNumber: 5,
      leakCounts: { counts: {} as never, totalDecisions: 0 },
      handHistory: [],
      coachEnabled: false,
      levelIndex: 0,
    };
    expect(pickRestorableSession(saved, headsUpSetup())).toBe(saved);
  });

  it('does not restore a session where the seat ids no longer match', () => {
    const saved = {
      seatKey: 'human,ai-2', // a different scenario/table
      stacks: { human: 400, 'ai-2': 2600 },
      dealerSeat: 1,
      handNumber: 5,
      leakCounts: { counts: {} as never, totalDecisions: 0 },
      handHistory: [],
      coachEnabled: false,
      levelIndex: 0,
    };
    expect(pickRestorableSession(saved, headsUpSetup())).toBeNull();
  });

  // Regression test for the "instant Champion / Game Over" bug: replaying a
  // scenario whose AI seat ids are deterministic (e.g. "ai-1" for every
  // heads-up game) used to silently restore a *finished* game's leftover
  // stacks — including a busted 0 — producing a table with fewer than 2
  // solvent players and ending the new game before a single hand was dealt.
  it('refuses to restore a finished session left over from a busted/won game', () => {
    const bustedSession = {
      seatKey: 'human,ai-1', // identical key: same scenario replayed
      stacks: { human: 0, 'ai-1': 3000 }, // human busted out in the previous game
      dealerSeat: 1,
      handNumber: 12,
      leakCounts: { counts: {} as never, totalDecisions: 0 },
      handHistory: [],
      coachEnabled: false,
      levelIndex: 3,
    };
    expect(pickRestorableSession(bustedSession, headsUpSetup())).toBeNull();
  });

  it('returns null when there is no saved session at all', () => {
    expect(pickRestorableSession(null, headsUpSetup())).toBeNull();
  });
});
