import { writable, get } from 'svelte/store';
import { db } from './firebase.js';
import {
    doc,
    getDoc,
    onSnapshot,
    collection
} from 'firebase/firestore';
import { teamChargesStore } from './teamCharges.js';

export const teamInvoicesStore = writable([]);

let teamInvoicesUnsubscribe = null;
let activeSubscriptionTeamId = null;

const INVOICE_PREFIX = 'MW';

function buildInvoiceNumber(date = new Date()) {
    const stamp = [
        date.getFullYear(),
        String(date.getMonth() + 1).padStart(2, '0'),
        String(date.getDate()).padStart(2, '0')
    ].join('');
    const suffix = Math.random().toString(36).slice(2, 7).toUpperCase();
    return `${INVOICE_PREFIX}-${stamp}-${suffix}`;
}

export function createInvoiceNumber(now = new Date()) {
    return buildInvoiceNumber(now);
}

function isInvoiceLike(charge) {
    if (!charge || typeof charge !== 'object') return false;
    return Boolean(charge.invoiceNumber);
}

function sortInvoices(invoices) {
    return [...invoices].sort((a, b) =>
        (b.issuedAt || b.createdAt || '').localeCompare(a.issuedAt || a.createdAt || '')
    );
}

function unsubscribeCurrent() {
    if (teamInvoicesUnsubscribe) {
        try { teamInvoicesUnsubscribe(); } catch (error) { /* noop */ }
        teamInvoicesUnsubscribe = null;
    }
    activeSubscriptionTeamId = null;
}

/**
 * Suscribe a las facturas derivadas de los cobros.
 * Las facturas son los cobros que tienen `invoiceNumber`.
 * Reutiliza la suscripción a `teamCharges` para evitar dobles listeners.
 */
export function subscribeToTeamInvoices(teamId) {
    unsubscribeCurrent();
    teamInvoicesStore.set([]);

    if (!teamId) return () => {};

    activeSubscriptionTeamId = teamId;
    const chargesRef = collection(db, 'teams', teamId, 'charges');

    const handleSuccess = (snapshot) => {
        if (activeSubscriptionTeamId !== teamId) return;
        const invoices = snapshot.docs
            .map((docSnap) => ({ id: docSnap.id, ...docSnap.data() }))
            .filter(isInvoiceLike);
        teamInvoicesStore.set(sortInvoices(invoices));
    };

    const handleError = (error) => {
        console.error('Error in team invoices listener:', error);
        if (activeSubscriptionTeamId === teamId) {
            teamInvoicesStore.set([]);
        }
    };

    teamInvoicesUnsubscribe = onSnapshot(chargesRef, handleSuccess, handleError);

    return () => {
        if (activeSubscriptionTeamId === teamId) {
            unsubscribeCurrent();
            teamInvoicesStore.set([]);
        }
    };
}

export async function getInvoiceById(teamId, invoiceId) {
    if (!teamId || !invoiceId) return null;
    const ref = doc(db, 'teams', teamId, 'charges', invoiceId);
    const snapshot = await getDoc(ref);
    if (!snapshot.exists()) return null;
    const data = snapshot.data();
    return isInvoiceLike({ id: snapshot.id, ...data }) ? { id: snapshot.id, ...data } : null;
}

export function filterInvoicesByClient(invoices, clientId) {
    if (!clientId) return invoices || [];
    return (invoices || []).filter((invoice) =>
        invoice.client?.taxId === clientId ||
        invoice.client?.name === clientId ||
        invoice.clientId === clientId
    );
}

export function getInvoicesFromCharges(charges) {
    if (!Array.isArray(charges)) return [];
    return sortInvoices(charges.filter(isInvoiceLike));
}

export function getCurrentInvoices() {
    return get(teamInvoicesStore);
}

export function getCurrentInvoiceTotal(invoices) {
    return (invoices || []).reduce((sum, invoice) => sum + (Number(invoice.amount) || 0), 0);
}

export function resetInvoiceStore() {
    unsubscribeCurrent();
    teamInvoicesStore.set([]);
}

/**
 * Helper: a partir del estado de los stores globales, devuelve los cobros
 * que funcionan como facturas sin necesidad de iniciar una nueva suscripción.
 */
export function deriveInvoicesFromChargesStore() {
    return getInvoicesFromCharges(get(teamChargesStore) || []);
}