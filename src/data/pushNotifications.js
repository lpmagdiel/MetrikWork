import { writable, get } from 'svelte/store';
import { deleteDoc, doc, setDoc } from 'firebase/firestore';
import { deleteToken, getMessaging, getToken, isSupported, onMessage } from 'firebase/messaging';
import { app, db, firebaseConfig } from './firebase.js';

const DEFAULT_STATE = {
    supported: false,
    permission: typeof Notification === 'undefined' ? 'default' : Notification.permission,
    status: 'idle',
    token: null,
    error: null,
};

export const pushNotificationState = writable(DEFAULT_STATE);

let messaging;
let messagingSupportedPromise;
let serviceWorkerRegistrationPromise;
let foregroundUnsubscribe;
let currentTokenDocId;
const recentlyShownNotifications = new Map();

function updateState(update) {
    pushNotificationState.update((state) => ({ ...state, ...update }));
}

export function canUseDeviceNotifications() {
    return typeof window !== 'undefined' &&
        'Notification' in window &&
        'serviceWorker' in navigator;
}

function getVapidKey() {
    return import.meta.env.VITE_FIREBASE_VAPID_KEY;
}

async function isMessagingSupported() {
    if (!canUseDeviceNotifications()) return false;
    if (!messagingSupportedPromise) {
        messagingSupportedPromise = isSupported().catch(() => false);
    }
    return messagingSupportedPromise;
}

function getConfigQueryString() {
    const params = new URLSearchParams();
    Object.entries(firebaseConfig).forEach(([key, value]) => {
        if (value) params.set(key, value);
    });
    return params.toString();
}

async function getServiceWorkerRegistration() {
    if (!canUseDeviceNotifications()) return null;
    if (!serviceWorkerRegistrationPromise) {
        const queryString = getConfigQueryString();
        const workerUrl = queryString
            ? `/firebase-messaging-sw.js?${queryString}`
            : '/firebase-messaging-sw.js';
        serviceWorkerRegistrationPromise = navigator.serviceWorker.register(workerUrl, {
            scope: '/firebase-cloud-messaging-push-scope',
        });
    }
    return serviceWorkerRegistrationPromise;
}

function getTokenDocId(token) {
    return encodeURIComponent(token);
}

async function saveToken(uid, token) {
    if (!uid || !token) return;
    currentTokenDocId = getTokenDocId(token);
    await setDoc(doc(db, 'users', uid, 'pushTokens', currentTokenDocId), {
        token,
        permission: Notification.permission,
        userAgent: navigator.userAgent,
        platform: navigator.platform || '',
        updatedAt: new Date().toISOString(),
    }, { merge: true });
}

function setupForegroundMessages() {
    if (!messaging || foregroundUnsubscribe) return;
    foregroundUnsubscribe = onMessage(messaging, (payload) => {
        const notification = payload.notification || {};
        const data = payload.data || {};
        if (data.showInForeground === 'false' && !isAppInBackground()) return;
        showDeviceNotification({
            id: data.notificationId || payload.messageId,
            title: notification.title || data.title || 'MetricWork',
            message: notification.body || data.body || data.message || '',
            url: data.url || '/notifications',
        });
    });
}

function isAppInBackground() {
    if (typeof document === 'undefined') return false;
    return document.visibilityState === 'hidden' || !document.hasFocus();
}

async function configureMessaging(uid) {
    const supported = await isMessagingSupported();
    const permission = Notification.permission;

    if (!supported) {
        updateState({ supported: false, permission, status: 'unsupported' });
        return { ok: permission === 'granted', token: null };
    }

    const registration = await getServiceWorkerRegistration();
    messaging = getMessaging(app);
    setupForegroundMessages();

    const vapidKey = getVapidKey();
    if (!vapidKey) {
        updateState({
            supported: true,
            permission,
            status: permission === 'granted' ? 'local-enabled' : 'permission-needed',
            error: 'VITE_FIREBASE_VAPID_KEY no está configurada.',
        });
        return { ok: permission === 'granted', token: null };
    }

    const token = await getToken(messaging, {
        vapidKey,
        serviceWorkerRegistration: registration,
    });

    if (token) {
        await saveToken(uid, token);
        updateState({ supported: true, permission, status: 'enabled', token, error: null });
        return { ok: true, token };
    }

    updateState({ supported: true, permission, status: 'permission-needed', token: null });
    return { ok: false, token: null };
}

export async function initializePushNotifications(uid) {
    if (!canUseDeviceNotifications()) {
        updateState({ supported: false, status: 'unsupported' });
        return;
    }

    const permission = Notification.permission;
    updateState({
        supported: true,
        permission,
        status: permission === 'granted' ? 'checking' : permission === 'denied' ? 'denied' : 'permission-needed',
        error: null,
    });

    if (!uid || permission !== 'granted') return;

    try {
        await configureMessaging(uid);
    } catch (error) {
        console.error('Error initializing push notifications:', error);
        updateState({ status: 'error', error: error.message || 'No se pudieron iniciar las notificaciones push.' });
    }
}

export async function requestPushNotifications(uid) {
    if (!canUseDeviceNotifications()) {
        updateState({ supported: false, status: 'unsupported' });
        return { ok: false, reason: 'unsupported' };
    }

    const permission = await Notification.requestPermission();
    updateState({ supported: true, permission });

    if (permission !== 'granted') {
        updateState({ status: permission === 'denied' ? 'denied' : 'permission-needed', token: null });
        return { ok: false, reason: permission };
    }

    try {
        return await configureMessaging(uid);
    } catch (error) {
        console.error('Error requesting push notifications:', error);
        updateState({ status: 'error', error: error.message || 'No se pudieron activar las notificaciones push.' });
        return { ok: false, reason: 'error', error };
    }
}

export async function disablePushNotifications(uid) {
    if (!messaging || !currentTokenDocId) return;
    try {
        await deleteToken(messaging);
        if (uid) {
            await deleteDoc(doc(db, 'users', uid, 'pushTokens', currentTokenDocId));
        }
        currentTokenDocId = null;
        updateState({ status: 'permission-needed', token: null });
    } catch (error) {
        console.error('Error disabling push notifications:', error);
        updateState({ status: 'error', error: error.message || 'No se pudieron desactivar las notificaciones.' });
        throw error;
    }
}

export async function showDeviceNotification(notification) {
    if (!canUseDeviceNotifications() || Notification.permission !== 'granted') return false;

    if (notification.id) {
        const now = Date.now();
        const lastShownAt = recentlyShownNotifications.get(notification.id);
        if (lastShownAt && now - lastShownAt < 10000) return false;
        recentlyShownNotifications.set(notification.id, now);
        if (recentlyShownNotifications.size > 50) {
            const expiredBefore = now - 60000;
            recentlyShownNotifications.forEach((shownAt, id) => {
                if (shownAt < expiredBefore) recentlyShownNotifications.delete(id);
            });
        }
    }

    const title = notification.title || 'MetricWork';
    const body = notification.message || notification.body || '';
    const tag = notification.id ? `metricwork-${notification.id}` : undefined;
    const url = notification.url || '/notifications';
    const options = {
        body,
        tag,
        renotify: Boolean(tag),
        icon: '/icon.png',
        badge: '/icons/android/launchericon-192x192.png',
        data: { url, notificationId: notification.id || '' },
    };

    try {
        const registration = await getServiceWorkerRegistration();
        if (registration?.showNotification) {
            await registration.showNotification(title, options);
            return true;
        }
    } catch (error) {
        console.warn('Service worker notification failed, falling back to Notification API:', error);
    }

    const systemNotification = new Notification(title, options);
    systemNotification.onclick = () => {
        window.focus();
        window.location.assign(url);
        systemNotification.close();
    };
    return true;
}

export function getPushNotificationState() {
    return get(pushNotificationState);
}
