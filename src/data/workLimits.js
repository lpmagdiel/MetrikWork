export function getOvertimeLimitHours(team) {
    const limit = Number(team?.overtimeLimitHours);
    return Number.isFinite(limit) && limit > 0 ? limit : 0;
}

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
