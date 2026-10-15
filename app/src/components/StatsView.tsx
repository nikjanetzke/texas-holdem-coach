import { useMemo } from 'react';
import { getDrillStats } from '../persistence/drillStats';
import { loadProgress, progressTotals } from '../persistence/progress';
import { LEVELS, progressOf } from '../training/path';
import { DrillProgress } from './DrillProgress';
import { ProgressPanel } from './ProgressPanel';

// The main menu's Stats tab: how you're doing in training and at the table,
// from the first answer or hand — nothing has to be finished to see it.
export function StatsView({ onTrain }: { onTrain: () => void }) {
  const drills = getDrillStats();
  const sessions = useMemo(() => loadProgress(), []);
  const t = progressTotals(sessions);
  const answered = Object.values(drills).reduce((a, r) => a + r.total, 0);
  const correct = Object.values(drills).reduce((a, r) => a + r.correct, 0);
  const mastered = LEVELS.filter((l) => progressOf(drills[l.drill]).mastered).length;
  const money = (n: number) => `${n < 0 ? '−' : n > 0 ? '+' : ''}$${Math.abs(n).toLocaleString()}`;

  return (
    <div className="space-y-4">
      <p className="text-xs text-slate-400">Everything you've done so far, in training and at the table. It fills in as you go — nothing has to be finished first.</p>

      <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 side:grid-cols-6">
        <Tile label="Training answers" value={String(answered)} />
        <Tile label="Answered right" value={answered ? `${Math.round((correct / answered) * 100)}%` : '—'} />
        <Tile label="Levels mastered" value={`${mastered}/${LEVELS.length}`} />
        <Tile label="Hands played" value={String(t.hands)} />
        <Tile label="Decision score" value={t.avgScore != null ? `${t.avgScore}/10` : '—'} hint="coach's average" />
        <Tile label="Chips won/lost" value={t.sessions ? money(t.netChips) : '—'} tone={t.netChips > 0 ? 'text-emerald-300' : t.netChips < 0 ? 'text-rose-300' : undefined} />
      </div>

      <div className="grid gap-4 side:grid-cols-2">
        <section className="rounded-xl border border-slate-800 bg-slate-900/50 p-4">
          <div className="mb-3 flex items-center justify-between gap-2">
            <h2 className="text-sm font-bold text-slate-100">🎯 Training</h2>
            <button onClick={onTrain} className="text-xs font-semibold text-emerald-300 hover:text-emerald-200">
              Go to training →
            </button>
          </div>
          <DrillProgress />
        </section>

        <section className="rounded-xl border border-slate-800 bg-slate-900/50 p-4">
          <h2 className="mb-3 text-sm font-bold text-slate-100">♠ At the table</h2>
          {t.sessions > 0 && (
            <p className="mb-3 text-xs text-slate-400">
              {t.sessions} session{t.sessions === 1 ? '' : 's'}, {t.hands} hands
              {t.handsWon != null && <>, {t.handsWon} won</>}
              {t.vpipPercent != null && (
                <>
                  . You put chips in before the flop in {t.vpipPercent}% of hands
                  <span className="text-slate-500"> (good players: roughly 20–30% at a 6-player table)</span>
                </>
              )}
              .
            </p>
          )}
          <ProgressPanel />
        </section>
      </div>
    </div>
  );
}

function Tile({ label, value, hint, tone }: { label: string; value: string; hint?: string; tone?: string }) {
  return (
    <div className="rounded-lg border border-slate-700/70 bg-slate-800/50 px-2 py-2 text-center">
      <div className={`text-lg font-extrabold ${tone ?? 'text-slate-100'}`}>{value}</div>
      <div className="text-[11px] font-semibold uppercase tracking-wide text-slate-400">{label}</div>
      {hint && <div className="text-[10px] text-slate-500">{hint}</div>}
    </div>
  );
}
