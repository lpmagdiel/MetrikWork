import { writable } from 'svelte/store';
import { db } from './firebase.js';
import { onSnapshot, collection, addDoc, doc, deleteDoc, updateDoc } from 'firebase/firestore';

export const locationsStore = writable([]);
export const teamLocationsStore = writable([]);
let locationsUnsubscribe;
let teamLocationsUnsubscribe;

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

export function subscribeToTeamLocations(teamId) {
    if (teamLocationsUnsubscribe) teamLocationsUnsubscribe();
    teamLocationsStore.set([]);
    if (!teamId) return;

    const locationsCollection = collection(db, 'teams', teamId, 'locations');
    teamLocationsUnsubscribe = onSnapshot(locationsCollection, (snapshot) => {
        const locations = [];
        snapshot.forEach((doc) => {
            locations.push({ id: doc.id, ...doc.data() });
        });
        locations.sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
        teamLocationsStore.set(locations);
    }, (error) => {
        console.error("Error in team locations listener:", error);
    });
}

export async function addTeamLocation(teamId, data) {
    if (!teamId) return;

    try {
        const locationData = {
            name: data.name,
            description: data.description || '',
            gps: data.gps || null,
            createdAt: new Date().toISOString()
        };

        const docRef = await addDoc(collection(db, 'teams', teamId, 'locations'), locationData);
        return docRef.id;
    } catch (error) {
        console.error("Error adding team location:", error);
        throw error;
    }
}

export async function updateTeamLocation(teamId, locationId, data) {
    if (!teamId || !locationId) return;

    try {
        const locationData = {
            name: data.name,
            description: data.description || '',
            gps: data.gps || null,
            updatedAt: new Date().toISOString()
        };

        const locationRef = doc(db, 'teams', teamId, 'locations', locationId);
        await updateDoc(locationRef, locationData);
    } catch (error) {
        console.error("Error updating team location:", error);
        throw error;
    }
}

export async function deleteTeamLocation(teamId, locationId) {
    if (!teamId || !locationId) return;

    try {
        const locationRef = doc(db, 'teams', teamId, 'locations', locationId);
        await deleteDoc(locationRef);
    } catch (error) {
        console.error("Error deleting team location:", error);
        throw error;
    }
}
