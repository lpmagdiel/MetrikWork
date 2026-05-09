import { writable } from 'svelte/store';
import { db } from './firebase.js';
import { onSnapshot, collection, addDoc, doc, deleteDoc } from 'firebase/firestore';

export const locationsStore = writable([]);
let locationsUnsubscribe;

export function subscribeToLocations(uid) {
    if (locationsUnsubscribe) locationsUnsubscribe();
    locationsStore.set([]);
    if (!uid) return;

    const locationsCollection = collection(db, 'users', uid, 'locations');
    locationsUnsubscribe = onSnapshot(locationsCollection, (snapshot) => {
        const locations = [];
        snapshot.forEach((doc) => {
            locations.push({ id: doc.id, ...doc.data() });
        });
        locations.sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
        locationsStore.set(locations);
    }, (error) => {
        console.error("Error in locations listener:", error);
    });
}

export async function addLocation(uid, data) {
    if (!uid) return;

    try {
        const locationData = {
            name: data.name,
            description: data.description || '',
            gps: data.gps || null,
            createdAt: new Date().toISOString()
        };

        const docRef = await addDoc(collection(db, 'users', uid, 'locations'), locationData);
        return docRef.id;
    } catch (error) {
        console.error("Error adding location:", error);
        throw error;
    }
}

export async function deleteLocation(uid, locationId) {
    if (!uid || !locationId) return;

    try {
        const locationRef = doc(db, 'users', uid, 'locations', locationId);
        await deleteDoc(locationRef);
    } catch (error) {
        console.error("Error deleting location:", error);
        throw error;
    }
}
