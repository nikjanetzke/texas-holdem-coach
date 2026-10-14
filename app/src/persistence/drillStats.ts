import { loadSession, notifyTrainingProgress, saveSession } from './storage';

// Persisted accuracy for each training drill, so the stats dashboard can show
// progress over time (survives reloads).
export type DrillId = 'chen' | 'position' | 'outs' | 'potodds' | 'mistakes';

export interface DrillRecord {
  correct: number;
  total: number;
  /**
   * The most recent answers, newest last (1 = right, 0 = wrong). Mastery is
   * judged on this rolling window rather than the lifetime total, so early
   * mistakes made while learning don't hold someone back forever, and a
   * skill that's slipped shows up again.
   */
  recent?: number[];
}
export type DrillStats = Record<DrillId, DrillRecord>;

export const RECENT_WINDOW = 20;

const KEY = 'texas-holdem-coach:drillstats:v1';
const blank = (): DrillRecord => ({ correct: 0, total: 0, recent: [] });
const EMPTY = (): DrillStats => ({ chen: blank(), position: blank(), outs: blank(), potodds: blank(), mistakes: blank() });

export function getDrillStats(): DrillStats {
  return { ...EMPTY(), ...(loadSession<DrillStats>(KEY) ?? {}) };
}

export function recordDrillResult(drill: DrillId, correct: boolean): void {
  const stats = getDrillStats();
  const rec = stats[drill] ?? blank();
  const recent = [...(rec.recent ?? []), correct ? 1 : 0].slice(-RECENT_WINDOW);
  stats[drill] = { correct: rec.correct + (correct ? 1 : 0), total: rec.total + 1, recent };
  saveSession(stats, KEY);
  notifyTrainingProgress();
}
