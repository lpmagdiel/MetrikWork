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
import { getTeamSizeOption, normalizeTeamSizeData } from './teamSizes.js';

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

    const user = get(userStore);
    const adminIds = [uid, normalizeAdminEmail(user?.email)]
        .filter(Boolean)
        .filter((value, index, list) => list.indexOf(value) === index);
    const profiles = new Map();
    const loaded = new Set();
    const unsubscribers = adminIds.map((adminId) =>
        onSnapshot(doc(db, 'system_admins', adminId), (snapshot) => {
            profiles.set(adminId, snapshot.exists() ? { id: adminId, ...snapshot.data() } : null);
            loaded.add(adminId);
            updateSystemAdminState(adminIds, profiles, loaded);
        }, (error) => {
            console.error('Error in system admin listener:', error);
            profiles.set(adminId, null);
            loaded.add(adminId);
            updateSystemAdminState(adminIds, profiles, loaded);
        })
    );

    systemAdminUnsubscribe = () => {
        unsubscribers.forEach((unsubscribe) => unsubscribe());
    };
}

function updateSystemAdminState(adminIds, profiles, loaded) {
    const profile = adminIds
        .map((adminId) => profiles.get(adminId))
        .find((candidate) => isActiveSystemAdminProfile(candidate)) || null;

    systemAdminStore.set({
        loading: loaded.size < adminIds.length,
        isAdmin: Boolean(profile),
        profile
    });
}

function isActiveSystemAdminProfile(profile) {
    return Boolean(profile) && profile.active !== false;
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

export async function createTeamAccessCode({ expiresAt, size = 'S' } = {}) {
    const user = get(userStore);
    if (!user?.uid) throw new Error('Usuario no autenticado');

    const expirationDate = normalizeExpirationDate(expiresAt);
    if (!expirationDate || expirationDate.getTime() <= Date.now()) {
        throw new Error('Selecciona una fecha de caducidad futura');
    }

    const sizeOption = getTeamSizeOption(size);

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
                size: sizeOption.value,
                maxMembers: sizeOption.maxMembers,
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

export async function applyTeamAccessCodeToTeam(teamId, accessCode) {
    const user = get(userStore);
    if (!user?.uid || !teamId) throw new Error('No se pudo aplicar el código');

    const normalizedCode = normalizeAccessCode(accessCode);
    if (!/^\d{8}$/.test(normalizedCode)) {
        throw new Error('El código debe tener 8 dígitos');
    }

    return runTransaction(db, async (transaction) => {
        const teamRef = doc(db, 'teams', teamId);
        const codeRef = doc(db, 'team_access_codes', normalizedCode);
        const [teamSnapshot, codeSnapshot] = await Promise.all([
            transaction.get(teamRef),
            transaction.get(codeRef)
        ]);

        if (!teamSnapshot.exists()) throw new Error('Equipo no encontrado');
        if (!codeSnapshot.exists()) throw new Error('Código no encontrado');

        const teamData = teamSnapshot.data();
        const codeData = codeSnapshot.data();
        if (codeData.used) throw new Error('Este código ya fue utilizado');

        const expiresAt = toDate(codeData.expiresAt);
        if (expiresAt && expiresAt.getTime() < Date.now()) {
            throw new Error('Este código de acceso caducó');
        }

        const teamSizeData = normalizeTeamSizeData(codeData.size, codeData.maxMembers);
        const currentMembers = Array.isArray(teamData.members) ? teamData.members.length : 0;
        if (currentMembers > teamSizeData.maxMembers) {
            throw new Error(`Este equipo ya tiene ${currentMembers} miembros y el código ${teamSizeData.teamSize} permite menos.`);
        }

        const now = new Date().toISOString();
        transaction.update(teamRef, {
            billingDate: toDateInput(expiresAt),
            billingUpdatedAt: serverTimestamp(),
            billingUpdatedBy: user.uid,
            teamSize: teamSizeData.teamSize,
            maxMembers: teamSizeData.maxMembers,
            teamAccessCode: {
                code: normalizedCode,
                uniqueCode: codeData.uniqueCode || '',
                expiresAt: codeData.expiresAt || null,
                size: teamSizeData.teamSize,
                maxMembers: teamSizeData.maxMembers,
                appliedAt: now,
                appliedBy: user.uid
            },
            updatedAt: now
        });

        transaction.update(codeRef, {
            used: true,
            usedAt: serverTimestamp(),
            usedBy: user.uid,
            usedByEmail: user.email || '',
            usedTeamId: teamId,
            usedTeamName: teamData.team || teamData.name || '',
            updatedAt: serverTimestamp()
        });

        return true;
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

function normalizeAccessCode(value) {
    return String(value || '').replace(/\D/g, '').slice(0, 8);
}

function toDate(value) {
    if (!value) return null;
    if (value instanceof Date) return value;
    if (typeof value.toDate === 'function') return value.toDate();
    if (typeof value.seconds === 'number') return new Date(value.seconds * 1000);

    const date = new Date(value);
    return Number.isNaN(date.getTime()) ? null : date;
}

function toDateInput(value) {
    const date = toDate(value);
    if (!date) return null;

    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, '0');
    const day = String(date.getDate()).padStart(2, '0');
    return `${year}-${month}-${day}`;
}

function normalizeAdminEmail(value) {
    return String(value || '').trim().toLowerCase();
}

function getTime(value) {
    if (!value) return 0;
    if (value instanceof Date) return value.getTime();
    if (typeof value.toDate === 'function') return value.toDate().getTime();
    if (typeof value.seconds === 'number') return value.seconds * 1000;

    const date = new Date(value);
    return Number.isNaN(date.getTime()) ? 0 : date.getTime();
}
