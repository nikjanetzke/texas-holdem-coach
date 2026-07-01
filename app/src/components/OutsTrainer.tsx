import { useEffect, useMemo, useRef, useState } from 'react';
import type { Card } from '../engine/deck';
import {
  ALL_DRAWS,
  DRAW_LABELS,
  comeDescription,
  generateOutsScenario,
  hitPercent,
  outsOptions,
  type DrawType,
} from '../engine/outsDrill';
import { recordDrillResult } from '../persistence/drillStats';

const SUIT_CHARS: Record<Card['suit'], string> = { s: '♠', h: '♥', d: '♦', c: '♣' };
const rankLabel = (r: Card['rank']) => (r === 'T' ? '10' : r);
const TIME_LIMIT = 20;

function CardFace({ c, small }: { c: Card; small?: boolean }) {
  const red = c.suit === 'h' || c.suit === 'd';
  return (
    <div className={`flex ${small ? 'h-16 w-11' : 'h-20 w-14'} flex-col items-center justify-center rounded-lg border border-slate-300 bg-white shadow`}>
      <span className={`${small ? 'text-lg' : 'text-2xl'} font-bold ${red ? 'text-rose-600' : 'text-slate-900'}`}>{rankLabel(c.rank)}</span>
      <span className={`${small ? 'text-lg' : 'text-2xl'} ${red ? 'text-rose-600' : 'text-slate-900'}`}>{SUIT_CHARS[c.suit]}</span>
    </div>
  );
}

export function OutsTrainer() {
  const [enabled, setEnabled] = useState<DrawType[]>([...ALL_DRAWS]);
  const [scenario, setScenario] = useState(() => generateOutsScenario(ALL_DRAWS));
  const [guess, setGuess] = useState<number | null>(null);
  const [timed, setTimed] = useState(false);
  const [showHelp, setShowHelp] = useState(false);
  const [timeLeft, setTimeLeft] = useState(TIME_LIMIT);
  const [stats, setStats] = useState({ correct: 0, total: 0, score: 0, streak: 0, best: 0 });
  const timeLeftRef = useRef(timeLeft);
  timeLeftRef.current = timeLeft;

  const options = useMemo(() => outsOptions(scenario.outs), [scenario]);
  const pct = hitPercent(scenario.outs, scenario.cardsToCome);
  const revealed = guess != null;
  const isCorrect = guess === scenario.outs;

  useEffect(() => {
    if (!timed || revealed) return;
    if (timeLeft <= 0) {
      submit(-1);
      return;
    }
    const t = setTimeout(() => setTimeLeft((s) => s - 1), 1000);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [timed, revealed, timeLeft]);

  function submit(choice: number) {
    if (revealed) return;
    const correct = choice === scenario.outs;
    const speedBonus = timed ? Math.round((timeLeftRef.current / TIME_LIMIT) * 50) : 0;
    const gained = correct ? 50 + speedBonus + stats.streak * 5 : 0;
    recordDrillResult('outs', correct);
    setGuess(choice);
    setStats((s) => {
      const streak = correct ? s.streak + 1 : 0;
      return {
        correct: s.correct + (correct ? 1 : 0),
        total: s.total + 1,
        score: s.score + gained,
        streak,
        best: Math.max(s.best, streak),
      };
    });
  }

  function next() {
    setScenario(generateOutsScenario(enabled));
    setGuess(null);
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

      {/* How-to (collapsed) */}
      <div className="rounded-lg border border-slate-700 bg-slate-800/60 text-sm text-slate-300">
        <button onClick={() => setShowHelp((v) => !v)} className="flex w-full items-center justify-between px-4 py-2 text-left font-semibold text-slate-100">
          <span>How to count outs (rule of 2 &amp; 4)</span>
          <span className="text-slate-500">{showHelp ? '▲' : '▼'}</span>
        </button>
        {showHelp && (
          <ol className="ml-4 list-decimal space-y-1 px-4 pb-3 text-xs">
            <li>An <span className="text-slate-100">out</span> is any card left in the deck that completes your hand.</li>
            <li>Count them: a flush draw has 9 (13 of the suit − 4 you can see); an open-ended straight has 8; a gutshot 4; two overcards 6 (3 to pair each).</li>
            <li>Convert to a rough %: on the flop (two cards to come) <span className="text-slate-100">outs × 4</span>; on the turn (one card) <span className="text-slate-100">outs × 2</span>.</li>
            <li>Example: 9 flush outs on the turn ≈ 9 × 2 = 18%.</li>
          </ol>
        )}
      </div>

      {/* The spot */}
      <div className="rounded-lg border border-slate-700 bg-emerald-950/30 p-3">
        <div className="mb-2 text-center text-xs text-slate-400">{comeDescription(scenario.cardsToCome)}</div>
        <div className="flex items-end justify-center gap-4">
          <div className="text-center">
            <div className="mb-1 text-[11px] uppercase tracking-wide text-emerald-300">Your hand</div>
            <div className="flex gap-1.5">
              {scenario.hero.map((c, i) => (
                <CardFace key={i} c={c} />
              ))}
            </div>
          </div>
          <div className="text-center">
            <div className="mb-1 text-[11px] uppercase tracking-wide text-slate-400">Board</div>
            <div className="flex gap-1.5">
              {scenario.board.map((c, i) => (
                <CardFace key={i} c={c} small />
              ))}
            </div>
          </div>
        </div>
        {timed && !revealed && (
          <div className={`mt-2 text-center font-mono text-sm font-bold ${timeLeft <= 6 ? 'text-rose-400' : 'text-slate-400'}`}>{timeLeft}s</div>
        )}
      </div>

      {!revealed ? (
        <div>
          <p className="mb-2 text-center text-sm text-slate-300">How many outs do you have?</p>
          <div className="grid grid-cols-4 gap-2">
            {options.map((n) => (
              <button
                key={n}
                onClick={() => submit(n)}
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
              isCorrect ? 'border-emerald-600 bg-emerald-950/50 text-emerald-300' : 'border-rose-600 bg-rose-950/50 text-rose-300'
            }`}
          >
            {isCorrect ? `Correct! +${50 + (timed ? Math.round((timeLeftRef.current / TIME_LIMIT) * 50) : 0) + (stats.streak - 1) * 5} pts` : guess === -1 ? "Time's up!" : `Not quite — you said ${guess}.`}{' '}
            <span className="text-slate-100">
              {scenario.drawName}: {scenario.outs} outs
            </span>
          </div>

          <div className="rounded-lg border border-slate-700 bg-slate-800/60 p-3">
            <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-slate-400">How it's worked out</p>
            <ul className="ml-4 list-disc space-y-1 text-sm text-slate-300">
              {scenario.steps.map((s, i) => (
                <li key={i}>{s}</li>
              ))}
            </ul>
            <div className="mt-3 border-t border-slate-700 pt-2 font-mono text-sm">
              {scenario.outs} outs × {scenario.cardsToCome === 2 ? 4 : 2} ={' '}
              <span className="text-emerald-300">≈ {pct}% to hit</span>{' '}
              <span className="text-slate-500">({scenario.cardsToCome === 2 ? 'two cards to come' : 'one card to come'})</span>
            </div>
          </div>

          <button onClick={next} className="w-full rounded-lg bg-emerald-600 py-2 font-semibold text-white transition-colors hover:bg-emerald-500">
            Next spot →
          </button>
        </div>
      )}
    </div>
  );
}
