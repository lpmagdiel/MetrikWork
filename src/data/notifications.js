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
    getDoc,
    getDocs,
    writeBatch
} from 'firebase/firestore';
import { showDeviceNotification } from './pushNotifications.js';

export const notificationsStore = writable([]);
let notificationsUnsubscribe;
let hasLoadedInitialSnapshot = false;

export function subscribeToNotifications(uid) {
    if (notificationsUnsubscribe) notificationsUnsubscribe();
    notificationsStore.set([]);
    hasLoadedInitialSnapshot = false;
    if (!uid) return;
    const notificationsQuery = query(collection(db, 'notifications'), where('notificationFor', '==', uid));
    notificationsUnsubscribe = onSnapshot(notificationsQuery, (snapshot) => {
        const notifications = [];
        snapshot.forEach((doc) => {
            notifications.push({ id: doc.id, ...doc.data() });
        });
        if (hasLoadedInitialSnapshot) {
            snapshot.docChanges()
                .filter((change) => change.type === 'added')
                .forEach((change) => {
                    const notification = { id: change.doc.id, ...change.doc.data() };
                    if (!notification.opened) {
                        showDeviceNotification({
                            id: notification.id,
                            title: notification.title,
                            message: notification.message,
                            url: '/notifications',
                        });
                    }
                });
        }
        hasLoadedInitialSnapshot = true;
        // @ts-ignore
        notifications.sort((a, b) => new Date(b.date) - new Date(a.date));
        notificationsStore.set(notifications);
    }, (error) => {
        console.error("Error in notifications listener:", error);
    });
}

export async function createNotification(uid, title, message) {
    try {
        const docRef = await addDoc(collection(db, 'notifications'), {
            title,
            message,
            date: new Date().toISOString(),
            notificationFor: uid,
            opened: false
        });
        sendPushNotification(docRef.id).catch((error) => {
            console.warn("Notification was saved, but push delivery failed:", error);
        });
    } catch (error) {
        console.error("Error creating notification:", error);
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
        throw new Error(errorBody || `Push request failed with ${response.status}`);
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
