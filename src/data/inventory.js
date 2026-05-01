import { writable } from 'svelte/store';
import { db } from './firebase.js';
import { onSnapshot, collection, addDoc, doc, deleteDoc, updateDoc } from 'firebase/firestore';

export const inventoryStore = writable([]);
let inventoryUnsubscribe;

export function subscribeToTeamInventory(teamId) {
    if (inventoryUnsubscribe) inventoryUnsubscribe();
    inventoryStore.set([]);
    if (!teamId) return;
    const inventoryCollection = collection(db, 'teams', teamId, 'inventory');
    inventoryUnsubscribe = onSnapshot(inventoryCollection, (snapshot) => {
        const items = [];
        snapshot.forEach((doc) => {
            items.push({ id: doc.id, ...doc.data() });
        });
        inventoryStore.set(items);
    }, (error) => {
        console.error("Error in inventory listener:", error);
    });
}

export async function addProduct(teamId, productData) {
    if (!teamId) return;
    try {
        const itemData = {
            ...productData,
            createdAt: new Date().toISOString(),
            updatedAt: new Date().toISOString()
        };
        await addDoc(collection(db, 'teams', teamId, 'inventory'), itemData);
    } catch (error) {
        console.error("Error adding product:", error);
        throw error;
    }
}

export async function updateProduct(teamId, productId, data) {
    if (!teamId) return;
    try {
        const productRef = doc(db, 'teams', teamId, 'inventory', productId);
        await updateDoc(productRef, { ...data, updatedAt: new Date().toISOString() });
    } catch (error) {
        console.error("Error updating product:", error);
        throw error;
    }
}

export async function deleteProduct(teamId, productId) {
    if (!teamId) return;
    try {
        const productRef = doc(db, 'teams', teamId, 'inventory', productId);
        await deleteDoc(productRef);
    } catch (error) {
        console.error("Error deleting product:", error);
        throw error;
    }
}
