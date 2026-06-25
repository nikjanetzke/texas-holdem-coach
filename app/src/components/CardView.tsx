import type { Card } from '../engine/deck';

const SUIT_SYMBOLS: Record<Card['suit'], string> = { s: '♠', h: '♥', d: '♦', c: '♣' };
const RED_SUITS = new Set(['h', 'd']);

export function CardView({ card, hidden, size = 'md' }: { card?: Card; hidden?: boolean; size?: 'sm' | 'md' }) {
  const dims = size === 'sm' ? 'w-8 h-11 text-xs' : 'w-12 h-16 text-base';

  if (hidden || !card) {
    return (
      <div className={`${dims} rounded-md border border-slate-400 bg-gradient-to-br from-blue-800 to-blue-950 shadow-sm`} />
    );
  }

  const isRed = RED_SUITS.has(card.suit);
  return (
    <div className={`${dims} rounded-md border border-slate-300 bg-white shadow-sm flex flex-col items-center justify-center font-bold ${isRed ? 'text-red-600' : 'text-slate-900'}`}>
      <span>{card.rank}</span>
      <span>{SUIT_SYMBOLS[card.suit]}</span>
    </div>
  );
}
