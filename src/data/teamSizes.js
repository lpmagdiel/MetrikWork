// Los planes ya no se utilizan para crear equipos. Este módulo conserva los
// helpers de lectura para no romper vistas legacy (p. ej. panel admin que
// mostraba el plan histórico), pero devuelve valores neutros cuando un
// equipo no tiene plan asignado.

export const TEAM_SIZE_OPTIONS = Object.freeze([]);

export function getTeamSizeOption(value) {
    return { value: '', label: '', description: '', maxMembers: Infinity, priceEur: 0 };
}

export function normalizeTeamSizeData(size, maxMembers) {
    return {
        teamSize: '',
        maxMembers: Number.isFinite(Number(maxMembers)) && Number(maxMembers) > 0
            ? Math.floor(Number(maxMembers))
            : Infinity
    };
}

export function getTeamSizeValue(teamOrSize) {
    if (typeof teamOrSize === 'object' && teamOrSize !== null) {
        const stored = teamOrSize?.teamSize || teamOrSize?.size;
        if (stored) return String(stored);
        return '';
    }
    return teamOrSize ? String(teamOrSize) : '';
}

export function getTeamMonthlyPrice(teamOrSize) {
    if (typeof teamOrSize === 'object' && teamOrSize !== null) {
        const storedPrice = Number(
            teamOrSize.billingAmountEur ??
            teamOrSize.priceEur ??
            teamOrSize.monthlyPriceEur
        );
        if (Number.isFinite(storedPrice) && storedPrice >= 0) return storedPrice;
    }
    return 0;
}

export function getTeamMemberLimit(team) {
    const directLimit = Number(team?.maxMembers);
    if (Number.isFinite(directLimit) && directLimit > 0) {
        return Math.floor(directLimit);
    }

    return Infinity;
}

export function getTeamMemberLimitLabel(teamOrSize, maxMembers) {
    if (!teamOrSize) return 'Sin límite';

    const limit = typeof teamOrSize === 'object' && teamOrSize !== null
        ? getTeamMemberLimit(teamOrSize)
        : normalizeTeamSizeData(teamOrSize, maxMembers).maxMembers;

    if (!Number.isFinite(limit)) return 'Sin límite';

    if (limit === 1) return '1 usuario máximo';
    return `${limit} usuarios máximo`;
}

/**
 * @deprecated Los planes ya no limitan los miembros. Se conserva por
 * compatibilidad con llamadas existentes pero no bloquea nada.
 */
export function assertTeamMemberLimit(team, nextMemberCount) {
    const limit = getTeamMemberLimit(team);
    if (!Number.isFinite(limit) || nextMemberCount <= limit) return;
    throw new Error(`Este equipo admite ${getTeamMemberLimitLabel(team)}.`);
}
