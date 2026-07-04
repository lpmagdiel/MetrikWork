import { beforeEach, describe, expect, it, vi } from 'vitest';

const firestoreMocks = vi.hoisted(() => ({
  addDoc: vi.fn(),
  deleteDoc: vi.fn(),
  onSnapshot: vi.fn(),
  updateDoc: vi.fn()
}));

vi.mock('firebase/firestore', () => ({
  addDoc: firestoreMocks.addDoc,
  collection: vi.fn((_db, ...segments) => segments.join('/')),
  deleteDoc: firestoreMocks.deleteDoc,
  doc: vi.fn((_db, ...segments) => segments.join('/')),
  onSnapshot: firestoreMocks.onSnapshot,
  query: vi.fn((value) => value),
  updateDoc: firestoreMocks.updateDoc,
  where: vi.fn()
}));

vi.mock('./firebase.js', () => ({ db: {} }));

import {
  addManualTeamExpense,
  deleteManualTeamExpense,
  expenseInventoryMovementsStore,
  expensePaymentsStore,
  manualTeamExpensesStore,
  subscribeToTeamExpenses,
  teamExpensesStateStore,
  updateManualTeamExpense
} from './teamExpenses.js';
import { get } from 'svelte/store';

const validInput = {
  title: 'Combustible',
  description: 'Visita a obra',
  amount: '25,50',
  currency: 'EUR',
  category: 'transport',
  status: 'paid',
  method: 'card',
  date: '2026-07-03',
  deductible: true
};

describe('manual team expenses persistence', () => {
  beforeEach(() => {
    subscribeToTeamExpenses(null);
    vi.clearAllMocks();
    firestoreMocks.addDoc.mockResolvedValue({ id: 'expense-1' });
    firestoreMocks.updateDoc.mockResolvedValue();
    firestoreMocks.deleteDoc.mockResolvedValue();
    firestoreMocks.onSnapshot.mockImplementation(() => vi.fn());
  });

  it('crea el gasto en la subcolección del equipo con autor y valores normalizados', async () => {
    const result = await addManualTeamExpense('team-1', validInput, {
      uid: 'user-1',
      name: 'Ana'
    });

    expect(firestoreMocks.addDoc).toHaveBeenCalledWith(
      'teams/team-1/expenses',
      expect.objectContaining({
        source: 'manual',
        title: 'Combustible',
        amount: 25.5,
        createdBy: 'user-1',
        createdByName: 'Ana'
      })
    );
    expect(result.id).toBe('expense-1');
  });

  it('preserva autor y fecha de creación al editar', async () => {
    await updateManualTeamExpense(
      'team-1',
      'expense-1',
      { ...validInput, amount: 30 },
      { uid: 'editor-1', name: 'Editor' },
      {
        createdBy: 'user-1',
        createdByName: 'Ana',
        createdAt: '2026-07-01T10:00:00.000Z'
      }
    );

    expect(firestoreMocks.updateDoc).toHaveBeenCalledWith(
      'teams/team-1/expenses/expense-1',
      expect.objectContaining({
        amount: 30,
        createdBy: 'user-1',
        createdByName: 'Ana',
        createdAt: '2026-07-01T10:00:00.000Z'
      })
    );
  });

  it('no escribe importes inválidos y elimina únicamente la ruta solicitada', async () => {
    await expect(addManualTeamExpense('team-1', { ...validInput, amount: 0 }, { uid: 'user-1' }))
      .rejects.toThrow(/mayor que cero/i);
    expect(firestoreMocks.addDoc).not.toHaveBeenCalled();

    await deleteManualTeamExpense('team-1', 'expense-1');
    expect(firestoreMocks.deleteDoc).toHaveBeenCalledWith('teams/team-1/expenses/expense-1');
  });

  it('combina las tres suscripciones y limpia listeners y stores al salir', () => {
    const unsubscribers = [vi.fn(), vi.fn(), vi.fn()];
    firestoreMocks.onSnapshot
      .mockReturnValueOnce(unsubscribers[0])
      .mockReturnValueOnce(unsubscribers[1])
      .mockReturnValueOnce(unsubscribers[2]);

    const stop = subscribeToTeamExpenses('team-1', { includeInventory: true });
    expect(firestoreMocks.onSnapshot).toHaveBeenCalledTimes(3);
    const calls = firestoreMocks.onSnapshot.mock.calls;
    calls[0][1]({ docs: [{ id: 'm1', data: () => ({ title: 'Manual' }) }] });
    calls[1][1]({ docs: [{ id: 'p1', data: () => ({ amount: 10 }) }] });
    calls[2][1]({ docs: [{ id: 'i1', data: () => ({ action: 'created' }) }] });

    expect(get(manualTeamExpensesStore)).toEqual([{ id: 'm1', title: 'Manual' }]);
    expect(get(expensePaymentsStore)).toEqual([{ id: 'p1', amount: 10 }]);
    expect(get(expenseInventoryMovementsStore)).toEqual([{ id: 'i1', action: 'created' }]);
    expect(get(teamExpensesStateStore)).toEqual({ loading: false, errors: [] });

    stop();
    unsubscribers.forEach((unsubscribe) => expect(unsubscribe).toHaveBeenCalledOnce());
    expect(get(manualTeamExpensesStore)).toEqual([]);
  });

  it('termina la carga con datos parciales si una fuente falla', () => {
    const stop = subscribeToTeamExpenses('team-1');
    const calls = firestoreMocks.onSnapshot.mock.calls;
    calls[0][1]({ docs: [{ id: 'm1', data: () => ({ title: 'Manual' }) }] });
    calls[1][2](new Error('permission-denied'));

    expect(get(manualTeamExpensesStore)).toHaveLength(1);
    expect(get(expensePaymentsStore)).toEqual([]);
    expect(get(teamExpensesStateStore)).toEqual({
      loading: false,
      errors: [{ source: 'payments', message: 'permission-denied' }]
    });
    stop();
  });
});
