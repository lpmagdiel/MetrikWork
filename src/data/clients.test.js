import { beforeEach, describe, expect, it, vi } from 'vitest';

const firestoreMocks = vi.hoisted(() => ({
    addDoc: vi.fn(),
    collection: vi.fn((_db, ...segments) => segments.join('/')),
    deleteDoc: vi.fn(),
    doc: vi.fn((_db, ...segments) => segments.join('/')),
    getDocs: vi.fn(),
    onSnapshot: vi.fn(),
    query: vi.fn((value) => value),
    updateDoc: vi.fn(),
    where: vi.fn()
}));

vi.mock('firebase/firestore', () => ({
    addDoc: firestoreMocks.addDoc,
    collection: firestoreMocks.collection,
    deleteDoc: firestoreMocks.deleteDoc,
    doc: firestoreMocks.doc,
    getDocs: firestoreMocks.getDocs,
    onSnapshot: firestoreMocks.onSnapshot,
    query: firestoreMocks.query,
    updateDoc: firestoreMocks.updateDoc,
    where: firestoreMocks.where
}));

vi.mock('./firebase.js', () => ({ db: {} }));

import {
    addCompanyClient,
    companyClientsStore,
    deleteCompanyClient,
    findClientsByTaxId,
    normalizeClient,
    resetClientStore,
    searchClients,
    setCompanyClientActive,
    subscribeToCompanyClients,
    updateCompanyClient,
    validateClient
} from './clients.js';
import { get } from 'svelte/store';

describe('clients normalization and validation', () => {
    it('normaliza textos vacíos, espacios y emails', () => {
        const result = normalizeClient({
            name: '  Cliente Demo  ',
            taxId: ' B12345678 ',
            email: 'CLIENTE@DEMO.COM',
            phone: '+34 600 123 456',
            address: 'Calle Mayor 1',
            contactName: ' Juan ',
            notes: ' nota importante ',
            active: 'false'
        });

        expect(result.name).toBe('Cliente Demo');
        expect(result.taxId).toBe('B12345678');
        expect(result.email).toBe('cliente@demo.com');
        expect(result.phone).toBe('+34 600 123 456');
        expect(result.contactName).toBe('Juan');
        expect(result.active).toBe(false);
    });

    it('mantiene emails malformados tal cual para permitir corrección manual', () => {
        const result = normalizeClient({ email: 'no-es-email' });
        expect(result.email).toBe('no-es-email');
    });

    it('rechaza clientes sin nombre o con emails malformados', () => {
        expect(validateClient({ name: '' }).length).toBeGreaterThan(0);
        expect(validateClient({ name: 'A' }).length).toBeGreaterThan(0);
        expect(validateClient({ name: 'Cliente', email: 'no-es-email' }).length).toBeGreaterThan(0);
        expect(validateClient({ name: 'Cliente', email: 'ok@demo.com' })).toEqual([]);
    });

    it('trunca campos que excedan los límites de longitud', () => {
        const longName = 'a'.repeat(200);
        const result = normalizeClient({ name: longName });
        expect(result.name.length).toBe(120);
    });
});

describe('clients CRUD', () => {
    beforeEach(() => {
        resetClientStore();
        vi.clearAllMocks();
        firestoreMocks.addDoc.mockResolvedValue({ id: 'client-1' });
        firestoreMocks.updateDoc.mockResolvedValue();
        firestoreMocks.deleteDoc.mockResolvedValue();
        firestoreMocks.getDocs.mockResolvedValue({ docs: [] });
        firestoreMocks.onSnapshot.mockImplementation(() => vi.fn());
    });

    it('crea un cliente en la colección top-level con trazabilidad del autor', async () => {
        const id = await addCompanyClient({
            name: 'Constructora ACME',
            taxId: 'B12345678',
            email: 'contacto@acme.com'
        }, { uid: 'user-1', name: 'Ana' });

        expect(id).toBe('client-1');
        expect(firestoreMocks.addDoc).toHaveBeenCalledWith(
            'clients',
            expect.objectContaining({
                name: 'Constructora ACME',
                taxId: 'B12345678',
                email: 'contacto@acme.com',
                active: true,
                createdBy: 'user-1',
                createdByName: 'Ana'
            })
        );
    });

    it('rechaza crear cliente sin nombre válido', async () => {
        await expect(addCompanyClient({ name: '' }, { uid: 'u' }))
            .rejects.toThrow(/obligatorio/i);
        await expect(addCompanyClient({ name: 'A' }, { uid: 'u' }))
            .rejects.toThrow(/mínimo 2 caracteres/i);
        expect(firestoreMocks.addDoc).not.toHaveBeenCalled();
    });

    it('actualiza un cliente en la colección top-level', async () => {
        await updateCompanyClient('client-1', {
            name: 'Nuevo Nombre',
            email: 'nuevo@cliente.com'
        });

        expect(firestoreMocks.updateDoc).toHaveBeenCalledWith(
            'clients/client-1',
            expect.objectContaining({
                name: 'Nuevo Nombre',
                email: 'nuevo@cliente.com',
                updatedAt: expect.any(String)
            })
        );
    });

    it('rechaza actualizar sin clientId', async () => {
        await expect(updateCompanyClient('', { name: 'X' }))
            .rejects.toThrow(/no válido/i);
        expect(firestoreMocks.updateDoc).not.toHaveBeenCalled();
    });

    it('elimina cliente únicamente con datos válidos', async () => {
        await deleteCompanyClient('');
        expect(firestoreMocks.deleteDoc).not.toHaveBeenCalled();

        await deleteCompanyClient('client-1');
        expect(firestoreMocks.deleteDoc).toHaveBeenCalledWith('clients/client-1');
    });

    it('marca un cliente como activo/inactivo', async () => {
        await setCompanyClientActive('client-1', false);
        expect(firestoreMocks.updateDoc).toHaveBeenCalledWith(
            'clients/client-1',
            expect.objectContaining({ active: false })
        );
    });
});

describe('clients subscriptions and search', () => {
    beforeEach(() => {
        resetClientStore();
        vi.clearAllMocks();
        firestoreMocks.onSnapshot.mockImplementation(() => vi.fn());
    });

    it('inicia el listener y alimenta el store', () => {
        firestoreMocks.onSnapshot.mockImplementation((_ref, onNext) => {
            onNext({
                docs: [
                    { id: 'c2', data: () => ({ name: 'Zeta', active: false }) },
                    { id: 'c1', data: () => ({ name: 'Alpha', active: true }) }
                ]
            });
            return vi.fn();
        });

        const stop = subscribeToCompanyClients();
        const clients = get(companyClientsStore);

        expect(firestoreMocks.onSnapshot).toHaveBeenCalledWith(
            'clients',
            expect.any(Function),
            expect.any(Function)
        );
        expect(clients).toHaveLength(2);
        expect(clients[0].id).toBe('c1');
        expect(clients[1].id).toBe('c2');
        stop();
    });

    it('limpia el store en caso de error del listener', () => {
        firestoreMocks.onSnapshot.mockImplementation((_ref, _onNext, onError) => {
            onError(new Error('permission-denied'));
            return vi.fn();
        });

        const stop = subscribeToCompanyClients();
        expect(get(companyClientsStore)).toEqual([]);
        stop();
    });

    it('cancela la suscripción anterior al llamar de nuevo', () => {
        const unsub1 = vi.fn();
        const unsub2 = vi.fn();
        firestoreMocks.onSnapshot
            .mockReturnValueOnce(unsub1)
            .mockReturnValueOnce(unsub2);

        subscribeToCompanyClients();
        const stop = subscribeToCompanyClients();

        expect(unsub1).toHaveBeenCalledOnce();
        expect(get(companyClientsStore)).toEqual([]);
        stop();
    });

    it('busca por múltiples campos ignorando acentos y mayúsculas', () => {
        const clients = [
            { name: 'Construcciones Pérez', taxId: 'B111', email: 'a@a.com' },
            { name: 'Reformas García', taxId: 'B222', email: 'b@b.com' },
            { name: 'Otro', phone: '+34 666' }
        ];

        expect(searchClients(clients, 'perez')).toHaveLength(1);
        expect(searchClients(clients, 'GARCIA')).toHaveLength(1);
        expect(searchClients(clients, '666')).toHaveLength(1);
        expect(searchClients(clients, 'xyz')).toHaveLength(0);
        expect(searchClients(clients, '')).toHaveLength(3);
    });

    it('excluye inactivos cuando se solicita', () => {
        const clients = [
            { name: 'A', active: true },
            { name: 'B', active: false }
        ];
        expect(searchClients(clients, '', { includeInactive: false })).toHaveLength(1);
        expect(searchClients(clients, '', { includeInactive: true })).toHaveLength(2);
    });

    it('busca por NIF/CIF en Firestore cuando se pide', async () => {
        firestoreMocks.getDocs.mockResolvedValue({
            docs: [
                { id: 'c1', data: () => ({ name: 'Match', taxId: 'B123' }) }
            ]
        });

        const results = await findClientsByTaxId('B123');
        expect(results).toEqual([{ id: 'c1', name: 'Match', taxId: 'B123' }]);
        expect(firestoreMocks.where).toHaveBeenCalledWith('taxId', '==', 'B123');
    });

    it('devuelve lista vacía si no hay taxId', async () => {
        expect(await findClientsByTaxId('')).toEqual([]);
        expect(firestoreMocks.getDocs).not.toHaveBeenCalled();
    });
});