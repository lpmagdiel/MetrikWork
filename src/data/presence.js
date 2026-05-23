import { writable } from 'svelte/store';
import { db } from './firebase.js';
import {
    collection,
    doc,
    documentId,
    onSnapshot,
    query,
    setDoc,
    where
} from 'firebase/firestore';

const HEARTBEAT_MS = 30000;
const ACTIVE_WINDOW_MS = 90000;

export const userPresenceStore = writable({});

let currentPresenceUid = '';
let heartbeatTimer = null;
let removePresenceListeners = null;
let presenceUnsubscribers = [];

function getNowIso() {
    return new Date().toISOString();
}

function getUniqueIds(userIds = []) {
    return [...new Set(userIds.filter(Boolean).map(String))];
}

function chunkIds(userIds) {
    const chunks = [];
    for (let index = 0; index < userIds.length; index += 10) {
        chunks.push(userIds.slice(index, index + 10));
    }
    return chunks;
}

function isAppActive() {
    if (typeof document === 'undefined') return true;
    const isVisible = document.visibilityState !== 'hidden';
    const isOnline = typeof navigator === 'undefined' ? true : navigator.onLine !== false;
    return isVisible && isOnline;
}

async function writePresence(uid, isOnline) {
    if (!uid) return;
    const now = getNowIso();
    const data = {
        uid,
        isOnline,
        updatedAt: now
    };

    if (isOnline) {
        data.lastActiveAt = now;
    } else {
        data.lastSeenAt = now;
    }

    try {
        await setDoc(doc(db, 'presence', uid), data, { merge: true });
    } catch (error) {
        console.warn('Error updating user presence:', error);
    }
}

function syncCurrentPresence() {
    writePresence(currentPresenceUid, isAppActive());
}

function markCurrentUserOnline() {
    if (!currentPresenceUid || !isAppActive()) return;
    writePresence(currentPresenceUid, true);
}

function markCurrentUserOffline() {
    writePresence(currentPresenceUid, false);
}

export function startUserPresence(uid) {
    stopUserPresence();
    if (!uid) return;

    currentPresenceUid = uid;
    markCurrentUserOnline();
    heartbeatTimer = setInterval(syncCurrentPresence, HEARTBEAT_MS);

    if (typeof window === 'undefined' || typeof document === 'undefined') return;

    document.addEventListener('visibilitychange', syncCurrentPresence);
    window.addEventListener('focus', markCurrentUserOnline);
    window.addEventListener('online', syncCurrentPresence);
    window.addEventListener('offline', syncCurrentPresence);
    window.addEventListener('pagehide', markCurrentUserOffline);
    window.addEventListener('beforeunload', markCurrentUserOffline);

    removePresenceListeners = () => {
        document.removeEventListener('visibilitychange', syncCurrentPresence);
        window.removeEventListener('focus', markCurrentUserOnline);
        window.removeEventListener('online', syncCurrentPresence);
        window.removeEventListener('offline', syncCurrentPresence);
        window.removeEventListener('pagehide', markCurrentUserOffline);
        window.removeEventListener('beforeunload', markCurrentUserOffline);
    };
}

export function stopUserPresence(shouldMarkOffline = true) {
    const uid = currentPresenceUid;
    currentPresenceUid = '';

    if (heartbeatTimer) {
        clearInterval(heartbeatTimer);
        heartbeatTimer = null;
    }

    removePresenceListeners?.();
    removePresenceListeners = null;

    if (shouldMarkOffline && uid) {
        writePresence(uid, false);
    }
}

export function subscribeToUsersPresence(userIds = []) {
    presenceUnsubscribers.forEach((unsubscribe) => unsubscribe?.());
    presenceUnsubscribers = [];
    userPresenceStore.set({});

    const ids = getUniqueIds(userIds);
    if (ids.length === 0) return () => {};

    const presenceByChunk = new Map();

    function publishPresence() {
        const nextPresence = {};
        presenceByChunk.forEach((chunkPresence) => {
            Object.assign(nextPresence, chunkPresence);
        });
        userPresenceStore.set(nextPresence);
    }

    const localUnsubscribers = chunkIds(ids).map((chunk, index) => {
        const presenceQuery = query(
            collection(db, 'presence'),
            where(documentId(), 'in', chunk)
        );

        return onSnapshot(presenceQuery, (snapshot) => {
            const chunkPresence = {};
            snapshot.forEach((presenceDoc) => {
                chunkPresence[presenceDoc.id] = {
                    id: presenceDoc.id,
                    ...presenceDoc.data()
                };
            });
            presenceByChunk.set(index, chunkPresence);
            publishPresence();
        }, (error) => {
            console.error('Error in presence listener:', error);
        });
    });
    presenceUnsubscribers = localUnsubscribers;

    return () => {
        localUnsubscribers.forEach((unsubscribe) => unsubscribe?.());
        if (presenceUnsubscribers === localUnsubscribers) {
            presenceUnsubscribers = [];
            userPresenceStore.set({});
        }
    };
}

function getPresenceMillis(value) {
    if (!value) return 0;
    if (typeof value.toMillis === 'function') return value.toMillis();
    if (typeof value === 'number') return value;

    const parsed = Date.parse(value);
    return Number.isNaN(parsed) ? 0 : parsed;
}

export function isUserPresenceActive(presence, now = Date.now()) {
    if (!presence?.isOnline) return false;
    const lastActiveAt = getPresenceMillis(presence.lastActiveAt || presence.updatedAt);
    return Boolean(lastActiveAt && now - lastActiveAt <= ACTIVE_WINDOW_MS);
}
