import { describe, expect, it } from 'vitest';
import {
    DEFAULT_WORK_BONUSES,
    computeWorkBonusAmounts,
    computeWorkEntryAmount,
    generateHolidayId,
    getBonusConfig,
    getHolidayDateSet,
    getTeamHolidays,
    getWorkBonuses,
    isHolidayDate,
    isWeekendDate,
    normalizeHolidays,
    normalizeWorkBonuses,
    summarizeBonuses,
    WEEKEND_WEEKDAYS
} from './workBonuses.js';

describe('normalizeWorkBonuses', () => {
    it('devuelve defaults cuando no hay datos', () => {
        expect(normalizeWorkBonuses(null)).toEqual(DEFAULT_WORK_BONUSES);
        expect(normalizeWorkBonuses(undefined)).toEqual(DEFAULT_WORK_BONUSES);
        expect(normalizeWorkBonuses('no es un objeto')).toEqual(DEFAULT_WORK_BONUSES);
    });

    it('rellena tipos faltantes con defaults', () => {
        const out = normalizeWorkBonuses({ weekend: { enabled: true, amount: 50 } });
        expect(out.weekend).toEqual({ enabled: true, amount: 50 });
        expect(out.holiday).toEqual({ enabled: false, amount: 0 });
    });

    it('ignora importes negativos o no numéricos', () => {
        const out = normalizeWorkBonuses({
            weekend: { enabled: true, amount: -10 },
            holiday: { enabled: true, amount: 'no-numero' }
        });
        expect(out.weekend.amount).toBe(0);
        expect(out.holiday.amount).toBe(0);
    });

    it('redondea los importes a céntimos', () => {
        const out = normalizeWorkBonuses({
            weekend: { enabled: true, amount: 60.129 },
            holiday: { enabled: true, amount: 33.335 }
        });
        expect(out.weekend.amount).toBe(60.13);
        expect(out.holiday.amount).toBe(33.34);
    });
});

describe('getWorkBonuses/getBonusConfig (team sin workBonuses)', () => {
    it('devuelve defaults si el equipo no tiene el campo', () => {
        expect(getWorkBonuses({})).toEqual(DEFAULT_WORK_BONUSES);
        expect(getWorkBonuses(null)).toEqual(DEFAULT_WORK_BONUSES);
    });

    it('devuelve la config concreta de un tipo', () => {
        const bonuses = getWorkBonuses({ workBonuses: { weekend: { enabled: true, amount: 40 } } });
        expect(getBonusConfig({ workBonuses: bonuses }, 'weekend')).toEqual({ enabled: true, amount: 40 });
        expect(getBonusConfig({ workBonuses: bonuses }, 'holiday')).toEqual({ enabled: false, amount: 0 });
    });

    it('devuelve defaults para tipos desconocidos sin lanzar', () => {
        expect(getBonusConfig({}, 'inventado')).toEqual({ enabled: false, amount: 0 });
    });
});

describe('normalizeHolidays / getTeamHolidays', () => {
    it('devuelve [] si no hay datos', () => {
        expect(normalizeHolidays(null)).toEqual([]);
        expect(normalizeHolidays([])).toEqual([]);
        expect(getTeamHolidays({})).toEqual([]);
    });

    it('descarta entradas sin fecha ISO válida', () => {
        const out = normalizeHolidays([
            { id: 'a', date: '01/01/2026', name: 'Año Nuevo' },
            { id: 'b', date: 'ayer', name: 'Raro' },
            null
        ]);
        expect(out).toEqual([]);
    });

    it('deduplica festivos por fecha y ordena por fecha', () => {
        const out = normalizeHolidays([
            { id: 'b', date: '2026-01-06', name: 'Reyes' },
            { id: 'a', date: '2026-01-01', name: 'Año Nuevo' },
            { id: 'dup', date: '2026-01-01', name: 'Duplicado' }
        ]);
        expect(out.map((h) => h.date)).toEqual(['2026-01-01', '2026-01-06']);
    });

    it('recorta strings demasiado largos', () => {
        const out = normalizeHolidays([
            { id: 'l', date: '2026-12-25', name: 'x'.repeat(500), notes: 'y'.repeat(500) }
        ]);
        expect(out[0].name.length).toBe(80);
        expect(out[0].notes.length).toBe(240);
    });

    it('genera id si falta', () => {
        const out = normalizeHolidays([{ date: '2026-05-01', name: 'Trabajo' }]);
        expect(out[0].id).toMatch(/holiday-2026-05-01-/);
    });
});

describe('isHolidayDate / isWeekendDate', () => {
    const team = {
        holidays: [
            { id: 'nav', date: '2026-12-25', name: 'Navidad' },
            { id: 'rey', date: '2026-01-06', name: 'Reyes' }
        ]
    };

    it('detecta fechas festivas del equipo', () => {
        expect(isHolidayDate(team, '2026-12-25')).toBe(true);
        expect(isHolidayDate(team, '2026-01-06')).toBe(true);
    });

    it('ignora fechas no festivas', () => {
        expect(isHolidayDate(team, '2026-06-15')).toBe(false);
    });

    it('tolera entradas mal formadas', () => {
        expect(isHolidayDate(null, '2026-12-25')).toBe(false);
        expect(isHolidayDate(team, '12/25/2026')).toBe(false);
        expect(isHolidayDate(team, '')).toBe(false);
    });

    it('detecta fines de semana por fecha ISO', () => {
        expect(isWeekendDate('2026-01-03')).toBe(true); // sábado
        expect(isWeekendDate('2026-01-04')).toBe(true); // domingo
        expect(isWeekendDate('2026-01-05')).toBe(false);
        expect(isWeekendDate('2026-01-02')).toBe(false); // viernes
        expect(isWeekendDate('no-fecha')).toBe(false);
    });

    it('expone la constante de días weekend', () => {
        expect(WEEKEND_WEEKDAYS).toEqual([0, 6]);
    });
});

describe('getHolidayDateSet', () => {
    it('devuelve un Set con las fechas festivas en formato ISO', () => {
        const team = { holidays: [{ id: 'a', date: '2026-01-01', name: 'x' }] };
        const set = getHolidayDateSet(team);
        expect(set.has('2026-01-01')).toBe(true);
        expect(set.has('2026-01-02')).toBe(false);
    });
});

describe('generateHolidayId', () => {
    it('deriva el id de la fecha ISO', () => {
        expect(generateHolidayId('2026-01-01')).toMatch(/^holiday-2026-01-01-/);
    });

    it('usa prefijo sin fecha cuando la fecha no es ISO', () => {
        expect(generateHolidayId()).toMatch(/^holiday-/);
    });
});

describe('computeWorkBonusAmounts', () => {
    const bonuses = normalizeWorkBonuses({
        weekend: { enabled: true, amount: 60 },
        holiday: { enabled: true, amount: 80 }
    });
    const holidaySet = new Set(['2026-12-25']);

    it('no aplica pluses si los toggles están desactivados', () => {
        const off = normalizeWorkBonuses({});
        const out = computeWorkBonusAmounts(
            { date: '2026-12-25', type: 'full-day' },
            off,
            holidaySet
        );
        expect(out.weekend).toBe(0);
        expect(out.holiday).toBe(0);
    });

    it('aplica solo weekend el sábado si el festivo no coincide', () => {
        const out = computeWorkBonusAmounts(
            { date: '2026-01-03', type: 'full-day' }, // sábado
            bonuses,
            holidaySet
        );
        expect(out.weekend).toBe(60);
        expect(out.holiday).toBe(0);
        expect(out.total).toBe(60);
        expect(out.applied).toEqual(['weekend']);
    });

    it('aplica solo holiday si el festivo cae entre semana', () => {
        const out = computeWorkBonusAmounts(
            { date: '2026-12-25', type: 'full-day' }, // viernes
            bonuses,
            holidaySet
        );
        expect(out.weekend).toBe(0);
        expect(out.holiday).toBe(80);
        expect(out.applied).toEqual(['holiday']);
    });

    it('suma ambos cuando un festivo cae en sábado o domingo', () => {
        const out = computeWorkBonusAmounts(
            { date: '2027-12-25', type: 'full-day' }, // sábado
            { ...bonuses, holiday: { enabled: true, amount: 80 } },
            new Set(['2027-12-25'])
        );
        expect(out.weekend).toBe(60);
        expect(out.holiday).toBe(80);
        expect(out.total).toBe(140);
        expect(out.applied).toEqual(['weekend', 'holiday']);
    });

    it('escala por unidades (media jornada cobra la mitad)', () => {
        const out = computeWorkBonusAmounts(
            { date: '2026-01-03', type: 'half-day' },
            bonuses,
            holidaySet
        );
        expect(out.weekend).toBe(30);
    });

    it('escala por horas para jornadas variable', () => {
        const out = computeWorkBonusAmounts(
            { date: '2026-01-03', type: 'variable', variableHours: 4 },
            bonuses,
            holidaySet
        );
        expect(out.weekend).toBe(30);
    });

    it('no aplica plus a entradas overtime puras', () => {
        const out = computeWorkBonusAmounts(
            { date: '2026-01-03', type: 'overtime', overtimeHours: 2 },
            bonuses,
            holidaySet
        );
        expect(out.weekend).toBe(0);
        expect(out.holiday).toBe(0);
        expect(out.total).toBe(0);
    });

    it('no aplica plus a overtime aunque aparezca en una jornada variable', () => {
        const out = computeWorkBonusAmounts(
            { date: '2026-01-03', type: 'variable', timerMode: 'overtime', variableHours: 2 },
            bonuses,
            holidaySet
        );
        expect(out.total).toBe(0);
    });

    it('redondea a céntimos para evitar drift en la suma', () => {
        const odd = normalizeWorkBonuses({
            weekend: { enabled: true, amount: 33.333 }
        });
        const out = computeWorkBonusAmounts(
            { date: '2026-01-03', type: 'half-day' },
            odd,
            null
        );
        // 33.333 * 0.5 = 16.6665 -> 16.67
        expect(out.weekend).toBe(16.67);
    });
});

describe('computeWorkEntryAmount', () => {
    const team = {
        workBonuses: {
            weekend: { enabled: true, amount: 60 },
            holiday: { enabled: true, amount: 80 }
        },
        holidays: [
            { id: '1', date: '2026-12-25', name: 'Navidad' },
            { id: '2', date: '2026-01-06', name: 'Reyes' }
        ]
    };

    it('suma base + overtime + pluses de fin de semana', () => {
        // Sábado 3 enero 2026, jornada completa + 2h extra
        const out = computeWorkEntryAmount(
            { date: '2026-01-03', type: 'full-day', overtimeHours: 2 },
            team,
            { dailyRate: 120, extraHourRate: 18 }
        );
        expect(out.base).toBe(120);
        expect(out.overtime).toBe(36);
        expect(out.weekendBonus).toBe(60);
        expect(out.holidayBonus).toBe(0);
        expect(out.amount).toBe(216);
    });

    it('suma base + plus de festivo entre semana', () => {
        const out = computeWorkEntryAmount(
            { date: '2026-12-25', type: 'full-day' },
            team,
            { dailyRate: 120, extraHourRate: 18 }
        );
        expect(out.weekendBonus).toBe(0);
        expect(out.holidayBonus).toBe(80);
        expect(out.amount).toBe(200);
    });

    it('cuenta solo base + overtime cuando el plus está desactivado', () => {
        const noBonus = { ...team, workBonuses: DEFAULT_WORK_BONUSES };
        const out = computeWorkEntryAmount(
            { date: '2026-12-25', type: 'full-day' },
            noBonus,
            { dailyRate: 120, extraHourRate: 18 }
        );
        expect(out.weekendBonus).toBe(0);
        expect(out.holidayBonus).toBe(0);
        expect(out.amount).toBe(120);
    });

    it('marca correctamente los flags de fin de semana y festivo', () => {
        const sat = computeWorkEntryAmount(
            { date: '2026-01-03', type: 'full-day' },
            team,
            { dailyRate: 120, extraHourRate: 0 }
        );
        expect(sat.weekendDay).toBe(true);
        expect(sat.holidayDay).toBe(false);

        const holiday = computeWorkEntryAmount(
            { date: '2026-12-25', type: 'full-day' },
            team,
            { dailyRate: 120, extraHourRate: 0 }
        );
        expect(holiday.weekendDay).toBe(false);
        expect(holiday.holidayDay).toBe(true);

        const both = computeWorkEntryAmount(
            { date: '2026-12-25', type: 'full-day' },
            {
                ...team,
                holidays: [
                    ...team.holidays,
                    { id: 'extra', date: '2027-01-02', name: 'Otro' }
                ]
            },
            { dailyRate: 120, extraHourRate: 0 }
        );
        // Fin de semana sin festivo
        expect(both.weekendDay).toBe(false);
        expect(both.holidayDay).toBe(true);
        const sat2 = computeWorkEntryAmount(
            { date: '2026-01-03', type: 'full-day' },
            {
                ...team,
                holidays: [
                    ...team.holidays,
                    { id: 'sat', date: '2026-01-03', name: 'Festivo en sábado' }
                ]
            },
            { dailyRate: 120, extraHourRate: 0 }
        );
        expect(sat2.weekendDay).toBe(true);
        expect(sat2.holidayDay).toBe(true);
    });
});

describe('summarizeBonuses', () => {
    const team = {
        workBonuses: {
            weekend: { enabled: true, amount: 60 },
            holiday: { enabled: true, amount: 80 }
        },
        holidays: [{ id: '1', date: '2026-01-06', name: 'Reyes' }]
    };

    it('suma weekend y holiday por separado', () => {
        const out = summarizeBonuses(
            [
                { date: '2026-01-03', type: 'full-day' }, // sábado -> 60 weekend
                { date: '2026-01-04', type: 'half-day' }, // domingo -> 30 weekend
                { date: '2026-01-06', type: 'full-day' }, // reyes (martes) -> 80 holiday
                { date: '2026-01-05', type: 'full-day' }, // lunes -> sin plus
            ],
            team,
            { dailyRate: 120, extraHourRate: 0 }
        );
        expect(out.weekend).toBe(90);
        expect(out.holiday).toBe(80);
        expect(out.total).toBe(170);
        expect(out.weekendUnits).toBe(1.5);
        expect(out.holidayUnits).toBe(1);
    });

    it('devuelve todo a cero si no hay pluses', () => {
        const noBonus = { ...team, workBonuses: DEFAULT_WORK_BONUSES };
        const out = summarizeBonuses(
            [{ date: '2026-01-03', type: 'full-day' }],
            noBonus,
            { dailyRate: 120, extraHourRate: 0 }
        );
        expect(out.total).toBe(0);
        expect(out.weekend).toBe(0);
        expect(out.holiday).toBe(0);
    });
});
