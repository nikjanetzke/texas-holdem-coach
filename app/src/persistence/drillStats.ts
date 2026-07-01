import { loadSession, saveSession } from './storage';

// Persisted accuracy for each training drill, so the stats dashboard can show
// progress over time (survives reloads).
export type DrillId = 'chen' | 'outs' | 'potodds';

export interface DrillRecord {
  correct: number;
  total: number;
}
export type DrillStats = Record<DrillId, DrillRecord>;

const KEY = 'texas-holdem-coach:drillstats:v1';
const EMPTY: DrillStats = { chen: { correct: 0, total: 0 }, outs: { correct: 0, total: 0 }, potodds: { correct: 0, total: 0 } };

export function getDrillStats(): DrillStats {
  return { ...EMPTY, ...(loadSession<DrillStats>(KEY) ?? {}) };
}

export function recordDrillResult(drill: DrillId, correct: boolean): void {
  const stats = getDrillStats();
  const rec = stats[drill] ?? { correct: 0, total: 0 };
  stats[drill] = { correct: rec.correct + (correct ? 1 : 0), total: rec.total + 1 };
  saveSession(stats, KEY);
}
