import type { DrillId } from '../persistence/drillStats';
import type { SessionReport as Report } from '../training/sessionReport';

// Shown when you leave the table (and under the game-over / champion screen):
// what happened this sitting, your two biggest leaks, and a button straight to
// the drill that works on each one.
export function SessionReport({
  report,
  onPractise,
  onLeave,
  onStay,
  leaveLabel = 'Leave table',
}: {
  report: Report;
  onPractise: (drill: DrillId) => void;
  onLeave: () => void;
  /** Omitted when there's no table to go back to (game over). */
  onStay?: () => void;
  leaveLabel?: string;
}) {
  const net = report.netChips;
  const mistakesLinked = report.leaks.some((l) => l.drill === 'mistakes');
  return (
    <div className="space-y-3 text-left text-sm text-slate-300">
      <h2 className="text-lg font-bold text-slate-100">Session report</h2>

      <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
        <Tile label="Hands played" value={String(report.handsPlayed)} />
        <Tile label="Hands won" value={String(report.handsWon)} />
        <Tile
          label="Chips"
          value={`${net >= 0 ? '+' : '−'}$${Math.abs(net).toLocaleString()}`}
          tone={net > 0 ? 'text-emerald-300' : net < 0 ? 'text-rose-300' : 'text-slate-200'}
        />
        <Tile
          label="Decision score"
          value={report.avgScore != null ? `${report.avgScore}/10` : '—'}
          tone={report.avgScore == null ? 'text-slate-400' : report.avgScore >= 7 ? 'text-emerald-300' : report.avgScore >= 5 ? 'text-amber-300' : 'text-rose-300'}
        />
      </div>

      {report.leaks.length > 0 ? (
        <div>
          <div className="mb-1.5 text-xs font-semibold uppercase tracking-wide text-slate-400">
            {report.leaks.length === 1 ? 'Your biggest leak' : 'Your two biggest leaks'}
          </div>
          <div className="space-y-2">
            {report.leaks.map((l) => (
              <div key={l.id} className="rounded-lg border border-rose-500/25 bg-rose-950/20 p-3">
                <div className="font-semibold text-rose-200">{l.title}</div>
                <p className="mt-0.5 text-xs text-slate-300">{l.detail}</p>
                <button
                  onClick={() => onPractise(l.drill)}
                  className="mt-2 rounded-lg bg-indigo-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-indigo-500"
                >
                  Practise: {l.drillLabel} →
                </button>
              </div>
            ))}
          </div>
        </div>
      ) : report.handsPlayed >= 3 ? (
        <p className="rounded-lg border border-emerald-500/30 bg-emerald-950/30 p-3 text-emerald-200">
          No clear leaks this session — disciplined play. Keep it up.
        </p>
      ) : (
        <p className="text-slate-400">Play a few more hands next time for a fuller read on your game.</p>
      )}

      {report.savedMistakes > 0 && !mistakesLinked && (
        <button
          onClick={() => onPractise('mistakes')}
          className="w-full rounded-lg border border-indigo-500/30 bg-indigo-950/30 px-3 py-2 text-left text-xs text-indigo-200 hover:bg-indigo-950/50"
        >
          📌 {report.savedMistakes} spot{report.savedMistakes === 1 ? '' : 's'} from this session saved to{' '}
          <span className="font-semibold">Practise your mistakes</span> →
        </button>
      )}

      <div className="flex gap-2 pt-1">
        {onStay && (
          <button onClick={onStay} className="flex-1 rounded-lg px-3 py-2 font-semibold text-slate-200 ring-1 ring-slate-600 hover:bg-slate-800">
            Back to the table
          </button>
        )}
        <button
          onClick={onLeave}
          className="flex-1 rounded-lg bg-gradient-to-b from-emerald-500 to-emerald-700 px-3 py-2 font-semibold text-white hover:from-emerald-400 hover:to-emerald-600"
        >
          {leaveLabel}
        </button>
      </div>
    </div>
  );
}

function Tile({ label, value, tone = 'text-slate-100' }: { label: string; value: string; tone?: string }) {
  return (
    <div className="rounded-lg bg-slate-900/70 px-2 py-2 text-center ring-1 ring-slate-700/60">
      <div className={`text-lg font-extrabold ${tone}`}>{value}</div>
      <div className="text-[10px] uppercase tracking-wide text-slate-500">{label}</div>
    </div>
  );
}
