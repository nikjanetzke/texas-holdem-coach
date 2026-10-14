import { useEffect, useRef } from 'react';
import { evidenceLines, type OpponentRead } from '../training/opponentNotes';

export interface OpponentEntry {
  id: string;
  name: string;
  portrait?: string;
  read: OpponentRead;
}

const TONES: Record<string, string> = {
  red: 'bg-rose-900/50 text-rose-200 ring-rose-500/40',
  amber: 'bg-amber-900/40 text-amber-200 ring-amber-500/40',
  green: 'bg-emerald-900/50 text-emerald-200 ring-emerald-500/40',
  blue: 'bg-sky-900/50 text-sky-200 ring-sky-500/40',
};

// Coaching UI: only ever opened while the coach is on.
export function OpponentNotes({ opponents, focusId, onClose }: { opponents: OpponentEntry[]; focusId?: string | null; onClose: () => void }) {
  const focusRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    focusRef.current?.scrollIntoView({ block: 'nearest' });
  }, [focusId]);
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose();
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-3" onClick={onClose}>
      <div
        role="dialog"
        aria-label="Notes on your opponents"
        className="max-h-[88vh] w-full max-w-lg overflow-y-auto rounded-2xl border border-slate-700 bg-gradient-to-b from-slate-900 to-slate-950 p-4 text-sm shadow-2xl ring-1 ring-white/5"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="mb-1 flex items-start justify-between gap-3">
          <h2 className="text-lg font-bold text-slate-100">🔍 Notes on your opponents</h2>
          <button onClick={onClose} aria-label="Close notes" className="rounded px-2 py-1 text-slate-400 hover:bg-slate-800 hover:text-slate-100">
            ✕
          </button>
        </div>
        <p className="mb-3 text-xs leading-relaxed text-slate-400">
          Good players notice how each opponent plays and change their own play to match. Watch someone for a few hands and the
          coach shares a read on their style, plus how to beat it. Tap a player's seat to jump to their note.
        </p>

        <div className="space-y-2.5">
          {opponents.map(({ id, name, portrait, read }) => (
            <div
              key={id}
              ref={id === focusId ? focusRef : undefined}
              className={`rounded-xl border p-3 ${id === focusId ? 'border-indigo-400/60 bg-indigo-950/40' : 'border-slate-800 bg-slate-900/60'}`}
            >
              <div className="mb-1.5 flex items-center gap-2">
                {portrait ? (
                  <img src={portrait} alt="" className="h-8 w-8 rounded-full object-cover ring-1 ring-slate-600" />
                ) : (
                  <div className="h-8 w-8 rounded-full bg-slate-700" />
                )}
                <span className="font-semibold text-slate-100">{name}</span>
                <div className="ml-auto flex flex-wrap justify-end gap-1">
                  {read.notes.map((n) => (
                    <span key={n.id} className={`rounded-full px-2 py-0.5 text-[11px] font-semibold ring-1 ${TONES[n.tone]}`}>
                      {n.tag}
                    </span>
                  ))}
                  {read.ready && read.notes.length === 0 && (
                    <span className="rounded-full bg-slate-800 px-2 py-0.5 text-[11px] font-semibold text-slate-300 ring-1 ring-slate-600">Balanced</span>
                  )}
                </div>
              </div>

              {!read.ready ? (
                <p className="text-xs text-slate-400">
                  👀 Still watching — {read.handsSeen} of {read.handsNeeded} hands seen. Notice what they do: do they play lots of hands? Bet a lot? Fold when you bet?
                </p>
              ) : (
                <div className="space-y-2">
                  {read.notes.length === 0 && (
                    <p className="text-[13px] text-slate-300">
                      A solid, ordinary style with no big weakness to target. Just play good poker against them.
                    </p>
                  )}
                  {read.notes.map((n) => (
                    <div key={n.id} className="text-[13px] leading-snug">
                      <p className="text-slate-300">{n.what}</p>
                      <p className="mt-0.5 text-emerald-200">
                        <span className="font-semibold">How to play them:</span> {n.adjust}
                      </p>
                    </div>
                  ))}
                  <div className="border-t border-slate-800 pt-1.5 text-[11px] leading-relaxed text-slate-500">
                    <span className="font-semibold text-slate-400">What you've seen:</span> {evidenceLines(read.stats).join(' ')}
                  </div>
                </div>
              )}
            </div>
          ))}
        </div>

        <button
          onClick={onClose}
          className="mt-4 w-full rounded-xl bg-gradient-to-b from-emerald-500 to-emerald-700 py-2.5 font-bold text-white shadow-lg ring-1 ring-emerald-400/40 hover:from-emerald-400 hover:to-emerald-600"
        >
          Back to the table
        </button>
      </div>
    </div>
  );
}
