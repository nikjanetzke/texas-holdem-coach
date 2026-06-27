import { useMemo, useState } from 'react';
import type { Card } from '../engine/deck';
import { RANKS, SUITS, shuffle } from '../engine/deck';
import { chenBreakdown } from '../engine/preflop';

const SUIT_CHARS: Record<Card['suit'], string> = { s: '♠', h: '♥', d: '♦', c: '♣' };

// Five answer buckets the player guesses between. Kept aligned with the in-game
// StartingHandRating labels so the trainer teaches the same vocabulary.
const BANDS: { label: string; min: number; tone: string }[] = [
  { label: 'Premium', min: 10, tone: 'bg-emerald-600' },
  { label: 'Strong', min: 8, tone: 'bg-emerald-500' },
  { label: 'Playable', min: 6, tone: 'bg-amber-500' },
  { label: 'Marginal', min: 4, tone: 'bg-orange-500' },
  { label: 'Weak', min: 0, tone: 'bg-rose-600' },
];

function bandFor(score: number): string {
  return BANDS.find((b) => score >= b.min)!.label;
}

function dealHand(): Card[] {
  const deck = shuffle(RANKS.flatMap((rank) => SUITS.map((suit) => ({ rank, suit }))));
  return deck.slice(0, 2);
}

export function ChenTrainer() {
  const [hand, setHand] = useState<Card[]>(() => dealHand());
  const [guess, setGuess] = useState<string | null>(null);
  const [stats, setStats] = useState({ correct: 0, total: 0 });

  const { score, steps } = useMemo(() => chenBreakdown(hand), [hand]);
  const answer = bandFor(score);
  const revealed = guess != null;
  const isCorrect = guess === answer;

  function submit(choice: string) {
    if (revealed) return;
    setGuess(choice);
    setStats((s) => ({ correct: s.correct + (choice === answer ? 1 : 0), total: s.total + 1 }));
  }

  function next() {
    setHand(dealHand());
    setGuess(null);
  }

  return (
    <div className="space-y-5">
      <div className="rounded-lg border border-slate-700 bg-slate-800/60 p-4 text-sm text-slate-300">
        <p className="mb-2 font-semibold text-slate-100">The Chen formula — score a starting hand fast</p>
        <ol className="ml-4 list-decimal space-y-1 text-xs">
          <li>Take your highest card: <span className="text-slate-100">A=10, K=8, Q=7, J=6, otherwise rank ÷ 2</span>.</li>
          <li><span className="text-slate-100">Pair?</span> Double those points (minimum 5).</li>
          <li><span className="text-slate-100">Suited?</span> Add 2.</li>
          <li><span className="text-slate-100">Gap</span> between cards: 1-gap −1, 2-gap −2, 3-gap −4, 4+ −5.</li>
          <li><span className="text-slate-100">Straighty?</span> 0–1 gap and both below Q: add 1.</li>
          <li>Round to the nearest whole number.</li>
        </ol>
      </div>

      <div className="flex items-center justify-center gap-3 py-2">
        {hand.map((c, i) => {
          const red = c.suit === 'h' || c.suit === 'd';
          return (
            <div
              key={i}
              className="flex h-28 w-20 flex-col items-center justify-center rounded-lg border border-slate-300 bg-white shadow-lg"
            >
              <span className={`text-3xl font-bold ${red ? 'text-rose-600' : 'text-slate-900'}`}>{c.rank}</span>
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
                {b.label}
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
            {isCorrect ? 'Correct!' : `Not quite — you picked ${guess}.`}{' '}
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

          <button
            onClick={next}
            className="w-full rounded-lg bg-emerald-600 py-2 font-semibold text-white transition-colors hover:bg-emerald-500"
          >
            Next hand →
          </button>
        </div>
      )}

      <p className="text-center text-xs text-slate-500">
        Score: {stats.correct}/{stats.total}
        {stats.total > 0 && ` (${Math.round((stats.correct / stats.total) * 100)}%)`}
      </p>
    </div>
  );
}
