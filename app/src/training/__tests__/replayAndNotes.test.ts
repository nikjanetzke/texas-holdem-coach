import { describe, expect, it } from 'vitest';
import { buildReplay, type ReplayHand } from '../replay';
import { evidenceLines, HANDS_FOR_A_READ, opponentStats, readOpponent } from '../opponentNotes';
import { CHARACTERS } from '../../ai/characters';
import { simulate, type SimHand } from './simTable';

// Real hands between the real AI characters (one of them stands in for you).
const HANDS = simulate(['leo', 'spike', 'professor'], 60, 11);

/** Re-label one player as "you" so the replay treats them as the hero. */
function asHero(h: SimHand, id: string): SimHand {
  const sw = (x: string) => (x === id ? 'human' : x);
  const keys = <T,>(o: Record<string, T>) => Object.fromEntries(Object.entries(o).map(([k, v]) => [sw(k), v]));
  return {
    ...h,
    players: h.players.map((p) => ({ ...p, id: sw(p.id), name: p.id === id ? 'You' : p.name })),
    actionLog: h.actionLog.map((e) => ({ ...e, playerId: sw(e.playerId) })),
    showdownResult: h.showdownResult && {
      ...h.showdownResult,
      payouts: keys(h.showdownResult.payouts),
      refunds: keys(h.showdownResult.refunds ?? {}),
      bestHandByPlayer: keys(h.showdownResult.bestHandByPlayer),
    },
    startStacks: keys(h.startStacks),
    finalStacks: keys(h.finalStacks),
  };
}
const toReplay = (h: SimHand): ReplayHand => ({ handNumber: 1, ...h });

describe('hand replayer', () => {
  it('chips always add up, and the last step matches how the hand really ended', () => {
    for (const h of HANDS) {
      const steps = buildReplay(toReplay(h));
      const total = Object.values(h.startStacks).reduce((a, b) => a + b, 0);
      for (const s of steps) {
        const behind = s.seats.reduce((a, p) => a + (p.stack ?? 0), 0);
        expect(behind + s.pot, s.text).toBe(total);
        for (const p of s.seats) expect(p.stack!, s.text).toBeGreaterThanOrEqual(0);
      }
      const last = steps[steps.length - 1];
      expect(last.kind).toBe('result');
      expect(last.pot).toBe(0);
      for (const p of last.seats) expect(p.stack, `${p.id}: ${last.text}`).toBe(h.finalStacks[p.id]);
      expect(last.board).toEqual(h.communityCards);
    }
  });

  it('one step per decision, cards appear street by street, folded hands stay hidden', () => {
    for (const h of HANDS) {
      const steps = buildReplay(toReplay(h));
      expect(steps.filter((s) => s.kind === 'action')).toHaveLength(h.actionLog.filter((e) => !e.forced).length);
      for (let i = 1; i < steps.length; i++) expect(steps[i].board.length).toBeGreaterThanOrEqual(steps[i - 1].board.length);
      for (const s of steps) for (const p of s.seats) if (p.folded) expect(p.cardsShown, s.text).toBe(false);
      const sd = steps.find((s) => s.kind === 'showdown');
      if (sd) expect(sd.seats.filter((p) => !p.folded).every((p) => p.cardsShown)).toBe(true);
    }
  });

  it('describes actions in plain English, with "you" for your own', () => {
    const h = asHero(HANDS.find((x) => x.actionLog.some((e) => e.playerId === 'leo' && !e.forced))!, 'leo');
    const steps = buildReplay(toReplay(h));
    expect(steps[0].text).toMatch(/^Cards are dealt\. Forced bets \(the blinds\) go in: /);
    const mine = steps.filter((s) => s.actorId === 'human');
    expect(mine.length).toBeGreaterThan(0);
    for (const s of mine) expect(s.text).toMatch(/^You (fold|check|call|bet|raise|go all in)/);
    for (const s of steps.filter((x) => x.actorId && x.actorId !== 'human')) expect(s.text).toMatch(/ (folds|checks|calls|bets|raises|goes all in)/);
    // Your cards are face up from the start.
    expect(steps[0].seats.find((p) => p.isYou)!.cardsShown).toBe(true);
  });

  it("attaches the coach's verdict to each of your decisions, in order", () => {
    const h = asHero(HANDS.find((x) => x.actionLog.filter((e) => e.playerId === 'leo' && !e.forced).length >= 2)!, 'leo');
    const n = h.actionLog.filter((e) => e.playerId === 'human' && !e.forced).length;
    const coach = Array.from({ length: n }, (_, i) => ({ suggested: 'call', score: i + 1, explanation: `d${i}`, equityPercent: 50, potOddsPercent: 25, toCall: 10 }));
    const steps = buildReplay({ ...toReplay(h), decisionTimings: coach.map((c) => ({ coach: c })) });
    const mine = steps.filter((s) => s.actorId === 'human');
    expect(mine.map((s) => s.decision?.coach?.explanation)).toEqual(coach.map((c) => c.explanation));
    // Other players' actions carry no coaching.
    expect(steps.filter((s) => s.actorId && s.actorId !== 'human').every((s) => !s.decision)).toBe(true);
  });

  it('older hands without start stacks still replay (stacks just left out)', () => {
    const { startStacks: _drop, ...old } = toReplay(HANDS[0]);
    const steps = buildReplay(old);
    expect(steps.length).toBeGreaterThan(2);
    expect(steps.every((s) => s.seats.every((p) => p.stack === null))).toBe(true);
  });

  it('an all-in before the river shows the hands, then deals the rest of the board', () => {
    const allInEarly = HANDS.find((h) => {
      const lastStreet = h.actionLog[h.actionLog.length - 1]?.street;
      return h.communityCards.length === 5 && lastStreet !== 'river' && h.showdownResult && Object.keys(h.showdownResult.bestHandByPlayer).length >= 2;
    });
    if (!allInEarly) return; // depends on the simulated cards; covered whenever it occurs
    const steps = buildReplay(toReplay(allInEarly));
    const reveal = steps.findIndex((s) => s.kind === 'showdown');
    expect(reveal).toBeGreaterThan(0);
    expect(steps.slice(reveal).some((s) => s.kind === 'street')).toBe(true);
  });
});

describe('opponent notes', () => {
  const style = (id: string) => CHARACTERS.find((c) => c.id === id)!;

  it('counts what you saw each opponent do', () => {
    const s = opponentStats(HANDS, 'leo');
    expect(s.hands).toBe(60);
    expect(s.played).toBeGreaterThan(0);
    expect(s.played).toBeLessThanOrEqual(s.hands);
    expect(s.foldedToBet).toBeLessThanOrEqual(s.facedBet);
    expect(evidenceLines(s)[0]).toMatch(/^Played \d+ of the 60 hands/);
  });

  it('stays quiet until you have watched someone for a few hands', () => {
    const early = readOpponent(style('leo'), HANDS.slice(0, HANDS_FOR_A_READ - 1), 'leo');
    expect(early.ready).toBe(false);
    expect(early.notes).toHaveLength(0);
    expect(readOpponent(style('leo'), HANDS.slice(0, HANDS_FOR_A_READ), 'leo').ready).toBe(true);
  });

  it("each character's notes match how they really play", () => {
    const ids = (id: string) => readOpponent(style(id), HANDS, 'leo').notes.map((n) => n.id);
    expect(ids('leo')).toEqual(['station', 'passive', 'loose']);
    expect(ids('spike')).toEqual(['bluffer', 'loose']);
    expect(ids('professor')).toEqual(['tight']);
    expect(ids('vivian')).toEqual(['aggressive']);
    expect(ids('danny')).toEqual([]); // balanced: nothing to exploit
  });

  it('every character gets at most three notes, each with plain advice', () => {
    for (const c of CHARACTERS) {
      const r = readOpponent(c, HANDS, 'leo');
      expect(r.notes.length).toBeLessThanOrEqual(3);
      for (const n of r.notes) {
        expect(n.seatTag.length).toBeLessThanOrEqual(12); // fits on a seat
        expect(n.adjust.length).toBeGreaterThan(20);
      }
    }
  });

  it('in the simulated games the styles really show: Leo folds least, Spike is most aggressive', () => {
    const s = (id: string) => opponentStats(HANDS, id);
    const foldRate = (id: string) => s(id).foldedToBet / Math.max(1, s(id).facedBet);
    const aggr = (id: string) => s(id).aggressive / Math.max(1, s(id).calls);
    expect(foldRate('leo')).toBeLessThan(foldRate('professor'));
    expect(aggr('spike')).toBeGreaterThan(aggr('leo'));
  });
});
