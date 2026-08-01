import { writable } from 'svelte/store';
import {
    addDoc,
    collection,
    deleteDoc,
    doc,
    getDoc,
    onSnapshot,
    updateDoc
} from 'firebase/firestore';
import { db } from './firebase.js';

/**
 * Presupuestos de la empresa (globales).
 *
 * Los presupuestos son documentos comerciales compartidos por toda la
 * empresa. Viven como colección top-level en Firestore y al ser
 * aceptados, se materializan en un cobro del equipo (`teamId`)
 * que el usuario elija en el momento de aceptar.
 */
export const companyBudgetsStore = writable([]);

let budgetsUnsubscribe = null;
let activeSubscription = false;

export const BUDGET_STATUSES = {
    pending: 'pending',
    accepted: 'accepted',
    rejected: 'rejected',
    expired: 'expired'
};

const BUDGET_FIELD_LIMITS = {
    title: 160,
    description: 1000,
    currency: 6,
    notes: 1000,
    rejectionReason: 240
};

function normalizeText(value, maxLength = 0) {
    const text = String(value ?? '').trim();
    if (!maxLength || text.length <= maxLength) return text;
    return text.slice(0, maxLength);
}

function normalizeCurrency(value, fallback = 'MXN') {
    const currency = String(value || '').trim().toUpperCase();
    return /^[A-Z]{3}$/.test(currency) ? currency : fallback;
}

function normalizeAmount(value) {
    if (typeof value === 'number') {
        if (!Number.isFinite(value)) return 0;
        return Math.max(0, Math.round(value * 100) / 100);
    }
    if (typeof value === 'string') {
        const cleaned = value.trim().replace(/\s+/g, '').replace(',', '.');
        const numeric = Number(cleaned);
        if (!Number.isFinite(numeric)) return 0;
        return Math.max(0, Math.round(numeric * 100) / 100);
    }
    return 0;
}

function normalizeStatus(value, fallback = BUDGET_STATUSES.pending) {
    return Object.values(BUDGET_STATUSES).includes(value) ? value : fallback;
}

function normalizeDateString(value) {
    if (!value) return '';
    const text = String(value).trim();
    if (!/^\d{4}-\d{2}-\d{2}$/.test(text)) return '';
    return text;
}

function normalizeItems(items) {
    if (!Array.isArray(items)) return [];
    return items
        .map((item, index) => ({
            id: String(item?.id || `item-${index + 1}`),
            concept: normalizeText(item?.concept || item?.description, 200),
            quantity: Number(item?.quantity) > 0 ? Number(item.quantity) : 1,
            unitPrice: normalizeAmount(item?.unitPrice ?? item?.price),
            total: normalizeAmount(item?.total)
        }))
        .filter((item) => item.concept);
}

export function normalizeBudget(data = {}) {
    return {
        title: normalizeText(data.title, BUDGET_FIELD_LIMITS.title),
        description: normalizeText(data.description, BUDGET_FIELD_LIMITS.description),
        amount: normalizeAmount(data.amount),
        currency: normalizeCurrency(data.currency),
        clientId: normalizeText(data.clientId, 60),
        clientName: normalizeText(data.clientName, BUDGET_FIELD_LIMITS.title),
        clientSnapshot: data.clientSnapshot && typeof data.clientSnapshot === 'object'
            ? normalizeClientSnapshot(data.clientSnapshot)
            : null,
        validUntil: normalizeDateString(data.validUntil),
        status: normalizeStatus(data.status),
        items: normalizeItems(data.items),
        notes: normalizeText(data.notes, BUDGET_FIELD_LIMITS.notes),
        rejectionReason: normalizeText(data.rejectionReason, BUDGET_FIELD_LIMITS.rejectionReason)
    };
}

function normalizeClientSnapshot(snapshot) {
    const text = normalizeText;
    return {
        name: text(snapshot.name, 120),
        taxId: text(snapshot.taxId, 40),
        email: text(snapshot.email, 120),
        phone: text(snapshot.phone, 40),
        address: text(snapshot.address, 240)
    };
}

export function validateBudget(data = {}) {
    const errors = [];
    if (!data.title || data.title.length < 2) {
        errors.push('El título del presupuesto es obligatorio.');
    }
    if (!Number.isFinite(Number(data.amount)) || Number(data.amount) < 0) {
        errors.push('El importe debe ser un número mayor o igual a cero.');
    }
    if (!data.clientId && !data.clientName) {
        errors.push('Selecciona un cliente o escribe su nombre.');
    }
    if (data.title && data.title.length > BUDGET_FIELD_LIMITS.title) {
        errors.push(`El título no puede superar los ${BUDGET_FIELD_LIMITS.title} caracteres.`);
    }
    return errors;
}

function sortBudgets(budgets) {
    const order = { pending: 0, accepted: 1, rejected: 2, expired: 3 };
    return [...budgets].sort((a, b) => {
        const aOrder = order[a.status] ?? 9;
        const bOrder = order[b.status] ?? 9;
        if (aOrder !== bOrder) return aOrder - bOrder;
        return (b.createdAt || '').localeCompare(a.createdAt || '');
    });
}

function buildBudgetDoc(data = {}, user = {}) {
    const budget = normalizeBudget(data);
    const now = new Date().toISOString();
    return {
        ...budget,
        createdBy: user?.uid || user?.id || '',
        createdByName: user?.name || user?.displayName || user?.email || 'Usuario',
        createdAt: data.createdAt || now,
        updatedAt: now,
        acceptedAt: data.acceptedAt || '',
        acceptedChargeId: data.acceptedChargeId || '',
        acceptedByTeamId: data.acceptedByTeamId || ''
    };
}

function unsubscribeCurrent() {
    if (budgetsUnsubscribe) {
        try { budgetsUnsubscribe(); } catch (error) { /* noop */ }
        budgetsUnsubscribe = null;
    }
    activeSubscription = false;
}

/**
 * Suscribe al listado global de presupuestos de la empresa.
 * Idempotente: cancela la suscripción previa antes de crear la nueva.
 */
export function subscribeToCompanyBudgets() {
    unsubscribeCurrent();
    companyBudgetsStore.set([]);

    activeSubscription = true;
    const collectionRef = collection(db, 'budgets');

    const handleSuccess = (snapshot) => {
        if (!activeSubscription) return;
        const budgets = snapshot.docs.map((docSnap) => ({
            id: docSnap.id,
            ...docSnap.data()
        }));
        companyBudgetsStore.set(sortBudgets(budgets));
    };

    const handleError = (error) => {
        console.error('Error in company budgets listener:', error);
        if (activeSubscription) {
            companyBudgetsStore.set([]);
        }
    };

    budgetsUnsubscribe = onSnapshot(collectionRef, handleSuccess, handleError);

    return () => {
        if (activeSubscription) {
            unsubscribeCurrent();
            companyBudgetsStore.set([]);
        }
    };
}

export async function addCompanyBudget(data = {}, user = {}) {
    const errors = validateBudget(data);
    if (errors.length) throw new Error(errors[0]);
    const budget = buildBudgetDoc({ ...data, status: data.status || BUDGET_STATUSES.pending }, user);
    const ref = await addDoc(collection(db, 'budgets'), budget);
    return ref.id;
}

export async function updateBudget(budgetId, data = {}) {
    if (!budgetId) throw new Error('Presupuesto no válido');
    const errors = validateBudget(data);
    if (errors.length) throw new Error(errors[0]);
    const patch = {
        ...normalizeBudget(data),
        updatedAt: new Date().toISOString()
    };
    await updateDoc(doc(db, 'budgets', budgetId), patch);
}

export async function deleteBudget(budgetId) {
    if (!budgetId) return;
    await deleteDoc(doc(db, 'budgets', budgetId));
}

export async function rejectBudget(budgetId, reason = '') {
    if (!budgetId) throw new Error('Presupuesto no válido');
    const patch = {
        status: BUDGET_STATUSES.rejected,
        rejectionReason: normalizeText(reason, BUDGET_FIELD_LIMITS.rejectionReason),
        updatedAt: new Date().toISOString()
    };
    await updateDoc(doc(db, 'budgets', budgetId), patch);
}

export function isBudgetAccepted(budget) {
    return budget?.status === BUDGET_STATUSES.accepted;
}

export function isBudgetPending(budget) {
    return budget?.status === BUDGET_STATUSES.pending || !budget?.status;
}

/**
 * Acepta un presupuesto y crea un cobro dentro del equipo indicado.
 *
 * A diferencia de la versión anterior ligada a un solo equipo, ahora el
 * `teamId` se pasa explícitamente porque un presupuesto es global pero
 * el cobro pertenece al equipo que ejecuta el trabajo.
 *
 * El flujo sigue siendo atómico:
 * 1. Lee el presupuesto desde Firestore (no del store, para evitar
 *    estados obsoletos).
 * 2. Crea el cobro en `teams/{teamId}/charges` usando `chargeCreator`.
 * 3. Marca el presupuesto como aceptado, guardando el `acceptedChargeId`
 *    y el `acceptedByTeamId` para trazabilidad.
 * Si la actualización del presupuesto falla, se elimina el cobro creado.
 *
 * @param {string} budgetId
 * @param {string} teamId  - Equipo al que se asigna el cobro resultante.
 * @param {object} user
 * @param {object} [options]
 * @param {string} [options.chargeStatus='pending']
 * @param {boolean} [options.applyToBudget=true]
 * @param {object} [options.companyDefaults]
 * @param {Function} [chargeCreator] - Factory para crear el cobro
 *   (inyectable en tests).
 */
export async function acceptBudget(budgetId, teamId, user = {}, options = {}, chargeCreator = null) {
    if (!budgetId) throw new Error('Presupuesto no válido');
    if (!teamId) throw new Error('Debes seleccionar un equipo para aceptar el presupuesto.');

    const budgetRef = doc(db, 'budgets', budgetId);
    const budgetSnapshot = await getDoc(budgetRef);
    if (!budgetSnapshot.exists()) {
        throw new Error('Presupuesto no encontrado');
    }
    const budget = { id: budgetSnapshot.id, ...budgetSnapshot.data() };

    if (isBudgetAccepted(budget)) {
        throw new Error('Este presupuesto ya fue aceptado anteriormente.');
    }
    if (!Number.isFinite(Number(budget.amount)) || Number(budget.amount) <= 0) {
        throw new Error('El presupuesto debe tener un importe mayor que cero para aceptarse.');
    }

    const now = new Date().toISOString();
    const chargePayload = {
        title: budget.title,
        description: budget.description,
        amount: budget.amount,
        currency: budget.currency,
        method: 'transfer',
        status: options.chargeStatus || 'pending',
        rangeType: 'days',
        startDate: now.slice(0, 10),
        endDate: now.slice(0, 10),
        dueDate: now.slice(0, 10),
        recurrence: { enabled: false },
        client: budget.clientSnapshot || {
            name: budget.clientName,
            taxId: '',
            email: '',
            phone: '',
            address: ''
        },
        company: options.companyDefaults || {},
        budgetTarget: { type: 'team', locationId: '', locationName: '' },
        applyToBudget: options.applyToBudget !== false,
        originBudgetId: budgetId
    };

    let chargeId;
    try {
        if (typeof chargeCreator === 'function') {
            chargeId = await chargeCreator(teamId, chargePayload, user);
        } else {
            chargeId = await createChargeFromBudget(teamId, chargePayload, user);
        }
    } catch (error) {
        throw new Error(`No se pudo crear el cobro: ${error?.message || 'error desconocido'}`);
    }

    try {
        await updateDoc(budgetRef, {
            status: BUDGET_STATUSES.accepted,
            acceptedAt: now,
            acceptedChargeId: chargeId,
            acceptedByTeamId: teamId,
            updatedAt: now
        });
    } catch (error) {
        // Rollback: eliminar el cobro creado.
        try {
            await deleteDoc(doc(db, 'teams', teamId, 'charges', chargeId));
        } catch (cleanupError) {
            console.warn('No se pudo revertir el cobro tras error de aceptación:', cleanupError);
        }
        throw new Error(`No se pudo aceptar el presupuesto: ${error?.message || 'error desconocido'}`);
    }

    return { chargeId, budgetId, teamId };
}

async function createChargeFromBudget(teamId, payload, user) {
    // Importación dinámica evita ciclos y mantiene el módulo ligero.
    const { registerTeamCharge } = await import('./teamCharges.js');
    return registerTeamCharge(teamId, payload, user);
}

export function resetBudgetStore() {
    unsubscribeCurrent();
    companyBudgetsStore.set([]);
}