import { useEffect, useRef, useState } from 'react';
import type { Card } from '../engine/deck';
import { ALL_DRAWS, DRAW_LABELS, comeDescription, outsOptions } from '../engine/outsDrill';
import type { DrawType } from '../engine/outsDrill';
import { generateDecisionScenario } from '../engine/decisionDrill';
import type { DecisionAction, DecisionScenario } from '../engine/decisionDrill';
import { recordDrillResult } from '../persistence/drillStats';

// A two-phase drill: first count your outs (exactly like the Draws & Outs
// trainer — same generators, same verified out counts), THEN decide what to
// do about it. This exists because the old version just handed you a made-up
// "your chance: 16%" with no way to see where that number came from. Now the
// equity you compare against the price is the exact number you just counted.
const TIME_LIMIT = 25;

const SUIT_CHARS: Record<Card['suit'], string> = { s: '♠', h: '♥', d: '♦', c: '♣' };
const rankLabel = (r: Card['rank']) => (r === 'T' ? '10' : r);

function CardFace({ c, small }: { c: Card; small?: boolean }) {
  const red = c.suit === 'h' || c.suit === 'd';
  return (
    <div className={`flex ${small ? 'h-16 w-11' : 'h-20 w-14'} flex-col items-center justify-center rounded-lg border border-slate-300 bg-white shadow`}>
      <span className={`${small ? 'text-lg' : 'text-2xl'} font-bold ${red ? 'text-rose-600' : 'text-slate-900'}`}>{rankLabel(c.rank)}</span>
      <span className={`${small ? 'text-lg' : 'text-2xl'} ${red ? 'text-rose-600' : 'text-slate-900'}`}>{SUIT_CHARS[c.suit]}</span>
    </div>
  );
}

const ACTION_LABEL: Record<DecisionAction, string> = { fold: 'Fold', call: 'Call', raise: 'Raise' };
const ACTION_TONE: Record<DecisionAction, string> = {
  fold: 'border-rose-600 bg-rose-950/50 text-rose-300',
  call: 'border-emerald-600 bg-emerald-950/50 text-emerald-300',
  raise: 'border-amber-500 bg-amber-950/40 text-amber-300',
};

type Phase = 'outs' | 'decision';

export function PotOddsTrainer() {
  const [enabled, setEnabled] = useState<DrawType[]>([...ALL_DRAWS]);
  const [scenario, setScenario] = useState<DecisionScenario>(() => generateDecisionScenario(ALL_DRAWS));
  const [phase, setPhase] = useState<Phase>('outs');
  const [outsGuess, setOutsGuess] = useState<number | null>(null);
  const [actionGuess, setActionGuess] = useState<DecisionAction | null>(null);
  const [timed, setTimed] = useState(false);
  const [showHelp, setShowHelp] = useState(false);
  const [timeLeft, setTimeLeft] = useState(TIME_LIMIT);
  const [stats, setStats] = useState({ correct: 0, total: 0, score: 0, streak: 0, best: 0 });
  const timeLeftRef = useRef(timeLeft);
  timeLeftRef.current = timeLeft;

  const outsRevealed = outsGuess != null;
  const decisionRevealed = actionGuess != null;
  const s = scenario.outsScenario;
  const outsOptionsList = outsRevealed ? [] : outsOptions(s.outs);

  // Countdown only runs during the currently-active, unanswered phase.
  useEffect(() => {
    if (!timed) return;
    const waitingOnOuts = phase === 'outs' && !outsRevealed;
    const waitingOnDecision = phase === 'decision' && !decisionRevealed;
    if (!waitingOnOuts && !waitingOnDecision) return;
    if (timeLeft <= 0) {
      if (waitingOnOuts) submitOuts(-1);
      else submitAction('fold' === scenario.action ? 'call' : 'fold'); // time-out counts as wrong
      return;
    }
    const t = setTimeout(() => setTimeLeft((v) => v - 1), 1000);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [timed, phase, outsRevealed, decisionRevealed, timeLeft]);

  function submitOuts(choice: number) {
    if (outsRevealed) return;
    setOutsGuess(choice);
    setTimeLeft(TIME_LIMIT);
  }

  function goToDecision() {
    setPhase('decision');
    setTimeLeft(TIME_LIMIT);
  }

  function submitAction(choice: DecisionAction) {
    if (decisionRevealed) return;
    const correct = choice === scenario.action;
    const speedBonus = timed ? Math.round((timeLeftRef.current / TIME_LIMIT) * 50) : 0;
    const gained = correct ? 50 + speedBonus + stats.streak * 5 : 0;
    recordDrillResult('potodds', correct);
    setActionGuess(choice);
    setStats((prev) => {
      const streak = correct ? prev.streak + 1 : 0;
      return {
        correct: prev.correct + (correct ? 1 : 0),
        total: prev.total + 1,
        score: prev.score + gained,
        streak,
        best: Math.max(prev.best, streak),
      };
    });
  }

  function next() {
    setScenario(generateDecisionScenario(enabled));
    setPhase('outs');
    setOutsGuess(null);
    setActionGuess(null);
    setTimeLeft(TIME_LIMIT);
  }

  function toggleType(t: DrawType) {
    setEnabled((prev) => (prev.includes(t) ? prev.filter((x) => x !== t) : [...prev, t]));
  }

  return (
    <div className="space-y-4">
      {/* Scoreboard */}
      <div className="flex items-center justify-between rounded-lg border border-slate-700 bg-slate-800/60 px-4 py-2">
        <div>
          <div className="text-2xl font-extrabold text-amber-300">{stats.score}</div>
          <div className="text-[11px] uppercase tracking-wide text-slate-400">points</div>
        </div>
        <div className="text-center text-xs text-slate-300">
          <div>
            {stats.correct}/{stats.total} correct
            {stats.total > 0 && ` (${Math.round((stats.correct / stats.total) * 100)}%)`}
          </div>
          <div className="text-slate-400">🔥 streak {stats.streak} · best {stats.best}</div>
        </div>
        <label className="flex cursor-pointer items-center gap-2 text-xs text-slate-300">
          <span>Timer</span>
          <button
            role="switch"
            aria-checked={timed}
            onClick={() => {
              setTimed((v) => !v);
              setTimeLeft(TIME_LIMIT);
            }}
            className={`relative h-5 w-9 rounded-full transition-colors ${timed ? 'bg-emerald-600' : 'bg-slate-600'}`}
          >
            <span className={`absolute top-0.5 h-4 w-4 rounded-full bg-white transition-transform ${timed ? 'translate-x-4' : 'translate-x-0.5'}`} />
          </button>
        </label>
      </div>

      {/* Which draws to practice */}
      <div>
        <div className="mb-1.5 text-xs font-medium uppercase tracking-wide text-slate-400">Practice which draws?</div>
        <div className="flex flex-wrap gap-1.5">
          {ALL_DRAWS.map((t) => {
            const on = enabled.includes(t);
            return (
              <button
                key={t}
                onClick={() => toggleType(t)}
                className={`rounded-full px-3 py-1 text-xs font-semibold transition-colors ${
                  on ? 'bg-emerald-600 text-white' : 'bg-slate-800 text-slate-400 hover:bg-slate-700'
                }`}
              >
                {DRAW_LABELS[t]}
              </button>
            );
          })}
        </div>
      </div>

      <div className="rounded-lg border border-slate-700 bg-slate-800/60 text-sm text-slate-300">
        <button onClick={() => setShowHelp((v) => !v)} className="flex w-full items-center justify-between px-4 py-2 text-left font-semibold text-slate-100">
          <span>How this drill works</span>
          <span className="text-slate-500">{showHelp ? '▲' : '▼'}</span>
        </button>
        {showHelp && (
          <ol className="ml-4 list-decimal space-y-1 px-4 pb-3 text-xs">
            <li>First, count your <span className="text-slate-100">outs</span> on the actual cards shown, same as the Draws &amp; Outs drill.</li>
            <li>Outs × 4 (two cards left) or × 2 (one card left) = your <span className="text-slate-100">equity</span> — no guessing, it's the number you just counted.</li>
            <li>The price to continue is <span className="text-slate-100">call ÷ (pot + call)</span> — the break-even %.</li>
            <li>Equity below break-even → <span className="text-rose-300">fold</span>. Equity above it with a big draw (8+ outs: open-ended, flush, or combo) → <span className="text-amber-300">raise</span> as a semi-bluff. Above it with a smaller draw (gutshot or overcards) → <span className="text-emerald-300">call</span>.</li>
          </ol>
        )}
      </div>

      {/* The spot: shown throughout both phases so the cards never disappear. */}
      <div className="rounded-lg border border-slate-700 bg-emerald-950/30 p-3">
        <div className="mb-2 text-center text-xs text-slate-400">{comeDescription(s.cardsToCome)}</div>
        <div className="flex items-end justify-center gap-4">
          <div className="text-center">
            <div className="mb-1 text-[11px] uppercase tracking-wide text-emerald-300">Your hand</div>
            <div className="flex gap-1.5">
              {s.hero.map((c, i) => (
                <CardFace key={i} c={c} />
              ))}
            </div>
          </div>
          <div className="text-center">
            <div className="mb-1 text-[11px] uppercase tracking-wide text-slate-400">Board</div>
            <div className="flex gap-1.5">
              {s.board.map((c, i) => (
                <CardFace key={i} c={c} small />
              ))}
            </div>
          </div>
        </div>
        {phase === 'decision' && (
          <div className="mt-3 grid grid-cols-3 gap-2">
            <Stat label="Pot" value={`$${scenario.potBefore.toLocaleString()}`} tone="text-amber-300" />
            <Stat label="To call" value={`$${scenario.toCall.toLocaleString()}`} tone="text-rose-300" />
            <Stat label="Your equity" value={`${scenario.equityPercent}%`} tone="text-emerald-300" />
          </div>
        )}
        {timed && ((phase === 'outs' && !outsRevealed) || (phase === 'decision' && !decisionRevealed)) && (
          <div className={`mt-2 text-center font-mono text-sm font-bold ${timeLeft <= 6 ? 'text-rose-400' : 'text-slate-400'}`}>{timeLeft}s</div>
        )}
      </div>

      {phase === 'outs' ? (
        !outsRevealed ? (
          <div>
            <p className="mb-2 text-center text-sm text-slate-300">Step 1 — how many outs do you have?</p>
            <div className="grid grid-cols-4 gap-2">
              {outsOptionsList.map((n) => (
                <button
                  key={n}
                  onClick={() => submitOuts(n)}
                  className="rounded-lg bg-slate-700 px-3 py-2 text-base font-bold text-white transition-colors hover:bg-slate-600"
                >
                  {n}
                </button>
              ))}
            </div>
          </div>
        ) : (
          <div className="space-y-4">
            <div
              className={`rounded-lg border p-3 text-center font-semibold ${
                outsGuess === s.outs ? 'border-emerald-600 bg-emerald-950/50 text-emerald-300' : 'border-rose-600 bg-rose-950/50 text-rose-300'
              }`}
            >
              {outsGuess === s.outs ? 'Correct!' : outsGuess === -1 ? "Time's up!" : `Not quite — you said ${outsGuess}.`}{' '}
              <span className="text-slate-100">
                {s.drawName}: {s.outs} outs
              </span>
            </div>
            <div className="rounded-lg border border-slate-700 bg-slate-800/60 p-3">
              <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-slate-400">How it's worked out</p>
              <ul className="ml-4 list-disc space-y-1 text-sm text-slate-300">
                {s.steps.map((st, i) => (
                  <li key={i}>{st}</li>
                ))}
              </ul>
              <div className="mt-3 border-t border-slate-700 pt-2 font-mono text-sm">
                {s.outs} outs × {s.cardsToCome === 2 ? 4 : 2} ={' '}
                <span className="text-emerald-300">≈ {scenario.equityPercent}% equity</span>
              </div>
            </div>
            <button onClick={goToDecision} className="w-full rounded-lg bg-emerald-600 py-2 font-semibold text-white transition-colors hover:bg-emerald-500">
              Step 2: what do you do? →
            </button>
          </div>
        )
      ) : !decisionRevealed ? (
        <div>
          <p className="mb-2 text-center text-sm text-slate-300">
            Step 2 — you have {scenario.equityPercent}% equity. Fold, call, or raise?
          </p>
          <div className="grid grid-cols-3 gap-2">
            <button onClick={() => submitAction('fold')} className="rounded-lg bg-rose-700 py-3 text-base font-bold text-white transition-colors hover:bg-rose-600">
              Fold
            </button>
            <button onClick={() => submitAction('call')} className="rounded-lg bg-emerald-600 py-3 text-base font-bold text-white transition-colors hover:bg-emerald-500">
              Call
            </button>
            <button onClick={() => submitAction('raise')} className="rounded-lg bg-amber-600 py-3 text-base font-bold text-white transition-colors hover:bg-amber-500">
              Raise
            </button>
          </div>
        </div>
      ) : (
        <div className="space-y-4">
          <div className={`rounded-lg border p-3 text-center font-semibold ${actionGuess === scenario.action ? ACTION_TONE[scenario.action] : 'border-rose-600 bg-rose-950/50 text-rose-300'}`}>
            {actionGuess === scenario.action
              ? `Correct! +${50 + (timed ? Math.round((timeLeftRef.current / TIME_LIMIT) * 50) : 0) + (stats.streak - 1) * 5} pts`
              : 'Not quite.'}{' '}
            <span className="text-slate-100">You should {ACTION_LABEL[scenario.action].toLowerCase()}.</span>
          </div>

          <div className="rounded-lg border border-slate-700 bg-slate-800/60 p-3 text-sm">
            <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-slate-400">How it's worked out</p>
            <p className="font-mono text-slate-300">
              {scenario.toCall} ÷ ({scenario.potBefore} + {scenario.toCall}) ={' '}
              <span className="text-amber-300">{scenario.breakEvenPercent.toFixed(1)}% break-even</span>
            </p>
            <p className="mt-2 text-slate-300">
              Your {scenario.equityPercent}% equity ({s.outs} outs) is{' '}
              <span className="text-slate-100">{scenario.equityPercent >= scenario.breakEvenPercent ? 'more' : 'less'}</span> than the{' '}
              {scenario.breakEvenPercent.toFixed(1)}% you need, so continuing{' '}
              {scenario.equityPercent >= scenario.breakEvenPercent ? 'makes money' : 'loses money'} over the long run.
            </p>
            {scenario.action !== 'fold' && (
              <p className="mt-2 text-slate-300">
                {scenario.raiseEligible
                  ? `With a big draw (${s.outs} outs) that's ahead of the price, raising as a semi-bluff often beats just calling — you might win the pot outright if they fold, and you still have your outs if they call.`
                  : `Your draw is live and worth continuing, but with only ${s.outs} outs there usually isn't enough extra value in raising — just call and see the next card.`}
              </p>
            )}
            <p className="mt-2 font-semibold text-slate-100">{ACTION_LABEL[scenario.action]}.</p>
          </div>

          <button onClick={next} className="w-full rounded-lg bg-emerald-600 py-2 font-semibold text-white transition-colors hover:bg-emerald-500">
            Next spot →
          </button>
        </div>
      )}
    </div>
  );
}

function Stat({ label, value, tone }: { label: string; value: string; tone: string }) {
  return (
    <div className="rounded-lg bg-slate-900/60 py-2">
      <div className={`text-lg font-extrabold ${tone}`}>{value}</div>
      <div className="text-[10px] uppercase tracking-wide text-slate-500">{label}</div>
    </div>
  );
}
