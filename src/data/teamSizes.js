export const TEAM_SIZE_OPTIONS = Object.freeze([
    {
        value: 'G',
        label: 'G',
        description: 'Gratuito, 1 usuario',
        maxMembers: 1,
        priceEur: 0
    },
    {
        value: 'S',
        label: 'S',
        description: 'Menos de 5 usuarios',
        maxMembers: 4,
        priceEur: 25
    },
    {
        value: 'M',
        label: 'M',
        description: '10 usuarios o menos',
        maxMembers: 10,
        priceEur: 35
    },
    {
        value: 'L',
        label: 'L',
        description: '11+ usuarios',
        maxMembers: 999,
        priceEur: 50
    }
]);

export function getTeamSizeOption(value) {
    const normalizedValue = String(value || '').trim().toUpperCase();
    return TEAM_SIZE_OPTIONS.find((option) => option.value === normalizedValue) || TEAM_SIZE_OPTIONS[0];
}

export function normalizeTeamSizeData(size, maxMembers) {
    const option = getTeamSizeOption(size);
    const parsedMaxMembers = Number(maxMembers);

    return {
        teamSize: option.value,
        maxMembers: Number.isFinite(parsedMaxMembers) && parsedMaxMembers > 0
            ? Math.floor(parsedMaxMembers)
            : option.maxMembers
    };
}

export function getTeamSizeValue(teamOrSize) {
    if (typeof teamOrSize === 'object' && teamOrSize !== null) {
        return getTeamSizeOption(teamOrSize.teamSize || teamOrSize.size).value;
    }

    return getTeamSizeOption(teamOrSize).value;
}

export function getTeamMonthlyPrice(teamOrSize) {
    if (typeof teamOrSize === 'object' && teamOrSize !== null) {
        const storedPrice = Number(
            teamOrSize.billingAmountEur ??
            teamOrSize.priceEur ??
            teamOrSize.monthlyPriceEur ??
            teamOrSize.teamAccessCode?.priceEur
        );
        if (Number.isFinite(storedPrice) && storedPrice >= 0) return storedPrice;
    }

    return getTeamSizeOption(getTeamSizeValue(teamOrSize)).priceEur;
}

export function getTeamMemberLimit(team) {
    const directLimit = Number(team?.maxMembers);
    if (Number.isFinite(directLimit) && directLimit > 0) {
        return Math.floor(directLimit);
    }

    const size = team?.teamSize || team?.size;
    if (size) return getTeamSizeOption(size).maxMembers;

    return Infinity;
}

export function getTeamMemberLimitLabel(teamOrSize, maxMembers) {
    const isObjectValue = typeof teamOrSize === 'object' && teamOrSize !== null;
    const size = isObjectValue ? teamOrSize.teamSize || teamOrSize.size : teamOrSize;
    const limit = isObjectValue
        ? getTeamMemberLimit(teamOrSize)
        : normalizeTeamSizeData(size, maxMembers).maxMembers;

    if (!Number.isFinite(limit)) return 'Sin limite registrado';

    const option = getTeamSizeOption(size);
    if (option.value === 'L') return '11+ usuarios';
    if (limit === 1) return '1 usuario maximo';

    return `${limit} usuarios maximo`;
}

export function assertTeamMemberLimit(team, nextMemberCount) {
    const limit = getTeamMemberLimit(team);
    if (!Number.isFinite(limit) || nextMemberCount <= limit) return;

    throw new Error(`Este equipo admite ${getTeamMemberLimitLabel(team)}.`);
}
