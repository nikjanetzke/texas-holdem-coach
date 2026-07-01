import { useEffect, useMemo, useRef, useState } from 'react';
import { recordDrillResult } from '../persistence/drillStats';

const TIME_LIMIT = 20;
const round25 = (n: number) => Math.max(25, Math.round(n / 25) * 25);

interface Spot {
  potBefore: number; // chips already in the middle (includes opponent's bet)
  toCall: number; // amount you must call
  winPct: number; // your rough chance to win
  breakEven: number; // equity needed to break even, %
  correct: 'call' | 'fold';
}

function makeSpot(): Spot {
  const potBefore = round25(100 + Math.random() * 700);
  const toCall = round25(potBefore * (0.25 + Math.random() * 0.75));
  const breakEven = (toCall / (potBefore + toCall)) * 100;
  const wantCall = Math.random() < 0.5;
  const margin = 6 + Math.random() * 12; // keep it a clear decision, not a coin-flip
  let winPct = Math.round(wantCall ? breakEven + margin : breakEven - margin);
  winPct = Math.max(3, Math.min(94, winPct));
  return { potBefore, toCall, winPct, breakEven, correct: winPct >= breakEven ? 'call' : 'fold' };
}

export function PotOddsTrainer() {
  const [spot, setSpot] = useState<Spot>(() => makeSpot());
  const [guess, setGuess] = useState<'call' | 'fold' | null>(null);
  const [timed, setTimed] = useState(false);
  const [showHelp, setShowHelp] = useState(false);
  const [timeLeft, setTimeLeft] = useState(TIME_LIMIT);
  const [stats, setStats] = useState({ correct: 0, total: 0, score: 0, streak: 0, best: 0 });
  const timeLeftRef = useRef(timeLeft);
  timeLeftRef.current = timeLeft;

  const revealed = guess != null;
  const isCorrect = guess === spot.correct;
  const beStr = useMemo(() => spot.breakEven.toFixed(1), [spot]);

  useEffect(() => {
    if (!timed || revealed) return;
    if (timeLeft <= 0) {
      submit(spot.correct === 'call' ? 'fold' : 'call'); // time-out counts as wrong
      return;
    }
    const t = setTimeout(() => setTimeLeft((s) => s - 1), 1000);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [timed, revealed, timeLeft]);

  function submit(choice: 'call' | 'fold') {
    if (revealed) return;
    const correct = choice === spot.correct;
    const speedBonus = timed ? Math.round((timeLeftRef.current / TIME_LIMIT) * 50) : 0;
    const gained = correct ? 50 + speedBonus + stats.streak * 5 : 0;
    recordDrillResult('potodds', correct);
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
    setSpot(makeSpot());
    setGuess(null);
    setTimeLeft(TIME_LIMIT);
  }

  return (
    <div className="space-y-4">
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

      <div className="rounded-lg border border-slate-700 bg-slate-800/60 text-sm text-slate-300">
        <button onClick={() => setShowHelp((v) => !v)} className="flex w-full items-center justify-between px-4 py-2 text-left font-semibold text-slate-100">
          <span>How pot odds decide it</span>
          <span className="text-slate-500">{showHelp ? '▲' : '▼'}</span>
        </button>
        {showHelp && (
          <ol className="ml-4 list-decimal space-y-1 px-4 pb-3 text-xs">
            <li>Work out the price: <span className="text-slate-100">call ÷ (pot + call)</span> = the % you need to win to break even.</li>
            <li>Compare it to your <span className="text-slate-100">chance to win</span> (equity).</li>
            <li>If your chance ≥ the break-even %, calling makes money → <span className="text-emerald-300">call</span>. Otherwise <span className="text-rose-300">fold</span>.</li>
          </ol>
        )}
      </div>

      <div className="rounded-lg border border-slate-700 bg-emerald-950/30 p-4 text-center">
        <div className="grid grid-cols-3 gap-2">
          <Stat label="Pot" value={`$${spot.potBefore.toLocaleString()}`} tone="text-amber-300" />
          <Stat label="To call" value={`$${spot.toCall.toLocaleString()}`} tone="text-rose-300" />
          <Stat label="Your chance" value={`~${spot.winPct}%`} tone="text-emerald-300" />
        </div>
        {timed && !revealed && (
          <div className={`mt-2 font-mono text-sm font-bold ${timeLeft <= 6 ? 'text-rose-400' : 'text-slate-400'}`}>{timeLeft}s</div>
        )}
      </div>

      {!revealed ? (
        <div>
          <p className="mb-2 text-center text-sm text-slate-300">Call or fold?</p>
          <div className="grid grid-cols-2 gap-2">
            <button onClick={() => submit('call')} className="rounded-lg bg-emerald-600 py-3 text-base font-bold text-white transition-colors hover:bg-emerald-500">
              Call
            </button>
            <button onClick={() => submit('fold')} className="rounded-lg bg-rose-700 py-3 text-base font-bold text-white transition-colors hover:bg-rose-600">
              Fold
            </button>
          </div>
        </div>
      ) : (
        <div className="space-y-4">
          <div
            className={`rounded-lg border p-3 text-center font-semibold ${
              isCorrect ? 'border-emerald-600 bg-emerald-950/50 text-emerald-300' : 'border-rose-600 bg-rose-950/50 text-rose-300'
            }`}
          >
            {isCorrect ? `Correct! +${50 + (timed ? Math.round((timeLeftRef.current / TIME_LIMIT) * 50) : 0) + (stats.streak - 1) * 5} pts` : 'Not quite.'}{' '}
            <span className="text-slate-100">You should {spot.correct}.</span>
          </div>

          <div className="rounded-lg border border-slate-700 bg-slate-800/60 p-3 text-sm">
            <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-slate-400">How it's worked out</p>
            <p className="font-mono text-slate-300">
              {spot.toCall} ÷ ({spot.potBefore} + {spot.toCall}) = <span className="text-amber-300">{beStr}% break-even</span>
            </p>
            <p className="mt-2 text-slate-300">
              You win about <span className="text-emerald-300">{spot.winPct}%</span> of the time, which is{' '}
              <span className="text-slate-100">{spot.winPct >= spot.breakEven ? 'more' : 'less'}</span> than the{' '}
              {beStr}% you need — so calling {spot.winPct >= spot.breakEven ? 'makes money' : 'loses money'} over the long run.{' '}
              <span className="font-semibold">{spot.correct === 'call' ? 'Call.' : 'Fold.'}</span>
            </p>
            <p className="mt-2 text-xs text-slate-500">
              In odds terms that's about {(spot.potBefore / spot.toCall).toFixed(1)}-to-1.
            </p>
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
