export type Suit = 's' | 'h' | 'd' | 'c';

// 2-9 as numbers, 10 as 'T', then face cards.
export type Rank = '2' | '3' | '4' | '5' | '6' | '7' | '8' | '9' | 'T' | 'J' | 'Q' | 'K' | 'A';

export const RANKS: Rank[] = ['2', '3', '4', '5', '6', '7', '8', '9', 'T', 'J', 'Q', 'K', 'A'];
export const SUITS: Suit[] = ['s', 'h', 'd', 'c'];

export interface Card {
  rank: Rank;
  suit: Suit;
}

export function cardToString(card: Card): string {
  return `${card.rank}${card.suit}`;
}

export function rankValue(rank: Rank): number {
  return RANKS.indexOf(rank) + 2;
}

export function makeDeck(): Card[] {
  const deck: Card[] = [];
  for (const suit of SUITS) {
    for (const rank of RANKS) {
      deck.push({ rank, suit });
    }
  }
  return deck;
}

export function shuffle<T>(items: T[], rng: () => number = Math.random): T[] {
  const result = items.slice();
  for (let i = result.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [result[i], result[j]] = [result[j], result[i]];
  }
  return result;
}

export class Shoe {
  private cards: Card[];

  constructor(rng: () => number = Math.random) {
    this.cards = shuffle(makeDeck(), rng);
  }

  draw(): Card {
    const card = this.cards.pop();
    if (!card) throw new Error('Shoe is empty');
    return card;
  }

  remaining(): number {
    return this.cards.length;
  }
}
