import { describe, expect, it } from 'vitest';
import {
  TEAM_PERMISSION_ACTIONS,
  TEAM_PERMISSION_MODULES,
  createCustomRoleId,
  createDefaultMemberPermissions,
  createPermissionsFromTeamRole,
  createRoleTemplatePermissions,
  createTeamPermissions,
  getMemberPermissions,
  getTeamRoleTemplates,
  hasTeamPermission,
  normalizeCustomTeamRoles,
  normalizeTeamPermissions
} from './permissions.js';

describe('permissions', () => {
  it('crea matrices de permisos completas', () => {
    const permissions = createTeamPermissions(true);

    Object.values(TEAM_PERMISSION_MODULES).forEach((module) => {
      Object.values(TEAM_PERMISSION_ACTIONS).forEach((action) => {
        expect(permissions[module][action]).toBe(true);
      });
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
});
