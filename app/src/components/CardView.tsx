import type { Card } from '../engine/deck';

const SUIT_SYMBOLS: Record<Card['suit'], string> = { s: '♠', h: '♥', d: '♦', c: '♣' };
const RED_SUITS = new Set(['h', 'd']);

export function CardView({
  card,
  hidden,
  size = 'md',
  animate,
}: {
  card?: Card;
  hidden?: boolean;
  size?: 'sm' | 'md' | 'lg';
  animate?: boolean;
}) {
  const dims =
    size === 'sm'
      ? 'w-8 h-11 text-[11px] rounded-[5px]'
      : size === 'lg'
        ? 'w-14 h-20 text-lg rounded-lg'
        : 'w-11 h-16 text-sm rounded-md';

  if (hidden || !card) {
    return (
      <div
        className={`${dims} border border-slate-900/40 bg-gradient-to-br from-indigo-600 to-indigo-900 shadow-md ${animate ? 'animate-deal' : ''}`}
        style={{
          backgroundImage:
            'repeating-linear-gradient(45deg, rgba(255,255,255,0.08) 0 4px, transparent 4px 8px)',
        }}
      />
    );
  }

  const isRed = RED_SUITS.has(card.suit);
  return (
    <div
      className={`${dims} border border-slate-300 bg-white shadow-md flex flex-col items-center justify-center font-bold leading-none ${
        isRed ? 'text-rose-600' : 'text-slate-900'
      } ${animate ? 'animate-flip' : ''}`}
    >
      <span>{card.rank}</span>
      <span className={size === 'sm' ? 'text-xs' : 'text-base'}>{SUIT_SYMBOLS[card.suit]}</span>
    </div>
  );
}
