import { writable } from 'svelte/store';
import {
    addDoc,
    collection,
    deleteDoc,
    doc,
    onSnapshot,
    updateDoc
} from 'firebase/firestore';
import { db } from './firebase.js';

export const teamTemplatesStore = writable([]);

let teamTemplatesUnsubscribe;

function normalizeActor(user = {}) {
    return {
        createdBy: user.uid || user.id || '',
        createdByName: user.name || user.displayName || user.email || 'Usuario'
    };
}

function normalizeTemplateType(type) {
    return type === 'workday' ? 'workday' : 'task';
}

export function subscribeToTeamTemplates(teamId, type = 'all') {
    if (teamTemplatesUnsubscribe) teamTemplatesUnsubscribe();
    teamTemplatesUnsubscribe = null;
    teamTemplatesStore.set([]);

    if (!teamId) return () => {};

    const unsubscribe = onSnapshot(
        collection(db, 'teams', teamId, 'templates'),
        (snapshot) => {
            const requestedType = type === 'all' ? 'all' : normalizeTemplateType(type);
            const templates = snapshot.docs
                .map((templateDoc) => ({ id: templateDoc.id, ...templateDoc.data() }))
                .filter((template) => requestedType === 'all' || template.type === requestedType)
                .sort((a, b) => (b.updatedAt || b.createdAt || '').localeCompare(a.updatedAt || a.createdAt || ''));
            teamTemplatesStore.set(templates);
        },
        (error) => {
            console.error('Error in team templates listener:', error);
            teamTemplatesStore.set([]);
        }
    );

    teamTemplatesUnsubscribe = unsubscribe;

    return () => {
        unsubscribe();
        if (teamTemplatesUnsubscribe === unsubscribe) {
            teamTemplatesUnsubscribe = null;
            teamTemplatesStore.set([]);
        }
    };
}

export async function addTeamTemplate(teamId, templateData, user) {
    if (!teamId) return;
    const now = new Date().toISOString();
    const data = {
        name: templateData.name || 'Plantilla',
        type: normalizeTemplateType(templateData.type),
        payload: templateData.payload || {},
        ...normalizeActor(user),
        createdAt: now,
        updatedAt: now
    };

    const templateRef = await addDoc(collection(db, 'teams', teamId, 'templates'), data);
    return templateRef.id;
}

export async function updateTeamTemplate(teamId, templateId, data) {
    if (!teamId || !templateId) return;
    await updateDoc(doc(db, 'teams', teamId, 'templates', templateId), {
        ...data,
        updatedAt: new Date().toISOString()
    });
}

export async function deleteTeamTemplate(teamId, templateId) {
    if (!teamId || !templateId) return;
    await deleteDoc(doc(db, 'teams', teamId, 'templates', templateId));
}
