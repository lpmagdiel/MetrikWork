import { beforeEach, describe, expect, it, vi } from 'vitest';
import { render, fireEvent, cleanup } from '@testing-library/svelte';

import TeamPermissionMatrix from './TeamPermissionMatrix.svelte';
import {
    createTeamPermissions,
    getTeamPermissionActionLabel,
    getTeamPermissionModuleActions
} from '../data/permissions.js';

function getRow(container, moduleLabel) {
    const rows = [...container.querySelectorAll('.permission-row')];
    return rows.find((row) => row.querySelector('.permission-module')?.textContent.trim() === moduleLabel);
}

function getToggleLabels(row) {
    return [...row.querySelectorAll('.permission-toggle span')].map((node) => node.textContent.trim());
}

describe('TeamPermissionMatrix', () => {
    beforeEach(() => {
        cleanup();
        vi.clearAllMocks();
    });

    it('muestra en gastos la vista de todos y la de propios en lugar de "ver"', () => {
        const permissions = createTeamPermissions(false);
        const { container } = render(TeamPermissionMatrix, { props: { permissions } });

        const expensesRow = getRow(container, 'Gastos');
        const labels = getToggleLabels(expensesRow);

        expect(labels).toContain('Ver todos los gastos');
        expect(labels).toContain('Ver gastos propios');
        expect(labels).not.toContain('Ver');
    });

    it('muestra en cada módulo solo las acciones que aplican', () => {
        const permissions = createTeamPermissions(false);
        const { container } = render(TeamPermissionMatrix, { props: { permissions } });

        expect(getToggleLabels(getRow(container, 'Estadísticas'))).toEqual(['Ver', 'Editar']);
        expect(getToggleLabels(getRow(container, 'Fantasmas'))).toEqual(['Crear', 'Controlar']);
        expect(getToggleLabels(getRow(container, 'Tareas'))).toEqual([
            'Ver',
            'Crear',
            'Editar',
            'Eliminar'
        ]);
    });

    it('integra la visibilidad de tareas dentro de la fila de tareas', async () => {
        const permissions = createTeamPermissions(false);
        const onTasksVisibilityChange = vi.fn();
        const { container } = render(TeamPermissionMatrix, {
            props: {
                permissions,
                showTasksVisibility: true,
                tasksVisibility: 'all',
                onTasksVisibilityChange
            }
        });

        const tasksRow = getRow(container, 'Tareas');
        const radios = tasksRow.querySelectorAll('input[type="radio"]');

        expect(radios.length).toBe(2);
        expect(radios[0].checked).toBe(true);
        expect(radios[1].checked).toBe(false);

        await fireEvent.click(radios[1]);
        expect(onTasksVisibilityChange).toHaveBeenCalledWith('own');
    });

    it('avisa del cambio de una casilla con el módulo y la acción', async () => {
        const permissions = createTeamPermissions(false);
        const onToggle = vi.fn();
        const { container } = render(TeamPermissionMatrix, { props: { permissions, onToggle } });

        const expensesRow = getRow(container, 'Gastos');
        const checkbox = expensesRow.querySelector('input[type="checkbox"]');

        await fireEvent.click(checkbox);

        expect(onToggle).toHaveBeenCalledWith('expenses', 'viewAll');
    });

    it('deshabilita las casillas cuando el menú es de solo lectura', () => {
        const permissions = createTeamPermissions(false);
        const { container } = render(TeamPermissionMatrix, {
            props: { permissions, disabled: true }
        });

        const checkboxes = container.querySelectorAll('input[type="checkbox"]');
        expect(checkboxes.length).toBeGreaterThan(0);
        checkboxes.forEach((checkbox) => expect(checkbox.disabled).toBe(true));
    });

    it('expone las etiquetas y acciones por módulo', () => {
        expect(getTeamPermissionModuleActions('expenses')).toEqual([
            'viewAll',
            'viewOwn',
            'create',
            'edit',
            'delete'
        ]);
        expect(getTeamPermissionActionLabel('expenses', 'viewAll')).toBe('Ver todos los gastos');
        expect(getTeamPermissionActionLabel('expenses', 'viewOwn')).toBe('Ver gastos propios');
        expect(getTeamPermissionActionLabel('tasks', 'view')).toBe('Ver');
    });
});
