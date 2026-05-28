import { writable, get } from 'svelte/store';
import { db } from './firebase.js';
import {
    onSnapshot,
    collection,
    query,
    where,
    deleteDoc,
    doc,
    updateDoc,
    addDoc,
    setDoc,
    getDoc,
    getDocs,
    writeBatch
} from 'firebase/firestore';
import { showDeviceNotification } from './pushNotifications.js';

export const DEFAULT_NOTIFICATION_PREFERENCES = {
    privateChats: true,
    groupChats: true,
    calls: true,
    events: true,
    tasks: true,
    requests: true,
    inventory: true,
    payments: true,
};

export const notificationsStore = writable([]);
export const notificationPreferencesStore = writable(DEFAULT_NOTIFICATION_PREFERENCES);
let notificationsUnsubscribe;
let notificationPreferencesUnsubscribe;
let hasLoadedInitialSnapshot = false;
let currentNotificationPreferences = DEFAULT_NOTIFICATION_PREFERENCES;
let rawNotifications = [];
const recipientPreferencesCache = new Map();
const RECIPIENT_PREFERENCES_CACHE_MS = 30000;

function isAppInBackground() {
    if (typeof document === 'undefined') return false;
    return document.visibilityState === 'hidden' || !document.hasFocus();
}

function isChatNotification(notification) {
    return notification.type === 'chat_message' ||
        notification.type === 'private_chat_message';
}

function shouldShowDeviceNotification(notification) {
    if (notification.opened) return false;
    if (!isNotificationTypeEnabled(notification.type, currentNotificationPreferences)) return false;
    if (isChatNotification(notification)) return isAppInBackground();
    if (notification.showInForeground === false) return isAppInBackground();
    return true;
}

export function normalizeNotificationPreferences(preferences = {}) {
    return Object.keys(DEFAULT_NOTIFICATION_PREFERENCES).reduce((normalized, key) => {
        normalized[key] = typeof preferences?.[key] === 'boolean'
            ? preferences[key]
            : DEFAULT_NOTIFICATION_PREFERENCES[key];
        return normalized;
    }, {});
}

function getPreferenceKeyForNotificationType(type = '') {
    const normalizedType = String(type || '').trim();
    if (normalizedType === 'private_chat_message') return 'privateChats';
    if (normalizedType === 'chat_message') return 'groupChats';
    if (normalizedType === 'private_call') return 'calls';
    if (normalizedType === 'task_assigned') return 'tasks';
    if (normalizedType === 'event_assigned') return 'events';
    if (
        normalizedType === 'absence_request' ||
        normalizedType === 'absence_request_status' ||
        normalizedType === 'team_invitation' ||
        normalizedType === 'team_invitation_status'
    ) {
        return 'requests';
    }
    if (normalizedType === 'inventory-problem' || normalizedType === 'inventory_problem') return 'inventory';
    if (normalizedType === 'payment_received') return 'payments';
    return '';
}

export function isNotificationTypeEnabled(type, preferences = currentNotificationPreferences) {
    const preferenceKey = getPreferenceKeyForNotificationType(type);
    if (!preferenceKey) return true;
    return normalizeNotificationPreferences(preferences)[preferenceKey] !== false;
}

function applyNotificationPreferences() {
    notificationsStore.set(
        rawNotifications.filter((notification) =>
            isNotificationTypeEnabled(notification.type, currentNotificationPreferences)
        )
    );
}

export function subscribeToNotificationPreferences(uid) {
    if (notificationPreferencesUnsubscribe) notificationPreferencesUnsubscribe();
    currentNotificationPreferences = DEFAULT_NOTIFICATION_PREFERENCES;
    notificationPreferencesStore.set(currentNotificationPreferences);
    recipientPreferencesCache.clear();
    applyNotificationPreferences();
    if (!uid) return;

    const preferencesRef = doc(db, 'users', uid, 'notificationPreferences', 'default');
    notificationPreferencesUnsubscribe = onSnapshot(preferencesRef, (snapshot) => {
        currentNotificationPreferences = normalizeNotificationPreferences(snapshot.exists() ? snapshot.data() : {});
        notificationPreferencesStore.set(currentNotificationPreferences);
        recipientPreferencesCache.set(uid, {
            preferences: currentNotificationPreferences,
            expiresAt: Date.now() + RECIPIENT_PREFERENCES_CACHE_MS
        });
        applyNotificationPreferences();
    }, (error) => {
        console.error("Error in notification preferences listener:", error);
    });
}

export async function updateNotificationPreferences(uid, preferences = {}) {
    if (!uid) return;
    const normalizedPreferences = normalizeNotificationPreferences(preferences);
    await setDoc(doc(db, 'users', uid, 'notificationPreferences', 'default'), {
        ...normalizedPreferences,
        updatedAt: new Date().toISOString()
    }, { merge: true });
    recipientPreferencesCache.set(uid, {
        preferences: normalizedPreferences,
        expiresAt: Date.now() + RECIPIENT_PREFERENCES_CACHE_MS
    });
}

async function getRecipientNotificationPreferences(uid) {
    const cached = recipientPreferencesCache.get(uid);
    if (cached && cached.expiresAt > Date.now()) return cached.preferences;

    try {
        const snapshot = await getDoc(doc(db, 'users', uid, 'notificationPreferences', 'default'));
        const preferences = normalizeNotificationPreferences(snapshot.exists() ? snapshot.data() : {});
        recipientPreferencesCache.set(uid, {
            preferences,
            expiresAt: Date.now() + RECIPIENT_PREFERENCES_CACHE_MS
        });
        return preferences;
    } catch (error) {
        console.warn("No se pudieron leer las preferencias de notificación:", error);
        return DEFAULT_NOTIFICATION_PREFERENCES;
    }
}

export function subscribeToNotifications(uid) {
    if (notificationsUnsubscribe) notificationsUnsubscribe();
    rawNotifications = [];
    notificationsStore.set([]);
    hasLoadedInitialSnapshot = false;
    if (!uid) return;
    const notificationsQuery = query(collection(db, 'notifications'), where('notificationFor', '==', uid));
    notificationsUnsubscribe = onSnapshot(notificationsQuery, (snapshot) => {
        const notifications = [];
        snapshot.forEach((doc) => {
            notifications.push({ id: doc.id, ...doc.data() });
        });
        notifications.sort((a, b) => new Date(b.date) - new Date(a.date));
        rawNotifications = notifications;

        if (hasLoadedInitialSnapshot) {
            snapshot.docChanges()
                .filter((change) => change.type === 'added')
                .forEach((change) => {
                    const notification = { id: change.doc.id, ...change.doc.data() };
                    if (shouldShowDeviceNotification(notification)) {
                        showDeviceNotification({
                            id: notification.id,
                            title: notification.title,
                            message: notification.message,
                            url: notification.url || '/notifications',
                        });
                    }
                });
        }
        hasLoadedInitialSnapshot = true;
        applyNotificationPreferences();
    }, (error) => {
        console.error("Error in notifications listener:", error);
    });
}

function getOptionalNotificationFields(options = {}) {
    const fields = {};
    ['url', 'type', 'sourceId', 'teamId', 'chatId', 'memberId', 'callId'].forEach((key) => {
        if (typeof options[key] === 'string' && options[key].trim()) {
            fields[key] = options[key].trim();
        }
    });

    if (typeof options.showInForeground === 'boolean') {
        fields.showInForeground = options.showInForeground;
    }

    return fields;
}

export async function createNotification(uid, title, message, options = {}) {
    try {
        if (!uid) return null;

        const preferences = await getRecipientNotificationPreferences(uid);
        if (!isNotificationTypeEnabled(options.type, preferences)) return null;

        const docRef = await addDoc(collection(db, 'notifications'), {
            title,
            message,
            date: new Date().toISOString(),
            notificationFor: uid,
            opened: false,
            ...getOptionalNotificationFields(options)
        });
        sendPushNotification(docRef.id).catch((error) => {
            console.warn("Notification was saved, but push delivery failed:", error);
        });
        return docRef.id;
    } catch (error) {
        console.error("Error creating notification:", error);
        return null;
    }
}

async function sendPushNotification(notificationId) {
    if (typeof fetch === 'undefined') return;
    const response = await fetch('/api/send-push-notification', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ notificationId }),
    });
    if (!response.ok) {
        const errorBody = await response.text();
        let message = errorBody;
        try {
            message = JSON.parse(errorBody).error || errorBody;
        } catch {
            // Keep the raw response body when it is not JSON.
        }
        throw new Error(message || `Push request failed with ${response.status}`);
    }
}

export async function markNotificationAsRead(notificationId) {
    try {
        const notifRef = doc(db, 'notifications', notificationId);
        await updateDoc(notifRef, { opened: true });
    } catch (error) {
        console.error("Error marking notification as read:", error);
        throw error;
    }
}

export async function deleteNotification(notificationId, uid = null) {
    try {
        const notifRef = doc(db, 'notifications', notificationId);
        if (uid) {
            const snapshot = await getDoc(notifRef);
            if (!snapshot.exists() || snapshot.data().notificationFor !== uid) {
                throw new Error('Notification not found for current user');
            }
        }
        await deleteDoc(notifRef);
    } catch (error) {
        console.error("Error deleting notification:", error);
        throw error;
    }
}

export async function deleteAllNotifications(uid) {
    try {
        if (uid) {
            const notificationsQuery = query(
                collection(db, 'notifications'),
                where('notificationFor', '==', uid)
            );
            const snapshot = await getDocs(notificationsQuery);
            if (snapshot.empty) return;

            const refs = snapshot.docs.map((notificationDoc) => notificationDoc.ref);
            for (let i = 0; i < refs.length; i += 450) {
                const batch = writeBatch(db);
                refs.slice(i, i + 450).forEach((notificationRef) => {
                    batch.delete(notificationRef);
                });
                await batch.commit();
            }
            return;
        }

        const notifications = get(notificationsStore);
        const deletePromises = notifications.map((n) => deleteDoc(doc(db, 'notifications', n.id)));
        await Promise.all(deletePromises);
    } catch (error) {
        console.error("Error deleting all notifications:", error);
        throw error;
    }
}
