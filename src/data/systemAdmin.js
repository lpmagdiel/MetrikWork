import { writable, get } from 'svelte/store';
import { collection, onSnapshot, query, where } from 'firebase/firestore';
import { db } from './firebase.js';
import { userStore } from './auth.js';
import {
    isConfiguredSystemAdmin,
    normalizeSystemAdminEmail,
    SYSTEM_ADMIN_EMAILS
} from './systemAdminConfig.js';

export { isConfiguredSystemAdmin, normalizeSystemAdminEmail, SYSTEM_ADMIN_EMAILS };

export const systemAdminStore = writable({
    loading: true,
    isAdmin: false
});
export const adminTeamsStore = writable([]);

let adminTeamsUnsubscribe;

export function subscribeToSystemAdmin(uid) {
    const user = get(userStore);
    const email = normalizeSystemAdminEmail(user?.email);
    const isAdmin = Boolean(uid) && isConfiguredSystemAdmin(email);

    systemAdminStore.set({
        loading: false,
        isAdmin
    });

    if (!isAdmin) stopAdminTeamsSubscription();
}

export function subscribeToAdminTeams() {
    stopAdminTeamsSubscription();

    const user = get(userStore);
    if (!user?.uid || !isConfiguredSystemAdmin(user.email)) {
        adminTeamsStore.set([]);
        return () => {};
    }

    const adminTeamsQuery = query(
        collection(db, 'teams'),
        where('members', 'array-contains', user.uid)
    );

    adminTeamsUnsubscribe = onSnapshot(adminTeamsQuery, (snapshot) => {
        const teams = snapshot.docs
            .map((item) => ({ id: item.id, name: item.data().team, ...item.data() }))
            .filter((team) => team.admin === user.uid)
            .sort((a, b) => getTime(b.createdAt) - getTime(a.createdAt));
        adminTeamsStore.set(teams);
    }, (error) => {
        console.error('Error in admin teams listener:', error);
        adminTeamsStore.set([]);
    });

    return stopAdminTeamsSubscription;
}

function stopAdminTeamsSubscription() {
    if (adminTeamsUnsubscribe) {
        adminTeamsUnsubscribe();
        adminTeamsUnsubscribe = null;
    }
    adminTeamsStore.set([]);
}

function getTime(value) {
    if (!value) return 0;
    if (value instanceof Date) return value.getTime();
    if (typeof value.toDate === 'function') return value.toDate().getTime();
    if (typeof value.seconds === 'number') return value.seconds * 1000;

    const date = new Date(value);
    return Number.isNaN(date.getTime()) ? 0 : date.getTime();
}
