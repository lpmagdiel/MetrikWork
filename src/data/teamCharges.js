import { writable } from 'svelte/store';
import {
    addDoc,
    collection,
    deleteDoc,
    doc,
    increment,
    onSnapshot,
    updateDoc,
    writeBatch
} from 'firebase/firestore';
import { db } from './firebase.js';

export const teamChargesStore = writable([]);
export const teamChargeTemplatesStore = writable([]);

let teamChargesUnsubscribe;
let teamChargeTemplatesUnsubscribe;

export const CHARGE_METHODS = ['cash', 'transfer', 'bizum'];
export const CHARGE_STATUSES = ['pending', 'paid'];
export const CHARGE_RANGE_TYPES = ['days', 'weekly', 'monthly', 'recurring'];
export const CHARGE_RECURRENCE_FREQUENCIES = ['weekly', 'monthly'];

function normalizeText(value, fallback = '') {
    return String(value ?? fallback).trim();
}

function normalizeAmount(value) {
    return Math.max(0, Number(value) || 0);
}

function normalizeMethod(value) {
    return CHARGE_METHODS.includes(value) ? value : 'transfer';
}

function normalizeStatus(value) {
    return CHARGE_STATUSES.includes(value) ? value : 'pending';
}

function normalizeRangeType(value) {
    return CHARGE_RANGE_TYPES.includes(value) ? value : 'days';
}

function normalizeRecurrenceFrequency(value) {
    return CHARGE_RECURRENCE_FREQUENCIES.includes(value) ? value : 'monthly';
}

function normalizeBudgetTarget(value = {}) {
    const type = value?.type === 'location' ? 'location' : 'team';
    return {
        type,
        locationId: type === 'location' ? normalizeText(value.locationId) : '',
        locationName: type === 'location' ? normalizeText(value.locationName) : ''
    };
}

function normalizeParty(value = {}) {
    return {
        name: normalizeText(value.name),
        taxId: normalizeText(value.taxId),
        email: normalizeText(value.email),
        phone: normalizeText(value.phone),
        address: normalizeText(value.address),
        iban: normalizeText(value.iban),
        bankName: normalizeText(value.bankName),
        bizum: normalizeText(value.bizum)
    };
}

function createInvoiceNumber() {
    const now = new Date();
    const stamp = [
        now.getFullYear(),
        String(now.getMonth() + 1).padStart(2, '0'),
        String(now.getDate()).padStart(2, '0')
    ].join('');
    return `MW-${stamp}-${Math.random().toString(36).slice(2, 7).toUpperCase()}`;
}

function getSortDate(charge = {}) {
    return charge.dueDate || charge.endDate || charge.startDate || charge.createdAt || '';
}

function buildChargeDoc(data = {}, user = {}) {
    const now = new Date().toISOString();
    const rangeType = normalizeRangeType(data.rangeType);
    const recurrenceEnabled = rangeType === 'recurring' || Boolean(data.recurrence?.enabled);
    const amount = normalizeAmount(data.amount);
    const status = normalizeStatus(data.status);

    return {
        title: normalizeText(data.title, 'Cobro'),
        description: normalizeText(data.description),
        amount,
        currency: normalizeText(data.currency, 'MXN').toUpperCase(),
        method: normalizeMethod(data.method),
        status,
        paidAt: status === 'paid' ? data.paidAt || now : '',
        rangeType,
        startDate: normalizeText(data.startDate),
        endDate: normalizeText(data.endDate),
        dueDate: normalizeText(data.dueDate || data.endDate || data.startDate),
        recurrence: {
            enabled: recurrenceEnabled,
            frequency: normalizeRecurrenceFrequency(data.recurrence?.frequency),
            interval: Math.max(1, Number(data.recurrence?.interval) || 1),
            nextDate: normalizeText(data.recurrence?.nextDate || data.dueDate || data.endDate || data.startDate),
            notifyDaysBefore: Math.max(1, Number(data.recurrence?.notifyDaysBefore) || 2)
        },
        client: normalizeParty(data.client),
        company: normalizeParty(data.company),
        budgetTarget: normalizeBudgetTarget(data.budgetTarget),
        applyToBudget: data.applyToBudget !== false,
        invoiceNumber: normalizeText(data.invoiceNumber, createInvoiceNumber()),
        createdBy: user?.uid || user?.id || '',
        createdByName: user?.name || user?.displayName || user?.email || 'Usuario',
        createdAt: now,
        updatedAt: now
    };
}

function applyBudgetUpdate(batch, teamId, charge, amount) {
    if (!teamId || !charge?.applyToBudget || charge.status !== 'paid' || amount <= 0) return false;
    const now = new Date().toISOString();

    if (charge.budgetTarget?.type === 'location' && charge.budgetTarget?.locationId) {
        batch.update(doc(db, 'teams', teamId, 'locations', charge.budgetTarget.locationId), {
            budget: increment(amount),
            updatedAt: now
        });
        return true;
    }

    batch.update(doc(db, 'teams', teamId), {
        projectBudget: increment(amount),
        projectBudgetCurrency: charge.currency || 'MXN',
        updatedAt: now
    });
    return true;
}

export function subscribeToTeamCharges(teamId) {
    if (teamChargesUnsubscribe) teamChargesUnsubscribe();
    teamChargesUnsubscribe = null;
    teamChargesStore.set([]);

    if (!teamId) return () => {};

    const unsubscribe = onSnapshot(
        collection(db, 'teams', teamId, 'charges'),
        (snapshot) => {
            const charges = snapshot.docs
                .map((chargeDoc) => ({ id: chargeDoc.id, ...chargeDoc.data() }))
                .sort((a, b) => getSortDate(b).localeCompare(getSortDate(a)));
            teamChargesStore.set(charges);
        },
        (error) => {
            console.error('Error in team charges listener:', error);
            teamChargesStore.set([]);
        }
    );

    teamChargesUnsubscribe = unsubscribe;
    return () => {
        unsubscribe();
        if (teamChargesUnsubscribe === unsubscribe) {
            teamChargesUnsubscribe = null;
            teamChargesStore.set([]);
        }
    };
}

export function subscribeToTeamChargeTemplates(teamId) {
    if (teamChargeTemplatesUnsubscribe) teamChargeTemplatesUnsubscribe();
    teamChargeTemplatesUnsubscribe = null;
    teamChargeTemplatesStore.set([]);

    if (!teamId) return () => {};

    const unsubscribe = onSnapshot(
        collection(db, 'teams', teamId, 'chargeTemplates'),
        (snapshot) => {
            const templates = snapshot.docs
                .map((templateDoc) => ({ id: templateDoc.id, ...templateDoc.data() }))
                .sort((a, b) => (b.updatedAt || b.createdAt || '').localeCompare(a.updatedAt || a.createdAt || ''));
            teamChargeTemplatesStore.set(templates);
        },
        (error) => {
            console.error('Error in team charge templates listener:', error);
            teamChargeTemplatesStore.set([]);
        }
    );

    teamChargeTemplatesUnsubscribe = unsubscribe;
    return () => {
        unsubscribe();
        if (teamChargeTemplatesUnsubscribe === unsubscribe) {
            teamChargeTemplatesUnsubscribe = null;
            teamChargeTemplatesStore.set([]);
        }
    };
}

export async function registerTeamCharge(teamId, data, user) {
    if (!teamId) throw new Error('Equipo no válido');

    const charge = buildChargeDoc(data, user);
    const batch = writeBatch(db);
    const chargeRef = doc(collection(db, 'teams', teamId, 'charges'));
    const budgetApplied = applyBudgetUpdate(batch, teamId, charge, charge.amount);

    batch.set(chargeRef, {
        ...charge,
        budgetAppliedAmount: budgetApplied ? charge.amount : 0,
        budgetAppliedAt: budgetApplied ? new Date().toISOString() : ''
    });

    await batch.commit();
    return chargeRef.id;
}

export async function markTeamChargePaid(teamId, charge) {
    if (!teamId || !charge?.id) throw new Error('Cobro no válido');

    const amount = normalizeAmount(charge.amount);
    const alreadyApplied = normalizeAmount(charge.budgetAppliedAmount);
    const amountToApply = Math.max(0, amount - alreadyApplied);
    const now = new Date().toISOString();
    const nextCharge = {
        ...charge,
        status: 'paid',
        paidAt: charge.paidAt || now,
        updatedAt: now
    };

    const batch = writeBatch(db);
    const budgetApplied = applyBudgetUpdate(batch, teamId, nextCharge, amountToApply);
    batch.update(doc(db, 'teams', teamId, 'charges', charge.id), {
        status: 'paid',
        paidAt: nextCharge.paidAt,
        updatedAt: now,
        budgetAppliedAmount: alreadyApplied + (budgetApplied ? amountToApply : 0),
        budgetAppliedAt: budgetApplied ? now : charge.budgetAppliedAt || ''
    });
    await batch.commit();
}

export async function deleteTeamCharge(teamId, chargeId) {
    if (!teamId || !chargeId) return;
    await deleteDoc(doc(db, 'teams', teamId, 'charges', chargeId));
}

export async function updateTeamChargeReminder(teamId, chargeId, reminderDate) {
    if (!teamId || !chargeId || !reminderDate) return;
    await updateDoc(doc(db, 'teams', teamId, 'charges', chargeId), {
        lastReminderDate: reminderDate,
        lastReminderAt: new Date().toISOString()
    });
}

export async function addTeamChargeTemplate(teamId, templateData = {}, user = {}) {
    if (!teamId) return;
    const now = new Date().toISOString();
    const data = {
        name: normalizeText(templateData.name, 'Plantilla de cobro'),
        payload: templateData.payload || {},
        createdBy: user?.uid || user?.id || '',
        createdByName: user?.name || user?.displayName || user?.email || 'Usuario',
        createdAt: now,
        updatedAt: now
    };
    const templateRef = await addDoc(collection(db, 'teams', teamId, 'chargeTemplates'), data);
    return templateRef.id;
}

export async function deleteTeamChargeTemplate(teamId, templateId) {
    if (!teamId || !templateId) return;
    await deleteDoc(doc(db, 'teams', teamId, 'chargeTemplates', templateId));
}
