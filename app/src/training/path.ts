import type { DrillId, DrillRecord, DrillStats } from '../persistence/drillStats';
import { RECENT_WINDOW } from '../persistence/drillStats';

// The training path: a short ladder that builds each skill on the one before.
// Each level unlocks once the previous one is mastered — 80%+ over your last
// 20 answers. "Practise your mistakes" sits outside the ladder: it's built
// from your own hands, so it's always open.

export const MASTERY_ACCURACY = 0.8;

export interface Level {
  drill: DrillId;
  title: string;
  skill: string;
}

export const LEVELS: Level[] = [
  { drill: 'chen', title: 'Starting hand strength', skill: 'Tell strong starting hands from weak ones at a glance.' },
  { drill: 'position', title: 'Play or fold by seat', skill: 'Know which hands to play from early, middle and late seats.' },
  { drill: 'outs', title: 'Draws & outs', skill: 'Count the cards that improve your hand, and your % to hit.' },
  { drill: 'potodds', title: 'Fold, call or raise', skill: 'Compare your chances with the price to decide what to do.' },
  { drill: 'sizing', title: 'Bet sizing', skill: 'Choose how much to bet with a strong hand, depending on the board.' },
];

export interface LevelProgress {
  answered: number; // in the recent window (max RECENT_WINDOW)
  accuracy: number; // 0..1 over the recent window
  mastered: boolean;
}

export function progressOf(rec: DrillRecord | undefined): LevelProgress {
  const recent = rec?.recent ?? [];
  const answered = recent.length;
  const accuracy = answered ? recent.reduce((a, b) => a + b, 0) / answered : 0;
  return { answered, accuracy, mastered: answered >= RECENT_WINDOW && accuracy >= MASTERY_ACCURACY };
}

export type LevelState = 'mastered' | 'current' | 'open' | 'locked';

/**
 * State of each level. A level is unlocked when the one before it is mastered
 * (or the player chose to skip ahead). The first unlocked, unmastered level is
 * "current" — the recommended next step.
 */
export function levelStates(stats: DrillStats, skipAhead: boolean): LevelState[] {
  const states: LevelState[] = [];
  let currentAssigned = false;
  for (let i = 0; i < LEVELS.length; i++) {
    const mastered = progressOf(stats[LEVELS[i].drill]).mastered;
    const unlocked = i === 0 || skipAhead || progressOf(stats[LEVELS[i - 1].drill]).mastered;
    if (mastered) states.push('mastered');
    else if (!unlocked) states.push('locked');
    else if (!currentAssigned) {
      states.push('current');
      currentAssigned = true;
    } else states.push('open');
  }
  return states;
}
