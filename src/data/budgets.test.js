import { beforeEach, describe, expect, it, vi } from 'vitest';

const firestoreMocks = vi.hoisted(() => ({
    addDoc: vi.fn(),
    collection: vi.fn((_db, ...segments) => segments.join('/')),
    deleteDoc: vi.fn(),
    doc: vi.fn((_db, ...segments) => segments.join('/')),
    getDoc: vi.fn(),
    onSnapshot: vi.fn(),
    updateDoc: vi.fn(),
    writeBatch: vi.fn(() => ({
        update: vi.fn(),
        commit: vi.fn().mockResolvedValue()
    }))
}));

vi.mock('firebase/firestore', () => ({
    addDoc: firestoreMocks.addDoc,
    collection: firestoreMocks.collection,
    deleteDoc: firestoreMocks.deleteDoc,
    doc: firestoreMocks.doc,
    getDoc: firestoreMocks.getDoc,
    onSnapshot: firestoreMocks.onSnapshot,
    updateDoc: firestoreMocks.updateDoc,
    writeBatch: firestoreMocks.writeBatch
}));

vi.mock('./firebase.js', () => ({ db: {} }));

// Evitamos que el módulo real se cargue: lo sustituimos por mocks.
const chargeCreatorMock = vi.fn();
vi.mock('./teamCharges.js', () => ({
    registerTeamCharge: chargeCreatorMock
}));

import {
    acceptBudget,
    addCompanyBudget,
    BUDGET_STATUSES,
    companyBudgetsStore,
    deleteBudget,
    isBudgetAccepted,
    isBudgetPending,
    normalizeBudget,
    rejectBudget,
    resetBudgetStore,
    subscribeToCompanyBudgets,
    updateBudget,
    validateBudget
} from './budgets.js';
import { get } from 'svelte/store';

describe('budgets normalization and validation', () => {
    it('normaliza importes, moneda y fechas', () => {
        const result = normalizeBudget({
            title: ' Reforma integral ',
            amount: '1234,5',
            currency: 'eur',
            validUntil: '2026-12-31',
            status: 'PENDING',
            clientName: 'Cliente X',
            clientId: 'cli-1'
        });

        expect(result.title).toBe('Reforma integral');
        expect(result.amount).toBe(1234.5);
        expect(result.currency).toBe('EUR');
        expect(result.validUntil).toBe('2026-12-31');
        expect(result.status).toBe('pending');
    });

    it('descarta fechas inválidas pero no rompe', () => {
        const result = normalizeBudget({ title: 'X', amount: 0, validUntil: 'no-es-fecha' });
        expect(result.validUntil).toBe('');
    });

    it('acepta importes cero pero rechaza importes negativos o NaN', () => {
        expect(validateBudget({ title: 'Test', amount: 0, clientId: 'c1' })).toEqual([]);
        expect(validateBudget({ title: 'Test', amount: -5, clientId: 'c1' }).length).toBeGreaterThan(0);
        expect(validateBudget({ title: 'Test', amount: 'NaN', clientId: 'c1' }).length).toBeGreaterThan(0);
        expect(validateBudget({ title: '', amount: 1, clientId: 'c1' }).length).toBeGreaterThan(0);
    });

    it('exige cliente (id o nombre)', () => {
        expect(validateBudget({ title: 'Test', amount: 10, clientId: 'c1' })).toEqual([]);
        expect(validateBudget({ title: 'Test', amount: 10, clientName: 'Cliente' })).toEqual([]);
        expect(validateBudget({ title: 'Test', amount: 10 }).length).toBeGreaterThan(0);
    });

    it('normaliza items descartando vacíos', () => {
        const result = normalizeBudget({
            title: 'X',
            amount: 0,
            items: [
                { concept: 'Mano de obra', quantity: 10, unitPrice: 25 },
                { concept: '', quantity: 1, unitPrice: 100 },
                { concept: 'Material', quantity: -2, unitPrice: 50 }
            ]
        });

        expect(result.items).toHaveLength(2);
        expect(result.items[0].concept).toBe('Mano de obra');
        expect(result.items[0].quantity).toBe(10);
        expect(result.items[1].quantity).toBe(1);
    });

    it('identifica presupuestos aceptados y pendientes', () => {
        expect(isBudgetAccepted({ status: 'accepted' })).toBe(true);
        expect(isBudgetPending({ status: 'pending' })).toBe(true);
        expect(isBudgetPending({})).toBe(true);
        expect(isBudgetPending({ status: 'rejected' })).toBe(false);
    });
});

describe('budgets CRUD', () => {
    beforeEach(() => {
        resetBudgetStore();
        vi.clearAllMocks();
        firestoreMocks.addDoc.mockResolvedValue({ id: 'budget-1' });
        firestoreMocks.updateDoc.mockResolvedValue();
        firestoreMocks.deleteDoc.mockResolvedValue();
        firestoreMocks.getDoc.mockResolvedValue({ exists: () => false });
        firestoreMocks.onSnapshot.mockImplementation(() => vi.fn());
    });

    it('crea presupuesto en colección top-level con estado pending por defecto', async () => {
        const id = await addCompanyBudget({
            title: 'Presupuesto Demo',
            amount: 1000,
            currency: 'EUR',
            clientId: 'c1',
            clientName: 'Cliente Demo'
        }, { uid: 'user-1', name: 'Ana' });

        expect(id).toBe('budget-1');
        expect(firestoreMocks.addDoc).toHaveBeenCalledWith(
            'budgets',
            expect.objectContaining({
                title: 'Presupuesto Demo',
                amount: 1000,
                currency: 'EUR',
                status: 'pending',
                clientId: 'c1',
                createdBy: 'user-1'
            })
        );
    });

    it('rechaza crear presupuesto sin datos válidos', async () => {
        await expect(addCompanyBudget({ title: 'X', amount: 10 }, { uid: 'u' }))
            .rejects.toThrow(/título/i);
        expect(firestoreMocks.addDoc).not.toHaveBeenCalled();
    });

    it('actualiza presupuesto en colección top-level', async () => {
        await updateBudget('budget-1', {
            title: 'Actualizado',
            amount: 1500,
            clientId: 'c1',
            clientName: 'Cliente Demo'
        });
        expect(firestoreMocks.updateDoc).toHaveBeenCalledWith(
            'budgets/budget-1',
            expect.objectContaining({ title: 'Actualizado', amount: 1500 })
        );
    });

    it('rechaza presupuesto con importe negativo al actualizar', async () => {
        await expect(updateBudget('b-1', {
            title: 'Test', amount: -1, clientId: 'c1'
        })).rejects.toThrow(/importe/i);
        expect(firestoreMocks.updateDoc).not.toHaveBeenCalled();
    });

    it('rechaza actualizar sin budgetId', async () => {
        await expect(updateBudget('', { title: 'X', amount: 0 }))
            .rejects.toThrow(/no válido/i);
    });

    it('rechaza un presupuesto y guarda el motivo', async () => {
        await rejectBudget('b-1', 'Fuera de presupuesto');
        expect(firestoreMocks.updateDoc).toHaveBeenCalledWith(
            'budgets/b-1',
            expect.objectContaining({
                status: 'rejected',
                rejectionReason: 'Fuera de presupuesto'
            })
        );
    });

    it('rechaza rechazar sin budgetId', async () => {
        await expect(rejectBudget('', 'motivo')).rejects.toThrow(/no válido/i);
    });

    it('elimina presupuesto', async () => {
        await deleteBudget('b-1');
        expect(firestoreMocks.deleteDoc).toHaveBeenCalledWith('budgets/b-1');
        await deleteBudget('');
        expect(firestoreMocks.deleteDoc).toHaveBeenCalledTimes(1);
    });
});

describe('budgets subscriptions', () => {
    beforeEach(() => {
        resetBudgetStore();
        vi.clearAllMocks();
        firestoreMocks.onSnapshot.mockImplementation(() => vi.fn());
    });

    it('inicia listener y ordena los presupuestos por estado y fecha', () => {
        firestoreMocks.onSnapshot.mockImplementation((_ref, onNext) => {
            onNext({
                docs: [
                    { id: 'b3', data: () => ({ title: 'Rechazado', status: 'rejected', createdAt: '2026-01-05' }) },
                    { id: 'b1', data: () => ({ title: 'Pendiente', status: 'pending', createdAt: '2026-01-03' }) },
                    { id: 'b2', data: () => ({ title: 'Aceptado', status: 'accepted', createdAt: '2026-01-01' }) }
                ]
            });
            return vi.fn();
        });

        subscribeToCompanyBudgets();
        const budgets = get(companyBudgetsStore);
        expect(budgets.map((b) => b.status)).toEqual(['pending', 'accepted', 'rejected']);
        expect(firestoreMocks.onSnapshot).toHaveBeenCalledWith(
            'budgets',
            expect.any(Function),
            expect.any(Function)
        );
    });

    it('limpia el store ante error de listener', () => {
        firestoreMocks.onSnapshot.mockImplementation((_ref, _onNext, onError) => {
            onError(new Error('permission-denied'));
            return vi.fn();
        });

        subscribeToCompanyBudgets();
        expect(get(companyBudgetsStore)).toEqual([]);
    });

    it('cancela la suscripción anterior al llamar de nuevo', () => {
        const unsub1 = vi.fn();
        const unsub2 = vi.fn();
        firestoreMocks.onSnapshot
            .mockReturnValueOnce(unsub1)
            .mockReturnValueOnce(unsub2);

        subscribeToCompanyBudgets();
        const stop = subscribeToCompanyBudgets();
        expect(unsub1).toHaveBeenCalledOnce();
        expect(get(companyBudgetsStore)).toEqual([]);
        stop();
    });
});

describe('acceptBudget', () => {
    beforeEach(() => {
        resetBudgetStore();
        vi.clearAllMocks();
        chargeCreatorMock.mockReset();
        chargeCreatorMock.mockResolvedValue('charge-99');
        firestoreMocks.addDoc.mockResolvedValue({ id: 'budget-1' });
        firestoreMocks.updateDoc.mockResolvedValue();
        firestoreMocks.deleteDoc.mockResolvedValue();
    });

    it('crea un cobro en el equipo indicado y marca el presupuesto como aceptado', async () => {
        firestoreMocks.getDoc.mockResolvedValue({
            exists: () => true,
            id: 'budget-1',
            data: () => ({
                title: 'Reforma integral',
                amount: 1500,
                currency: 'EUR',
                clientId: 'c1',
                clientName: 'Cliente X',
                clientSnapshot: { name: 'Cliente X', taxId: 'B123', email: '', phone: '', address: '' },
                status: 'pending'
            })
        });

        const result = await acceptBudget('budget-1', 'team-1', { uid: 'u', name: 'Ana' });

        expect(result).toEqual({ chargeId: 'charge-99', budgetId: 'budget-1', teamId: 'team-1' });
        expect(chargeCreatorMock).toHaveBeenCalledTimes(1);
        expect(chargeCreatorMock.mock.calls[0][0]).toBe('team-1');
        expect(chargeCreatorMock.mock.calls[0][1]).toEqual(expect.objectContaining({
            amount: 1500,
            currency: 'EUR',
            client: expect.objectContaining({ name: 'Cliente X', taxId: 'B123' }),
            originBudgetId: 'budget-1'
        }));
        // El campo acceptedByTeamId se guarda para trazabilidad.
        expect(firestoreMocks.updateDoc).toHaveBeenCalledWith(
            'budgets/budget-1',
            expect.objectContaining({
                status: 'accepted',
                acceptedChargeId: 'charge-99',
                acceptedByTeamId: 'team-1'
            })
        );
    });

    it('rechaza aceptar si no se proporciona teamId', async () => {
        await expect(acceptBudget('budget-1', '', {}))
            .rejects.toThrow(/equipo/i);
        expect(chargeCreatorMock).not.toHaveBeenCalled();
    });

    it('rechaza aceptar si no se proporciona budgetId', async () => {
        await expect(acceptBudget('', 'team-1', {}))
            .rejects.toThrow(/presupuesto/i);
    });

    it('rechaza aceptar un presupuesto que no existe', async () => {
        firestoreMocks.getDoc.mockResolvedValue({ exists: () => false });

        await expect(acceptBudget('no-existe', 'team-1', {}))
            .rejects.toThrow(/no encontrado/i);
        expect(chargeCreatorMock).not.toHaveBeenCalled();
    });

    it('rechaza aceptar dos veces el mismo presupuesto', async () => {
        firestoreMocks.getDoc.mockResolvedValue({
            exists: () => true,
            id: 'budget-1',
            data: () => ({ title: 'X', amount: 100, status: BUDGET_STATUSES.accepted })
        });

        await expect(acceptBudget('budget-1', 'team-1', {}))
            .rejects.toThrow(/ya fue aceptado/i);
    });

    it('rechaza aceptar presupuestos con importe cero o negativo', async () => {
        firestoreMocks.getDoc.mockResolvedValue({
            exists: () => true,
            id: 'budget-1',
            data: () => ({ title: 'X', amount: 0, status: 'pending' })
        });

        await expect(acceptBudget('budget-1', 'team-1', {}))
            .rejects.toThrow(/importe/i);
    });

    it('hace rollback del cobro si falla la actualización del presupuesto', async () => {
        firestoreMocks.getDoc.mockResolvedValue({
            exists: () => true,
            id: 'budget-1',
            data: () => ({
                title: 'Reforma',
                amount: 500,
                currency: 'EUR',
                clientName: 'Cliente',
                status: 'pending'
            })
        });

        firestoreMocks.updateDoc.mockRejectedValueOnce(new Error('update-failed'));

        await expect(acceptBudget('budget-1', 'team-1', {}))
            .rejects.toThrow(/no se pudo aceptar/i);
        expect(firestoreMocks.deleteDoc).toHaveBeenCalledWith(
            'teams/team-1/charges/charge-99'
        );
    });

    it('propaga error si falla la creación del cobro', async () => {
        firestoreMocks.getDoc.mockResolvedValue({
            exists: () => true,
            id: 'budget-1',
            data: () => ({ title: 'X', amount: 100, status: 'pending' })
        });
        chargeCreatorMock.mockRejectedValueOnce(new Error('no-permission'));

        await expect(acceptBudget('budget-1', 'team-1', {}))
            .rejects.toThrow(/no se pudo crear el cobro/i);
        expect(firestoreMocks.updateDoc).not.toHaveBeenCalled();
    });

    it('acepta inyección de chargeCreator para tests', async () => {
        firestoreMocks.getDoc.mockResolvedValue({
            exists: () => true,
            id: 'budget-1',
            data: () => ({ title: 'X', amount: 50, currency: 'EUR', status: 'pending' })
        });

        const customCreator = vi.fn().mockResolvedValue('custom-charge');
        const result = await acceptBudget('budget-1', 'team-1', {}, {}, customCreator);

        expect(result.chargeId).toBe('custom-charge');
        expect(customCreator).toHaveBeenCalledTimes(1);
        expect(customCreator.mock.calls[0][0]).toBe('team-1');
        expect(chargeCreatorMock).not.toHaveBeenCalled();
    });
});