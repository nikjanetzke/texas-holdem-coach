import { useEffect, useRef, useState, type MouseEvent } from 'react';
import { ChenTrainer } from './ChenTrainer';
import { OutsTrainer } from './OutsTrainer';
import { PotOddsTrainer } from './PotOddsTrainer';
import { PositionTrainer } from './PositionTrainer';
import { MistakesTrainer } from './MistakesTrainer';
import { SizingTrainer } from './SizingTrainer';
import { getDrillStats, RECENT_WINDOW } from '../persistence/drillStats';
import type { DrillId } from '../persistence/drillStats';
import { loadSession, saveSession } from '../persistence/storage';
import { LEVELS, MASTERY_ACCURACY, levelStates, progressOf, type LevelState } from '../training/path';
import { MISTAKES_DECK } from '../training/mistakes';
import { dueCard, loadDeck } from '../training/srs';
import { useSideLayout } from '../hooks/useSideLayout';

const SKIP_KEY = 'texas-holdem-coach:path:skip-ahead:v1';
const COLLAPSE_KEY = 'texas-holdem-coach:path:collapsed:v1';

// Re-read progress whenever any drill records an answer.
function useTrainingProgress() {
  const [, setTick] = useState(0);
  useEffect(() => {
    const bump = () => setTick((t) => t + 1);
    window.addEventListener('training-progress', bump);
    return () => window.removeEventListener('training-progress', bump);
  }, []);
  return getDrillStats();
}

const STATE_BADGE: Record<LevelState, { text: string; cls: string }> = {
  mastered: { text: '✓ Mastered', cls: 'bg-emerald-600/20 text-emerald-300 ring-emerald-500/40' },
  current: { text: 'Next up', cls: 'bg-amber-500/20 text-amber-200 ring-amber-400/40' },
  open: { text: 'Open', cls: 'bg-slate-700/50 text-slate-300 ring-slate-500/40' },
  locked: { text: '🔒 Locked', cls: 'bg-slate-800 text-slate-500 ring-slate-700' },
};

export function TrainingHub({ initialDrill }: { initialDrill?: DrillId } = {}) {
  const stats = useTrainingProgress();
  const [skipAhead, setSkipAhead] = useState(() => loadSession<boolean>(SKIP_KEY) ?? false);
  const states = levelStates(stats, skipAhead);
  const firstOpen = LEVELS[Math.max(0, states.findIndex((s) => s === 'current'))]?.drill ?? 'chen';
  // A specific drill can be requested (e.g. from the end-of-session report's
  // "Practise this" button) — opened even if the path hasn't reached it yet.
  const [drill, setDrill] = useState<DrillId>(initialDrill ?? firstOpen);
  const [toast, setToast] = useState<string | null>(null);
  // On a phone the full level list pushes the drill off screen, so it can be
  // folded down to one line; the choice is remembered.
  const [collapsedPref, setCollapsed] = useState(() => loadSession<boolean>(COLLAPSE_KEY) ?? false);
  // Side by side (laptops) there's room for the whole path next to the drill.
  const side = useSideLayout();
  const collapsed = collapsedPref && !side;
  function toggleCollapsed() {
    const next = !collapsedPref;
    setCollapsed(next);
    saveSession(next, COLLAPSE_KEY);
  }
  function choose(d: DrillId) {
    setDrill(d);
    setToast(null);
    requestAnimationFrame(toDrillTop);
  }

  const mistakes = loadDeck(MISTAKES_DECK);
  const mistakesDue = dueCard(mistakes) ? mistakes.cards.filter((c) => c.due <= mistakes.turn).length : 0;

  // Celebrate a level being mastered during this visit, and point at the next one.
  const prevStates = useRef(states);
  useEffect(() => {
    states.forEach((st, i) => {
      if (st === 'mastered' && prevStates.current[i] !== 'mastered') {
        const nextLevel = LEVELS[i + 1];
        setToast(
          nextLevel
            ? `🎉 “${LEVELS[i].title}” mastered — “${nextLevel.title}” is unlocked.`
            : `🎉 “${LEVELS[i].title}” mastered — that's the whole path. Keep sharp with your mistakes drill.`,
        );
      }
    });
    prevStates.current = states;
  });

  function toggleSkip() {
    const next = !skipAhead;
    setSkipAhead(next);
    saveSession(next, SKIP_KEY);
  }

  const selectedLevel = LEVELS.findIndex((l) => l.drill === drill);

  // The drill scrolls inside a panel (its own pane on wide screens, the menu
  // panel on phones). After reading a long explanation further down, "Next"
  // must open the new question at the top — whichever panel is scrolling.
  const drillPaneRef = useRef<HTMLDivElement>(null);
  const drillTopRef = useRef<HTMLDivElement>(null);
  const toDrillTop = () => drillTopRef.current?.scrollIntoView({ block: 'nearest' });
  function backToTop(e: MouseEvent) {
    if ((e.target as HTMLElement).closest('[data-next]')) requestAnimationFrame(toDrillTop);
  }

  return (
    // Wide screens: the path on the left, the drill on the right, each scrolling
    // on its own. Phones: stacked, with the path foldable to one line.
    <div className="space-y-4 side:grid side:h-full side:grid-cols-[minmax(280px,340px)_1fr] side:gap-5 side:space-y-0">
      <div className="side:min-h-0 side:overflow-y-auto side:pr-1">
        <div className="mb-2 flex items-baseline justify-between gap-2">
          <button onClick={toggleCollapsed} disabled={side} className="text-left text-sm font-semibold text-slate-100" aria-expanded={!collapsed}>
            {side ? '' : collapsed ? '▸ ' : '▾ '}Your training path
            {collapsed && (
              <span className="ml-2 text-xs font-normal text-slate-400">
                {states.filter((s) => s === 'mastered').length}/{LEVELS.length} mastered
              </span>
            )}
          </button>
          {!collapsed && (
            <button onClick={toggleSkip} className="text-[11px] text-slate-400 underline-offset-2 hover:text-slate-200 hover:underline">
              {skipAhead ? 'Back to the guided path' : 'Unlock all levels'}
            </button>
          )}
        </div>
        {!collapsed && (
        <>
        <p className="mb-2 text-xs text-slate-400">
          Master each level — {Math.round(MASTERY_ACCURACY * 100)}% over your last {RECENT_WINDOW} answers — to unlock
          the next. Questions you miss come back later until they stick.
        </p>

        <div className="space-y-1.5">
          {LEVELS.map((lvl, i) => {
            const p = progressOf(stats[lvl.drill]);
            const st = states[i];
            const locked = st === 'locked';
            const active = drill === lvl.drill;
            return (
              <button
                key={lvl.drill}
                disabled={locked}
                onClick={() => choose(lvl.drill)}
                className={`w-full rounded-lg border px-3 py-2 text-left transition-colors ${
                  active
                    ? 'border-emerald-500 bg-emerald-950/40'
                    : locked
                      ? 'cursor-not-allowed border-slate-800 bg-slate-900/40'
                      : 'border-slate-700 bg-slate-800/60 hover:bg-slate-800'
                }`}
              >
                <div className="flex items-center justify-between gap-2">
                  <span className={`text-sm font-semibold ${locked ? 'text-slate-500' : 'text-slate-100'}`}>
                    {i + 1}. {lvl.title}
                  </span>
                  <span className={`shrink-0 rounded-full px-2 py-0.5 text-[10px] font-semibold ring-1 ${STATE_BADGE[st].cls}`}>
                    {STATE_BADGE[st].text}
                  </span>
                </div>
                <div className={`text-xs ${locked ? 'text-slate-600' : 'text-slate-400'}`}>
                  {locked ? `Reach ${Math.round(MASTERY_ACCURACY * 100)}% on level ${i} to unlock.` : lvl.skill}
                </div>
                {!locked && p.answered > 0 && (
                  <div className="mt-1.5 flex items-center gap-2">
                    {/* Bar = recent accuracy; the tick marks the mastery line. */}
                    <div className="relative h-1.5 flex-1 overflow-hidden rounded-full bg-slate-700">
                      <div
                        className={`h-full ${p.mastered ? 'bg-emerald-400' : 'bg-amber-400'}`}
                        style={{ width: `${Math.round(p.accuracy * 100)}%` }}
                      />
                      <div className="absolute inset-y-0 w-px bg-slate-200/70" style={{ left: `${MASTERY_ACCURACY * 100}%` }} />
                    </div>
                    <span className="shrink-0 font-mono text-[10px] text-slate-400">
                      {Math.round(p.accuracy * 100)}% · {p.answered}/{RECENT_WINDOW}
                    </span>
                  </div>
                )}
              </button>
            );
          })}

          <button
            onClick={() => choose('mistakes')}
            className={`w-full rounded-lg border px-3 py-2 text-left transition-colors ${
              drill === 'mistakes'
                ? 'border-indigo-400 bg-indigo-950/40'
                : 'border-indigo-500/30 bg-indigo-950/20 hover:bg-indigo-950/40'
            }`}
          >
            <div className="flex items-center justify-between gap-2">
              <span className="text-sm font-semibold text-slate-100">📌 Practise your mistakes</span>
              <span className="shrink-0 rounded-full bg-indigo-500/20 px-2 py-0.5 text-[10px] font-semibold text-indigo-200 ring-1 ring-indigo-400/40">
                {mistakesDue > 0 ? `${mistakesDue} due` : `${mistakes.cards.length} saved`}
              </span>
            </div>
            <div className="text-xs text-slate-400">Replay clear errors from your own hands until you get them right.</div>
          </button>
        </div>
        </>
        )}
      </div>

      <div ref={drillPaneRef} onClickCapture={backToTop} className="space-y-4 side:min-h-0 side:overflow-y-auto side:pr-1">
      {toast && (
        <button
          onClick={() => setToast(null)}
          className="animate-pop w-full rounded-lg border border-emerald-500/50 bg-emerald-950/60 px-3 py-2 text-left text-sm font-semibold text-emerald-200"
        >
          {toast} <span className="text-xs font-normal text-emerald-400">(tap to dismiss)</span>
        </button>
      )}

      <div className="border-t border-slate-800 pt-3 side:border-t-0 side:pt-0">
        <div ref={drillTopRef} className="mb-3 scroll-mt-2 text-xs font-semibold uppercase tracking-wide text-slate-400">
          {drill === 'mistakes' ? 'Practise your mistakes' : `Level ${selectedLevel + 1} · ${LEVELS[selectedLevel].title}`}
        </div>
        {drill === 'chen' ? (
          <ChenTrainer key="chen" />
        ) : drill === 'position' ? (
          <PositionTrainer key="position" />
        ) : drill === 'outs' ? (
          <OutsTrainer key="outs" />
        ) : drill === 'potodds' ? (
          <PotOddsTrainer key="potodds" />
        ) : drill === 'sizing' ? (
          <SizingTrainer key="sizing" />
        ) : (
          <MistakesTrainer key="mistakes" />
        )}
      </div>
      </div>
    </div>
  );
}
