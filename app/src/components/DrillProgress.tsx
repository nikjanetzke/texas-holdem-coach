import { getDrillStats, RECENT_WINDOW, type DrillId } from '../persistence/drillStats';
import { LEVELS, MASTERY_ACCURACY, progressOf } from '../training/path';
import { MISTAKES_DECK } from '../training/mistakes';
import { loadDeck } from '../training/srs';

// How each drill is going, from the very first answer: lifetime accuracy,
// recent accuracy against the mastery line, and how close you are to it.

const ROWS: { id: DrillId; label: string }[] = [
  ...LEVELS.map((l) => ({ id: l.drill, label: l.title })),
  { id: 'mistakes', label: 'Practise your mistakes' },
];

export function DrillProgress() {
  const stats = getDrillStats();
  const saved = loadDeck(MISTAKES_DECK).cards.length;
  return (
    <div className="space-y-2.5">
      {ROWS.map(({ id, label }) => {
        const rec = stats[id];
        const p = progressOf(rec);
        const lifetime = rec.total ? Math.round((rec.correct / rec.total) * 100) : null;
        const status =
          rec.total === 0
            ? id === 'mistakes'
              ? saved
                ? `${saved} saved from your games — not practised yet`
                : 'Nothing saved yet — clear errors from your games land here'
              : 'Not started'
            : id === 'mistakes'
              ? `${rec.total} answered · ${saved} still saved`
              : p.mastered
                ? '✓ Mastered'
                : p.answered < RECENT_WINDOW
                  ? `${p.answered} of ${RECENT_WINDOW} answers toward mastery`
                  : `Needs ${Math.round(MASTERY_ACCURACY * 100)}% — at ${Math.round(p.accuracy * 100)}% over your last ${RECENT_WINDOW}`;
        return (
          <div key={id}>
            <div className="flex items-baseline justify-between gap-2 text-sm">
              <span className="font-semibold text-slate-200">{label}</span>
              <span className="shrink-0 font-mono text-xs text-slate-400">
                {lifetime == null ? '—' : `${rec.correct}/${rec.total} right (${lifetime}%)`}
              </span>
            </div>
            {rec.total > 0 && (
              <div className="mt-1 flex items-center gap-2">
                {/* Bar = recent accuracy; the tick marks the mastery line. */}
                <div className="relative h-1.5 flex-1 overflow-hidden rounded-full bg-slate-800" title={`Recent accuracy ${Math.round(p.accuracy * 100)}%`}>
                  <div className={`h-full ${p.mastered ? 'bg-emerald-400' : 'bg-amber-400'}`} style={{ width: `${Math.round(p.accuracy * 100)}%` }} />
                  <div className="absolute inset-y-0 w-px bg-slate-200/70" style={{ left: `${MASTERY_ACCURACY * 100}%` }} />
                </div>
                <span className="w-10 shrink-0 text-right font-mono text-[11px] text-slate-400">{Math.round(p.accuracy * 100)}%</span>
              </div>
            )}
            <div className={`mt-0.5 text-xs ${p.mastered ? 'text-emerald-300' : 'text-slate-500'}`}>{status}</div>
          </div>
        );
      })}
      <p className="pt-1 text-[11px] text-slate-500">
        The bar is your last {RECENT_WINDOW} answers; the white tick is the {Math.round(MASTERY_ACCURACY * 100)}% you need to master a level.
      </p>
    </div>
  );
}
