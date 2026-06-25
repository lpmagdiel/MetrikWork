import { describe, expect, it } from 'vitest';
import {
  applyWorkdayOvertimeLimit,
  assertWorkingDay,
  clampToOvertimeLimit,
  exceedsOvertimeLimit,
  getLocalWeekday,
  getNonWorkingDayMessage,
  getNonWorkingDays,
  getOvertimeLimitHours,
  hasOvertimeEnabled,
  hasOvertimeLimit,
  isNonWorkingDay,
  normalizeNonWorkingDays
} from './workLimits.js';

describe('workLimits', () => {
  it('normaliza dias no laborables validos y descarta valores invalidos', () => {
    expect(normalizeNonWorkingDays([0, 6, 6, 2, -1, 7, 'foo', '3'])).toEqual([0, 6, 2, 3]);
    expect(normalizeNonWorkingDays('lunes')).toEqual([]);
    expect(getNonWorkingDays({ nonWorkingDays: [1, 5] })).toEqual([1, 5]);
  });

  it('calcula el dia de la semana en fecha local', () => {
    expect(getLocalWeekday('2026-06-25')).toBe(4);
    expect(isNonWorkingDay({ nonWorkingDays: [4] }, '2026-06-25')).toBe(true);
    expect(getNonWorkingDayMessage({ nonWorkingDays: [4] }, '2026-06-25')).toContain('jueves');
  });

  it('lanza error al registrar en dia no laborable', () => {
    expect(() => assertWorkingDay({ nonWorkingDays: [4] }, '2026-06-25')).toThrow(/jueves/);
    expect(() => assertWorkingDay({ nonWorkingDays: [5] }, '2026-06-25')).not.toThrow();
  });

  it('lee y aplica el limite de horas extra del equipo', () => {
    const team = { overtimeLimitHours: 4 };

    expect(getOvertimeLimitHours(team)).toBe(4);
    expect(hasOvertimeLimit(team)).toBe(true);
    expect(hasOvertimeEnabled(team)).toBe(true);
    expect(clampToOvertimeLimit(8, team)).toBe(4);
    expect(exceedsOvertimeLimit(5, team)).toBe(true);
    expect(exceedsOvertimeLimit(4, team)).toBe(false);
  });

  it('bloquea horas extra cuando el equipo no tiene limite configurado', () => {
    const team = { overtimeLimitHours: 0 };

    expect(getOvertimeLimitHours(team)).toBe(0);
    expect(hasOvertimeEnabled(team)).toBe(false);
    expect(() => applyWorkdayOvertimeLimit({ type: 'overtime', overtimeHours: 1 }, team)).toThrow(
      /desactivadas/
    );
    expect(() => applyWorkdayOvertimeLimit({ type: 'full-day', overtimeHours: 0 }, team)).not.toThrow();
  });

  it('recorta jornadas variables al maximo permitido', () => {
    const team = { overtimeLimitHours: 3 };
    const workDay = applyWorkdayOvertimeLimit(
      {
        type: 'variable',
        timerMode: 'variable',
        durationHours: 8,
        durationSeconds: 28800,
        variableHours: 8,
        overtimeHours: 0
      },
      team
    );

    expect(workDay.variableHours).toBe(3);
    expect(workDay.durationHours).toBe(3);
    expect(workDay.durationSeconds).toBe(10800);
  });

  it('rechaza horas extra que superan el limite en jornadas extra', () => {
    expect(() =>
      applyWorkdayOvertimeLimit({ type: 'overtime', overtimeHours: 6 }, { overtimeLimitHours: 5 })
    ).toThrow(/5h/);
  });
});
