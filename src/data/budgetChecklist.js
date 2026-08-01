import { writable } from 'svelte/store';
import {
    addDoc,
    collection,
    deleteDoc,
    doc,
    getDocs,
    onSnapshot,
    orderBy,
    query,
    updateDoc,
    where,
    writeBatch
} from 'firebase/firestore';
import { db } from './firebase.js';

/**
 * Checklist asociado a un presupuesto.
 *
 * Cada presupuesto (`budgets/{budgetId}`) puede tener una subcolección
 * `checklist` con los items a verificar o ejecutar. Se usa para
 * reproducir el formato de los presupuestos tradicionales donde cada
 * línea describe un trabajo e indica si incluye mano de obra,
 * materiales o ambos.
 *
 * Campos del item:
 *  - title:        descripción corta del trabajo (obligatorio)
 *  - includesLabor:        ¿incluye mano de obra?
 *  - includesMaterials:    ¿incluye materiales / artefactos?
 *  - notes:        texto libre que aparece debajo de la línea
 *                  (ej. "No incluye ventana")
 *  - order:        entero para ordenar la lista
 *  - status:       'pending' | 'done'
 *  - assignedTo:   uid (opcional)
 *  - assignedToName: nombre legible (opcional)
 *  - completedAt:  ISO string cuando se completa
 *  - completedBy:  uid del usuario que marcó como hecho
 *  - createdBy / createdAt / updatedAt: autoría y timestamps
 */
export const CHECKLIST_STATUSES = {
    pending: 'pending',
    done: 'done'
};

const CHECKLIST_FIELD_LIMITS = {
    title: 240,
    notes: 240,
    assignedToName: 120
};

function normalizeText(value, maxLength = 0) {
    const text = String(value ?? '').trim();
    if (!maxLength || text.length <= maxLength) return text;
    return text.slice(0, maxLength);
}

function normalizeStatus(value, fallback = CHECKLIST_STATUSES.pending) {
    const candidate = String(value ?? '').trim().toLowerCase();
    return Object.values(CHECKLIST_STATUSES).includes(candidate) ? candidate : fallback;
}

function normalizeBoolean(value, fallback = false) {
    if (typeof value === 'boolean') return value;
    if (value === 'true' || value === '1' || value === 1) return true;
    if (value === 'false' || value === '0' || value === 0) return false;
    return fallback;
}

function normalizeOrder(value, fallback = 0) {
    const numeric = Number(value);
    if (!Number.isFinite(numeric)) return fallback;
    return Math.max(0, Math.round(numeric));
}

export function normalizeChecklistItem(data = {}) {
    return {
        title: normalizeText(data.title, CHECKLIST_FIELD_LIMITS.title),
        notes: normalizeText(data.notes, CHECKLIST_FIELD_LIMITS.notes),
        includesLabor: normalizeBoolean(data.includesLabor, false),
        includesMaterials: normalizeBoolean(data.includesMaterials, false),
        order: normalizeOrder(data.order, 0),
        status: normalizeStatus(data.status),
        assignedTo: normalizeText(data.assignedTo, 60),
        assignedToName: normalizeText(data.assignedToName, CHECKLIST_FIELD_LIMITS.assignedToName),
        completedAt: data.completedAt || '',
        completedBy: normalizeText(data.completedBy, 60)
    };
}

export function validateChecklistItem(data = {}) {
    const errors = [];
    if (!data.title || data.title.length < 2) {
        errors.push('La descripción del item es obligatoria (mínimo 2 caracteres).');
    }
    if (data.title && data.title.length > CHECKLIST_FIELD_LIMITS.title) {
        errors.push(`La descripción no puede superar los ${CHECKLIST_FIELD_LIMITS.title} caracteres.`);
    }
    if (data.status && !Object.values(CHECKLIST_STATUSES).includes(data.status)) {
        errors.push('Estado del item no válido.');
    }
    return errors;
}

/**
 * Map de stores por budgetId para evitar duplicar listeners al
 * suscribirse desde varios componentes a la vez. El Map mantiene
 * una sola suscripción Firestore por presupuesto.
 */
const checklistStores = new Map();
const checklistUnsubscribes = new Map();

function setItems(budgetId, items) {
    const store = checklistStores.get(budgetId);
    if (store) store.set(items);
}

function sortItems(items) {
    return [...items].sort((a, b) => {
        const aOrder = Number.isFinite(Number(a.order)) ? Number(a.order) : 0;
        const bOrder = Number.isFinite(Number(b.order)) ? Number(b.order) : 0;
        if (aOrder !== bOrder) return aOrder - bOrder;
        return (a.createdAt || '').localeCompare(b.createdAt || '');
    });
}

function buildChecklistDoc(data = {}, user = {}, order = 0) {
    const item = normalizeChecklistItem({ ...data, order });
    const now = new Date().toISOString();
    return {
        ...item,
        createdBy: user?.uid || user?.id || '',
        createdByName: user?.name || user?.displayName || user?.email || 'Usuario',
        createdAt: data.createdAt || now,
        updatedAt: now
    };
}

/**
 * Suscribe al checklist de un presupuesto concreto.
 * Devuelve una función para cancelar la suscripción y limpia el store.
 * Si se llama varias veces con el mismo `budgetId`, cancela la previa.
 */
export function subscribeToBudgetChecklist(budgetId) {
    if (!budgetId) return () => {};

    const prevUnsub = checklistUnsubscribes.get(budgetId);
    if (prevUnsub) {
        try { prevUnsub(); } catch (error) { /* noop */ }
        checklistUnsubscribes.delete(budgetId);
    }

    const store = writable([]);
    checklistStores.set(budgetId, store);
    store.set([]);

    const checklistCollection = collection(db, 'budgets', budgetId, 'checklist');
    const checklistQuery = query(checklistCollection, orderBy('order', 'asc'));

    const handleSuccess = (snapshot) => {
        if (!checklistStores.has(budgetId)) return;
        const items = snapshot.docs.map((docSnap) => ({
            id: docSnap.id,
            ...docSnap.data()
        }));
        setItems(budgetId, sortItems(items));
    };

    const handleError = (error) => {
        console.error('Error in budget checklist listener:', error);
        if (checklistStores.has(budgetId)) {
            setItems(budgetId, []);
        }
    };

    const unsub = onSnapshot(checklistQuery, handleSuccess, handleError);
    checklistUnsubscribes.set(budgetId, unsub);

    return () => {
        try { unsub(); } catch (error) { /* noop */ }
        if (checklistUnsubscribes.get(budgetId) === unsub) {
            checklistUnsubscribes.delete(budgetId);
        }
        if (checklistStores.has(budgetId)) {
            checklistStores.get(budgetId).set([]);
            checklistStores.delete(budgetId);
        }
    };
}

/**
 * Devuelve el store reactivo del checklist de un presupuesto.
 * Requiere haber llamado antes a `subscribeToBudgetChecklist`.
 */
export function getBudgetChecklistStore(budgetId) {
    return checklistStores.get(budgetId) || null;
}

/**
 * Crea un item en el checklist. Devuelve el id del documento creado.
 * `order` por defecto es el siguiente al último existente.
 */
export async function addBudgetChecklistItem(budgetId, data = {}, user = {}) {
    if (!budgetId) throw new Error('Presupuesto no válido');
    const errors = validateChecklistItem(data);
    if (errors.length) throw new Error(errors[0]);

    let order = Number.isFinite(Number(data.order)) ? Number(data.order) : NaN;
    if (!Number.isFinite(order)) {
        const existing = await getDocs(collection(db, 'budgets', budgetId, 'checklist'));
        order = existing.size;
    }

    const item = buildChecklistDoc(data, user, order);
    const ref = await addDoc(collection(db, 'budgets', budgetId, 'checklist'), item);
    return ref.id;
}

/**
 * Crea varios items en una sola operación batch. Pensado para cuando
 * se crea un presupuesto nuevo con su checklist inicial.
 *
 * @param {string} budgetId
 * @param {Array<{title:string, includesLabor?:boolean, includesMaterials?:boolean, notes?:string}>} items
 * @param {object} user
 * @returns {Promise<string[]>} ids creados en el mismo orden
 */
export async function addBudgetChecklistItems(budgetId, items = [], user = {}) {
    if (!budgetId) throw new Error('Presupuesto no válido');
    if (!Array.isArray(items) || items.length === 0) return [];

    // Validamos todos antes de escribir nada.
    items.forEach((entry, index) => {
        const errors = validateChecklistItem(entry);
        if (errors.length) {
            throw new Error(`Item ${index + 1}: ${errors[0]}`);
        }
    });

    const batch = writeBatch(db);
    const ids = [];
    items.forEach((entry, index) => {
        const ref = doc(collection(db, 'budgets', budgetId, 'checklist'));
        const payload = buildChecklistDoc(entry, user, index);
        batch.set(ref, payload);
        ids.push(ref.id);
    });
    await batch.commit();
    return ids;
}

export async function updateBudgetChecklistItem(budgetId, itemId, data = {}) {
    if (!budgetId || !itemId) throw new Error('Item no válido');
    const errors = validateChecklistItem(data);
    if (errors.length) throw new Error(errors[0]);

    const patch = {
        ...normalizeChecklistItem(data),
        updatedAt: new Date().toISOString()
    };
    await updateDoc(doc(db, 'budgets', budgetId, 'checklist', itemId), patch);
}

export async function setBudgetChecklistItemStatus(budgetId, itemId, status, user = {}) {
    if (!budgetId || !itemId) throw new Error('Item no válido');
    const nextStatus = normalizeStatus(status);
    const patch = {
        status: nextStatus,
        completedAt: nextStatus === CHECKLIST_STATUSES.done ? new Date().toISOString() : '',
        completedBy: nextStatus === CHECKLIST_STATUSES.done ? (user?.uid || user?.id || '') : '',
        updatedAt: new Date().toISOString()
    };
    await updateDoc(doc(db, 'budgets', budgetId, 'checklist', itemId), patch);
}

export async function deleteBudgetChecklistItem(budgetId, itemId) {
    if (!budgetId || !itemId) return;
    await deleteDoc(doc(db, 'budgets', budgetId, 'checklist', itemId));
}

/**
 * Elimina todos los items del checklist de un presupuesto.
 * Útil cuando se elimina el presupuesto para no dejar huérfanos.
 */
export async function clearBudgetChecklist(budgetId) {
    if (!budgetId) return;
    const snapshot = await getDocs(collection(db, 'budgets', budgetId, 'checklist'));
    if (snapshot.empty) return;
    const batch = writeBatch(db);
    snapshot.docs.forEach((docSnap) => batch.delete(docSnap.ref));
    await batch.commit();
}

/**
 * Comprueba si ya existe un item con el mismo título (case-insensitive)
 * en el checklist del presupuesto. Útil para evitar duplicados al
 * generar el checklist inicial.
 */
export async function hasChecklistItemWithTitle(budgetId, title) {
    if (!budgetId || !title) return false;
    const normalized = String(title).trim().toLowerCase();
    if (!normalized) return false;
    const snapshot = await getDocs(
        query(
            collection(db, 'budgets', budgetId, 'checklist'),
            where('title', '==', title)
        )
    );
    return snapshot.docs.some((docSnap) => {
        const existing = docSnap.data()?.title || '';
        return existing.trim().toLowerCase() === normalized;
    });
}

export function resetBudgetChecklistStores() {
    checklistUnsubscribes.forEach((unsub) => {
        try { unsub(); } catch (error) { /* noop */ }
    });
    checklistUnsubscribes.clear();
    checklistStores.forEach((store) => store.set([]));
    checklistStores.clear();
}