import { writable, get } from 'svelte/store';
import { db } from './firebase.js';
import { userStore } from './auth.js';
import {
    collection,
    doc,
    onSnapshot,
    runTransaction,
    serverTimestamp,
    updateDoc
} from 'firebase/firestore';

export const systemAdminStore = writable({
    loading: true,
    isAdmin: false,
    profile: null
});
export const teamAccessCodesStore = writable([]);
export const adminTeamsStore = writable([]);

let systemAdminUnsubscribe;
let accessCodesUnsubscribe;
let adminTeamsUnsubscribe;

export function subscribeToSystemAdmin(uid) {
    if (systemAdminUnsubscribe) systemAdminUnsubscribe();
    systemAdminStore.set({ loading: true, isAdmin: false, profile: null });

    if (!uid) {
        systemAdminStore.set({ loading: false, isAdmin: false, profile: null });
        return;
    }

    systemAdminUnsubscribe = onSnapshot(doc(db, 'system_admins', uid), (snapshot) => {
        const profile = snapshot.exists() ? snapshot.data() : null;
        systemAdminStore.set({
            loading: false,
            isAdmin: Boolean(profile?.active),
            profile
        });
    }, (error) => {
        console.error('Error in system admin listener:', error);
        systemAdminStore.set({ loading: false, isAdmin: false, profile: null });
    });
}

export function subscribeToTeamAccessCodes() {
    if (accessCodesUnsubscribe) accessCodesUnsubscribe();

    accessCodesUnsubscribe = onSnapshot(collection(db, 'team_access_codes'), (snapshot) => {
        const codes = snapshot.docs
            .map((item) => ({ id: item.id, ...item.data() }))
            .sort((a, b) => getTime(b.createdAt) - getTime(a.createdAt));
        teamAccessCodesStore.set(codes);
    }, (error) => {
        console.error('Error in team access codes listener:', error);
        teamAccessCodesStore.set([]);
    });

    return () => {
        if (accessCodesUnsubscribe) {
            accessCodesUnsubscribe();
            accessCodesUnsubscribe = null;
        }
        teamAccessCodesStore.set([]);
    };
}

export function subscribeToAdminTeams() {
    if (adminTeamsUnsubscribe) adminTeamsUnsubscribe();

    adminTeamsUnsubscribe = onSnapshot(collection(db, 'teams'), (snapshot) => {
        const teams = snapshot.docs
            .map((item) => ({ id: item.id, name: item.data().team, ...item.data() }))
            .sort((a, b) => getTime(b.createdAt) - getTime(a.createdAt));
        adminTeamsStore.set(teams);
    }, (error) => {
        console.error('Error in admin teams listener:', error);
        adminTeamsStore.set([]);
    });

    return () => {
        if (adminTeamsUnsubscribe) {
            adminTeamsUnsubscribe();
            adminTeamsUnsubscribe = null;
        }
        adminTeamsStore.set([]);
    };
}

export async function createTeamAccessCode({ expiresAt }) {
    const user = get(userStore);
    if (!user?.uid) throw new Error('Usuario no autenticado');

    const expirationDate = normalizeExpirationDate(expiresAt);
    if (!expirationDate || expirationDate.getTime() <= Date.now()) {
        throw new Error('Selecciona una fecha de caducidad futura');
    }

    for (let attempt = 0; attempt < 20; attempt += 1) {
        const code = generateEightDigitCode();
        const codeRef = doc(db, 'team_access_codes', code);

        const created = await runTransaction(db, async (transaction) => {
            const snapshot = await transaction.get(codeRef);
            if (snapshot.exists()) return null;

            const uniqueCode = createUniqueCode();
            const data = {
                code,
                uniqueCode,
                expiresAt: expirationDate,
                used: false,
                createdBy: user.uid,
                createdByEmail: user.email || '',
                createdAt: serverTimestamp(),
                updatedAt: serverTimestamp()
            };
            transaction.set(codeRef, data);
            return { id: code, ...data };
        });

        if (created) return created;
    }

    throw new Error('No se pudo generar un código único. Intenta de nuevo.');
}

export async function updateTeamBillingDate(teamId, billingDate) {
    const user = get(userStore);
    if (!user?.uid || !teamId) throw new Error('No se pudo actualizar la fecha');

    const normalizedDate = normalizeBillingDate(billingDate);
    await updateDoc(doc(db, 'teams', teamId), {
        billingDate: normalizedDate,
        billingUpdatedAt: serverTimestamp(),
        billingUpdatedBy: user.uid
    });
}

function generateEightDigitCode() {
    return String(Math.floor(10000000 + Math.random() * 90000000));
}

function createUniqueCode() {
    if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
        return crypto.randomUUID();
    }

    return `${Date.now()}-${Math.random().toString(36).slice(2, 12)}`;
}

function normalizeExpirationDate(value) {
    if (value instanceof Date) return value;
    if (typeof value !== 'string') return null;

    const match = value.match(/^(\d{4})-(\d{2})-(\d{2})$/);
    if (!match) return null;

    const [, year, month, day] = match.map(Number);
    return new Date(year, month - 1, day, 23, 59, 59, 999);
}

function normalizeBillingDate(value) {
    const date = String(value || '').trim();
    return /^\d{4}-\d{2}-\d{2}$/.test(date) ? date : null;
}

function getTime(value) {
    if (!value) return 0;
    if (value instanceof Date) return value.getTime();
    if (typeof value.toDate === 'function') return value.toDate().getTime();
    if (typeof value.seconds === 'number') return value.seconds * 1000;

    const date = new Date(value);
    return Number.isNaN(date.getTime()) ? 0 : date.getTime();
}
