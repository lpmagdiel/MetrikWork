import { describe, expect, it } from 'vitest';
import {
    MAX_SHIFT_VARIATION_HOURS,
    applyShiftVariationToAmount,
    applyShiftVariationToWorkAmount,
    computeShiftVariationAmount,
    formatShiftVariationHours,
    getShiftVariationHourRate,
    getShiftVariationHours,
    getShiftVariationTone,
    getWorkShiftVariationAmount,
    normalizeShiftVariationHours
} from './workVariations.js';
import { computeWorkEntryAmount } from './workBonuses.js';
import { getWorkEarnings } from './userStats.js';

const DAILY_RATE = 80;

describe('normalizeShiftVariationHours', () => {
    it('devuelve 0 para valores inválidos', () => {
        expect(normalizeShiftVariationHours(undefined)).toBe(0);
        expect(normalizeShiftVariationHours(null)).toBe(0);
        expect(normalizeShiftVariationHours('no-numero')).toBe(0);
        expect(normalizeShiftVariationHours(NaN)).toBe(0);
    });

    it('mantiene el signo (variaciones positivas y negativas)', () => {
        expect(normalizeShiftVariationHours(-2)).toBe(-2);
        expect(normalizeShiftVariationHours(3)).toBe(3);
    });

    it('limita la variación al rango permitido', () => {
        expect(normalizeShiftVariationHours(50)).toBe(MAX_SHIFT_VARIATION_HOURS);
        expect(normalizeShiftVariationHours(-50)).toBe(-MAX_SHIFT_VARIATION_HOURS);
    });
});

describe('getShiftVariationHours', () => {
    it('lee las horas de variación de la jornada', () => {
        expect(getShiftVariationHours({ shiftVariationHours: -2 })).toBe(-2);
        expect(getShiftVariationHours({ shiftVariationHours: 1.5 })).toBe(1.5);
    });

    it('devuelve 0 si la jornada no tiene variación', () => {
        expect(getShiftVariationHours({})).toBe(0);
        expect(getShiftVariationHours(null)).toBe(0);
    });
});

describe('computeShiftVariationAmount', () => {
    it('usa el precio por hora derivado de la tarifa diaria', () => {
        expect(getShiftVariationHourRate(DAILY_RATE)).toBe(10);
        expect(computeShiftVariationAmount(-2, DAILY_RATE)).toBe(-20);
        expect(computeShiftVariationAmount(2, DAILY_RATE)).toBe(20);
    });

    it('devuelve 0 sin variación', () => {
        expect(computeShiftVariationAmount(0, DAILY_RATE)).toBe(0);
    });
});

describe('applyShiftVariationToAmount', () => {
    it('descuenta el importe de la variación', () => {
        expect(applyShiftVariationToAmount(80, -20)).toBe(60);
        expect(applyShiftVariationToAmount(40, -20)).toBe(20);
        expect(applyShiftVariationToAmount(80, 20)).toBe(100);
    });

    it('nunca devuelve un importe negativo', () => {
        expect(applyShiftVariationToAmount(40, -80)).toBe(0);
        expect(applyShiftVariationToAmount(0, -20)).toBe(0);
    });
});

describe('formatShiftVariationHours', () => {
    it('indica el signo de la variación', () => {
        expect(formatShiftVariationHours(2)).toBe('+2h');
        expect(formatShiftVariationHours(-2)).toBe('-2h');
        expect(formatShiftVariationHours(0)).toBe('0h');
    });

    it('permite cambiar la unidad (H en estadísticas)', () => {
        expect(formatShiftVariationHours(1, 'H')).toBe('+1H');
        expect(formatShiftVariationHours(-2, 'H')).toBe('-2H');
        expect(formatShiftVariationHours(0, 'H')).toBe('0H');
    });
});

describe('getShiftVariationTone', () => {
    it('distingue variaciones positivas, negativas y neutras', () => {
        expect(getShiftVariationTone(2)).toBe('positive');
        expect(getShiftVariationTone(-2)).toBe('negative');
        expect(getShiftVariationTone(0)).toBe('neutral');
    });
});

describe('applyShiftVariationToWorkAmount', () => {
    it('aplica la variación cuando la jornada tiene parte regular', () => {
        expect(applyShiftVariationToWorkAmount(80, -20, 1)).toBe(60);
        expect(applyShiftVariationToWorkAmount(40, -20, 0.5)).toBe(20);
    });

    it('ignora la variación en jornadas sin parte regular (horas extra)', () => {
        expect(applyShiftVariationToWorkAmount(0, 20, 0)).toBe(0);
        expect(applyShiftVariationToWorkAmount(0, -20, 0)).toBe(0);
    });
});

describe('computeWorkEntryAmount con variación de jornada', () => {
    const team = {};

    it('descuenta la variación de una jornada completa', () => {
        const breakdown = computeWorkEntryAmount(
            { type: 'full-day', shiftVariationHours: -2, date: '2026-01-12' },
            team,
            { dailyRate: DAILY_RATE, extraHourRate: 0 }
        );
        expect(breakdown.grossBase).toBe(80);
        expect(breakdown.shiftVariation).toBe(-20);
        expect(breakdown.base).toBe(60);
        expect(breakdown.amount).toBe(60);
    });

    it('aplica la variación también a las medias jornadas', () => {
        const breakdown = computeWorkEntryAmount(
            { type: 'half-day', shiftVariationHours: -2, date: '2026-01-12' },
            team,
            { dailyRate: DAILY_RATE, extraHourRate: 0 }
        );
        expect(breakdown.grossBase).toBe(40);
        expect(breakdown.base).toBe(20);
        expect(breakdown.amount).toBe(20);
    });

    it('suma la variación positiva sin contarla como horas extra', () => {
        const breakdown = computeWorkEntryAmount(
            { type: 'full-day', shiftVariationHours: 2, date: '2026-01-12' },
            team,
            { dailyRate: DAILY_RATE, extraHourRate: 15 }
        );
        expect(breakdown.base).toBe(100);
        expect(breakdown.overtime).toBe(0);
        expect(breakdown.amount).toBe(100);
    });

    it('no altera las jornadas sin variación', () => {
        const breakdown = computeWorkEntryAmount(
            { type: 'full-day', date: '2026-01-12' },
            team,
            { dailyRate: DAILY_RATE, extraHourRate: 0 }
        );
        expect(breakdown.shiftVariation).toBe(0);
        expect(breakdown.amount).toBe(80);
    });

    it('mantiene las horas extra además de la variación', () => {
        const breakdown = computeWorkEntryAmount(
            { type: 'full-day', overtimeHours: 2, shiftVariationHours: -2, date: '2026-01-12' },
            team,
            { dailyRate: DAILY_RATE, extraHourRate: 15 }
        );
        expect(breakdown.base).toBe(60);
        expect(breakdown.overtime).toBe(30);
        expect(breakdown.amount).toBe(90);
    });
});

describe('getWorkEarnings con variación de jornada', () => {
    it('aplica la variación al salario del día', () => {
        expect(
            getWorkEarnings({ type: 'full-day', shiftVariationHours: -2 }, DAILY_RATE, 0)
        ).toBe(60);
        expect(
            getWorkEarnings({ type: 'half-day', shiftVariationHours: -2 }, DAILY_RATE, 0)
        ).toBe(20);
        expect(
            getWorkEarnings({ type: 'full-day', shiftVariationHours: 2 }, DAILY_RATE, 0)
        ).toBe(100);
    });

    it('no cobra las jornadas de los fantasmas', () => {
        expect(
            getWorkEarnings(
                { type: 'full-day', shiftVariationHours: -2, isGhost: true },
                DAILY_RATE,
                0
            )
        ).toBe(0);
    });
});

describe('getWorkShiftVariationAmount', () => {
    it('calcula el importe de la variación de una jornada', () => {
        expect(getWorkShiftVariationAmount({ shiftVariationHours: -2 }, DAILY_RATE)).toBe(-20);
        expect(getWorkShiftVariationAmount({}, DAILY_RATE)).toBe(0);
    });
});
