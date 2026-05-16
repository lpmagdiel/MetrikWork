export function getOvertimeLimitHours(team) {
    const limit = Number(team?.overtimeLimitHours);
    return Number.isFinite(limit) && limit > 0 ? limit : 0;
}

export const WEEKDAY_OPTIONS = [
    { value: 1, label: 'Lunes', shortLabel: 'Lun' },
    { value: 2, label: 'Martes', shortLabel: 'Mar' },
    { value: 3, label: 'Miércoles', shortLabel: 'Mie' },
    { value: 4, label: 'Jueves', shortLabel: 'Jue' },
    { value: 5, label: 'Viernes', shortLabel: 'Vie' },
    { value: 6, label: 'Sábado', shortLabel: 'Sab' },
    { value: 0, label: 'Domingo', shortLabel: 'Dom' }
];

export function hasOvertimeLimit(team) {
    return getOvertimeLimitHours(team) > 0;
}

export function clampToOvertimeLimit(hours, team) {
    const numericHours = Math.max(0, Number(hours) || 0);
    const limit = getOvertimeLimitHours(team);
    return limit > 0 ? Math.min(numericHours, limit) : numericHours;
}

export function exceedsOvertimeLimit(hours, team) {
    const limit = getOvertimeLimitHours(team);
    return limit > 0 && (Number(hours) || 0) > limit;
}

export function getOvertimeLimitMessage(team) {
    const limit = getOvertimeLimitHours(team);
    return limit > 0 ? `El límite de horas extra de este equipo es ${limit}h.` : '';
}

export function normalizeNonWorkingDays(days = []) {
    if (!Array.isArray(days)) return [];
    return [...new Set(days.map((day) => Number(day)).filter((day) => Number.isInteger(day) && day >= 0 && day <= 6))];
}

export function getNonWorkingDays(team) {
    return normalizeNonWorkingDays(team?.nonWorkingDays);
}

export function getLocalWeekday(dateString) {
    if (!dateString) return new Date().getDay();
    const [year, month, day] = String(dateString).split('-').map(Number);
    if (!year || !month || !day) return new Date(dateString).getDay();
    return new Date(year, month - 1, day).getDay();
}

export function isNonWorkingDay(team, dateString) {
    return getNonWorkingDays(team).includes(getLocalWeekday(dateString));
}

export function getNonWorkingDayMessage(team, dateString) {
    const weekday = getLocalWeekday(dateString);
    const dayLabel = WEEKDAY_OPTIONS.find((day) => day.value === weekday)?.label || 'este día';
    return isNonWorkingDay(team, dateString)
        ? `El equipo tiene ${dayLabel.toLowerCase()} configurado como día no laborable.`
        : '';
}

export function assertWorkingDay(team, dateString) {
    if (isNonWorkingDay(team, dateString)) {
        throw new Error(getNonWorkingDayMessage(team, dateString));
    }
}

export function applyWorkdayOvertimeLimit(workDay, team) {
    const limit = getOvertimeLimitHours(team);
    if (!limit || !workDay) return { ...workDay };

    const nextWorkDay = { ...workDay };
    const overtimeHours = Number(nextWorkDay.overtimeHours) || 0;

    if (nextWorkDay.type === 'variable') {
        const cappedHours = clampToOvertimeLimit(
            nextWorkDay.variableHours ?? nextWorkDay.durationHours ?? overtimeHours,
            team
        );
        nextWorkDay.variableHours = cappedHours;
        nextWorkDay.durationHours = cappedHours;
        nextWorkDay.durationSeconds = Math.round(cappedHours * 3600);

        if (nextWorkDay.timerMode === 'overtime') {
            nextWorkDay.overtimeHours = clampToOvertimeLimit(overtimeHours, team);
        }

        return nextWorkDay;
    }

    if (overtimeHours > limit) {
        throw new Error(getOvertimeLimitMessage(team));
    }

    return nextWorkDay;
}
