import { useMemo, useState } from 'react';
import type { ScenarioStrategy } from '../scenarios/strategy';
import { expandRange } from '../scenarios/strategy';

// Renders a scenario's strategy primer: plain-English intro, key principles,
// a 13x13 starting-hand chart, and a glossary for every poker term the guide
// uses. Shown before a scenario starts and re-openable in-game via 📖.

const ORDER = ['A', 'K', 'Q', 'J', 'T', '9', '8', '7', '6', '5', '4', '3', '2'];
const label = (r: string) => (r === 'T' ? '10' : r);

// Standard range-chart convention: the diagonal is pairs, above the diagonal
// is suited combos, below it is offsuit combos.
function cellHand(row: number, col: number): string {
  const a = ORDER[row];
  const b = ORDER[col];
  if (row === col) return a + a;
  return row < col ? a + b + 's' : b + a + 'o';
}

function RangeGrid({ strategy }: { strategy: ScenarioStrategy }) {
  const play = useMemo(() => expandRange(strategy.range.play), [strategy]);
  const maybe = useMemo(() => expandRange(strategy.range.maybe), [strategy]);
  return (
    <div>
      <div className="overflow-x-auto">
        <div className="mx-auto grid w-fit gap-[2px]" style={{ gridTemplateColumns: `repeat(13, minmax(0, 1fr))` }}>
          {ORDER.map((_, row) =>
            ORDER.map((_, col) => {
              const hand = cellHand(row, col);
              const tier = play.has(hand) ? 'play' : maybe.has(hand) ? 'maybe' : 'fold';
              const tone =
                tier === 'play'
                  ? 'bg-emerald-600 text-white'
                  : tier === 'maybe'
                    ? 'bg-amber-500/80 text-slate-900'
                    : 'bg-slate-800 text-slate-500';
              const display = row === col ? label(ORDER[row]) + label(ORDER[col]) : label(hand[0]) + label(hand[1]);
              return (
                <div
                  key={`${row}-${col}`}
                  className={`flex h-6 w-7 items-center justify-center rounded-sm text-[9px] font-semibold sm:h-7 sm:w-8 sm:text-[10px] ${tone}`}
                  title={
                    row === col
                      ? `A pair of ${label(ORDER[row])}s`
                      : `${label(hand[0])}-${label(hand[1])} ${hand[2] === 's' ? '(same suit)' : '(different suits)'}`
                  }
                >
                  {display}
                  {row !== col && <span className="opacity-70">{hand[2]}</span>}
                </div>
              );
            }),
          )}
        </div>
      </div>
      <div className="mt-2 flex flex-wrap items-center justify-center gap-3 text-xs text-slate-300">
        <span className="flex items-center gap-1.5">
          <span className="inline-block h-3 w-3 rounded-sm bg-emerald-600" /> Play
        </span>
        <span className="flex items-center gap-1.5">
          <span className="inline-block h-3 w-3 rounded-sm bg-amber-500/80" /> Borderline
        </span>
        <span className="flex items-center gap-1.5">
          <span className="inline-block h-3 w-3 rounded-sm bg-slate-800 ring-1 ring-slate-700" /> Fold
        </span>
      </div>
      <p className="mt-2 text-center text-[11px] text-slate-500">
        How to read it: the diagonal = pairs. Above the diagonal = suited (s, both cards share a suit). Below = offsuit
        (o). Example: find your two cards' letters — A♦ 9♦ is "A9s".
      </p>
    </div>
  );
}

export function StrategyGuide({
  strategy,
  onClose,
  onConfirm,
  closeLabel = 'Got it',
}: {
  strategy: ScenarioStrategy;
  /** Dismiss without proceeding (✕ or clicking the backdrop). */
  onClose: () => void;
  /** The main call-to-action button; falls back to onClose when not given. */
  onConfirm?: () => void;
  closeLabel?: string;
}) {
  const [glossaryOpen, setGlossaryOpen] = useState(false);
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4" onClick={onClose}>
      <div
        className="max-h-[88vh] w-full max-w-xl overflow-y-auto rounded-2xl border border-amber-500/20 bg-gradient-to-b from-slate-900 to-slate-950 p-5 shadow-2xl ring-1 ring-white/5"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="mb-1 flex items-start justify-between gap-3">
          <h2 className="text-xl font-bold text-slate-100">📖 How to play this scenario</h2>
          <button onClick={onClose} className="rounded px-2 py-1 text-slate-400 hover:bg-slate-800 hover:text-slate-100">
            ✕
          </button>
        </div>

        <p className="mb-4 text-sm leading-relaxed text-slate-300">{strategy.intro}</p>

        <div className="mb-4 space-y-2.5">
          {strategy.principles.map((p, i) => (
            <div key={i} className="rounded-lg border border-slate-700/70 bg-slate-800/50 p-3">
              <div className="mb-1 text-sm font-semibold text-emerald-300">
                {i + 1}. {p.title}
              </div>
              <p className="text-sm leading-relaxed text-slate-300">{p.body}</p>
            </div>
          ))}
        </div>

        <div className="mb-4 rounded-lg border border-slate-700/70 bg-slate-900/60 p-3">
          <div className="mb-0.5 text-sm font-semibold text-slate-100">{strategy.rangeTitle}</div>
          <p className="mb-3 text-xs text-slate-400">{strategy.rangeCaption}</p>
          <RangeGrid strategy={strategy} />
        </div>

        <div className="mb-4 rounded-lg border border-slate-700/70 bg-slate-800/40">
          <button
            onClick={() => setGlossaryOpen((v) => !v)}
            className="flex w-full items-center justify-between px-3 py-2 text-left text-sm font-semibold text-slate-100"
          >
            <span>🔤 Poker words used here, in plain English</span>
            <span className="text-slate-500">{glossaryOpen ? '▲' : '▼'}</span>
          </button>
          {glossaryOpen && (
            <dl className="space-y-2 border-t border-slate-700/60 px-3 py-2.5">
              {strategy.glossary.map((g) => (
                <div key={g.term}>
                  <dt className="text-sm font-semibold text-amber-300">{g.term}</dt>
                  <dd className="text-sm text-slate-300">{g.meaning}</dd>
                </div>
              ))}
            </dl>
          )}
        </div>

        <button
          onClick={onConfirm ?? onClose}
          className="w-full rounded-xl bg-gradient-to-b from-emerald-500 to-emerald-700 py-3 text-base font-bold text-white shadow-lg shadow-emerald-900/40 ring-1 ring-emerald-400/40 transition-all hover:from-emerald-400 hover:to-emerald-600 active:scale-[0.99]"
        >
          {closeLabel}
        </button>
      </div>
    </div>
  );
}
