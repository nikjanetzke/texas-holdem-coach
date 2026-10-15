import { useEffect, useMemo, useState } from 'react';
import type { HandRecord } from '../hooks/useGame';
import { buildReplay, cardText, type ReplayStep } from '../training/replay';
import { CardView } from './CardView';

const money = (n: number) => `${n < 0 ? '-' : ''}$${Math.abs(n).toLocaleString()}`;

/** Your chips won (+) or lost (−) in a hand, when the hand recorded start stacks. */
function yourResult(steps: ReplayStep[], record: HandRecord): number | null {
  const start = record.startStacks?.human;
  const end = steps[steps.length - 1]?.seats.find((p) => p.isYou)?.stack;
  return start == null || end == null ? null : end - start;
}

const scoreTone = (s: number) => (s >= 7 ? 'text-emerald-300' : s >= 5 ? 'text-amber-300' : 'text-rose-300');

// Quiz answers are compared by kind of action: a bet, a raise and going all in
// are all "putting more in".
type QuizChoice = 'fold' | 'check' | 'call' | 'bet' | 'raise';
const family = (a: string) => (a === 'bet' || a === 'raise' || a === 'all in' || a === 'all-in' ? 'more' : a);
function quizOptions(toCall: number, street: string): { id: QuizChoice; label: string }[] {
  if (toCall > 0) return [{ id: 'fold', label: 'Fold' }, { id: 'call', label: 'Call' }, { id: 'raise', label: 'Raise' }];
  // Nothing to call before the flop = the big blind's option: the blind already counts as a bet.
  return [{ id: 'check', label: 'Check' }, street === 'preflop' ? { id: 'raise', label: 'Raise' } : { id: 'bet', label: 'Bet' }];
}

// Step through a recorded hand: the deal, every action, each new card, the
// showdown. On your own decisions the coach's verdict is shown — but only while
// the coach is on (coaching UI stays hidden with the coach off).
export function HandReplay({ record, coachEnabled, onClose }: { record: HandRecord; coachEnabled: boolean; onClose: () => void }) {
  const steps = useMemo(() => buildReplay(record), [record]);
  const [i, setI] = useState(0);
  const [revealAll, setRevealAll] = useState(false);
  // "What would you do?": pause on each of your decisions (coach on, and only
  // where the coach's verdict was saved) and ask before revealing.
  const [quiz, setQuiz] = useState(true);
  const [answers, setAnswers] = useState<Record<number, QuizChoice | 'skipped'>>({});
  const last = steps.length - 1;
  const actual = steps[Math.min(i, last)];
  const quizzable = (idx: number) => coachEnabled && quiz && !!steps[idx]?.decision?.coach;
  const pending = quizzable(i) && answers[i] === undefined;
  const asking = pending && i > 0;
  // While asking, show the table as it was just before you acted.
  const step = asking ? steps[i - 1] : actual;
  const myDecisions = steps.map((s, idx) => (s.decision ? idx : -1)).filter((idx) => idx >= 0);
  const answered = myDecisions.filter((idx) => answers[idx] && answers[idx] !== 'skipped');
  const matched = answered.filter((idx) => family(answers[idx] as string) === family(steps[idx].decision!.coach!.suggested));

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      // Stepping past a question skips it.
      if (e.key === 'ArrowRight') {
        if (pending) setAnswers((a) => ({ ...a, [i]: 'skipped' }));
        setI((x) => Math.min(last, x + 1));
      }
      else if (e.key === 'ArrowLeft') setI((x) => Math.max(0, x - 1));
      else if (e.key === 'Escape') onClose();
      else return;
      e.preventDefault();
      e.stopPropagation();
    };
    window.addEventListener('keydown', onKey, true);
    return () => window.removeEventListener('keydown', onKey, true);
  }, [last, onClose, i, pending]);

  const coach = actual.decision?.coach;
  const myAnswer = answers[i];
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/75 p-3" onClick={onClose}>
      <div
        role="dialog"
        aria-label={`Replay of hand ${record.handNumber}`}
        className="max-h-[92vh] w-full max-w-lg overflow-y-auto rounded-2xl border border-slate-700 bg-gradient-to-b from-slate-900 to-slate-950 p-4 text-sm text-slate-200 shadow-2xl ring-1 ring-white/5"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="mb-3 flex items-center justify-between">
          <h2 className="font-bold text-slate-100">↺ Replay — hand #{record.handNumber}</h2>
          <button onClick={onClose} aria-label="Close replay" className="rounded px-2 py-1 text-slate-400 hover:bg-slate-800 hover:text-slate-100">
            ✕
          </button>
        </div>

        {/* The felt: board and pot. */}
        <div className="mb-3 rounded-xl border border-emerald-900/60 bg-emerald-950/40 p-3">
          <div className="flex min-h-[4rem] items-center justify-center gap-1.5">
            {step.board.length === 0 ? (
              <span className="text-xs italic text-emerald-200/60">— before the flop —</span>
            ) : (
              step.board.map((c) => <CardView key={cardText(c)} card={c} size="md" />)
            )}
          </div>
          <div className="mt-2 text-center text-xs font-semibold text-amber-200">Pot {money(step.pot)}</div>
        </div>

        {/* Everyone at the table at this point. */}
        <div className="mb-3 space-y-1">
          {step.seats.map((p) => {
            const faceUp = p.cardsShown || revealAll;
            const acting = step.actorId === p.id;
            return (
              <div
                key={p.id}
                className={`flex items-center gap-2 rounded-lg px-2 py-1 ${acting ? 'bg-amber-400/10 ring-1 ring-amber-400/50' : ''} ${p.folded ? 'opacity-45' : ''}`}
              >
                <span className={`w-20 truncate font-semibold ${p.isYou ? 'text-emerald-300' : 'text-slate-200'}`}>{p.isYou ? 'You' : p.name}</span>
                <div className="flex gap-1">
                  {p.holeCards.map((c, k) => (
                    <CardView key={k} card={c} hidden={!faceUp} size="sm" />
                  ))}
                </div>
                <div className="ml-auto flex items-center gap-2 text-xs">
                  {p.folded && <span className="rounded bg-slate-800 px-1.5 py-0.5 text-slate-400">Folded</span>}
                  {p.allIn && !p.folded && <span className="rounded bg-rose-900/60 px-1.5 py-0.5 text-rose-200">All in</span>}
                  {p.inFront > 0 && <span className="text-amber-200" title="Put in this betting round">bet {money(p.inFront)}</span>}
                  {p.stack != null && <span className="w-16 text-right font-mono text-slate-400">{money(p.stack)}</span>}
                </div>
              </div>
            );
          })}
        </div>

        {asking ? (
          <div className="mb-2 rounded-lg border border-emerald-500/40 bg-emerald-950/50 px-3 py-2.5">
            <div className="text-[15px] font-semibold text-emerald-200">🎯 Your turn — what would you do?</div>
            <div className="mt-0.5 text-xs text-slate-400">
              {coach!.toCall > 0 ? `It costs ${money(coach!.toCall)} to call.` : 'Nobody has bet — you can check for free.'} Decide, then see what the coach thinks.
            </div>
            <div className="mt-2 flex flex-wrap gap-2">
              {quizOptions(coach!.toCall, actual.street).map((o) => (
                <button
                  key={o.id}
                  onClick={() => setAnswers((a) => ({ ...a, [i]: o.id }))}
                  className="rounded-lg bg-slate-700 px-4 py-1.5 font-semibold text-white ring-1 ring-slate-500 hover:bg-slate-600"
                >
                  {o.label}
                </button>
              ))}
              <button onClick={() => setAnswers((a) => ({ ...a, [i]: 'skipped' }))} className="ml-auto text-xs text-slate-400 underline hover:text-slate-200">
                Just show me
              </button>
            </div>
          </div>
        ) : (
          <div aria-live="polite" className="mb-2 min-h-[2.75rem] rounded-lg bg-slate-800/80 px-3 py-2 text-[15px] leading-snug text-amber-100">
            {step.text}
          </div>
        )}

        {/* Your quiz answer against the coach. */}
        {!asking && coach && myAnswer && myAnswer !== 'skipped' && coachEnabled && (
          <div
            className={`mb-2 rounded-lg px-3 py-1.5 text-[13px] ${family(myAnswer) === family(coach.suggested) ? 'bg-emerald-900/40 text-emerald-200' : 'bg-rose-900/30 text-rose-200'}`}
          >
            {family(myAnswer) === family(coach.suggested) ? '✅' : '✖'} You picked <span className="font-semibold capitalize">{myAnswer}</span> — the coach
            suggests <span className="font-semibold capitalize">{coach.suggested}</span>.
          </div>
        )}

        {/* The coach on your decisions (coach on only). */}
        {coachEnabled && step.decision && !asking && (
          <div className="mb-2 rounded-lg border border-indigo-400/30 bg-indigo-950/50 px-3 py-2 text-[13px] leading-snug">
            {coach ? (
              <>
                <div className="flex flex-wrap items-baseline gap-x-2">
                  <span className="font-semibold text-indigo-200">🎓 Coach suggested: <span className="capitalize text-amber-300">{coach.suggested}</span></span>
                  <span className={`font-semibold ${scoreTone(coach.score)}`}>Your decision: {coach.score}/10</span>
                </div>
                <div className="mt-1 text-slate-300">{coach.explanation}</div>
                {coach.reason && <div className="mt-1 text-slate-400">{coach.reason}</div>}
                <div className="mt-1 text-xs text-slate-500">
                  Your chance to win: {Math.round(coach.equityPercent)}%
                  {coach.toCall > 0 && <> · a call needed {Math.round(coach.potOddsPercent)}% to break even</>}
                </div>
              </>
            ) : (
              <span className="text-slate-400">No coach notes for this decision — this hand was played before the replayer saved them.</span>
            )}
          </div>
        )}

        <div className="flex items-center justify-between gap-2">
          <button onClick={() => setI(0)} disabled={i === 0} aria-label="Back to the start" className="rounded-lg bg-slate-800 px-2.5 py-1.5 hover:bg-slate-700 disabled:opacity-40">
            ⏮
          </button>
          <button onClick={() => setI((x) => Math.max(0, x - 1))} disabled={i === 0} className="flex-1 rounded-lg bg-slate-700 px-3 py-1.5 font-semibold hover:bg-slate-600 disabled:opacity-40">
            ← Back
          </button>
          <span className="shrink-0 text-xs text-slate-500">
            {i + 1} / {steps.length}
          </span>
          <button
            onClick={() => setI((x) => Math.min(last, x + 1))}
            disabled={i === last || asking}
            className="flex-1 rounded-lg bg-emerald-600 px-3 py-1.5 font-semibold text-white hover:bg-emerald-500 disabled:opacity-40"
          >
            Next →
          </button>
          <button onClick={() => setI(last)} disabled={i === last} aria-label="Jump to the end" className="rounded-lg bg-slate-800 px-2.5 py-1.5 hover:bg-slate-700 disabled:opacity-40">
            ⏭
          </button>
        </div>

        <div className="mt-3 flex flex-wrap items-center gap-1.5 text-xs">
          {myDecisions.length > 0 && <span className="text-slate-500">Your decisions:</span>}
          {myDecisions.map((idx, k) => (
            <button
              key={idx}
              onClick={() => setI(idx)}
              className={`rounded-full px-2 py-0.5 ${i === idx ? 'bg-emerald-600 text-white' : 'bg-slate-800 text-slate-300 hover:bg-slate-700'}`}
            >
              {k + 1}. {steps[idx].street === 'preflop' ? 'before flop' : steps[idx].street}
            </button>
          ))}
          <div className="ml-auto flex flex-col items-end gap-1">
            {coachEnabled && myDecisions.some((idx) => steps[idx].decision?.coach) && (
              <label className="flex cursor-pointer items-center gap-1.5 text-slate-400">
                <input type="checkbox" checked={quiz} onChange={(e) => setQuiz(e.target.checked)} className="accent-emerald-500" />
                Quiz me on my decisions
              </label>
            )}
            <label className="flex cursor-pointer items-center gap-1.5 text-slate-400">
              <input type="checkbox" checked={revealAll} onChange={(e) => setRevealAll(e.target.checked)} className="accent-emerald-500" />
              Show everyone's cards
            </label>
          </div>
        </div>
        {coachEnabled && quiz && answered.length > 0 && (
          <p className="mt-2 text-xs text-slate-300">
            🎯 Quiz so far: {matched.length} of {answered.length} matched the coach.
          </p>
        )}
        <p className="mt-2 text-[11px] text-slate-500">Tip: use ← → on your keyboard to step through.</p>
      </div>
    </div>
  );
}

export function HandHistoryPanel({ history, onReplay }: { history: HandRecord[]; onReplay: (record: HandRecord) => void }) {
  const rows = useMemo(
    () =>
      history.map((record) => {
        const steps = buildReplay(record);
        const you = record.players.find((p) => p.id === 'human');
        return { record, result: yourResult(steps, record), cards: you?.holeCards ?? [], summary: steps[steps.length - 1]?.text ?? '' };
      }),
    [history],
  );

  if (history.length === 0) return <p className="text-xs text-slate-400">No finished hands yet.</p>;

  return (
    <div className="space-y-1 text-xs">
      <p className="mb-1.5 text-slate-400">Tap a hand to replay it step by step{' '}— the most recent is first.</p>
      {rows.map(({ record, result, cards, summary }) => (
        <button
          key={record.handNumber}
          onClick={() => onReplay(record)}
          className="flex w-full items-center gap-2 rounded-lg bg-slate-800/70 px-2 py-1.5 text-left hover:bg-slate-700"
        >
          <span className="w-9 shrink-0 font-mono text-slate-500">#{record.handNumber}</span>
          <span className="w-14 shrink-0 font-mono text-slate-200">{cards.map(cardText).join(' ')}</span>
          <span className="min-w-0 flex-1 truncate text-slate-400">{summary}</span>
          {result != null && (
            <span className={`w-16 shrink-0 text-right font-mono font-semibold ${result > 0 ? 'text-emerald-300' : result < 0 ? 'text-rose-300' : 'text-slate-400'}`}>
              {result > 0 ? '+' : ''}
              {money(result)}
            </span>
          )}
          <span className="shrink-0 text-emerald-300">▶</span>
        </button>
      ))}
    </div>
  );
}
