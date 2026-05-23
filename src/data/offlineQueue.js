import { writable } from 'svelte/store';

const DB_NAME = 'metricwork-offline';
const DB_VERSION = 1;
const STORE_NAME = 'operations';
const MAX_ATTEMPTS = 8;

let dbPromise = null;
let syncHandlers = {};
let isSyncing = false;
let syncStarted = false;

export const offlineQueueStore = writable({
    pending: 0,
    syncing: false,
    lastSyncedAt: null,
    lastError: null
});

function canUseIndexedDb() {
    return typeof indexedDB !== 'undefined';
}

function createId(prefix = 'offline') {
    const randomId = typeof crypto !== 'undefined' && crypto.randomUUID
        ? crypto.randomUUID()
        : `${Date.now()}-${Math.random().toString(16).slice(2)}`;
    return `${prefix}-${randomId}`;
}

function openDb() {
    if (!canUseIndexedDb()) {
        return Promise.reject(new Error('IndexedDB is not available'));
    }

    if (dbPromise) return dbPromise;

    dbPromise = new Promise((resolve, reject) => {
        const request = indexedDB.open(DB_NAME, DB_VERSION);

        request.onupgradeneeded = () => {
            const db = request.result;
            if (!db.objectStoreNames.contains(STORE_NAME)) {
                const store = db.createObjectStore(STORE_NAME, { keyPath: 'id' });
                store.createIndex('createdAt', 'createdAt');
                store.createIndex('type', 'type');
            }
        };

        request.onsuccess = () => resolve(request.result);
        request.onerror = () => reject(request.error);
    });

    return dbPromise;
}

function runStore(mode, callback) {
    return openDb().then((db) => new Promise((resolve, reject) => {
        const tx = db.transaction(STORE_NAME, mode);
        const store = tx.objectStore(STORE_NAME);
        const request = callback(store);

        tx.oncomplete = () => resolve(request?.result);
        tx.onerror = () => reject(tx.error);
        tx.onabort = () => reject(tx.error);
    }));
}

async function getAllOperations() {
    if (!canUseIndexedDb()) return [];
    const operations = await runStore('readonly', (store) => store.getAll());
    return (operations || []).sort((a, b) => (a.createdAt || '').localeCompare(b.createdAt || ''));
}

async function countOperations() {
    if (!canUseIndexedDb()) return 0;
    return runStore('readonly', (store) => store.count());
}

async function putOperation(operation) {
    await runStore('readwrite', (store) => store.put(operation));
}

async function deleteOperation(operationId) {
    await runStore('readwrite', (store) => store.delete(operationId));
}

async function refreshQueueState(patch = {}) {
    try {
        const pending = await countOperations();
        offlineQueueStore.update((state) => ({ ...state, pending, ...patch }));
    } catch (error) {
        offlineQueueStore.update((state) => ({
            ...state,
            ...patch,
            lastError: error?.message || 'No se pudo leer la cola offline'
        }));
    }
}

export function isBrowserOffline() {
    return false;
}

export function isOfflineError(error) {
    const code = String(error?.code || '').toLowerCase();
    const message = String(error?.message || '').toLowerCase();

    return code.includes('unavailable') ||
        code.includes('deadline-exceeded') ||
        message.includes('offline') ||
        message.includes('network') ||
        message.includes('failed to fetch') ||
        message.includes('client is offline');
}

export async function enqueueOfflineOperation(type, payload, metadata = {}) {
    const now = new Date().toISOString();
    const operation = {
        id: metadata.id || createId(type),
        type,
        payload,
        label: metadata.label || type,
        createdAt: now,
        updatedAt: now,
        attempts: 0,
        lastError: null
    };

    await putOperation(operation);
    await refreshQueueState({ lastError: null });
    return operation;
}

export async function getQueuedOperationsByType(type) {
    const operations = await getAllOperations();
    return operations.filter((operation) => operation.type === type);
}

export async function syncOfflineQueue() {
    if (isSyncing || isBrowserOffline()) return;

    isSyncing = true;
    await refreshQueueState({ syncing: true, lastError: null });

    try {
        const operations = await getAllOperations();

        for (const operation of operations) {
            const handler = syncHandlers[operation.type];
            if (!handler) continue;

            try {
                await handler(operation.payload, operation);
                await deleteOperation(operation.id);
            } catch (error) {
                const attempts = (operation.attempts || 0) + 1;
                const updatedOperation = {
                    ...operation,
                    attempts,
                    updatedAt: new Date().toISOString(),
                    lastError: error?.message || 'Error al sincronizar'
                };

                if (attempts >= MAX_ATTEMPTS && !isOfflineError(error)) {
                    await deleteOperation(operation.id);
                } else {
                    await putOperation(updatedOperation);
                }

                if (isOfflineError(error)) break;
            }
        }

        await refreshQueueState({
            syncing: false,
            lastSyncedAt: new Date().toISOString()
        });
    } catch (error) {
        await refreshQueueState({
            syncing: false,
            lastError: error?.message || 'Error al sincronizar la cola offline'
        });
    } finally {
        isSyncing = false;
    }
}

export function scheduleOfflineSync(delay = 250) {
    if (typeof window === 'undefined') return;
    window.setTimeout(() => {
        syncOfflineQueue();
    }, delay);
}

export function startOfflineQueueSync(handlers = {}) {
    syncHandlers = { ...syncHandlers, ...handlers };
    refreshQueueState();

    if (syncStarted || typeof window === 'undefined') {
        scheduleOfflineSync();
        return;
    }

    syncStarted = true;
    window.addEventListener('online', () => scheduleOfflineSync(150));
    window.addEventListener('focus', () => scheduleOfflineSync(500));
    document.addEventListener('visibilitychange', () => {
        if (document.visibilityState === 'visible') scheduleOfflineSync(500);
    });
    scheduleOfflineSync(500);
}
