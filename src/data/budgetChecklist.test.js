import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const firestoreMocks = vi.hoisted(() => ({
    addDoc: vi.fn(),
    collection: vi.fn((_db, ...segments) => segments.join('/')),
    deleteDoc: vi.fn(),
    doc: vi.fn((_db, ...segments) => segments.join('/')),
    getDocs: vi.fn(),
    onSnapshot: vi.fn(),
    orderBy: vi.fn((field, direction) => ({ field, direction })),
    query: vi.fn((...args) => ({ args })),
    updateDoc: vi.fn(),
    where: vi.fn((field, op, value) => ({ field, op, value })),
    writeBatch: vi.fn(() => ({
        set: vi.fn(),
        update: vi.fn(),
        delete: vi.fn(),
        commit: vi.fn().mockResolvedValue()
    }))
}));

vi.mock('firebase/firestore', () => ({
    addDoc: firestoreMocks.addDoc,
    collection: firestoreMocks.collection,
    deleteDoc: firestoreMocks.deleteDoc,
    doc: firestoreMocks.doc,
    getDocs: firestoreMocks.getDocs,
    onSnapshot: firestoreMocks.onSnapshot,
    orderBy: firestoreMocks.orderBy,
    query: firestoreMocks.query,
    updateDoc: firestoreMocks.updateDoc,
    where: firestoreMocks.where,
    writeBatch: firestoreMocks.writeBatch
}));

vi.mock('./firebase.js', () => ({ db: {} }));

import {
    addBudgetChecklistItem,
    addBudgetChecklistItems,
    CHECKLIST_STATUSES,
    clearBudgetChecklist,
    deleteBudgetChecklistItem,
    getBudgetChecklistStore,
    hasChecklistItemWithTitle,
    normalizeChecklistItem,
    resetBudgetChecklistStores,
    setBudgetChecklistItemStatus,
    subscribeToBudgetChecklist,
    updateBudgetChecklistItem,
    validateChecklistItem
} from './budgetChecklist.js';

describe('budgetChecklist normalization and validation', () => {
    it('normaliza strings, booleanos y estado por defecto', () => {
        const item = normalizeChecklistItem({
            title: '  Apertura de ventana  ',
            includesLabor: 'true',
            includesMaterials: 1,
            notes: 'No incluye ventana',
            status: 'DONE',
            order: '4',
            assignedTo: '  uid-1  '
        });

        expect(item.title).toBe('Apertura de ventana');
        expect(item.includesLabor).toBe(true);
        expect(item.includesMaterials).toBe(true);
        expect(item.status).toBe('done');
        expect(item.order).toBe(4);
        expect(item.notes).toBe('No incluye ventana');
        expect(item.assignedTo).toBe('uid-1');
    });

    it('recorta títulos que superen el límite', () => {
        const item = normalizeChecklistItem({ title: 'a'.repeat(500) });
        expect(item.title.length).toBe(240);
    });

    it('valida que el título sea obligatorio y tenga longitud mínima', () => {
        expect(validateChecklistItem({ title: '', status: 'pending' }).length).toBeGreaterThan(0);
        expect(validateChecklistItem({ title: 'X' }).length).toBeGreaterThan(0);
        expect(validateChecklistItem({ title: 'OK', status: 'invalid' }).length).toBeGreaterThan(0);
        expect(validateChecklistItem({ title: 'OK', status: 'pending' })).toEqual([]);
    });
});

describe('budgetChecklist CRUD', () => {
    beforeEach(() => {
        resetBudgetChecklistStores();
        vi.clearAllMocks();
        firestoreMocks.addDoc.mockResolvedValue({ id: 'item-1' });
        firestoreMocks.updateDoc.mockResolvedValue();
        firestoreMocks.deleteDoc.mockResolvedValue();
        firestoreMocks.getDocs.mockResolvedValue({ empty: true, size: 0, docs: [] });
    });

    afterEach(() => {
        resetBudgetChecklistStores();
    });

    it('crea un item y devuelve su id', async () => {
        const id = await addBudgetChecklistItem('budget-1', {
            title: 'Mano de obra',
            includesLabor: true,
            includesMaterials: false
        }, { uid: 'user-1', name: 'Ana' });

        expect(id).toBe('item-1');
        expect(firestoreMocks.addDoc).toHaveBeenCalledWith(
            'budgets/budget-1/checklist',
            expect.objectContaining({
                title: 'Mano de obra',
                includesLabor: true,
                includesMaterials: false,
                status: 'pending',
                order: 0,
                createdBy: 'user-1'
            })
        );
    });

    it('rechaza crear un item sin título', async () => {
        await expect(addBudgetChecklistItem('budget-1', { title: '' }))
            .rejects.toThrow(/descripción/i);
        expect(firestoreMocks.addDoc).not.toHaveBeenCalled();
    });

    it('rechaza crear sin budgetId', async () => {
        await expect(addBudgetChecklistItem('', { title: 'OK' }))
            .rejects.toThrow(/presupuesto/i);
    });

    it('asigna order automático igual al número de items existentes', async () => {
        firestoreMocks.getDocs.mockResolvedValue({
            empty: false,
            size: 3,
            docs: [{ id: 'a' }, { id: 'b' }, { id: 'c' }]
        });

        await addBudgetChecklistItem('budget-2', { title: 'Nuevo item' });
        expect(firestoreMocks.addDoc).toHaveBeenCalledWith(
            'budgets/budget-2/checklist',
            expect.objectContaining({ order: 3 })
        );
    });

    it('crea varios items en una sola operación batch', async () => {
        const ids = await addBudgetChecklistItems('budget-3', [
            { title: 'Item 1', includesLabor: true },
            { title: 'Item 2', includesMaterials: true },
            { title: 'Item 3' }
        ], { uid: 'u' });

        expect(ids).toHaveLength(3);
        expect(firestoreMocks.writeBatch).toHaveBeenCalled();
    });

    it('no escribe batch si algún item es inválido', async () => {
        await expect(addBudgetChecklistItems('budget-3', [
            { title: 'OK' },
            { title: '' }
        ])).rejects.toThrow(/Item 2/i);
        expect(firestoreMocks.writeBatch).not.toHaveBeenCalled();
    });

    it('actualiza un item existente', async () => {
        await updateBudgetChecklistItem('budget-1', 'item-1', {
            title: 'Nuevo título',
            includesLabor: true
        });
        expect(firestoreMocks.updateDoc).toHaveBeenCalledWith(
            'budgets/budget-1/checklist/item-1',
            expect.objectContaining({
                title: 'Nuevo título',
                includesLabor: true
            })
        );
    });

    it('marca un item como done guardando completedAt y completedBy', async () => {
        await setBudgetChecklistItemStatus('budget-1', 'item-1', 'done', { uid: 'u-1' });
        expect(firestoreMocks.updateDoc).toHaveBeenCalledWith(
            'budgets/budget-1/checklist/item-1',
            expect.objectContaining({
                status: 'done',
                completedBy: 'u-1',
                completedAt: expect.any(String)
            })
        );
    });

    it('revierte completedAt al pasar de done a pending', async () => {
        await setBudgetChecklistItemStatus('budget-1', 'item-1', 'pending', { uid: 'u-1' });
        expect(firestoreMocks.updateDoc).toHaveBeenCalledWith(
            'budgets/budget-1/checklist/item-1',
            expect.objectContaining({
                status: 'pending',
                completedAt: '',
                completedBy: ''
            })
        );
    });

    it('elimina items individualmente', async () => {
        await deleteBudgetChecklistItem('budget-1', 'item-1');
        expect(firestoreMocks.deleteDoc).toHaveBeenCalledWith(
            'budgets/budget-1/checklist/item-1'
        );
        // Llamadas vacías son no-op silenciosas.
        firestoreMocks.deleteDoc.mockClear();
        await deleteBudgetChecklistItem('', '');
        expect(firestoreMocks.deleteDoc).not.toHaveBeenCalled();
    });

    it('limpia todo el checklist de un presupuesto en batch', async () => {
        firestoreMocks.getDocs.mockResolvedValue({
            empty: false,
            docs: [
                { id: 'a', ref: { id: 'a' } },
                { id: 'b', ref: { id: 'b' } }
            ]
        });

        await clearBudgetChecklist('budget-1');
        expect(firestoreMocks.writeBatch).toHaveBeenCalled();
    });

    it('no escribe batch al limpiar un checklist vacío', async () => {
        firestoreMocks.getDocs.mockResolvedValue({ empty: true, docs: [] });
        await clearBudgetChecklist('budget-1');
        expect(firestoreMocks.writeBatch).not.toHaveBeenCalled();
    });

    it('hasChecklistItemWithTitle detecta duplicados case-insensitive', async () => {
        firestoreMocks.getDocs.mockResolvedValue({
            docs: [{ data: () => ({ title: '  Apertura de ventana  ' }) }]
        });
        const exists = await hasChecklistItemWithTitle('budget-1', 'apertura DE ventana');
        expect(exists).toBe(true);
        expect(firestoreMocks.where).toHaveBeenCalledWith('title', '==', 'apertura DE ventana');
    });

    it('hasChecklistItemWithTitle devuelve false sin argumentos', async () => {
        expect(await hasChecklistItemWithTitle('', 'algo')).toBe(false);
        expect(await hasChecklistItemWithTitle('budget-1', '')).toBe(false);
        expect(firestoreMocks.getDocs).not.toHaveBeenCalled();
    });
});

describe('budgetChecklist subscriptions', () => {
    beforeEach(() => {
        resetBudgetChecklistStores();
        vi.clearAllMocks();
    });

    afterEach(() => {
        resetBudgetChecklistStores();
    });

    it('crea un listener y rellena el store con los items ordenados por order', () => {
        firestoreMocks.onSnapshot.mockImplementation((_ref, onNext) => {
            onNext({
                docs: [
                    { id: 'b', data: () => ({ title: 'B', order: 2, createdAt: '2026-01-02' }) },
                    { id: 'a', data: () => ({ title: 'A', order: 1, createdAt: '2026-01-01' }) }
                ]
            });
            return vi.fn();
        });

        const stop = subscribeToBudgetChecklist('budget-1');
        const store = getBudgetChecklistStore('budget-1');
        expect(store).not.toBeNull();

        let items;
        store.subscribe((value) => (items = value))();
        expect(items.map((i) => i.id)).toEqual(['a', 'b']);
        stop();
    });

    it('cancela la suscripción anterior al re-suscribirse', () => {
        const unsub1 = vi.fn();
        const unsub2 = vi.fn();
        firestoreMocks.onSnapshot
            .mockReturnValueOnce(unsub1)
            .mockReturnValueOnce(unsub2);

        subscribeToBudgetChecklist('budget-1');
        subscribeToBudgetChecklist('budget-1');
        expect(unsub1).toHaveBeenCalledOnce();
    });

    it('subscribe sin budgetId devuelve función no-op', () => {
        const stop = subscribeToBudgetChecklist('');
        expect(typeof stop).toBe('function');
        expect(() => stop()).not.toThrow();
        expect(firestoreMocks.onSnapshot).not.toHaveBeenCalled();
    });

    it('resetBudgetChecklistStores cancela todas las suscripciones', () => {
        const unsub1 = vi.fn();
        const unsub2 = vi.fn();
        firestoreMocks.onSnapshot
            .mockReturnValueOnce(unsub1)
            .mockReturnValueOnce(unsub2);

        subscribeToBudgetChecklist('budget-1');
        subscribeToBudgetChecklist('budget-2');
        resetBudgetChecklistStores();
        expect(unsub1).toHaveBeenCalledOnce();
        expect(unsub2).toHaveBeenCalledOnce();
    });
});

describe('CHECKLIST_STATUSES constants', () => {
    it('expone pending y done', () => {
        expect(CHECKLIST_STATUSES.pending).toBe('pending');
        expect(CHECKLIST_STATUSES.done).toBe('done');
    });
});