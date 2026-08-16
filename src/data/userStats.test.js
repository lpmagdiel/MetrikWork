import { describe, expect, it } from 'vitest';
import { getOutstandingAmount, getWorkEarnings } from './userStats.js';

describe('user statistics earnings', () => {
  const rates = { dailyRate: 100, extraHourRate: 20 };

  it('keeps prior-month debt in the outstanding balance', () => {
    const works = [{ id: 'april-work', type: 'full-day', date: '2026-04-30' }];

    // The default May filter contains no work, but the statistics screen must
    // still show the debt created in April.
    expect(getOutstandingAmount(works, [], rates.dailyRate, rates.extraHourRate)).toBe(100);
  });

  it('subtracts all registered payments from the accumulated balance', () => {
    const works = [
      { type: 'full-day' },
      { type: 'half-day', overtimeHours: 2 },
    ];
    const payments = [{ amount: 40 }, { amount: 70 }];

    expect(getOutstandingAmount(works, payments, rates.dailyRate, rates.extraHourRate)).toBe(80);
  });

  it('calculates variable work and overtime without producing a negative balance', () => {
    const work = {
      type: 'variable',
      variableHours: 4,
      overtimeHours: 3,
    };

    expect(getWorkEarnings(work, rates.dailyRate, rates.extraHourRate)).toBe(110);
    expect(getOutstandingAmount([work], [{ amount: 150 }], rates.dailyRate, rates.extraHourRate)).toBe(0);
  });

  it('ghost workdays never generate earnings regardless of hours', () => {
    const ghostWork = {
      id: 'ghost-work',
      type: 'full-day',
      isGhost: true,
      overtimeHours: 8,
    };
    const legacyGhostWork = {
      id: 'legacy-ghost',
      type: 'variable',
      variableHours: 6,
      overtimeHours: 4,
      userId: 'ghost-abc123',
    };

    expect(getWorkEarnings(ghostWork, rates.dailyRate, rates.extraHourRate)).toBe(0);
    expect(getWorkEarnings(legacyGhostWork, rates.dailyRate, rates.extraHourRate)).toBe(0);
    expect(getOutstandingAmount([ghostWork, legacyGhostWork], [], rates.dailyRate, rates.extraHourRate)).toBe(0);
  });
});
