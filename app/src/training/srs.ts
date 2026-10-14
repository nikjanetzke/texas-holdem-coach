import { loadSession, notifyTrainingProgress, saveSession } from '../persistence/storage';

// Spaced repetition for the training drills, measured in QUESTIONS rather than
// days: a drill session is short, so "come back in 3 questions" is what makes
// a missed spot resurface while it still matters. A missed item returns soon;
// each correct answer pushes it further out; three spaced correct answers in a
// row clear it. Getting it wrong again sends it back to the start.

export interface SrsCard<T> {
  id: string;
  item: T;
  /** 0..MASTERED_BOX-1 — how many spaced correct answers in a row so far. */
  box: number;
  /** The deck turn at (or after) which this card is due again. */
  due: number;
  /** Times this was answered wrong (for display / sorting). */
  lapses: number;
}

export interface SrsDeck<T> {
  /** Increments once per question served, so `due` values are comparable. */
  turn: number;
  cards: SrsCard<T>[];
  /** Cards cleared by answering them right three spaced times. */
  mastered: number;
}

/** Questions to wait before the next review, indexed by the card's box. */
export const REVIEW_GAPS = [3, 7, 15] as const;
export const MASTERED_BOX = REVIEW_GAPS.length;
const MAX_CARDS = 60;

export function emptyDeck<T>(): SrsDeck<T> {
  return { turn: 0, cards: [], mastered: 0 };
}

/** Call once per question served. */
export function advanceTurn<T>(deck: SrsDeck<T>): SrsDeck<T> {
  return { ...deck, turn: deck.turn + 1 };
}

/** The most overdue card, or null if nothing is due yet. */
export function dueCard<T>(deck: SrsDeck<T>): SrsCard<T> | null {
  let best: SrsCard<T> | null = null;
  for (const c of deck.cards) {
    if (c.due <= deck.turn && (!best || c.due < best.due)) best = c;
  }
  return best;
}

/** The card due soonest even if not yet due — for decks you practise on purpose. */
export function soonestCard<T>(deck: SrsDeck<T>): SrsCard<T> | null {
  let best: SrsCard<T> | null = null;
  for (const c of deck.cards) if (!best || c.due < best.due) best = c;
  return best;
}

function trim<T>(cards: SrsCard<T>[]): SrsCard<T>[] {
  if (cards.length <= MAX_CARDS) return cards;
  // Drop the cards closest to being mastered first; keep the ones you struggle with.
  return [...cards].sort((a, b) => a.box - b.box || b.lapses - a.lapses).slice(0, MAX_CARDS);
}

/**
 * Record an answer. A brand-new item answered correctly isn't stored at all;
 * a wrong answer (new or review) puts the item in the deck at box 0.
 */
export function recordAnswer<T>(deck: SrsDeck<T>, id: string, item: T, correct: boolean): SrsDeck<T> {
  const existing = deck.cards.find((c) => c.id === id);
  if (!existing) {
    if (correct) return deck;
    const card: SrsCard<T> = { id, item, box: 0, due: deck.turn + REVIEW_GAPS[0], lapses: 1 };
    return { ...deck, cards: trim([...deck.cards, card]) };
  }
  if (!correct) {
    const reset = { ...existing, box: 0, due: deck.turn + REVIEW_GAPS[0], lapses: existing.lapses + 1 };
    return { ...deck, cards: deck.cards.map((c) => (c.id === id ? reset : c)) };
  }
  const box = existing.box + 1;
  if (box >= MASTERED_BOX) {
    return { ...deck, cards: deck.cards.filter((c) => c.id !== id), mastered: deck.mastered + 1 };
  }
  const promoted = { ...existing, box, due: deck.turn + REVIEW_GAPS[box] };
  return { ...deck, cards: deck.cards.map((c) => (c.id === id ? promoted : c)) };
}

/** Add (or re-arm) an item that should be reviewed right away — used for mistakes from real play. */
export function addDueNow<T>(deck: SrsDeck<T>, id: string, item: T): SrsDeck<T> {
  const existing = deck.cards.find((c) => c.id === id);
  if (existing) {
    const reset = { ...existing, item, box: 0, due: deck.turn, lapses: existing.lapses + 1 };
    return { ...deck, cards: deck.cards.map((c) => (c.id === id ? reset : c)) };
  }
  return { ...deck, cards: trim([...deck.cards, { id, item, box: 0, due: deck.turn, lapses: 1 }]) };
}

export function removeCard<T>(deck: SrsDeck<T>, id: string): SrsDeck<T> {
  return { ...deck, cards: deck.cards.filter((c) => c.id !== id) };
}

// ---- persistence ------------------------------------------------------------

const keyFor = (name: string) => `texas-holdem-coach:srs:${name}:v1`;

export function loadDeck<T>(name: string): SrsDeck<T> {
  const d = loadSession<SrsDeck<T>>(keyFor(name));
  if (!d || !Array.isArray(d.cards) || typeof d.turn !== 'number') return emptyDeck<T>();
  return { turn: d.turn, cards: d.cards, mastered: d.mastered ?? 0 };
}

export function saveDeck<T>(name: string, deck: SrsDeck<T>): void {
  saveSession(deck, keyFor(name));
  notifyTrainingProgress();
}

// ---- drill helpers ----------------------------------------------------------
// Each drill calls pickQuestion() when it needs the next question and
// gradeQuestion() when it's answered. Reviews are interleaved with fresh
// questions automatically: anything due is served first.

// Saved mistakes from real play run on a clock that ticks with EVERY practice
// question, in any drill. Otherwise a lone saved mistake could only be spaced
// out by answering itself, and you could "clear" it with three quick clicks.
export const SHARED_CLOCK_DECK = 'mistakes';

export function pickQuestion<T>(name: string, generate: () => T): { item: T; isReview: boolean } {
  const deck = advanceTurn(loadDeck<T>(name));
  saveDeck(name, deck);
  if (name !== SHARED_CLOCK_DECK) saveDeck(SHARED_CLOCK_DECK, advanceTurn(loadDeck(SHARED_CLOCK_DECK)));
  const due = dueCard(deck);
  return due ? { item: due.item, isReview: true } : { item: generate(), isReview: false };
}

export function gradeQuestion<T>(name: string, id: string, item: T, correct: boolean): void {
  saveDeck(name, recordAnswer(loadDeck<T>(name), id, item, correct));
}

export function pendingReviews(name: string): number {
  return loadDeck(name).cards.length;
}
