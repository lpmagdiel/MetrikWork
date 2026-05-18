export const TEAM_PERMISSION_MODULES = {
    stats: 'stats',
    payments: 'payments',
    inventory: 'inventory',
    locations: 'locations',
    tasks: 'tasks',
    settings: 'settings'
};

export const TEAM_PERMISSION_ACTIONS = {
    view: 'view',
    create: 'create',
    edit: 'edit',
    delete: 'delete'
};

export const TEAM_PERMISSION_LABELS = {
    stats: 'Estadísticas',
    payments: 'Pagos',
    inventory: 'Inventario',
    locations: 'Ubicaciones',
    tasks: 'Tareas',
    settings: 'Ajustes'
};

export const TEAM_PERMISSION_ACTION_LABELS = {
    view: 'Ver',
    create: 'Crear',
    edit: 'Editar',
    delete: 'Eliminar'
};

const MODULES = Object.values(TEAM_PERMISSION_MODULES);
const ACTIONS = Object.values(TEAM_PERMISSION_ACTIONS);

export function createTeamPermissions(enabled = false) {
    return MODULES.reduce((permissions, module) => {
        permissions[module] = ACTIONS.reduce((actions, action) => {
            actions[action] = enabled;
            return actions;
        }, {});
        return permissions;
    }, {});
}

export function createDefaultMemberPermissions() {
    const permissions = createTeamPermissions(false);
    permissions.tasks.view = true;
    return permissions;
}

export function normalizeTeamPermissions(permissions = {}, enabledFallback = false) {
    const normalized = createTeamPermissions(enabledFallback);

    MODULES.forEach((module) => {
        ACTIONS.forEach((action) => {
            normalized[module][action] = Boolean(permissions?.[module]?.[action]);
        });
    });

    return normalized;
}

export function getMemberPermissions(team, uid) {
    if (!team || !uid) return createTeamPermissions(false);
    if (team.admin === uid) return createTeamPermissions(true);
    return normalizeTeamPermissions(team.memberPermissions?.[uid]);
}

export function hasTeamPermission(team, uid, module, action = 'view') {
    if (!team || !uid) return false;
    if (team.admin === uid) return true;
    return Boolean(team.memberPermissions?.[uid]?.[module]?.[action]);
}
