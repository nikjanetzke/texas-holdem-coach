import { useState } from 'react';
import { recordDrillResult } from '../persistence/drillStats';
import { gradeQuestion, pendingReviews, pickQuestion } from '../training/srs';
import {
  SEATS,
  describeClass,
  explainVerdict,
  generatePositionQuestion,
  positionQuestionId,
  tierOf,
  verdictFor,
  type PositionQuestion,
  type Verdict,
} from '../training/positionDrill';
import { PlayingCard, ReviewBadge } from './training/PlayingCard';

const DECK = 'position';

// The order players act in before the flop at a 6-player table — you at one
// of the four non-blind seats. Showing the whole order makes "how many people
// act after you" concrete, which is the entire idea behind position.
const ORDER: { id: string; short: string }[] = [
  { id: 'early', short: 'Early' },
  { id: 'middle', short: 'Middle' },
  { id: 'cutoff', short: 'Cutoff' },
  { id: 'button', short: 'Button' },
  { id: 'sb', short: 'Small blind' },
  { id: 'bb', short: 'Big blind' },
];

const TIER_CHIP = {
  play: { text: 'Green on the chart — play from any seat', cls: 'bg-emerald-950/60 text-emerald-300 ring-emerald-600/40' },
  maybe: { text: 'Amber on the chart — late seats only', cls: 'bg-amber-950/60 text-amber-300 ring-amber-600/40' },
  fold: { text: 'Not on the chart — fold from every seat', cls: 'bg-slate-800 text-slate-300 ring-slate-600/40' },
} as const;

export function PositionTrainer() {
  const [q, setQ] = useState(() => pickQuestion<PositionQuestion>(DECK, generatePositionQuestion));
  const [guess, setGuess] = useState<Verdict | null>(null);
  const [showHelp, setShowHelp] = useState(false);
  const [stats, setStats] = useState({ correct: 0, total: 0, streak: 0, best: 0 });
  const [reviews, setReviews] = useState(() => pendingReviews(DECK));

  const { item, isReview } = q;
  const answer = verdictFor(item.handClass, item.seat);
  const revealed = guess != null;
  const isCorrect = guess === answer;
  const seat = SEATS.find((s) => s.id === item.seat)!;
  const tier = tierOf(item.handClass);

  function submit(choice: Verdict) {
    if (revealed) return;
    const correct = choice === answer;
    recordDrillResult('position', correct);
    gradeQuestion(DECK, positionQuestionId(item), item, correct);
    setReviews(pendingReviews(DECK));
    setGuess(choice);
    setStats((s) => {
      const streak = correct ? s.streak + 1 : 0;
      return { correct: s.correct + (correct ? 1 : 0), total: s.total + 1, streak, best: Math.max(s.best, streak) };
    });
  }

  function next() {
    setQ(pickQuestion<PositionQuestion>(DECK, generatePositionQuestion));
    setGuess(null);
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between rounded-lg border border-slate-700 bg-slate-800/60 px-4 py-2 text-xs text-slate-300">
        <div>
          {stats.correct}/{stats.total} correct
          {stats.total > 0 && ` (${Math.round((stats.correct / stats.total) * 100)}%)`}
          <div className="text-slate-400">🔥 streak {stats.streak} · best {stats.best}</div>
        </div>
        <div className="text-right text-slate-400">
          {reviews > 0 ? `🔁 ${reviews} to review` : 'No reviews waiting'}
        </div>
      </div>

      <div className="rounded-lg border border-slate-700 bg-slate-800/60 text-sm text-slate-300">
        <button
          onClick={() => setShowHelp((v) => !v)}
          className="flex w-full items-center justify-between px-4 py-2 text-left font-semibold text-slate-100"
        >
          <span>Why your seat matters</span>
          <span className="text-slate-500">{showHelp ? '▲' : '▼'}</span>
        </button>
        {showHelp && (
          <div className="space-y-2 px-4 pb-3 text-xs">
            <p>
              The fewer players who act <span className="text-slate-100">after</span> you, the better. They can't
              surprise you with a strong hand, and on every round after the flop you get to see what they do before you
              decide.
            </p>
            <p>
              So the same hand can be a fold from an early seat and a raise from the button. Strong hands (green on the
              range chart) are played from anywhere. Borderline hands (amber) only from the cutoff or the button.
              Everything else is a fold.
            </p>
            <p className="text-slate-400">
              Questions you get wrong come back after a few more questions until you've got them right three times.
            </p>
          </div>
        )}
      </div>

      {isReview && <ReviewBadge />}

      {/* Acting order with your seat highlighted. */}
      <div>
        <div className="mb-1 flex justify-between text-[10px] uppercase tracking-wide text-slate-500">
          <span>Acts first</span>
          <span>Acts last before the flop</span>
        </div>
        <div className="grid grid-cols-6 gap-1">
          {ORDER.map((o) => {
            const you = o.id === item.seat;
            return (
              <div
                key={o.id}
                className={`rounded-md px-1 py-1.5 text-center text-[11px] font-semibold ${
                  you ? 'bg-emerald-600 text-white ring-2 ring-emerald-300' : 'bg-slate-800 text-slate-400'
                }`}
              >
                {you ? 'YOU' : o.short}
              </div>
            );
          })}
        </div>
        <p className="mt-2 text-center text-sm text-slate-300">
          You're in <span className="font-semibold text-slate-100">{seat.label}</span> ·{' '}
          <span className="text-slate-400">
            {seat.playersAfter} players still to act after you · everyone before you folded
          </span>
        </p>
      </div>

      <div className="flex items-center justify-center gap-3 py-1">
        {item.cards.map((c, i) => (
          <PlayingCard key={i} card={c} size="lg" />
        ))}
      </div>

      {!revealed ? (
        <div>
          <p className="mb-2 text-center text-sm text-slate-300">6-player table. Raise to play this hand, or fold?</p>
          <div className="grid grid-cols-2 gap-2">
            <button
              onClick={() => submit('play')}
              className="rounded-lg bg-emerald-600 py-3 text-base font-bold text-white transition-colors hover:bg-emerald-500"
            >
              Play (raise)
            </button>
            <button
              onClick={() => submit('fold')}
              className="rounded-lg bg-rose-700 py-3 text-base font-bold text-white transition-colors hover:bg-rose-600"
            >
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
            {isCorrect ? 'Correct!' : 'Not quite.'}{' '}
            <span className="text-slate-100">{answer === 'play' ? 'Raise it' : 'Fold it'} from this seat.</span>
          </div>

          <div className="rounded-lg border border-slate-700 bg-slate-800/60 p-3 text-sm">
            <div className={`mb-2 inline-block rounded-full px-2.5 py-0.5 text-xs font-semibold ring-1 ${TIER_CHIP[tier].cls}`}>
              {TIER_CHIP[tier].text}
            </div>
            <p data-testid="hand-name" className="font-semibold text-slate-100">{describeClass(item.handClass)}</p>
            <p className="mt-0.5 text-slate-300">{explainVerdict(item.handClass, item.seat)}</p>
            <p className="mt-3 mb-1 text-xs font-semibold uppercase tracking-wide text-slate-400">Same hand, every seat</p>
            <div className="grid grid-cols-4 gap-1">
              {SEATS.map((s) => {
                const v = verdictFor(item.handClass, s.id);
                const here = s.id === item.seat;
                return (
                  <div
                    key={s.id}
                    className={`rounded-md px-1 py-1.5 text-center text-[11px] ${
                      here ? 'ring-2 ring-slate-300' : ''
                    } ${v === 'play' ? 'bg-emerald-900/60 text-emerald-200' : 'bg-rose-950/60 text-rose-200'}`}
                  >
                    <div className="font-semibold">{ORDER.find((o) => o.id === s.id)!.short}</div>
                    <div>{v === 'play' ? 'Raise' : 'Fold'}</div>
                  </div>
                );
              })}
            </div>
          </div>

          <button data-next onClick={next} className="w-full rounded-lg bg-emerald-600 py-2 font-semibold text-white transition-colors hover:bg-emerald-500 side:sticky side:bottom-0 side:z-10 side:shadow-[0_-10px_18px_rgba(2,6,23,0.95)]">
            Next hand →
          </button>
        </div>
      )}
    </div>
  );
}
