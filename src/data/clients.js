import { writable } from 'svelte/store';
import {
    addDoc,
    collection,
    deleteDoc,
    doc,
    onSnapshot,
    query,
    updateDoc,
    where,
    getDocs
} from 'firebase/firestore';
import { db } from './firebase.js';

/**
 * Clientes de la empresa (globales).
 *
 * La app pertenece a una sola empresa constructora y los clientes son
 * relaciones comerciales compartidas entre todos los equipos de trabajo.
 * Por eso esta colección vive como top-level en Firestore y no depende
 * de un `teamId`.
 */
export const companyClientsStore = writable([]);

let clientsUnsubscribe = null;
let activeSubscription = false;

const CLIENT_FIELD_LIMITS = {
    name: 120,
    taxId: 40,
    email: 120,
    phone: 40,
    address: 240,
    contactName: 120,
    notes: 1000
};

const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export const CLIENT_STATUSES = {
    active: 'active',
    inactive: 'inactive'
};

function normalizeText(value, maxLength = 0) {
    const text = String(value ?? '').trim();
    if (!maxLength || text.length <= maxLength) return text;
    return text.slice(0, maxLength);
}

function normalizeEmail(value) {
    const email = normalizeText(value, CLIENT_FIELD_LIMITS.email);
    if (!email) return '';
    return EMAIL_PATTERN.test(email) ? email.toLowerCase() : email;
}

function normalizePhone(value) {
    const phone = normalizeText(value, CLIENT_FIELD_LIMITS.phone);
    return phone.replace(/[^\d+\s()-]/g, '').trim();
}

function normalizeBoolean(value, fallback = true) {
    if (typeof value === 'boolean') return value;
    if (value === 'true' || value === '1' || value === 1) return true;
    if (value === 'false' || value === '0' || value === 0) return false;
    return fallback;
}

export function normalizeClient(data = {}) {
    return {
        name: normalizeText(data.name, CLIENT_FIELD_LIMITS.name),
        taxId: normalizeText(data.taxId, CLIENT_FIELD_LIMITS.taxId),
        email: normalizeEmail(data.email),
        phone: normalizePhone(data.phone),
        address: normalizeText(data.address, CLIENT_FIELD_LIMITS.address),
        contactName: normalizeText(data.contactName, CLIENT_FIELD_LIMITS.contactName),
        notes: normalizeText(data.notes, CLIENT_FIELD_LIMITS.notes),
        active: normalizeBoolean(data.active, true)
    };
}

export function validateClient(data = {}) {
    const errors = [];
    if (!data.name || data.name.length < 2) {
        errors.push('El nombre del cliente es obligatorio (mínimo 2 caracteres).');
    }
    if (data.email && !EMAIL_PATTERN.test(data.email)) {
        errors.push('El email del cliente no tiene un formato válido.');
    }
    if (data.name && data.name.length > CLIENT_FIELD_LIMITS.name) {
        errors.push(`El nombre no puede superar los ${CLIENT_FIELD_LIMITS.name} caracteres.`);
    }
    return errors;
}

function sortClients(clients) {
    return [...clients].sort((a, b) => {
        if ((a.active ? 0 : 1) !== (b.active ? 0 : 1)) {
            return (a.active ? 0 : 1) - (b.active ? 0 : 1);
        }
        return (a.name || '').localeCompare(b.name || '', 'es', { sensitivity: 'base' });
    });
}

function buildClientDoc(data = {}, user = {}) {
    const client = normalizeClient(data);
    return {
        ...client,
        createdBy: user?.uid || user?.id || '',
        createdByName: user?.name || user?.displayName || user?.email || 'Usuario',
        createdAt: data.createdAt || new Date().toISOString(),
        updatedAt: new Date().toISOString()
    };
}

function unsubscribeCurrent() {
    if (clientsUnsubscribe) {
        try { clientsUnsubscribe(); } catch (error) { /* noop */ }
        clientsUnsubscribe = null;
    }
    activeSubscription = false;
}

/**
 * Suscribe al listado global de clientes de la empresa.
 * Idempotente: cancelar la suscripción anterior antes de crear la nueva.
 */
export function subscribeToCompanyClients() {
    unsubscribeCurrent();
    companyClientsStore.set([]);

    activeSubscription = true;
    const clientsCollection = collection(db, 'clients');

    const handleSuccess = (snapshot) => {
        if (!activeSubscription) return;
        const clients = snapshot.docs.map((docSnap) => ({
            id: docSnap.id,
            ...docSnap.data()
        }));
        companyClientsStore.set(sortClients(clients));
    };

    const handleError = (error) => {
        console.error('Error in company clients listener:', error);
        if (activeSubscription) {
            companyClientsStore.set([]);
        }
    };

    clientsUnsubscribe = onSnapshot(clientsCollection, handleSuccess, handleError);

    return () => {
        if (activeSubscription) {
            unsubscribeCurrent();
            companyClientsStore.set([]);
        }
    };
}

export async function addCompanyClient(data = {}, user = {}) {
    const errors = validateClient(data);
    if (errors.length) throw new Error(errors[0]);
    const client = buildClientDoc(data, user);
    const ref = await addDoc(collection(db, 'clients'), client);
    return ref.id;
}

export async function updateCompanyClient(clientId, data = {}) {
    if (!clientId) throw new Error('Cliente no válido');
    const errors = validateClient(data);
    if (errors.length) throw new Error(errors[0]);
    const patch = {
        ...normalizeClient(data),
        updatedAt: new Date().toISOString()
    };
    await updateDoc(doc(db, 'clients', clientId), patch);
}

export async function deleteCompanyClient(clientId) {
    if (!clientId) return;
    await deleteDoc(doc(db, 'clients', clientId));
}

export async function setCompanyClientActive(clientId, active) {
    if (!clientId) return;
    await updateDoc(doc(db, 'clients', clientId), {
        active: normalizeBoolean(active, true),
        updatedAt: new Date().toISOString()
    });
}

function normalizeSearch(value) {
    return String(value || '')
        .toLowerCase()
        .normalize('NFD')
        .replace(/[\u0300-\u036f]/g, '')
        .trim();
}

export function searchClients(clients, term = '', { includeInactive = true } = {}) {
    const needle = normalizeSearch(term);
    const list = Array.isArray(clients) ? clients : [];
    const filtered = includeInactive ? list : list.filter((client) => client.active !== false);

    if (!needle) return filtered;

    return filtered.filter((client) => {
        const haystack = [
            client.name,
            client.taxId,
            client.email,
            client.phone,
            client.contactName,
            client.address
        ].map(normalizeSearch);
        return haystack.some((value) => value.includes(needle));
    });
}

export async function findClientsByTaxId(taxId) {
    if (!taxId) return [];
    const normalized = normalizeText(taxId);
    if (!normalized) return [];
    const snapshot = await getDocs(
        query(collection(db, 'clients'), where('taxId', '==', normalized))
    );
    return snapshot.docs.map((docSnap) => ({ id: docSnap.id, ...docSnap.data() }));
}

export function resetClientStore() {
    unsubscribeCurrent();
    companyClientsStore.set([]);
}