import { writable } from 'svelte/store';
import { db } from './firebase.js';
import { onSnapshot, collection, addDoc, query, where, deleteDoc, updateDoc, doc, getDoc, getDocs } from 'firebase/firestore';
import { createNotification } from './notifications.js';

export const tasksStore = writable([]);
export const teamTasksStore = writable([]);

let tasksUnsubscribe;
let teamTasksUnsubscribe;

export function subscribeToTasks(uid) {
    if (tasksUnsubscribe) tasksUnsubscribe();
    if (!uid) {
        tasksStore.set([]);
        return;
    }
    const tasksQuery = query(collection(db, 'tasks'), where('assignedTo', 'array-contains', uid));
    tasksUnsubscribe = onSnapshot(tasksQuery, (snapshot) => {
        const tasks = [];
        snapshot.forEach((doc) => {
            tasks.push({ id: doc.id, ...doc.data() });
        });
        tasksStore.set(tasks);
    }, (error) => {
        console.error("Error in tasks listener:", error);
    });
}

export function subscribeToTeamTasks(teamId) {
    if (teamTasksUnsubscribe) teamTasksUnsubscribe();
    if (!teamId) {
        teamTasksStore.set([]);
        return;
    }
    const tasksCollection = collection(db, 'teams', teamId, 'tasks');
    teamTasksUnsubscribe = onSnapshot(tasksCollection, (snapshot) => {
        const tasks = [];
        snapshot.forEach((doc) => {
            tasks.push({ id: doc.id, ...doc.data() });
        });
        // @ts-ignore
        tasks.sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
        teamTasksStore.set(tasks);
    }, (error) => {
        console.error("Error in team tasks listener:", error);
    });
}

export async function getAssignedTasksFromTeams(teams = [], uid) {
    if (!uid || !Array.isArray(teams) || teams.length === 0) return [];
    const taskGroups = await Promise.all(
        teams.map(async (team) => {
            const tasksQuery = query(
                collection(db, 'teams', team.id, 'tasks'),
                where('assignedTo', 'array-contains', uid)
            );
            const snapshot = await getDocs(tasksQuery);
            const teamName = team.name || team.team || 'Equipo';
            return snapshot.docs.map((taskDoc) => ({
                id: taskDoc.id,
                teamId: team.id,
                teamName,
                ...taskDoc.data()
            }));
        })
    );
    return taskGroups
        .flat()
        .sort((a, b) => (a.dueDate || '').localeCompare(b.dueDate || ''));
}

export async function addTeamTask(teamId, taskData, user, teamName = 'el equipo') {
    if (!user || !teamId) return;
    try {
        const newTask = {
            title: taskData.title,
            description: taskData.description || '',
            status: taskData.status || 'unassigned',
            assignedTo: taskData.assignedTo || [],
            dueDate: taskData.dueDate || null,
            createdAt: new Date().toISOString(),
            createdBy: user.uid,
        };
        const docRef = await addDoc(collection(db, 'teams', teamId, 'tasks'), newTask);
        if (newTask.assignedTo.length > 0) {
            const creatorName = user.name || user.email;
            const notifPromises = newTask.assignedTo.map(uid =>
                createNotification(uid, '📋 Nueva tarea asignada', `"${newTask.title}" fue asignada a ti en ${teamName} por ${creatorName}.`)
            );
            await Promise.all(notifPromises);
        }
        return docRef.id;
    } catch (error) {
        console.error('Error adding team task:', error);
        throw error;
    }
}

export async function updateTeamTask(teamId, taskId, data) {
    if (!teamId || !taskId) return;
    try {
        const taskRef = doc(db, 'teams', teamId, 'tasks', taskId);
        await updateDoc(taskRef, { ...data, updatedAt: new Date().toISOString() });
    } catch (error) {
        console.error('Error updating team task:', error);
        throw error;
    }
}

export async function deleteTeamTask(teamId, taskId) {
    if (!teamId || !taskId) return;
    try {
        const taskRef = doc(db, 'teams', teamId, 'tasks', taskId);
        await deleteDoc(taskRef);
    } catch (error) {
        console.error('Error deleting team task:', error);
        throw error;
    }
}
