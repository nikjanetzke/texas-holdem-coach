import { LEAK_TEXT, type Leak } from '../coach/coach';
import { useMemo } from 'react';
import type { HandRecord } from '../hooks/useGame';
import { DrillProgress } from './DrillProgress';

interface LeakRow {
  leak: string;
  count: number;
  percentOfHands: number;
}

// Compute the human's playing-style stats from the recorded hand history.
function computeStats(history: HandRecord[]) {
  let vpip = 0; // voluntarily put money in preflop (call/raise), excludes blinds
  let pfr = 0; // raised preflop
  let showdowns = 0;
  let wins = 0;
  let postAggr = 0; // postflop bets + raises
  let postCalls = 0;
  let postFolds = 0;

  for (const h of history) {
    const mine = h.actionLog.filter((a) => a.playerId === 'human');
    const pre = mine.filter((a) => a.street === 'preflop');
    if (pre.some((a) => a.type === 'call' || a.type === 'raise' || a.type === 'all-in')) vpip++;
    if (pre.some((a) => a.type === 'raise' || a.type === 'all-in')) pfr++;

    const post = mine.filter((a) => a.street !== 'preflop');
    for (const a of post) {
      if (a.type === 'fold') postFolds++;
      else if (a.type === 'call') postCalls++;
      else if (a.type === 'bet' || a.type === 'raise' || a.type === 'all-in') postAggr++;
    }

    const folded = mine.some((a) => a.type === 'fold');
    if (h.showdownResult && !folded) showdowns++;
    if (h.showdownResult && (h.showdownResult.payouts['human'] ?? 0) > 0) wins++;
  }

  const n = history.length;
  const pct = (x: number) => (n ? Math.round((x / n) * 100) : 0);
  const postAll = postFolds + postCalls + postAggr;
  return {
    hands: n,
    vpip: pct(vpip),
    pfr: pct(pfr),
    showdown: pct(showdowns),
    won: pct(wins),
    aggression: postCalls > 0 ? (postAggr / postCalls).toFixed(1) : postAggr > 0 ? '∞' : '0',
    foldToBet: postAll ? Math.round((postFolds / postAll) * 100) : 0,
  };
}

export function StatsPanel({ history, leaks }: { history: HandRecord[]; leaks: LeakRow[] }) {
  const s = useMemo(() => computeStats(history), [history]);

  // Each part shows as soon as it has something to show — training progress
  // never waits for hands to be played.
  return (
    <div className="space-y-4 text-sm">
      <div>
        <div className="mb-2 text-xs font-semibold uppercase tracking-wide text-slate-400">
          Your play{s.hands > 0 ? ` (${s.hands} hand${s.hands === 1 ? '' : 's'})` : ''}
        </div>
        {s.hands === 0 ? (
          <div className="text-xs text-slate-500">Finish a hand and your playing style shows up here.</div>
        ) : (
          <div className="grid grid-cols-3 gap-2">
            <StatCard label="Played" value={`${s.vpip}%`} hint="put chips in before the flop (VPIP)" />
            <StatCard label="Raised first" value={`${s.pfr}%`} hint="raised before the flop (PFR)" />
            <StatCard label="Won" value={`${s.won}%`} hint="of hands" />
            <StatCard label="Showdown" value={`${s.showdown}%`} hint="showed your cards at the end" />
            <StatCard label="Aggression" value={String(s.aggression)} hint="bets+raises per call" />
            <StatCard label="Fold to bet" value={`${s.foldToBet}%`} hint="after the flop" />
          </div>
        )}
      </div>

      <div>
        <div className="mb-2 text-xs font-semibold uppercase tracking-wide text-slate-400">Training</div>
        <DrillProgress />
      </div>

      {s.hands > 0 && (
        <div>
          <div className="mb-2 text-xs font-semibold uppercase tracking-wide text-slate-400">Biggest leaks</div>
          {leaks.length === 0 ? (
            <div className="text-xs text-slate-500">No notable leaks yet — nice discipline.</div>
          ) : (
            <div className="space-y-1">
              {leaks.map((l) => (
                <div key={l.leak} className="flex items-center justify-between text-xs">
                  <span className="text-rose-300" title={LEAK_TEXT[l.leak as Leak]?.detail}>{LEAK_TEXT[l.leak as Leak]?.title ?? l.leak}</span>
                  <span className="text-slate-400">
                    {l.count}× ({l.percentOfHands.toFixed(0)}% of decisions)
                  </span>
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

function StatCard({ label, value, hint }: { label: string; value: string; hint: string }) {
  return (
    <div className="rounded-lg border border-slate-700 bg-slate-900/60 p-2 text-center">
      <div className="text-lg font-extrabold text-emerald-300">{value}</div>
      <div className="text-xs font-semibold text-slate-200">{label}</div>
      <div className="text-[10px] text-slate-500">{hint}</div>
    </div>
  );
}
