import { useState } from 'react';
import { recordDrillResult } from '../persistence/drillStats';
import {
  MISTAKES_DECK,
  choicesFor,
  correctChoices,
  explainMistake,
  mistakeId,
  type DrillChoice,
  type MistakeSpot,
} from '../training/mistakes';
import {
  MASTERED_BOX,
  advanceTurn,
  dueCard,
  loadDeck,
  recordAnswer,
  removeCard,
  saveDeck,
  soonestCard,
  type SrsCard,
  type SrsDeck,
} from '../training/srs';
import { PlayingCard } from './training/PlayingCard';

const LABEL: Record<DrillChoice, string> = { fold: 'Fold', check: 'Check', call: 'Call', bet: 'Bet', raise: 'Raise' };
const TONE: Record<DrillChoice, string> = {
  fold: 'bg-rose-700 hover:bg-rose-600',
  check: 'bg-slate-600 hover:bg-slate-500',
  call: 'bg-emerald-600 hover:bg-emerald-500',
  bet: 'bg-amber-600 hover:bg-amber-500',
  raise: 'bg-amber-600 hover:bg-amber-500',
};
const KIND_TITLE: Record<MistakeSpot['kind'], string> = {
  freefold: 'Folded when checking was free',
  overfold: 'Folded a favourite at a good price',
  overcall: 'Called without the odds',
};
const STREET_LABEL: Record<string, string> = { preflop: 'Pre-flop', flop: 'Flop', turn: 'Turn', river: 'River' };

// Serves the most overdue saved mistake. If nothing is due yet the drill says
// so and offers to practise early — early answers can't clear a spot (that
// would let three quick clicks undo the spacing), but a wrong one still resets it.
function nextCard(early = false): {
  deck: SrsDeck<MistakeSpot>;
  card: SrsCard<MistakeSpot> | null;
  early: boolean;
} {
  const deck = advanceTurn(loadDeck<MistakeSpot>(MISTAKES_DECK));
  saveDeck(MISTAKES_DECK, deck);
  const due = dueCard(deck);
  if (due) return { deck, card: due, early: false };
  return { deck, card: early ? soonestCard(deck) : null, early };
}

export function MistakesTrainer() {
  const [{ deck, card, early }, setState] = useState(() => nextCard());
  const [guess, setGuess] = useState<DrillChoice | null>(null);
  const [session, setSession] = useState({ correct: 0, total: 0 });
  const [afterBox, setAfterBox] = useState<number | null>(null);

  if (!card && deck.cards.length > 0) {
    const soonest = soonestCard(deck)!;
    const wait = Math.max(1, soonest.due - deck.turn);
    return (
      <div className="space-y-3 rounded-lg border border-slate-700 bg-slate-800/60 p-4 text-sm text-slate-300">
        <p className="font-semibold text-slate-100">All caught up for now.</p>
        <p>
          You have {deck.cards.length} saved spot{deck.cards.length === 1 ? '' : 's'}. The next one comes back after{' '}
          {wait} more practice question{wait === 1 ? '' : 's'} in any drill — spacing them out is what makes them stick.
        </p>
        <button
          onClick={() => {
            setState(nextCard(true));
            setGuess(null);
            setAfterBox(null);
          }}
          className="rounded-lg px-3 py-1.5 text-xs font-semibold text-slate-200 ring-1 ring-slate-600 hover:bg-slate-700"
        >
          Practise early anyway
        </button>
      </div>
    );
  }

  if (!card) {
    return (
      <div className="space-y-3 rounded-lg border border-slate-700 bg-slate-800/60 p-4 text-sm text-slate-300">
        <p className="font-semibold text-slate-100">No mistakes waiting — nice.</p>
        <p>
          While you play, clear-cut maths errors are saved here so you can replay the exact spot: folding when you
          could have checked for free, folding a hand that was a favourite at a cheap price, or calling when the pot
          didn't give you the odds.
        </p>
        <p className="text-slate-400">
          Each saved spot needs answering correctly three times, spread out, to clear it.
          {deck.mastered > 0 && ` You've cleared ${deck.mastered} so far.`}
        </p>
      </div>
    );
  }

  const spot = card.item;
  const choices = choicesFor(spot);
  const right = correctChoices(spot);
  const revealed = guess != null;
  const isCorrect = guess != null && right.includes(guess);
  const id = mistakeId(spot);

  function submit(choice: DrillChoice) {
    if (revealed) return;
    const correct = right.includes(choice);
    recordDrillResult('mistakes', correct);
    const before = loadDeck<MistakeSpot>(MISTAKES_DECK);
    // Early practice can't promote a spot, only reset it.
    const after = early && correct ? before : recordAnswer(before, id, spot, correct);
    saveDeck(MISTAKES_DECK, after);
    const updated = after.cards.find((c) => c.id === id);
    setAfterBox(updated ? updated.box : MASTERED_BOX);
    setGuess(choice);
    setSession((s) => ({ correct: s.correct + (correct ? 1 : 0), total: s.total + 1 }));
  }

  function next() {
    setState(nextCard());
    setGuess(null);
    setAfterBox(null);
  }

  function remove() {
    saveDeck(MISTAKES_DECK, removeCard(loadDeck<MistakeSpot>(MISTAKES_DECK), id));
    next();
  }

  const box = afterBox ?? card.box;
  const waiting = deck.cards.length;

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between rounded-lg border border-slate-700 bg-slate-800/60 px-4 py-2 text-xs text-slate-300">
        <div>
          {session.correct}/{session.total} correct this session
          <div className="text-slate-400">
            {waiting} spot{waiting === 1 ? '' : 's'} saved{deck.mastered > 0 ? ` · ${deck.mastered} cleared` : ''}
          </div>
        </div>
        <div className="text-right text-slate-400">
          From a real hand
          <div>{new Date(spot.savedAt).toLocaleDateString()}</div>
        </div>
      </div>

      <div className="rounded-lg border border-slate-700 bg-emerald-950/30 p-3">
        <div className="mb-2 flex flex-wrap items-center justify-center gap-x-3 gap-y-1 text-xs text-slate-400">
          <span className="font-semibold text-slate-200">{STREET_LABEL[spot.street] ?? spot.street}</span>
          <span>Seat: {spot.position}</span>
          <span>
            {spot.numOpponents} opponent{spot.numOpponents === 1 ? '' : 's'} still in
          </span>
        </div>
        <div className="flex items-end justify-center gap-4">
          <div className="text-center">
            <div className="mb-1 text-[11px] uppercase tracking-wide text-emerald-300">Your hand</div>
            <div className="flex gap-1.5">
              {spot.holeCards.map((c, i) => (
                <PlayingCard key={i} card={c} />
              ))}
            </div>
          </div>
          {spot.board.length > 0 && (
            <div className="text-center">
              <div className="mb-1 text-[11px] uppercase tracking-wide text-slate-400">Board</div>
              <div className="flex gap-1.5">
                {spot.board.map((c, i) => (
                  <PlayingCard key={i} card={c} size="sm" />
                ))}
              </div>
            </div>
          )}
        </div>
        <div className="mt-3 grid grid-cols-2 gap-2 text-center">
          <div className="rounded-lg bg-slate-900/60 py-2">
            <div className="text-lg font-extrabold text-amber-300">${spot.pot.toLocaleString()}</div>
            <div className="text-[10px] uppercase tracking-wide text-slate-500">Pot</div>
          </div>
          <div className="rounded-lg bg-slate-900/60 py-2">
            <div className="text-lg font-extrabold text-rose-300">
              {spot.toCall > 0 ? `$${spot.toCall.toLocaleString()}` : 'Nothing'}
            </div>
            <div className="text-[10px] uppercase tracking-wide text-slate-500">To call</div>
          </div>
        </div>
      </div>

      {!revealed ? (
        <div>
          <p className="mb-2 text-center text-sm text-slate-300">You've seen this spot before. What's the right play?</p>
          <div className="grid grid-cols-3 gap-2">
            {choices.map((c) => (
              <button
                key={c}
                onClick={() => submit(c)}
                className={`rounded-lg py-3 text-base font-bold text-white transition-colors ${TONE[c]}`}
              >
                {LABEL[c]}
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
            <span className="text-slate-100">Right play: {right.map((r) => LABEL[r]).join(' or ')}.</span>
          </div>

          <div className="rounded-lg border border-slate-700 bg-slate-800/60 p-3 text-sm text-slate-300">
            <p className="mb-1 text-xs font-semibold uppercase tracking-wide text-slate-400">{KIND_TITLE[spot.kind]}</p>
            <p>{explainMistake(spot)}</p>
            {spot.kind !== 'freefold' && (
              <p className="mt-2 font-mono text-xs text-slate-400">
                Win chance ≈ {Math.round(spot.equityPercent)}% · needed {spot.toCall} ÷ ({spot.pot} + {spot.toCall}) ≈{' '}
                {Math.round(spot.potOddsPercent)}%
              </p>
            )}
            <p className="mt-2 text-xs text-slate-400">
              At the table you chose <span className="text-slate-200">{LABEL[spot.actualAction as DrillChoice] ?? spot.actualAction}</span>.
              {spot.kind !== 'freefold' && ' (Win chance is measured against random hands, so treat it as a guide.)'}
            </p>
          </div>

          {/* Progress towards clearing this spot. */}
          <div className="flex items-center justify-center gap-2 text-xs text-slate-400">
            {early && isCorrect ? (
              <span>Early practice — this one still comes back on schedule to count towards clearing it.</span>
            ) : box >= MASTERED_BOX ? (
              <span className="font-semibold text-emerald-300">✓ Cleared — you've got this one.</span>
            ) : (
              <>
                <span>Right {box} of {MASTERED_BOX} times in a row</span>
                <span className="flex gap-1">
                  {Array.from({ length: MASTERED_BOX }, (_, i) => (
                    <span key={i} className={`h-2 w-2 rounded-full ${i < box ? 'bg-emerald-400' : 'bg-slate-600'}`} />
                  ))}
                </span>
              </>
            )}
          </div>

          <div className="flex gap-2 bg-slate-900 side:sticky side:bottom-0 side:z-10 side:shadow-[0_-10px_18px_rgba(2,6,23,0.95)]">
            <button data-next onClick={next} className="flex-1 rounded-lg bg-emerald-600 py-2 font-semibold text-white transition-colors hover:bg-emerald-500">
              Next spot →
            </button>
            <button
              onClick={remove}
              className="rounded-lg px-3 py-2 text-xs text-slate-400 ring-1 ring-slate-700 hover:text-slate-200"
              title="Remove this spot from your mistakes"
            >
              Remove
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
