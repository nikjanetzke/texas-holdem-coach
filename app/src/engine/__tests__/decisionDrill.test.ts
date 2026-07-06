import { describe, expect, it } from 'vitest';
import { generateDecisionScenario } from '../decisionDrill';
import { hitPercent } from '../outsDrill';

describe('decisionDrill', () => {
  it('equity is always exactly outs x 2 or x 4 (never invented)', () => {
    for (let i = 0; i < 200; i++) {
      const s = generateDecisionScenario();
      expect(s.equityPercent).toBe(hitPercent(s.outsScenario.outs, s.outsScenario.cardsToCome));
    }
  });

  it('folds whenever equity is below the break-even price', () => {
    for (let i = 0; i < 500; i++) {
      const s = generateDecisionScenario();
      if (s.equityPercent < s.breakEvenPercent) expect(s.action).toBe('fold');
      else expect(s.action).not.toBe('fold');
    }
  });

  it('only raises with a big draw (8+ outs); smaller draws call instead', () => {
    for (let i = 0; i < 500; i++) {
      const s = generateDecisionScenario();
      if (s.action === 'raise') expect(s.outsScenario.outs).toBeGreaterThanOrEqual(8);
      if (s.action === 'call') expect(s.outsScenario.outs).toBeLessThan(8);
    }
  });

  it('never grades a near-tie between equity and break-even', () => {
    for (let i = 0; i < 500; i++) {
      const s = generateDecisionScenario();
      expect(Math.abs(s.equityPercent - s.breakEvenPercent)).toBeGreaterThanOrEqual(3);
    }
  });

  it('produces a healthy mix of all three actions (no starved bucket)', { timeout: 30000 }, () => {
    const counts = { fold: 0, call: 0, raise: 0 };
    const N = 1200;
    for (let i = 0; i < N; i++) counts[generateDecisionScenario().action]++;
    for (const key of ['fold', 'call', 'raise'] as const) {
      expect(counts[key], `${key} count`).toBeGreaterThan(N * 0.05);
    }
  });
});
