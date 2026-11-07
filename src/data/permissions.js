export const TEAM_PERMISSION_MODULES = {
    stats: 'stats',
    payments: 'payments',
    expenses: 'expenses',
    inventory: 'inventory',
    locations: 'locations',
    tasks: 'tasks',
    settings: 'settings',
    ghosts: 'ghosts'
};

export const TEAM_PERMISSION_ACTIONS = {
    view: 'view',
    create: 'create',
    edit: 'edit',
    delete: 'delete',
    control: 'control'
};

// Acciones de lectura con alcance: permiten ver una parte concreta del
// módulo en lugar de todo su contenido.
export const TEAM_PERMISSION_SCOPED_VIEW_ACTIONS = {
    viewAll: 'viewAll',
    viewOwn: 'viewOwn'
};

export const TEAM_PERMISSION_LABELS = {
    stats: 'Estadísticas',
    payments: 'Pagos',
    expenses: 'Gastos',
    inventory: 'Inventario',
    locations: 'Ubicaciones',
    tasks: 'Tareas',
    settings: 'Ajustes',
    ghosts: 'Fantasmas'
};

export const TEAM_PERMISSION_ACTION_LABELS = {
    view: 'Ver',
    create: 'Crear',
    edit: 'Editar',
    delete: 'Eliminar',
    control: 'Controlar',
    viewAll: 'Ver todos',
    viewOwn: 'Ver propios'
};

/**
 * Acciones que tienen efecto real en cada módulo.
 *
 * Antes todos los módulos mostraban las mismas cinco casillas (ver, crear,
 * editar, eliminar y controlar), así que aparecían opciones sin sentido
 * como "Eliminar" en estadísticas o "Controlar" en pagos. Ahora cada módulo
 * expone únicamente las acciones que el backend comprueba.
 */
export const TEAM_PERMISSION_MODULE_ACTIONS = {
    stats: ['view', 'edit'],
    payments: ['view', 'create', 'edit', 'delete'],
    expenses: ['viewAll', 'viewOwn', 'create', 'edit', 'delete'],
    inventory: ['view', 'create', 'edit', 'delete'],
    locations: ['view', 'create', 'edit', 'delete'],
    tasks: ['view', 'create', 'edit', 'delete'],
    settings: ['view', 'create', 'edit', 'delete'],
    ghosts: ['create', 'control']
};

/**
 * Ayuda de cada acción para explicar qué se consigue al activarla.
 */
export const TEAM_PERMISSION_ACTION_HINTS = {
    stats: {
        edit: 'Permite modificar el presupuesto del equipo'
    },
    expenses: {
        viewAll: 'Permite ver todos los gastos del equipo',
        viewOwn: 'Permite ver solo los gastos que ha creado el miembro'
    },
    ghosts: {
        create: 'Permite crear fantasmas en el equipo',
        control: 'Permite registrar y gestionar las jornadas de los fantasmas'
    }
};

/**
 * Visibilidad del libro de gastos de un miembro.
 */
export const TEAM_EXPENSE_VISIBILITY = {
    all: 'all',
    own: 'own',
    none: 'none'
};

const MODULES = Object.values(TEAM_PERMISSION_MODULES);

export function getTeamPermissionModuleActions(module) {
    return TEAM_PERMISSION_MODULE_ACTIONS[module] || [];
}

/**
 * Etiqueta de una acción concreta de un módulo.
 * Los gastos usan textos propios porque "Ver" no aclara el alcance.
 */
export function getTeamPermissionActionLabel(module, action) {
    if (module === 'expenses' && action === 'viewAll') return 'Ver todos los gastos';
    if (module === 'expenses' && action === 'viewOwn') return 'Ver gastos propios';
    return TEAM_PERMISSION_ACTION_LABELS[action] || action;
}

export function getTeamPermissionActionHint(module, action) {
    return TEAM_PERMISSION_ACTION_HINTS[module]?.[action] || '';
}

export const TEAM_PERMISSION_ROLE_TEMPLATES = [
    {
        id: 'manager',
        label: 'Manager',
        description: 'Supervisa operaciones, tareas, pagos, gastos, reportes y ajustes sin eliminar datos sensibles.',
        permissions: {
            stats: ['view'],
            payments: ['view', 'create', 'edit'],
            expenses: ['viewAll', 'create', 'edit'],
            inventory: ['view', 'create', 'edit'],
            locations: ['view'],
            tasks: ['view', 'create', 'edit', 'delete'],
            settings: ['view', 'create', 'edit'],
            ghosts: []
        }
    },
    {
        id: 'accountant',
        label: 'Contador',
        description: 'Gestiona pagos y gastos, y consulta reportes financieros con acceso operativo limitado.',
        permissions: {
            stats: ['view'],
            payments: ['view', 'create', 'edit', 'delete'],
            expenses: ['viewAll', 'create', 'edit', 'delete'],
            inventory: ['view'],
            locations: [],
            tasks: ['view'],
            settings: ['view'],
            ghosts: []
        }
    },
    {
        id: 'field_operator',
        label: 'Operario de Campo',
        description: 'Trabaja con tareas, ubicaciones e inventario sin acceso a pagos, gastos ni ajustes.',
        permissions: {
            stats: [],
            payments: [],
            expenses: [],
            inventory: ['view', 'create', 'edit'],
            locations: ['view', 'create'],
            tasks: ['view', 'create', 'edit'],
            settings: [],
            ghosts: []
        }
    },
    {
        id: 'inventory_manager',
        label: 'Encargado de Inventario',
        description: 'Controla inventario y ubicaciones, con visibilidad de tareas relacionadas.',
        permissions: {
            stats: ['view'],
            payments: [],
            expenses: [],
            inventory: ['view', 'create', 'edit', 'delete'],
            locations: ['view', 'create', 'edit'],
            tasks: ['view', 'create', 'edit'],
            settings: [],
            ghosts: []
        }
    },
    {
        id: 'coordinator',
        label: 'Coordinador',
        description: 'Organiza tareas y consulta actividad del equipo sin tocar pagos, gastos o ajustes.',
        permissions: {
            stats: ['view'],
            payments: [],
            expenses: [],
            inventory: ['view'],
            locations: ['view'],
            tasks: ['view', 'create', 'edit', 'delete'],
            settings: [],
            ghosts: []
        }
    },
    {
        id: 'auditor',
        label: 'Auditor',
        description: 'Acceso de solo lectura para revisar información del equipo.',
        permissions: {
            stats: ['view'],
            payments: ['view'],
            expenses: ['viewAll'],
            inventory: ['view'],
            locations: ['view'],
            tasks: ['view'],
            settings: ['view'],
            ghosts: []
        }
    },
    {
        id: 'assistant',
        label: 'Asistente',
        description: 'Apoyo administrativo con creación de tareas y lectura de módulos clave.',
        permissions: {
            stats: ['view'],
            payments: ['view', 'create'],
            expenses: ['viewAll', 'create'],
            inventory: ['view'],
            locations: ['view'],
            tasks: ['view', 'create', 'edit'],
            settings: ['view'],
            ghosts: []
        }
    }
];

export function createTeamPermissions(enabled = false) {
    return MODULES.reduce((permissions, module) => {
        permissions[module] = getTeamPermissionModuleActions(module).reduce((actions, action) => {
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
        getTeamPermissionModuleActions(module).forEach((action) => {
            permissions[module][action] = enabledActions.includes(action);
        });
    });

    return permissions;
}

/**
 * Alterna un permiso y devuelve la matriz actualizada.
 *
 * "Ver todos los gastos" y "Ver gastos propios" son excluyentes: ver todos
 * ya incluye los propios, así que activar uno desactiva el otro.
 */
export function toggleTeamPermission(permissions = {}, module, action) {
    const modulePermissions = permissions?.[module] || {};
    const isEnabled = Boolean(modulePermissions[action]);
    const nextModule = { ...modulePermissions, [action]: !isEnabled };

    if (module === 'expenses') {
        if (action === 'viewAll' && !isEnabled) nextModule.viewOwn = false;
        if (action === 'viewOwn' && !isEnabled) nextModule.viewAll = false;
    }

    return {
        ...permissions,
        [module]: nextModule
    };
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
        getTeamPermissionModuleActions(module).forEach((action) => {
            normalized[module][action] = Boolean(permissions?.[module]?.[action]);
        });
    });

    return applyLegacyExpensesFallback(normalized, permissions);
}

/**
 * Compatibilidad con los equipos creados antes de que los gastos tuvieran su
 * propio módulo de permisos y antes de separar la vista del equipo.
 *
 * - Mientras un miembro no tenga guardado el módulo "expenses" se hereda
 *   desde "pagos", de forma que separar los permisos no revoca los accesos
 *   de golpe. En cuanto se guardan los permisos del miembro, el módulo
 *   "expenses" ya existe y deja de aplicarse esta herencia.
 * - Los gastos guardados con la antigua acción "view" (una sola casilla)
 *   equivalen a "viewAll": ver todos los gastos del equipo.
 */
function applyLegacyExpensesFallback(normalized = {}, source = {}) {
    if (!normalized.expenses) return normalized;

    const expensesSource = source?.expenses;
    if (expensesSource && typeof expensesSource === 'object') {
        const hasScopedView = 'viewAll' in expensesSource || 'viewOwn' in expensesSource;
        if (!hasScopedView && 'view' in expensesSource) {
            normalized.expenses.viewAll = Boolean(expensesSource.view);
        }
        return normalized;
    }

    const paymentsSource = source?.payments;
    if (!paymentsSource) return normalized;

    normalized.expenses.viewAll = Boolean(paymentsSource.view || paymentsSource.viewAll);
    normalized.expenses.viewOwn = Boolean(paymentsSource.viewOwn);
    normalized.expenses.create = Boolean(paymentsSource.create);
    normalized.expenses.edit = Boolean(paymentsSource.edit);
    normalized.expenses.delete = Boolean(paymentsSource.delete);

    return normalized;
}

/**
 * Resuelve el valor de una acción dentro de un módulo ya guardado,
 * teniendo en cuenta la antigua casilla "view" de los gastos.
 */
function resolveModulePermission(modulePermissions = {}, module, action) {
    if (module !== 'expenses') return Boolean(modulePermissions[action]);

    if (action === 'view' || action === 'viewAll') {
        if ('viewAll' in modulePermissions) return Boolean(modulePermissions.viewAll);
        if ('view' in modulePermissions) return Boolean(modulePermissions.view);
        return false;
    }

    if (action === 'viewOwn') {
        if ('viewOwn' in modulePermissions) return Boolean(modulePermissions.viewOwn);
        return false;
    }

    return Boolean(modulePermissions[action]);
}

export function getMemberPermissions(team, uid) {
    if (!team || !uid) return createTeamPermissions(false);
    if (team.admin === uid) return createTeamPermissions(true);
    return normalizeTeamPermissions(team.memberPermissions?.[uid]);
}

export function hasTeamPermission(team, uid, module, action = 'view') {
    if (!team || !uid) return false;
    if (team.admin === uid) return true;

    const memberPermissions = team.memberPermissions?.[uid] || {};
    const modulePermissions = memberPermissions[module];

    if (modulePermissions) {
        return resolveModulePermission(modulePermissions, module, action);
    }

    // Los gastos heredan del permiso de pagos mientras el miembro no tenga
    // guardado su propio módulo (equipos anteriores a la separación).
    if (module === 'expenses' && !memberPermissions.expenses) {
        const paymentsPermissions = memberPermissions.payments || {};
        if (action === 'view' || action === 'viewAll') {
            return Boolean(paymentsPermissions.view || paymentsPermissions.viewAll);
        }
        if (action === 'viewOwn') return Boolean(paymentsPermissions.viewOwn);
        return Boolean(paymentsPermissions[action]);
    }

    return false;
}

/**
 * Alcance con el que un miembro puede consultar el libro de gastos:
 * "all" (todos los gastos), "own" (solo los propios) o "none" (no puede
 * ver el listado, aunque sí puede registrar gastos).
 */
export function getTeamExpenseVisibility(team, uid) {
    if (!team || !uid) return TEAM_EXPENSE_VISIBILITY.none;
    if (team.admin === uid) return TEAM_EXPENSE_VISIBILITY.all;
    if (hasTeamPermission(team, uid, 'expenses', 'viewAll')) return TEAM_EXPENSE_VISIBILITY.all;
    if (hasTeamPermission(team, uid, 'expenses', 'viewOwn')) return TEAM_EXPENSE_VISIBILITY.own;
    return TEAM_EXPENSE_VISIBILITY.none;
}
