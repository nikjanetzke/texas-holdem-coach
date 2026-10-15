import { useMemo, useState } from 'react';
import { loadProgress, recentLeaks, type SessionSummary } from '../persistence/progress';

// "Your progress": average decision score per session as a column chart (one
// series, so no legend — the heading names it), the same numbers as a table,
// and the leaks that keep coming back. Built from loadProgress(), which the
// game updates after every hand.

const SHOWN = 12;
const fmtDate = (ms: number) => new Date(ms).toLocaleDateString(undefined, { day: 'numeric', month: 'short' });
const money = (n: number) => `${n < 0 ? '−' : n > 0 ? '+' : ''}$${Math.abs(n).toLocaleString()}`;

function ScoreChart({ sessions, currentId }: { sessions: SessionSummary[]; currentId?: number }) {
  const [hover, setHover] = useState<number | null>(null);
  const W = 320;
  const H = 130;
  const pad = { l: 22, r: 6, t: 8, b: 18 };
  const plotW = W - pad.l - pad.r;
  const plotH = H - pad.t - pad.b;
  const slot = plotW / Math.max(sessions.length, 6);
  const barW = Math.min(16, slot * 0.6);
  const y = (v: number) => pad.t + plotH - (v / 10) * plotH;
  const h = hover != null ? sessions[hover] : null;

  return (
    <div className="relative">
      <svg viewBox={`0 0 ${W} ${H}`} className="w-full" role="img" aria-label="Average decision score per session, out of 10">
        {/* Recessive grid: 0, 5 and 10. */}
        {[0, 5, 10].map((v) => (
          <g key={v}>
            <line x1={pad.l} x2={W - pad.r} y1={y(v)} y2={y(v)} stroke="#334155" strokeWidth={v === 0 ? 1 : 0.5} strokeDasharray={v === 0 ? undefined : '2 3'} />
            <text x={pad.l - 5} y={y(v) + 3} textAnchor="end" fontSize="8" fill="#94a3b8">
              {v}
            </text>
          </g>
        ))}
        {sessions.map((s, i) => {
          const x = pad.l + slot * i + slot / 2;
          const v = s.avgScore ?? 0;
          const top = y(v);
          const base = y(0);
          const r = Math.min(4, (base - top) / 2);
          // Rounded top, square base anchored on the axis.
          const d = `M${x - barW / 2},${base} V${top + r} Q${x - barW / 2},${top} ${x - barW / 2 + r},${top} H${x + barW / 2 - r} Q${x + barW / 2},${top} ${x + barW / 2},${top + r} V${base} Z`;
          return (
            <g key={s.id} onMouseEnter={() => setHover(i)} onMouseLeave={() => setHover(null)} onFocus={() => setHover(i)} onBlur={() => setHover(null)} tabIndex={0}>
              {/* Hit target: the whole column slot, bigger than the bar. */}
              <rect x={x - slot / 2} y={pad.t} width={slot} height={plotH} fill="transparent" />
              {s.avgScore != null && <path d={d} fill="#34d399" opacity={hover == null || hover === i ? 1 : 0.55} />}
              {s.id === currentId && (
                <text x={x} y={H - 5} textAnchor="middle" fontSize="8" fill="#e2e8f0">
                  now
                </text>
              )}
            </g>
          );
        })}
      </svg>
      {h && hover != null && (
        <div
          className="pointer-events-none absolute -top-1 z-10 -translate-x-1/2 -translate-y-full whitespace-nowrap rounded-md border border-slate-600 bg-slate-950 px-2 py-1 text-[11px] text-slate-200 shadow-lg"
          style={{ left: `${((pad.l + slot * hover + slot / 2) / W) * 100}%` }}
        >
          <div className="font-semibold">{fmtDate(h.id)}</div>
          <div>Score {h.avgScore ?? '–'}/10 · {h.hands} hands · {money(h.netChips)}</div>
        </div>
      )}
    </div>
  );
}

export function ProgressPanel({ currentId }: { currentId?: number }) {
  // Re-read whenever the panel is shown; the game writes after every hand.
  const sessions = useMemo(() => loadProgress(), []);
  const shown = sessions.slice(-SHOWN);
  const leaks = recentLeaks(sessions);

  if (sessions.length === 0) {
    return <p className="text-xs text-slate-400">Finish a few hands and your progress will appear here, session by session.</p>;
  }
  return (
    <div className="space-y-3 text-xs text-slate-300">
      <div>
        <div className="mb-1 font-semibold text-slate-200">Decision score per session (out of 10)</div>
        <p className="mb-1.5 text-slate-400">The coach's average score for your decisions each time you sat down. Higher is better — watch it climb.</p>
        <ScoreChart sessions={shown} currentId={currentId} />
      </div>

      <table className="w-full text-left">
        <caption className="sr-only">Your recent sessions</caption>
        <thead className="text-slate-500">
          <tr>
            <th className="py-0.5 font-medium">Session</th>
            <th className="py-0.5 text-right font-medium">Hands</th>
            <th className="py-0.5 text-right font-medium">Score</th>
            <th className="py-0.5 text-right font-medium">Chips</th>
          </tr>
        </thead>
        <tbody>
          {[...shown].reverse().slice(0, 8).map((s) => (
            <tr key={s.id} className="border-t border-slate-800">
              <td className="py-0.5">
                {fmtDate(s.id)}
                {s.id === currentId && <span className="ml-1 text-emerald-300">(now)</span>}
              </td>
              <td className="py-0.5 text-right font-mono">{s.hands}</td>
              <td className="py-0.5 text-right font-mono">{s.avgScore ?? '–'}</td>
              <td className={`py-0.5 text-right font-mono ${s.netChips > 0 ? 'text-emerald-300' : s.netChips < 0 ? 'text-rose-300' : ''}`}>{money(s.netChips)}</td>
            </tr>
          ))}
        </tbody>
      </table>

      <div>
        <div className="mb-1 font-semibold text-slate-200">Leaks that keep coming back (last 5 sessions)</div>
        {leaks.length === 0 ? (
          <p className="text-slate-400">None recorded — nice.</p>
        ) : (
          <ul className="space-y-0.5">
            {leaks.map((l) => (
              <li key={l.id} className="flex justify-between gap-2">
                <span>{l.label}</span>
                <span className="font-mono text-slate-400">×{l.count}</span>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}
