import { describe, expect, it } from 'vitest';
import { compareToRecent, recentLeaks, type SessionSummary } from '../progress';
import { LeakTracker } from '../../coach/coach';

const session = (id: number, avgScore: number | null, decisions: number, m: Partial<SessionSummary['mistakes']> = {}, smallValueBets = 0): SessionSummary => ({
  id,
  updatedAt: id,
  hands: 10,
  decisions,
  avgScore,
  netChips: 0,
  vpipPercent: 25,
  mistakes: { freefold: 0, overfold: 0, overcall: 0, ...m },
  smallValueBets,
});

describe('progress across sessions', () => {
  it('compares this session with recent ones, weighted by decisions', () => {
    const past = [session(1, 4, 10), session(2, 7, 30)];
    const r = compareToRecent([...past, session(3, 7, 5)], { id: 3, avgScore: 7 })!;
    expect(r.sessions).toBe(2);
    expect(r.previousAvg).toBeCloseTo(6.3, 1); // (4*10 + 7*30) / 40 = 6.25
    expect(r.delta).toBeCloseTo(0.8, 1);
  });

  it('nothing to compare on the first session, or without a score', () => {
    expect(compareToRecent([session(1, 6, 5)], { id: 1, avgScore: 6 })).toBeNull();
    expect(compareToRecent([session(1, 6, 5)], { id: 2, avgScore: null })).toBeNull();
  });

  it('only looks at sessions before this one', () => {
    const r = compareToRecent([session(1, 5, 10), session(3, 9, 10)], { id: 2, avgScore: 6 })!;
    expect(r.previousAvg).toBe(5);
  });

  it('adds up the leaks of the last five sessions, biggest first', () => {
    const sessions = [
      session(1, 5, 5, { overcall: 9 }), // too old to count
      session(2, 5, 5, { overcall: 1 }),
      session(3, 5, 5, { freefold: 2 }, 1),
      session(4, 5, 5, { freefold: 1 }),
      session(5, 5, 5, {}, 1),
      session(6, 5, 5, { overcall: 1 }),
    ];
    expect(recentLeaks(sessions).map((l) => [l.id, l.count])).toEqual([
      ['freefold', 3],
      ['overcall', 2],
      ['sizing', 2],
    ]);
  });
});

describe('the blinds leak', () => {
  const rec = (actualAction: 'call' | 'check' | 'raise', equityPercent: number) => ({
    actualAction,
    suggestedAction: 'call' as const,
    equityPercent,
    potOddsPercent: 20,
    position: 'Big Blind' as const,
  });
  it('counts only calling with a weak hand from the blinds', () => {
    const t = new LeakTracker();
    t.record(rec('check', 20)); // free — fine
    t.record(rec('call', 60)); // strong — fine
    t.record(rec('call', 25)); // weak call — the leak
    expect(t.toJSON().counts.outOfPositionPlay).toBe(1);
  });
});
