import { writable } from 'svelte/store';
import {
    addDoc,
    collection,
    deleteDoc,
    doc,
    onSnapshot,
    query,
    updateDoc,
    where
} from 'firebase/firestore';
import { db } from './firebase.js';
import {
    normalizeManualExpenseInput,
    validateManualExpenseInput
} from './teamExpenseUtils.js';

export const manualTeamExpensesStore = writable([]);
export const expensePaymentsStore = writable([]);
export const expenseInventoryMovementsStore = writable([]);
export const teamExpensesStateStore = writable({ loading: false, errors: [] });

let expenseUnsubscribers = [];
let subscriptionVersion = 0;

function stopExpenseSubscriptions() {
    expenseUnsubscribers.forEach((unsubscribe) => unsubscribe?.());
    expenseUnsubscribers = [];
}

function resetExpenseStores() {
    manualTeamExpensesStore.set([]);
    expensePaymentsStore.set([]);
    expenseInventoryMovementsStore.set([]);
}

export function subscribeToTeamExpenses(teamId, { includeInventory = false } = {}) {
    stopExpenseSubscriptions();
    resetExpenseStores();
    const version = ++subscriptionVersion;

    if (!teamId) {
        teamExpensesStateStore.set({ loading: false, errors: [] });
        return () => {};
    }

    const requiredSources = includeInventory
        ? ['manual', 'payments', 'inventory']
        : ['manual', 'payments'];
    const completedSources = new Set();
    const errors = [];
    teamExpensesStateStore.set({ loading: true, errors: [] });

    function completeSource(source, error = null) {
        if (version !== subscriptionVersion) return;
        completedSources.add(source);
        if (error && !errors.some((item) => item.source === source)) {
            errors.push({ source, message: error.message || 'No se pudo cargar esta fuente.' });
        }
        teamExpensesStateStore.set({
            loading: completedSources.size < requiredSources.length,
            errors: [...errors]
        });
    }

    function listen(source, reference, store) {
        try {
            const unsubscribe = onSnapshot(
                reference,
                (snapshot) => {
                    if (version !== subscriptionVersion) return;
                    store.set(snapshot.docs.map((snapshotDoc) => ({
                        id: snapshotDoc.id,
                        ...snapshotDoc.data()
                    })));
                    completeSource(source);
                },
                (error) => {
                    if (version !== subscriptionVersion) return;
                    console.error(`Error in ${source} expense listener:`, error);
                    store.set([]);
                    completeSource(source, error);
                }
            );
            expenseUnsubscribers.push(unsubscribe);
        } catch (error) {
            console.error(`Error starting ${source} expense listener:`, error);
            store.set([]);
            completeSource(source, error);
        }
    }

    listen(
        'manual',
        collection(db, 'teams', teamId, 'expenses'),
        manualTeamExpensesStore
    );
    listen(
        'payments',
        query(collection(db, 'team_payments'), where('teamId', '==', teamId)),
        expensePaymentsStore
    );
    if (includeInventory) {
        listen(
            'inventory',
            collection(db, 'teams', teamId, 'inventoryMovements'),
            expenseInventoryMovementsStore
        );
    }

    return () => {
        if (version !== subscriptionVersion) return;
        stopExpenseSubscriptions();
        resetExpenseStores();
        teamExpensesStateStore.set({ loading: false, errors: [] });
    };
}

function getActor(user = {}) {
    return {
        createdBy: user.uid || user.id || '',
        createdByName: String(user.name || user.displayName || user.email || 'Usuario')
            .trim()
            .slice(0, 120)
    };
}

function createExpenseDocument(input, user, existing = null) {
    const validationError = validateManualExpenseInput(input);
    if (validationError) throw new Error(validationError);

    const now = new Date();
    const nowIso = now.toISOString();
    const normalized = normalizeManualExpenseInput(input, {
        currency: input.currency,
        now
    });
    const actor = getActor(user);

    return {
        ...normalized,
        createdBy: existing?.createdBy || actor.createdBy,
        createdByName: String(existing?.createdByName || actor.createdByName).trim().slice(0, 120),
        createdAt: existing?.createdAt || nowIso,
        updatedAt: nowIso
    };
}

export async function addManualTeamExpense(teamId, input, user) {
    if (!teamId) throw new Error('Equipo no válido.');
    if (!user?.uid && !user?.id) throw new Error('Usuario no autenticado.');

    const expense = createExpenseDocument(input, user);
    const expenseRef = await addDoc(collection(db, 'teams', teamId, 'expenses'), expense);
    return { id: expenseRef.id, ...expense };
}

export async function updateManualTeamExpense(teamId, expenseId, input, user, existing = {}) {
    if (!teamId || !expenseId) throw new Error('Gasto no válido.');
    if (!user?.uid && !user?.id) throw new Error('Usuario no autenticado.');

    const expense = createExpenseDocument(input, user, existing);
    await updateDoc(doc(db, 'teams', teamId, 'expenses', expenseId), expense);
    return { id: expenseId, ...expense };
}

export async function deleteManualTeamExpense(teamId, expenseId) {
    if (!teamId || !expenseId) throw new Error('Gasto no válido.');
    await deleteDoc(doc(db, 'teams', teamId, 'expenses', expenseId));
}
