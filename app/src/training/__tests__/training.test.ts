import { beforeEach, describe, expect, it } from 'vitest';
import {
  MASTERED_BOX,
  REVIEW_GAPS,
  addDueNow,
  advanceTurn,
  dueCard,
  emptyDeck,
  gradeQuestion,
  loadDeck,
  pickQuestion,
  recordAnswer,
} from '../srs';
import { classifyMistake, choicesFor, correctChoices, mistakeId, type MistakeSpot } from '../mistakes';
import {
  SEATS,
  allHandClasses,
  cardsFor,
  generatePositionQuestion,
  tierOf,
  verdictFor,
} from '../positionDrill';
import { LEVELS, levelStates, progressOf } from '../path';
import type { DrillStats } from '../../persistence/drillStats';

// Minimal in-memory localStorage so persistence can be exercised in node.
beforeEach(() => {
  const store = new Map<string, string>();
  (globalThis as unknown as { localStorage: Storage }).localStorage = {
    getItem: (k: string) => store.get(k) ?? null,
    setItem: (k: string, v: string) => void store.set(k, v),
    removeItem: (k: string) => void store.delete(k),
    clear: () => store.clear(),
    key: () => null,
    length: 0,
  };
});

describe('spaced repetition deck', () => {
  it('a correct answer to a new item stores nothing', () => {
    expect(recordAnswer(emptyDeck(), 'x', 1, true).cards).toHaveLength(0);
  });

  it('a missed item comes back after the first gap, not before', () => {
    let d = recordAnswer(emptyDeck<number>(), 'x', 1, false);
    for (let i = 0; i < REVIEW_GAPS[0] - 1; i++) {
      d = advanceTurn(d);
      expect(dueCard(d)).toBeNull();
    }
    d = advanceTurn(d);
    expect(dueCard(d)?.id).toBe('x');
  });

  it('needs three spaced correct answers to clear, with growing gaps', () => {
    let d = recordAnswer(emptyDeck<number>(), 'x', 1, false);
    const seenGaps: number[] = [];
    for (let round = 0; round < MASTERED_BOX; round++) {
      let waited = 0;
      while (!dueCard(d)) {
        d = advanceTurn(d);
        waited++;
      }
      seenGaps.push(waited);
      d = recordAnswer(d, 'x', 1, true);
    }
    expect(seenGaps).toEqual([...REVIEW_GAPS]);
    expect(d.cards).toHaveLength(0);
    expect(d.mastered).toBe(1);
  });

  it('getting it wrong again sends it back to the start', () => {
    let d = recordAnswer(emptyDeck<number>(), 'x', 1, false);
    d = { ...d, turn: 100 };
    d = recordAnswer(d, 'x', 1, true); // box 1
    d = recordAnswer(d, 'x', 1, false); // reset
    expect(d.cards[0].box).toBe(0);
    expect(d.cards[0].due).toBe(100 + REVIEW_GAPS[0]);
    expect(d.cards[0].lapses).toBe(2);
  });

  it('pickQuestion serves a due review before generating a new question', () => {
    gradeQuestion('t', 'missed', 'MISSED', false);
    const served: string[] = [];
    for (let i = 0; i < REVIEW_GAPS[0]; i++) {
      const q = pickQuestion<string>('t', () => 'NEW');
      served.push(q.isReview ? q.item : 'NEW');
    }
    expect(served).toEqual(['NEW', 'NEW', 'MISSED']);
  });

  it('every practice question also ticks the mistakes clock', () => {
    const before = loadDeck('mistakes').turn;
    pickQuestion('chen', () => 1);
    pickQuestion('outs', () => 1);
    expect(loadDeck('mistakes').turn).toBe(before + 2);
  });

  it('a mistake from real play is due immediately', () => {
    const d = addDueNow(emptyDeck<number>(), 'm', 1);
    expect(dueCard(d)?.id).toBe('m');
  });
});

describe('mistake classification', () => {
  const base = { validTypes: ['fold', 'call', 'raise'] as const, callAmount: 50 };

  it('folding when a free check was available is always a mistake', () => {
    expect(
      classifyMistake({ action: 'fold', validTypes: ['fold', 'check', 'bet'], callAmount: 0, equityPercent: 5, potOddsPercent: 0 }),
    ).toBe('freefold');
  });

  it('folding a clear favourite at a cheap price is an overfold', () => {
    expect(classifyMistake({ ...base, validTypes: [...base.validTypes], action: 'fold', equityPercent: 60, potOddsPercent: 25 })).toBe(
      'overfold',
    );
  });

  it('does NOT flag a borderline fold (equity is vs random hands, so stay conservative)', () => {
    expect(classifyMistake({ ...base, validTypes: [...base.validTypes], action: 'fold', equityPercent: 45, potOddsPercent: 20 })).toBeNull();
    expect(classifyMistake({ ...base, validTypes: [...base.validTypes], action: 'fold', equityPercent: 55, potOddsPercent: 40 })).toBeNull();
  });

  it('calling far below the pot odds is an overcall', () => {
    expect(classifyMistake({ ...base, validTypes: [...base.validTypes], action: 'call', equityPercent: 10, potOddsPercent: 33 })).toBe(
      'overcall',
    );
  });

  it('a weak RAISE is not flagged — it may be a deliberate bluff', () => {
    expect(classifyMistake({ ...base, validTypes: [...base.validTypes], action: 'raise', equityPercent: 10, potOddsPercent: 33 })).toBeNull();
  });

  it('replay offers the same buttons the table did, and the right answers are among them', () => {
    const spot = (kind: MistakeSpot['kind'], toCall: number): MistakeSpot => ({
      kind,
      holeCards: [{ rank: 'A', suit: 's' }, { rank: 'K', suit: 's' }],
      board: [],
      street: 'preflop',
      pot: 100,
      toCall,
      numOpponents: 1,
      position: 'Late',
      equityPercent: 60,
      potOddsPercent: 25,
      actualAction: 'fold',
      savedAt: 0,
    });
    for (const s of [spot('freefold', 0), spot('overfold', 50), spot('overcall', 50)]) {
      const offered = choicesFor(s);
      for (const c of correctChoices(s)) expect(offered).toContain(c);
    }
    expect(mistakeId(spot('overfold', 50))).toBe('AsKs||50');
  });
});

describe('position drill', () => {
  it('covers all 169 starting hands exactly once', () => {
    const all = allHandClasses();
    expect(all).toHaveLength(169);
    expect(new Set(all).size).toBe(169);
  });

  it('green hands are played from every seat; amber only from late seats; the rest never', () => {
    for (const h of allHandClasses()) {
      const verdicts = SEATS.map((s) => verdictFor(h, s.id));
      const tier = tierOf(h);
      if (tier === 'play') expect(verdicts.every((v) => v === 'play')).toBe(true);
      if (tier === 'fold') expect(verdicts.every((v) => v === 'fold')).toBe(true);
      if (tier === 'maybe') {
        SEATS.forEach((s, i) => expect(verdicts[i]).toBe(s.late ? 'play' : 'fold'));
      }
    }
  });

  it('spot checks against standard opening advice', () => {
    expect(verdictFor('AA', 'early')).toBe('play');
    expect(verdictFor('A9o', 'early')).toBe('fold');
    expect(verdictFor('A9o', 'button')).toBe('play');
    expect(verdictFor('72o', 'button')).toBe('fold');
    expect(verdictFor('KQo', 'early')).toBe('play');
  });

  it('dealt cards always match their hand class', () => {
    for (let i = 0; i < 500; i++) {
      const q = generatePositionQuestion();
      const [a, b] = q.cards;
      expect(a.rank).toBe(q.handClass[0]);
      expect(b.rank).toBe(q.handClass[1]);
      if (q.handClass.length === 2) expect(a.suit).not.toBe(b.suit);
      else if (q.handClass[2] === 's') expect(a.suit).toBe(b.suit);
      else expect(a.suit).not.toBe(b.suit);
    }
    const ts = cardsFor('T9s');
    expect(ts[0].suit).toBe(ts[1].suit);
  });

  it('serves a healthy mix where position decides the answer', () => {
    let positionMatters = 0;
    const N = 2000;
    for (let i = 0; i < N; i++) if (tierOf(generatePositionQuestion().handClass) === 'maybe') positionMatters++;
    expect(positionMatters / N).toBeGreaterThan(0.35);
    expect(positionMatters / N).toBeLessThan(0.55);
  });
});

describe('training path', () => {
  const rec = (recent: number[]) => ({ correct: 0, total: recent.length, recent });
  const stats = (o: Partial<Record<string, number[]>>): DrillStats =>
    ({
      chen: rec(o.chen ?? []),
      position: rec(o.position ?? []),
      outs: rec(o.outs ?? []),
      potodds: rec(o.potodds ?? []),
      sizing: rec(o.sizing ?? []),
      mistakes: rec([]),
    }) as DrillStats;
  const good = Array(20).fill(1);

  it('mastery needs 20 answers at 80%+', () => {
    expect(progressOf(rec(Array(19).fill(1))).mastered).toBe(false);
    expect(progressOf(rec([...Array(16).fill(1), ...Array(4).fill(0)])).mastered).toBe(true);
    expect(progressOf(rec([...Array(15).fill(1), ...Array(5).fill(0)])).mastered).toBe(false);
  });

  it('a fresh player starts on level 1 with the rest locked', () => {
    expect(levelStates(stats({}), false)).toEqual(['current', 'locked', 'locked', 'locked', 'locked']);
  });

  it('mastering a level unlocks the next', () => {
    expect(levelStates(stats({ chen: good }), false)).toEqual(['mastered', 'current', 'locked', 'locked', 'locked']);
  });

  it('skipping ahead opens everything but still recommends the first unmastered level', () => {
    expect(levelStates(stats({}), true)).toEqual(['current', 'open', 'open', 'open', 'open']);
  });

  it('has the levels in teaching order', () => {
    expect(LEVELS.map((l) => l.drill)).toEqual(['chen', 'position', 'outs', 'potodds', 'sizing']);
  });
});
