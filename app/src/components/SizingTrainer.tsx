import { useState } from 'react';
import { recordDrillResult } from '../persistence/drillStats';
import { gradeQuestion, pendingReviews, pickQuestion } from '../training/srs';
import {
  FLUSH_DRAW_NEXT_CARD,
  SIZES,
  correctSizes,
  explainSizing,
  generateSizingQuestion,
  priceForCaller,
  sizingQuestionId,
  type SizeId,
  type SizingQuestion,
} from '../training/sizingDrill';
import { PlayingCard, ReviewBadge } from './training/PlayingCard';

const DECK = 'sizing';

export function SizingTrainer() {
  const [q, setQ] = useState(() => pickQuestion<SizingQuestion>(DECK, generateSizingQuestion));
  const [guess, setGuess] = useState<SizeId | null>(null);
  const [showHelp, setShowHelp] = useState(false);
  const [stats, setStats] = useState({ correct: 0, total: 0, streak: 0, best: 0 });
  const [reviews, setReviews] = useState(() => pendingReviews(DECK));

  const { item, isReview } = q;
  const right = correctSizes(item.texture);
  const revealed = guess != null;
  const isCorrect = guess != null && right.includes(guess);

  function submit(choice: SizeId) {
    if (revealed) return;
    const correct = right.includes(choice);
    recordDrillResult('sizing', correct);
    gradeQuestion(DECK, sizingQuestionId(item), item, correct);
    setReviews(pendingReviews(DECK));
    setGuess(choice);
    setStats((s) => {
      const streak = correct ? s.streak + 1 : 0;
      return { correct: s.correct + (correct ? 1 : 0), total: s.total + 1, streak, best: Math.max(s.best, streak) };
    });
  }

  function next() {
    setQ(pickQuestion<SizingQuestion>(DECK, generateSizingQuestion));
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
        <div className="text-right text-slate-400">{reviews > 0 ? `🔁 ${reviews} to review` : 'No reviews waiting'}</div>
      </div>

      <div className="rounded-lg border border-slate-700 bg-slate-800/60 text-sm text-slate-300">
        <button
          onClick={() => setShowHelp((v) => !v)}
          className="flex w-full items-center justify-between px-4 py-2 text-left font-semibold text-slate-100"
        >
          <span>How to size a bet</span>
          <span className="text-slate-500">{showHelp ? '▲' : '▼'}</span>
        </button>
        {showHelp && (
          <div className="space-y-2 px-4 pb-3 text-xs">
            <p>
              Every bet sets a <span className="text-slate-100">price</span> for the other player. To call your bet they
              must win at least <span className="font-mono text-slate-100">bet ÷ (pot + bet + bet)</span> of the time.
            </p>
            <p>
              <span className="text-slate-100">Board full of draws</span> (two of a suit, cards close together)? Bet big
              — ¾ pot or more — so chasing a draw costs them more than it's worth.
            </p>
            <p>
              <span className="text-slate-100">Dry board</span> (all different suits, cards far apart)? There's nothing to
              charge, so bet small — ⅓ to ½ pot — and let worse hands keep paying you.
            </p>
          </div>
        )}
      </div>

      {isReview && <ReviewBadge />}

      <div className="rounded-lg border border-slate-700 bg-emerald-950/30 p-3">
        <div className="mb-2 text-center text-xs text-slate-400">
          On the flop · {item.opponents} opponent{item.opponents === 1 ? '' : 's'} · nobody has bet yet
        </div>
        <div className="flex items-end justify-center gap-4">
          <div className="text-center">
            <div className="mb-1 text-[11px] uppercase tracking-wide text-emerald-300">Your hand</div>
            <div className="flex gap-1.5">
              {item.hero.map((c, i) => (
                <PlayingCard key={i} card={c} />
              ))}
            </div>
          </div>
          <div className="text-center">
            <div className="mb-1 text-[11px] uppercase tracking-wide text-slate-400">Board</div>
            <div className="flex gap-1.5">
              {item.board.map((c, i) => (
                <PlayingCard key={i} card={c} size="sm" />
              ))}
            </div>
          </div>
        </div>
        <div className="mt-3 text-center text-sm">
          <span className="text-slate-400">Pot </span>
          <span className="font-bold text-amber-300">${item.pot.toLocaleString()}</span>
          <span className="text-slate-400"> · you have </span>
          <span className="font-semibold text-slate-100">{item.handLabel.split(' — ')[0].toLowerCase()}</span>
        </div>
      </div>

      {!revealed ? (
        <div>
          <p className="mb-2 text-center text-sm text-slate-300">You're betting for value. How much?</p>
          <div className="grid grid-cols-4 gap-2">
            {SIZES.map((sz) => (
              <button
                key={sz.id}
                onClick={() => submit(sz.id)}
                className="rounded-lg bg-amber-600 py-3 text-sm font-bold text-white transition-colors hover:bg-amber-500"
              >
                {sz.label}
                <div className="text-[10px] font-normal opacity-80">${Math.round(item.pot * sz.frac).toLocaleString()}</div>
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
            {isCorrect ? 'Correct!' : 'Not quite.'}{' '}
            <span className="text-slate-100">
              Bet {right.map((r) => SIZES.find((s) => s.id === r)!.label).join(' or ')} here.
            </span>
          </div>

          <div className="rounded-lg border border-slate-700 bg-slate-800/60 p-3 text-sm text-slate-300">
            <div
              className={`mb-2 inline-block rounded-full px-2.5 py-0.5 text-xs font-semibold ring-1 ${
                item.texture === 'wet'
                  ? 'bg-rose-950/60 text-rose-300 ring-rose-600/40'
                  : 'bg-sky-950/60 text-sky-300 ring-sky-600/40'
              }`}
            >
              {item.texture === 'wet' ? 'Board full of draws' : 'Dry board — few draws'}
            </div>
            <p>{explainSizing(item)}</p>
            <p className="mt-3 mb-1 text-xs font-semibold uppercase tracking-wide text-slate-400">The price each bet gives them</p>
            <div className="grid grid-cols-4 gap-1 text-center">
              {SIZES.map((sz) => {
                const price = priceForCaller(sz.frac);
                const good = right.includes(sz.id);
                const mine = guess === sz.id;
                return (
                  <div
                    key={sz.id}
                    className={`rounded-md px-1 py-1.5 text-[11px] ${mine ? 'ring-2 ring-slate-300' : ''} ${
                      good ? 'bg-emerald-900/60 text-emerald-200' : 'bg-slate-900/60 text-slate-400'
                    }`}
                  >
                    <div className="font-semibold">{sz.label}</div>
                    <div>needs {Math.round(price)}%</div>
                  </div>
                );
              })}
            </div>
            {item.texture === 'wet' && (
              <p className="mt-2 text-xs text-slate-400">
                A flush draw hits about {FLUSH_DRAW_NEXT_CARD}% on the next card and about 35% by the river. Small bets
                let them keep chasing cheaply; ¾ pot or more makes them pay a real price on every street they chase.
              </p>
            )}
          </div>

          <button onClick={next} className="w-full rounded-lg bg-emerald-600 py-2 font-semibold text-white transition-colors hover:bg-emerald-500">
            Next hand →
          </button>
        </div>
      )}
    </div>
  );
}
