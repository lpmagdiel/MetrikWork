import { writable, get } from 'svelte/store';
import { db } from './firebase.js';
import { onSnapshot, collection, query, where, deleteDoc, doc, updateDoc, addDoc } from 'firebase/firestore';

export const notificationsStore = writable([]);
let notificationsUnsubscribe;

export function subscribeToNotifications(uid) {
    if (notificationsUnsubscribe) notificationsUnsubscribe();
    notificationsStore.set([]);
    if (!uid) return;
    const notificationsQuery = query(collection(db, 'notifications'), where('notificationFor', '==', uid));
    notificationsUnsubscribe = onSnapshot(notificationsQuery, (snapshot) => {
        const notifications = [];
        snapshot.forEach((doc) => {
            notifications.push({ id: doc.id, ...doc.data() });
        });
        // @ts-ignore
        notifications.sort((a, b) => new Date(b.date) - new Date(a.date));
        notificationsStore.set(notifications);
    }, (error) => {
        console.error("Error in notifications listener:", error);
    });
}

export async function createNotification(uid, title, message) {
    try {
        await addDoc(collection(db, 'notifications'), {
            title,
            message,
            date: new Date().toISOString(),
            notificationFor: uid,
            opened: false
        });
    } catch (error) {
        console.error("Error creating notification:", error);
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

export async function deleteNotification(notificationId) {
    try {
        const notifRef = doc(db, 'notifications', notificationId);
        await deleteDoc(notifRef);
    } catch (error) {
        console.error("Error deleting notification:", error);
        throw error;
    }
}

export async function deleteAllNotifications(uid) {
    try {
        const notifications = get(notificationsStore);
        const deletePromises = notifications.map(n => deleteDoc(doc(db, 'notifications', n.id)));
        await Promise.all(deletePromises);
    } catch (error) {
        console.error("Error deleting all notifications:", error);
        throw error;
    }
}
