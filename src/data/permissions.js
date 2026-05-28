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

export const TEAM_PERMISSION_ROLE_TEMPLATES = [
    {
        id: 'manager',
        label: 'Manager',
        description: 'Supervisa operaciones, tareas, reportes y ajustes sin eliminar datos sensibles.',
        permissions: {
            stats: ['view'],
            payments: ['view', 'create', 'edit'],
            inventory: ['view', 'create', 'edit'],
            locations: ['view'],
            tasks: ['view', 'create', 'edit', 'delete'],
            settings: ['view', 'create', 'edit']
        }
    },
    {
        id: 'accountant',
        label: 'Contador',
        description: 'Gestiona pagos y consulta reportes financieros con acceso operativo limitado.',
        permissions: {
            stats: ['view'],
            payments: ['view', 'create', 'edit', 'delete'],
            inventory: ['view'],
            locations: [],
            tasks: ['view'],
            settings: ['view']
        }
    },
    {
        id: 'field_operator',
        label: 'Operario de Campo',
        description: 'Trabaja con tareas, ubicaciones e inventario sin acceso a pagos ni ajustes.',
        permissions: {
            stats: [],
            payments: [],
            inventory: ['view', 'create', 'edit'],
            locations: ['view', 'create'],
            tasks: ['view', 'create', 'edit'],
            settings: []
        }
    },
    {
        id: 'inventory_manager',
        label: 'Encargado de Inventario',
        description: 'Controla inventario y ubicaciones, con visibilidad de tareas relacionadas.',
        permissions: {
            stats: ['view'],
            payments: [],
            inventory: ['view', 'create', 'edit', 'delete'],
            locations: ['view', 'create', 'edit'],
            tasks: ['view', 'create', 'edit'],
            settings: []
        }
    },
    {
        id: 'coordinator',
        label: 'Coordinador',
        description: 'Organiza tareas y consulta actividad del equipo sin tocar pagos o ajustes.',
        permissions: {
            stats: ['view'],
            payments: [],
            inventory: ['view'],
            locations: ['view'],
            tasks: ['view', 'create', 'edit', 'delete'],
            settings: []
        }
    },
    {
        id: 'auditor',
        label: 'Auditor',
        description: 'Acceso de solo lectura para revisar información del equipo.',
        permissions: {
            stats: ['view'],
            payments: ['view'],
            inventory: ['view'],
            locations: ['view'],
            tasks: ['view'],
            settings: ['view']
        }
    },
    {
        id: 'assistant',
        label: 'Asistente',
        description: 'Apoyo administrativo con creación de tareas y lectura de módulos clave.',
        permissions: {
            stats: ['view'],
            payments: ['view', 'create'],
            inventory: ['view'],
            locations: ['view'],
            tasks: ['view', 'create', 'edit'],
            settings: ['view']
        }
    }
];

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

export function createRoleTemplatePermissions(templateId) {
    const template = TEAM_PERMISSION_ROLE_TEMPLATES.find((role) => role.id === templateId);
    const permissions = createTeamPermissions(false);

    if (!template) return permissions;

    MODULES.forEach((module) => {
        const enabledActions = template.permissions[module] || [];
        ACTIONS.forEach((action) => {
            permissions[module][action] = enabledActions.includes(action);
        });
    });

    return permissions;
}

function normalizeCustomRoleId(value, fallback = 'rol') {
    const id = String(value || fallback)
        .trim()
        .toLowerCase()
        .normalize('NFD')
        .replace(/[\u0300-\u036f]/g, '')
        .replace(/[^a-z0-9_-]+/g, '-')
        .replace(/^-+|-+$/g, '');
    return id || 'rol';
}

export function createCustomRoleId(label = 'rol', roles = []) {
    const usedIds = new Set(
        (Array.isArray(roles) ? roles : [])
            .map((role) => String(role?.id || '').trim())
            .filter(Boolean)
    );
    const baseId = normalizeCustomRoleId(label);
    let roleId = baseId;
    let counter = 2;

    while (usedIds.has(roleId)) {
        roleId = `${baseId}-${counter}`;
        counter += 1;
    }

    return roleId;
}

export function normalizeCustomTeamRoles(roles = []) {
    if (!Array.isArray(roles)) return [];

    return roles
        .map((role, index) => {
            const label = String(role?.label || role?.name || '').trim();
            if (!label) return null;

            return {
                id: normalizeCustomRoleId(role?.id, `${label}-${index + 1}`),
                label: label.slice(0, 48),
                description: String(role?.description || '').trim().slice(0, 140),
                permissions: normalizeTeamPermissions(role?.permissions),
                createdAt: typeof role?.createdAt === 'string' ? role.createdAt : '',
                updatedAt: typeof role?.updatedAt === 'string' ? role.updatedAt : ''
            };
        })
        .filter(Boolean);
}

export function getTeamRoleTemplates(team = {}) {
    const systemRoles = TEAM_PERMISSION_ROLE_TEMPLATES.map((role) => ({
        id: `system:${role.id}`,
        source: 'system',
        label: role.label,
        description: role.description,
        permissions: createRoleTemplatePermissions(role.id)
    }));
    const customRoles = normalizeCustomTeamRoles(team?.customRoles).map((role) => ({
        ...role,
        id: `custom:${role.id}`,
        source: 'custom'
    }));

    return [...systemRoles, ...customRoles];
}

export function createPermissionsFromTeamRole(roleId, team = {}) {
    const role = getTeamRoleTemplates(team).find((item) => item.id === roleId || item.id.endsWith(`:${roleId}`));
    if (role) return normalizeTeamPermissions(role.permissions);
    return createRoleTemplatePermissions(roleId);
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
