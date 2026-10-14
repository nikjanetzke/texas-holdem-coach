import type { Card } from '../../engine/deck';

const SUIT_CHARS: Record<Card['suit'], string> = { s: '♠', h: '♥', d: '♦', c: '♣' };
const rankLabel = (r: Card['rank']) => (r === 'T' ? '10' : r);

const SIZES = {
  lg: { box: 'h-28 w-20', text: 'text-3xl' },
  md: { box: 'h-20 w-14', text: 'text-2xl' },
  sm: { box: 'h-16 w-11', text: 'text-lg' },
} as const;

export function PlayingCard({ card, size = 'md' }: { card: Card; size?: keyof typeof SIZES }) {
  const red = card.suit === 'h' || card.suit === 'd';
  const s = SIZES[size];
  const tone = red ? 'text-rose-600' : 'text-slate-900';
  return (
    <div className={`flex ${s.box} flex-col items-center justify-center rounded-lg border border-slate-300 bg-white shadow`}>
      <span className={`${s.text} font-bold ${tone}`}>{rankLabel(card.rank)}</span>
      <span className={`${s.text} ${tone}`}>{SUIT_CHARS[card.suit]}</span>
    </div>
  );
}

/** Shown on a question that came back because you missed it before. */
export function ReviewBadge() {
  return (
    <div className="mx-auto w-fit rounded-full bg-indigo-950/70 px-3 py-0.5 text-xs font-semibold text-indigo-200 ring-1 ring-indigo-500/40">
      🔁 Review — you missed this one before
    </div>
  );
}
