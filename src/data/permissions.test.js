import { describe, expect, it } from 'vitest';
import {
  TEAM_PERMISSION_ACTIONS,
  TEAM_PERMISSION_LABELS,
  TEAM_PERMISSION_MODULES,
  TEAM_PERMISSION_MODULE_ACTIONS,
  TEAM_EXPENSE_VISIBILITY,
  createCustomRoleId,
  createDefaultMemberPermissions,
  createPermissionsFromTeamRole,
  createRoleTemplatePermissions,
  createTeamPermissions,
  getMemberPermissions,
  getTeamExpenseVisibility,
  getTeamRoleTemplates,
  hasTeamPermission,
  normalizeCustomTeamRoles,
  normalizeTeamPermissions,
  toggleTeamPermission
} from './permissions.js';

describe('permissions', () => {
  it('crea matrices de permisos completas', () => {
    const permissions = createTeamPermissions(true);

    Object.values(TEAM_PERMISSION_MODULES).forEach((module) => {
      TEAM_PERMISSION_MODULE_ACTIONS[module].forEach((action) => {
        expect(permissions[module][action]).toBe(true);
      });
    });
  });

  it('expone en cada módulo solo las acciones que el backend comprueba', () => {
    // Antes todos los módulos mostraban las mismas cinco casillas, así que
    // aparecían opciones inertes como "Eliminar" en estadísticas.
    expect(TEAM_PERMISSION_MODULE_ACTIONS.stats).toEqual(['view', 'edit']);
    expect(TEAM_PERMISSION_MODULE_ACTIONS.ghosts).toEqual(['create', 'control']);
    expect(TEAM_PERMISSION_MODULE_ACTIONS.expenses).toEqual([
      'viewAll',
      'viewOwn',
      'create',
      'edit',
      'delete'
    ]);

    const permissions = createTeamPermissions(true);
    expect(permissions.stats.delete).toBeUndefined();
    expect(permissions.payments.control).toBeUndefined();
    expect(permissions.ghosts.view).toBeUndefined();
  });

  it('mantiene las acciones globales disponibles para los módulos que las usan', () => {
    expect(Object.values(TEAM_PERMISSION_ACTIONS)).toEqual(
      expect.arrayContaining(['view', 'create', 'edit', 'delete', 'control'])
    );
  });

  it('tiene una etiqueta para cada módulo, que es lo que dibuja su recuadro', () => {
    Object.values(TEAM_PERMISSION_MODULES).forEach((module) => {
      expect(TEAM_PERMISSION_LABELS[module]).toBeTruthy();
    });
  });

  it('crea permisos por defecto para miembros con solo tareas visibles', () => {
    const permissions = createDefaultMemberPermissions();

    expect(permissions.tasks.view).toBe(true);
    expect(permissions.tasks.create).toBe(false);
    expect(permissions.payments.view).toBe(false);
    expect(permissions.settings.edit).toBe(false);
  });

  it('normaliza permisos parciales sin filtrar modulos esperados', () => {
    const permissions = normalizeTeamPermissions({
      payments: { view: true, delete: true },
      tasks: { create: true },
      unknown: { view: true }
    });

    expect(permissions.payments.view).toBe(true);
    expect(permissions.payments.delete).toBe(true);
    expect(permissions.tasks.create).toBe(true);
    expect(permissions.tasks.view).toBe(false);
    expect(permissions.unknown).toBeUndefined();
  });

  it('aplica plantillas de rol del sistema', () => {
    const managerPermissions = createRoleTemplatePermissions('manager');
    const operatorPermissions = createRoleTemplatePermissions('field_operator');

    expect(managerPermissions.stats.view).toBe(true);
    expect(managerPermissions.tasks.delete).toBe(true);
    expect(operatorPermissions.inventory.create).toBe(true);
    expect(operatorPermissions.payments.view).toBe(false);
  });

  it('trata al administrador como usuario con todos los permisos', () => {
    const team = {
      admin: 'admin-1',
      memberPermissions: {
        'member-1': {
          tasks: { view: true }
        }
      }
    };

    expect(hasTeamPermission(team, 'admin-1', 'payments', 'delete')).toBe(true);
    expect(getMemberPermissions(team, 'admin-1').settings.delete).toBe(true);
  });

  it('lee permisos explicitamente asignados a miembros', () => {
    const team = {
      admin: 'admin-1',
      memberPermissions: {
        'member-1': normalizeTeamPermissions({
          tasks: { view: true, create: true },
          payments: { view: true }
        })
      }
    };

    expect(hasTeamPermission(team, 'member-1', 'tasks', 'create')).toBe(true);
    expect(hasTeamPermission(team, 'member-1', 'payments', 'create')).toBe(false);
    expect(hasTeamPermission(team, 'member-2', 'tasks', 'view')).toBe(false);
  });

  it('normaliza roles personalizados y genera ids unicos', () => {
    const roles = normalizeCustomTeamRoles([
      {
        id: 'Jefe de Obra',
        label: 'Jefe de Obra',
        description: 'Coordina trabajos',
        permissions: { tasks: { view: true, edit: true } },
        createdAt: '2026-01-01T00:00:00.000Z'
      },
      { label: '' }
    ]);

    expect(roles).toHaveLength(1);
    expect(roles[0].id).toBe('jefe-de-obra');
    expect(roles[0].permissions.tasks.edit).toBe(true);
    expect(createCustomRoleId('Jefe de Obra', roles)).toBe('jefe-de-obra-2');
  });

  it('mezcla roles de sistema y personalizados para crear permisos', () => {
    const team = {
      customRoles: [
        {
          id: 'planner',
          label: 'Planner',
          permissions: normalizeTeamPermissions({
            stats: { view: true },
            tasks: { view: true, create: true }
          })
        }
      ]
    };

    const roleTemplates = getTeamRoleTemplates(team);
    const customPermissions = createPermissionsFromTeamRole('custom:planner', team);

    expect(roleTemplates.some((role) => role.id === 'system:manager')).toBe(true);
    expect(roleTemplates.some((role) => role.id === 'custom:planner')).toBe(true);
    expect(customPermissions.stats.view).toBe(true);
    expect(customPermissions.tasks.create).toBe(true);
    expect(customPermissions.payments.view).toBe(false);
  });

  it('incluye el módulo de fantasmas con la acción de control por defecto en false', () => {
    const permissions = createTeamPermissions(false);

    expect(permissions.ghosts).toBeDefined();
    expect(permissions.ghosts.create).toBe(false);
    expect(permissions.ghosts.control).toBe(false);
  });

  it('otorga control total al administrador del equipo', () => {
    const team = {
      admin: 'admin-1',
      memberPermissions: {}
    };

    expect(hasTeamPermission(team, 'admin-1', 'ghosts', 'control')).toBe(true);
    expect(hasTeamPermission(team, 'admin-1', 'ghosts', 'create')).toBe(true);
    expect(getMemberPermissions(team, 'admin-1').ghosts.control).toBe(true);
  });

  it('respeta los permisos ghosts.create y ghosts.control en miembros', () => {
    const team = {
      admin: 'admin-1',
      memberPermissions: {
        creator: normalizeTeamPermissions({ ghosts: { create: true } }),
        controller: normalizeTeamPermissions({ ghosts: { control: true } }),
        stranger: normalizeTeamPermissions({})
      }
    };

    expect(hasTeamPermission(team, 'creator', 'ghosts', 'create')).toBe(true);
    expect(hasTeamPermission(team, 'creator', 'ghosts', 'control')).toBe(false);
    expect(hasTeamPermission(team, 'controller', 'ghosts', 'control')).toBe(true);
    expect(hasTeamPermission(team, 'stranger', 'ghosts', 'create')).toBe(false);
    expect(hasTeamPermission(team, 'stranger', 'ghosts', 'control')).toBe(false);
  });

  it('incluye el módulo de gastos como una caja separada de la de pagos', () => {
    const permissions = createTeamPermissions(false);

    expect(TEAM_PERMISSION_MODULES.expenses).toBe('expenses');
    expect(TEAM_PERMISSION_LABELS.expenses).toBe('Gastos');
    expect(TEAM_PERMISSION_LABELS.payments).toBe('Pagos');
    expect(permissions.expenses).toBeDefined();
    expect(permissions.expenses.viewAll).toBe(false);
    expect(permissions.expenses.viewOwn).toBe(false);
    expect(permissions.expenses.create).toBe(false);
    expect(permissions.expenses.edit).toBe(false);
    expect(permissions.expenses.delete).toBe(false);
    // La lectura de gastos ya no es una única casilla "ver".
    expect(permissions.expenses.view).toBeUndefined();
  });

  it('permite ver todos los gastos o solo los propios, pero nunca ambos a la vez', () => {
    const team = {
      admin: 'admin-1',
      memberPermissions: {
        'member-1': normalizeTeamPermissions({ expenses: { viewAll: true } })
      }
    };

    expect(hasTeamPermission(team, 'member-1', 'expenses', 'viewAll')).toBe(true);
    expect(hasTeamPermission(team, 'member-1', 'expenses', 'viewOwn')).toBe(false);
    expect(getTeamExpenseVisibility(team, 'member-1')).toBe(TEAM_EXPENSE_VISIBILITY.all);

    const own = toggleTeamPermission(
      normalizeTeamPermissions({ expenses: { viewAll: true } }),
      'expenses',
      'viewOwn'
    );

    expect(own.expenses.viewOwn).toBe(true);
    expect(own.expenses.viewAll).toBe(false);
  });

  it('deja sin acceso al listado de gastos a quien solo puede crearlos', () => {
    const team = {
      admin: 'admin-1',
      memberPermissions: {
        'member-1': normalizeTeamPermissions({ expenses: { create: true } })
      }
    };

    expect(hasTeamPermission(team, 'member-1', 'expenses', 'viewAll')).toBe(false);
    expect(hasTeamPermission(team, 'member-1', 'expenses', 'viewOwn')).toBe(false);
    expect(hasTeamPermission(team, 'member-1', 'expenses', 'create')).toBe(true);
    expect(getTeamExpenseVisibility(team, 'member-1')).toBe(TEAM_EXPENSE_VISIBILITY.none);
  });

  it('calcula el alcance de gastos del propio y del administrador', () => {
    const team = {
      admin: 'admin-1',
      memberPermissions: {
        'member-1': normalizeTeamPermissions({ expenses: { viewOwn: true } })
      }
    };

    expect(getTeamExpenseVisibility(team, 'member-1')).toBe(TEAM_EXPENSE_VISIBILITY.own);
    expect(getTeamExpenseVisibility(team, 'admin-1')).toBe(TEAM_EXPENSE_VISIBILITY.all);
    expect(getTeamExpenseVisibility(team, 'member-2')).toBe(TEAM_EXPENSE_VISIBILITY.none);
  });

  it('hereda los gastos de pagos en equipos creados antes de separarlos', () => {
    const team = {
      admin: 'admin-1',
      memberPermissions: {
        'member-1': {
          payments: { view: true, create: true, edit: false, delete: false }
        }
      }
    };

    expect(hasTeamPermission(team, 'member-1', 'expenses', 'view')).toBe(true);
    expect(hasTeamPermission(team, 'member-1', 'expenses', 'viewAll')).toBe(true);
    expect(hasTeamPermission(team, 'member-1', 'expenses', 'create')).toBe(true);
    expect(hasTeamPermission(team, 'member-1', 'expenses', 'edit')).toBe(false);
    expect(hasTeamPermission(team, 'member-1', 'expenses', 'delete')).toBe(false);
  });

  it('muestra el estado efectivo de gastos heredado al normalizar permisos antiguos', () => {
    const permissions = normalizeTeamPermissions({
      payments: { view: true, create: true }
    });

    expect(permissions.expenses.viewAll).toBe(true);
    expect(permissions.expenses.viewOwn).toBe(false);
    expect(permissions.expenses.create).toBe(true);
    expect(permissions.expenses.edit).toBe(false);
    expect(permissions.expenses.delete).toBe(false);
  });

  it('convierte la antigua casilla "ver" de gastos en "ver todos"', () => {
    const permissions = normalizeTeamPermissions({
      expenses: { view: true, create: true }
    });

    expect(permissions.expenses.viewAll).toBe(true);
    expect(permissions.expenses.viewOwn).toBe(false);
    expect(permissions.expenses.create).toBe(true);
  });

  it('deja el módulo de gastos explícito mandar sobre el de pagos', () => {
    const team = {
      admin: 'admin-1',
      memberPermissions: {
        // Miembro con pagos pero sin gastos: el permiso explícito lo desactiva.
        sinGastos: normalizeTeamPermissions({
          payments: { view: true, create: true },
          expenses: { viewAll: false, create: false }
        }),
        // Miembro con gastos pero sin pagos.
        soloGastos: normalizeTeamPermissions({
          payments: { view: false, create: false },
          expenses: { viewAll: true, create: true }
        })
      }
    };

    expect(hasTeamPermission(team, 'sinGastos', 'expenses', 'view')).toBe(false);
    expect(hasTeamPermission(team, 'sinGastos', 'expenses', 'viewAll')).toBe(false);
    expect(hasTeamPermission(team, 'sinGastos', 'expenses', 'create')).toBe(false);
    expect(hasTeamPermission(team, 'sinGastos', 'payments', 'view')).toBe(true);

    expect(hasTeamPermission(team, 'soloGastos', 'expenses', 'view')).toBe(true);
    expect(hasTeamPermission(team, 'soloGastos', 'expenses', 'viewAll')).toBe(true);
    expect(hasTeamPermission(team, 'soloGastos', 'expenses', 'create')).toBe(true);
    expect(hasTeamPermission(team, 'soloGastos', 'payments', 'view')).toBe(false);
  });

  it('incluye los gastos en las plantillas de rol con acceso a pagos', () => {
    expect(createRoleTemplatePermissions('manager').expenses.viewAll).toBe(true);
    expect(createRoleTemplatePermissions('manager').expenses.delete).toBe(false);
    expect(createRoleTemplatePermissions('accountant').expenses.delete).toBe(true);
    expect(createRoleTemplatePermissions('auditor').expenses.viewAll).toBe(true);
    expect(createRoleTemplatePermissions('field_operator').expenses.viewAll).toBe(false);
    expect(createRoleTemplatePermissions('field_operator').expenses.viewOwn).toBe(false);
  });
});
