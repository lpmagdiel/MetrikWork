import { writable } from 'svelte/store';
import { db } from './firebase.js';
import { onSnapshot, collection, addDoc, doc, deleteDoc, updateDoc } from 'firebase/firestore';

export const notesStore = writable([]);
let notesUnsubscribe;

export function subscribeToNotes(uid) {
    if (notesUnsubscribe) notesUnsubscribe();
    notesStore.set([]);
    if (!uid) return;
    const notesCollection = collection(db, 'users', uid, 'notes');
    notesUnsubscribe = onSnapshot(notesCollection, (snapshot) => {
        const notes = [];
        snapshot.forEach((doc) => {
            notes.push({ id: doc.id, ...doc.data() });
        });
        notesStore.set(notes);
    }, (error) => {
        console.error("Error in notes listener:", error);
    });
}

export async function addNote(uid, content, date, title = '', type = 'text', items = [], color = '#ffffff') {
    if (!uid) return;
    try {
        const noteData = {
            content,
            date: date ? date.toISOString() : new Date().toISOString(),
            title,
            type,
            items,
            color,
            createdAt: new Date().toISOString()
        };
        const docRef = await addDoc(collection(db, 'users', uid, 'notes'), noteData);
        return docRef.id;
    } catch (error) {
        console.error("Error adding note:", error);
        throw error;
    }
}

export async function updateNote(uid, noteId, data) {
    if (!uid) return;
    try {
        const noteRef = doc(db, 'users', uid, 'notes', noteId);
        await updateDoc(noteRef, { ...data, updatedAt: new Date().toISOString() });
    } catch (error) {
        console.error("Error updating note:", error);
        throw error;
    }
}

export async function deleteNote(uid, noteId) {
    if (!uid) return;
    try {
        const noteRef = doc(db, 'users', uid, 'notes', noteId);
        await deleteDoc(noteRef);
    } catch (error) {
        console.error("Error deleting note:", error);
        throw error;
    }
}
