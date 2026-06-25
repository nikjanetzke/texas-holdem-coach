import { describe, expect, it } from 'vitest';
import type { Card } from '../deck';
import { bandFor, chenScore } from '../preflop';

const c = (rank: Card['rank'], suit: Card['suit']): Card => ({ rank, suit });

describe('chenScore', () => {
  it('scores pocket aces highest', () => {
    expect(chenScore([c('A', 's'), c('A', 'h')])).toBe(20);
  });

  it('rates premium suited connectors as strong', () => {
    expect(chenScore([c('A', 's'), c('K', 's')])).toBeGreaterThanOrEqual(8);
  });

  it('rates offsuit trash low', () => {
    expect(chenScore([c('7', 's'), c('2', 'h')])).toBeLessThanOrEqual(4);
  });

  it('places hands in the expected luck bands', () => {
    const hot = bandFor('hot');
    const cold = bandFor('cold');
    const aces = chenScore([c('A', 's'), c('A', 'h')]);
    const trash = chenScore([c('7', 's'), c('2', 'h')]);
    expect(aces).toBeGreaterThanOrEqual(hot.min);
    expect(trash).toBeLessThanOrEqual(cold.max);
  });
});
