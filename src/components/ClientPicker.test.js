import { beforeEach, describe, expect, it, vi } from 'vitest';
import { render, fireEvent, cleanup } from '@testing-library/svelte';

const clientsStoreMock = vi.hoisted(() => ({
    subscribe: vi.fn((fn) => {
        fn([]);
        return () => {};
    })
}));

vi.mock('../data/clients.js', () => ({
    teamClientsStore: clientsStoreMock,
    searchClients: vi.fn((clients, term, options = {}) => {
        const list = Array.isArray(clients) ? clients : [];
        const filtered = options.includeInactive ? list : list.filter((c) => c.active !== false);
        if (!term) return filtered;
        const needle = term.toLowerCase();
        return filtered.filter((c) => (c.name || '').toLowerCase().includes(needle));
    })
}));

import ClientPicker from './ClientPicker.svelte';

const SAMPLE_CLIENTS = [
    { id: 'c1', name: 'Construcciones Pérez', taxId: 'B111', email: 'perez@construcciones.com' },
    { id: 'c2', name: 'Reformas García', taxId: 'B222', email: 'garcia@reformas.com' },
    { id: 'c3', name: 'Cliente Inactivo', taxId: 'B333', email: 'inactivo@x.com', active: false }
];

describe('ClientPicker', () => {
    beforeEach(() => {
        cleanup();
        vi.clearAllMocks();
        clientsStoreMock.subscribe.mockImplementation((fn) => {
            fn(SAMPLE_CLIENTS);
            return () => {};
        });
    });

    it('renderiza el input con placeholder', () => {
        const { getByPlaceholderText, container } = render(ClientPicker, {
            props: { clients: SAMPLE_CLIENTS }
        });

        expect(getByPlaceholderText(/buscar cliente/i)).toBeTruthy();
        expect(container.querySelector('[role="combobox"]')).toBeTruthy();
    });

    it('abre el dropdown al recibir foco y muestra clientes', async () => {
        const { container, getByPlaceholderText } = render(ClientPicker, {
            props: { clients: SAMPLE_CLIENTS }
        });

        const input = getByPlaceholderText(/buscar cliente/i);
        await fireEvent.focus(input);

        const listbox = container.querySelector('[role="listbox"]');
        expect(listbox).toBeTruthy();
        expect(container.querySelectorAll('[role="option"]').length).toBeGreaterThan(0);
    });

    it('llama a onSelect al hacer click en un cliente', async () => {
        const onSelect = vi.fn();
        const { container, getByPlaceholderText } = render(ClientPicker, {
            props: { clients: SAMPLE_CLIENTS, onSelect }
        });

        const input = getByPlaceholderText(/buscar cliente/i);
        await fireEvent.focus(input);

        const options = container.querySelectorAll('[role="option"]');
        // options[0] debería ser el primer cliente
        await fireEvent.click(options[0]);
        expect(onSelect).toHaveBeenCalledTimes(1);
        expect(onSelect.mock.calls[0][0].id).toBe('c1');
    });

    it('muestra la opción "Crear cliente" cuando el texto no coincide', async () => {
        const onCreateNew = vi.fn();
        const { container, getByPlaceholderText } = render(ClientPicker, {
            props: { clients: SAMPLE_CLIENTS, onCreateNew }
        });

        const input = getByPlaceholderText(/buscar cliente/i);
        await fireEvent.input(input, { target: { value: 'zzz no existe' } });
        // Esperar al debounce.
        await new Promise((resolve) => setTimeout(resolve, 220));
        await fireEvent.focus(input);

        const options = container.querySelectorAll('[role="option"]');
        const createOption = Array.from(options).find((opt) =>
            opt.textContent?.toLowerCase().includes('crear cliente')
        );
        expect(createOption).toBeTruthy();
    });

    it('NO muestra la opción crear cuando allowCreate es false', async () => {
        const { container, getByPlaceholderText } = render(ClientPicker, {
            props: { clients: SAMPLE_CLIENTS, allowCreate: false }
        });

        const input = getByPlaceholderText(/buscar cliente/i);
        await fireEvent.input(input, { target: { value: 'inexistente' } });
        await new Promise((resolve) => setTimeout(resolve, 220));
        await fireEvent.focus(input);

        const options = Array.from(container.querySelectorAll('[role="option"]'));
        const createOption = options.find((opt) =>
            opt.textContent?.toLowerCase().includes('crear cliente')
        );
        expect(createOption).toBeFalsy();
    });

    it('muestra cliente seleccionado y permite limpiarlo', async () => {
        const onClear = vi.fn();
        const selectedClient = SAMPLE_CLIENTS[0];

        const { container, getByText } = render(ClientPicker, {
            props: { clients: SAMPLE_CLIENTS, selectedClient, onClear }
        });

        // El nombre del cliente seleccionado debe aparecer visible.
        expect(getByText('Construcciones Pérez')).toBeTruthy();

        const clearBtn = container.querySelector('[aria-label*="Quitar"]');
        expect(clearBtn).toBeTruthy();
        await fireEvent.click(clearBtn);
        expect(onClear).toHaveBeenCalledTimes(1);
    });

    it('no abre el dropdown cuando está disabled', async () => {
        const { container, getByPlaceholderText } = render(ClientPicker, {
            props: { clients: SAMPLE_CLIENTS, disabled: true }
        });

        const input = getByPlaceholderText(/buscar cliente/i);
        await fireEvent.focus(input);

        const listbox = container.querySelector('[role="listbox"]');
        expect(listbox).toBeFalsy();
    });

    it('maneja la tecla Enter para seleccionar la opción destacada', async () => {
        const onSelect = vi.fn();
        const { container, getByPlaceholderText } = render(ClientPicker, {
            props: { clients: SAMPLE_CLIENTS, onSelect }
        });

        const input = getByPlaceholderText(/buscar cliente/i);
        await fireEvent.focus(input);
        await fireEvent.keyDown(input, { key: 'ArrowDown' });
        await fireEvent.keyDown(input, { key: 'Enter' });

        expect(onSelect).toHaveBeenCalledTimes(1);
        expect(onSelect.mock.calls[0][0].id).toBe('c1');
    });

    it('cierra el dropdown con Escape', async () => {
        const { container, getByPlaceholderText } = render(ClientPicker, {
            props: { clients: SAMPLE_CLIENTS }
        });

        const input = getByPlaceholderText(/buscar cliente/i);
        await fireEvent.focus(input);
        expect(container.querySelector('[role="listbox"]')).toBeTruthy();

        await fireEvent.keyDown(input, { key: 'Escape' });
        expect(container.querySelector('[role="listbox"]')).toBeFalsy();
    });

    it('muestra mensaje vacío cuando no hay coincidencias', async () => {
        const { container, getByPlaceholderText } = render(ClientPicker, {
            props: { clients: SAMPLE_CLIENTS, allowCreate: false }
        });

        const input = getByPlaceholderText(/buscar cliente/i);
        await fireEvent.input(input, { target: { value: 'zzzzz' } });
        await new Promise((resolve) => setTimeout(resolve, 220));
        await fireEvent.focus(input);

        const empty = container.querySelector('.picker-empty');
        expect(empty?.textContent?.toLowerCase()).toContain('sin coincidencias');
    });
});