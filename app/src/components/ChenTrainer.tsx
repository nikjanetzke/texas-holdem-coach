import { useEffect, useMemo, useRef, useState } from 'react';
import type { Card } from '../engine/deck';
import { RANKS, SUITS, shuffle } from '../engine/deck';
import { chenBreakdown } from '../engine/preflop';

const SUIT_CHARS: Record<Card['suit'], string> = { s: '♠', h: '♥', d: '♦', c: '♣' };
const rankLabel = (r: Card['rank']) => (r === 'T' ? '10' : r);

// Answer buckets, labelled with their Chen-score ranges so the cutoffs are obvious.
const BANDS: { label: string; range: string; min: number; tone: string }[] = [
  { label: 'Premium', range: '10+', min: 10, tone: 'bg-emerald-600' },
  { label: 'Strong', range: '8–9', min: 8, tone: 'bg-emerald-500' },
  { label: 'Playable', range: '6–7', min: 6, tone: 'bg-amber-500' },
  { label: 'Marginal', range: '4–5', min: 4, tone: 'bg-orange-500' },
  { label: 'Weak', range: '0–3', min: 0, tone: 'bg-rose-600' },
];

const bandFor = (score: number) => BANDS.find((b) => score >= b.min)!.label;

const TIME_LIMIT = 15; // seconds per hand when the timer is on

function dealHand(): Card[] {
  const deck = shuffle(RANKS.flatMap((rank) => SUITS.map((suit) => ({ rank, suit }))));
  return deck.slice(0, 2);
}

export function ChenTrainer() {
  const [hand, setHand] = useState<Card[]>(() => dealHand());
  const [guess, setGuess] = useState<string | null>(null);
  const [timed, setTimed] = useState(false);
  const [timeLeft, setTimeLeft] = useState(TIME_LIMIT);
  const [stats, setStats] = useState({ correct: 0, total: 0, score: 0, streak: 0, best: 0 });

  const { score, steps } = useMemo(() => chenBreakdown(hand), [hand]);
  const answer = bandFor(score);
  const revealed = guess != null;
  const isCorrect = guess === answer;
  const timeLeftRef = useRef(timeLeft);
  timeLeftRef.current = timeLeft;

  // Countdown while a timed question is unanswered.
  useEffect(() => {
    if (!timed || revealed) return;
    if (timeLeft <= 0) {
      submit('__timeout__');
      return;
    }
    const t = setTimeout(() => setTimeLeft((s) => s - 1), 1000);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [timed, revealed, timeLeft]);

  function submit(choice: string) {
    if (revealed) return;
    const correct = choice === answer;
    // Faster answers score more when the timer is on; flat points otherwise.
    const speedBonus = timed ? Math.round((timeLeftRef.current / TIME_LIMIT) * 50) : 0;
    const gained = correct ? 50 + speedBonus + stats.streak * 5 : 0;
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
    setHand(dealHand());
    setGuess(null);
    setTimeLeft(TIME_LIMIT);
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

      <div className="rounded-lg border border-slate-700 bg-slate-800/60 p-4 text-sm text-slate-300">
        <p className="mb-2 font-semibold text-slate-100">The Chen formula — score a starting hand fast</p>
        <ol className="ml-4 list-decimal space-y-1 text-xs">
          <li>
            Take your <span className="text-slate-100">highest card</span>: A = 10, K = 8, Q = 7, J = 6, 10 = 5, and any
            other card = its number ÷ 2 (so a 6 = 3).
          </li>
          <li>
            <span className="text-slate-100">A pair?</span> Double those points (a minimum of 5). So KK = 8 × 2 = 16; 22 =
            1 × 2 = 2, bumped up to the minimum 5.
          </li>
          <li>
            <span className="text-slate-100">Both the same suit?</span> Add 2 (you can make a flush).
          </li>
          <li>
            <span className="text-slate-100">Count the cards BETWEEN them</span> (the “gap”, not the rank difference):
            none = 0, one = −1, two = −2, three = −4, four or more = −5. Example: K and 10 have Q and J between them → a
            2-gap → −2.
          </li>
          <li>
            <span className="text-slate-100">Close and low?</span> If the gap is 0 or 1 and both cards are below Q, add 1
            (easy to make straights).
          </li>
          <li>Round to the nearest whole number. Roughly: 10+ premium, 8–9 strong, 6–7 playable, 4–5 marginal, below 4 fold.</li>
        </ol>
      </div>

      <div className="relative flex items-center justify-center gap-3 py-2">
        {timed && !revealed && (
          <span className={`absolute right-2 top-0 font-mono text-sm font-bold ${timeLeft <= 5 ? 'text-rose-400' : 'text-slate-400'}`}>
            {timeLeft}s
          </span>
        )}
        {hand.map((c, i) => {
          const red = c.suit === 'h' || c.suit === 'd';
          return (
            <div key={i} className="flex h-28 w-20 flex-col items-center justify-center rounded-lg border border-slate-300 bg-white shadow-lg">
              <span className={`text-3xl font-bold ${red ? 'text-rose-600' : 'text-slate-900'}`}>{rankLabel(c.rank)}</span>
              <span className={`text-3xl ${red ? 'text-rose-600' : 'text-slate-900'}`}>{SUIT_CHARS[c.suit]}</span>
            </div>
          );
        })}
      </div>

      {!revealed ? (
        <div>
          <p className="mb-2 text-center text-sm text-slate-300">How strong is this hand?</p>
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
            {BANDS.map((b) => (
              <button
                key={b.label}
                onClick={() => submit(b.label)}
                className={`rounded-lg ${b.tone} px-3 py-2 text-sm font-semibold text-white transition-opacity hover:opacity-90`}
              >
                {b.label} <span className="opacity-80">{b.range}</span>
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
            {isCorrect ? `Correct! +${50 + (timed ? Math.round((timeLeftRef.current / TIME_LIMIT) * 50) : 0) + (stats.streak - 1) * 5} pts` : guess === '__timeout__' ? "Time's up!" : `Not quite — you picked ${guess}.`}{' '}
            <span className="text-slate-100">
              Chen score {score} → {answer}
            </span>
          </div>

          <div className="rounded-lg border border-slate-700 bg-slate-800/60 p-3">
            <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-slate-400">How it scores</p>
            <ul className="space-y-1 text-sm">
              {steps.map((s, i) => (
                <li key={i} className="flex items-center justify-between gap-3">
                  <span className="text-slate-300">{s.label}</span>
                  <span className="font-mono text-slate-400">
                    {s.delta} <span className="text-slate-100">= {s.running}</span>
                  </span>
                </li>
              ))}
            </ul>
          </div>

          <button onClick={next} className="w-full rounded-lg bg-emerald-600 py-2 font-semibold text-white transition-colors hover:bg-emerald-500">
            Next hand →
          </button>
        </div>
      )}
    </div>
  );
}
