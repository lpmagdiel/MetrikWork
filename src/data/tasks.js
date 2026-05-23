import { writable, get } from 'svelte/store';
import { db } from './firebase.js';
import {
    onSnapshot,
    collection,
    addDoc,
    query,
    where,
    deleteDoc,
    updateDoc,
    doc,
    getDocs,
    orderBy,
    limit,
    startAfter
} from 'firebase/firestore';
import { createNotification } from './notifications.js';

export const TEAM_TASKS_PAGE_SIZE = 20;
export const tasksStore = writable([]);
export const teamTasksStore = writable([]);
export const teamTasksPaginationStore = writable({
    isLoadingMore: false,
    hasMore: true,
    pageSize: TEAM_TASKS_PAGE_SIZE
});

let tasksUnsubscribe;
let teamTasksUnsubscribe;
let teamTasksQueryState = {
    teamId: '',
    status: 'all',
    pageSize: TEAM_TASKS_PAGE_SIZE,
    nextCursor: null,
    olderTasks: [],
    hasMore: true
};

function normalizeTaskDoc(taskDoc) {
    return { id: taskDoc.id, ...taskDoc.data(), _snapshot: taskDoc };
}

function getTaskTime(task) {
    const value = task?.createdAt || task?.updatedAt || '';
    const time = new Date(value).getTime();
    return Number.isNaN(time) ? 0 : time;
}

function sortTeamTasks(tasks) {
    return tasks.sort((a, b) => getTaskTime(b) - getTaskTime(a));
}

function mergeTeamTasks(firstPageTasks = [], olderTasks = []) {
    const tasksById = new Map();
    [...olderTasks, ...firstPageTasks].forEach((task) => {
        tasksById.set(task.id, task);
    });
    return sortTeamTasks(Array.from(tasksById.values()));
}

function getTeamTasksConstraints(status = 'all', pageSize = TEAM_TASKS_PAGE_SIZE, cursor = null) {
    const constraints = [];
    if (status && status !== 'all') {
        constraints.push(where('status', '==', status));
    }
    constraints.push(orderBy('createdAt', 'desc'));
    if (cursor) {
        constraints.push(startAfter(cursor));
    }
    constraints.push(limit(pageSize));
    return constraints;
}

function resetTeamTasksPagination(pageSize = TEAM_TASKS_PAGE_SIZE) {
    teamTasksQueryState.nextCursor = null;
    teamTasksQueryState.olderTasks = [];
    teamTasksQueryState.hasMore = true;
    teamTasksPaginationStore.set({
        isLoadingMore: false,
        hasMore: true,
        pageSize
    });
}

export function subscribeToTasks(uid) {
    if (tasksUnsubscribe) tasksUnsubscribe();
    tasksUnsubscribe = null;
    if (!uid) {
        tasksStore.set([]);
        return () => {};
    }
    const tasksQuery = query(collection(db, 'tasks'), where('assignedTo', 'array-contains', uid));
    const unsubscribe = onSnapshot(tasksQuery, (snapshot) => {
        const tasks = [];
        snapshot.forEach((doc) => {
            tasks.push({ id: doc.id, ...doc.data() });
        });
        tasksStore.set(tasks);
    }, (error) => {
        console.error("Error in tasks listener:", error);
    });
    tasksUnsubscribe = unsubscribe;

    return () => {
        unsubscribe();
        if (tasksUnsubscribe === unsubscribe) {
            tasksUnsubscribe = null;
            tasksStore.set([]);
        }
    };
}

export function subscribeToTeamTasks(teamId, options = {}) {
    if (teamTasksUnsubscribe) teamTasksUnsubscribe();
    teamTasksUnsubscribe = null;
    const pageSize = options.pageSize || TEAM_TASKS_PAGE_SIZE;
    const status = options.status || 'all';
    resetTeamTasksPagination(pageSize);

    if (!teamId) {
        teamTasksStore.set([]);
        return () => {};
    }

    teamTasksQueryState = {
        teamId,
        status,
        pageSize,
        nextCursor: null,
        olderTasks: [],
        hasMore: true
    };

    const tasksQuery = query(
        collection(db, 'teams', teamId, 'tasks'),
        ...getTeamTasksConstraints(status, pageSize)
    );
    const unsubscribe = onSnapshot(tasksQuery, (snapshot) => {
        const firstPageTasks = snapshot.docs.map(normalizeTaskDoc);
        if (teamTasksQueryState.olderTasks.length === 0) {
            teamTasksQueryState.nextCursor = snapshot.docs[snapshot.docs.length - 1] || null;
            teamTasksQueryState.hasMore = snapshot.docs.length === pageSize;
        }
        teamTasksStore.set(mergeTeamTasks(firstPageTasks, teamTasksQueryState.olderTasks));
        teamTasksPaginationStore.set({
            isLoadingMore: false,
            hasMore: teamTasksQueryState.hasMore,
            pageSize
        });
    }, (error) => {
        console.error("Error in team tasks listener:", error);
        teamTasksPaginationStore.set({
            isLoadingMore: false,
            hasMore: false,
            pageSize
        });
    });
    teamTasksUnsubscribe = unsubscribe;

    return () => {
        unsubscribe();
        if (teamTasksUnsubscribe === unsubscribe) {
            teamTasksUnsubscribe = null;
            teamTasksStore.set([]);
            resetTeamTasksPagination(pageSize);
        }
    };
}

export async function loadMoreTeamTasks() {
    const { teamId, status, pageSize, nextCursor } = teamTasksQueryState;
    if (!teamId || !nextCursor) return [];

    const paginationState = get(teamTasksPaginationStore);

    if (paginationState.isLoadingMore || !paginationState.hasMore) return [];

    teamTasksPaginationStore.set({
        ...paginationState,
        isLoadingMore: true
    });

    try {
        const tasksQuery = query(
            collection(db, 'teams', teamId, 'tasks'),
            ...getTeamTasksConstraints(status, pageSize, nextCursor)
        );
        const snapshot = await getDocs(tasksQuery);
        const olderTasks = snapshot.docs.map(normalizeTaskDoc);
        teamTasksQueryState.nextCursor = snapshot.docs[snapshot.docs.length - 1] || null;
        teamTasksQueryState.olderTasks = mergeTeamTasks(teamTasksQueryState.olderTasks, olderTasks);
        teamTasksQueryState.hasMore = snapshot.docs.length === pageSize;
        teamTasksStore.update((currentTasks) => mergeTeamTasks(currentTasks, olderTasks));
        teamTasksPaginationStore.set({
            isLoadingMore: false,
            hasMore: teamTasksQueryState.hasMore,
            pageSize
        });
        return olderTasks;
    } catch (error) {
        console.error('Error loading more team tasks:', error);
        teamTasksPaginationStore.set({
            isLoadingMore: false,
            hasMore: false,
            pageSize
        });
        throw error;
    }
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
