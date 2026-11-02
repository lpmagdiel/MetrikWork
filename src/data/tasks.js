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
    setDoc,
    startAfter
} from 'firebase/firestore';
import { createNotification } from './notifications.js';
import {
    enqueueOfflineOperation,
    isBrowserOffline,
    isOfflineError,
    scheduleOfflineSync
} from './offlineQueue.js';
import {
    getGhostById,
    getGhostIdFromUserId,
    isGhostUserId,
    teamsStore
} from './teams.js';

export const TEAM_TASKS_PAGE_SIZE = 20;
export const MAX_TASK_ATTACHMENTS = 5;
export const MAX_TASK_ITEMS = 40;
const ADD_TEAM_TASK_OPERATION = 'addTeamTask';
const UPDATE_TEAM_TASK_OPERATION = 'updateTeamTask';

/** Visibilidad de las tareas configurada por el administrador del equipo. */
export const TASK_VISIBILITY = {
    all: 'all',
    own: 'own'
};

/** Estados del tablero de tareas. */
export const TASK_STATUS = {
    purchases: 'purchases',
    unassigned: 'unassigned',
    pending: 'pending',
    'in-progress': 'in-progress',
    completed: 'completed'
};

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
    visibility: TASK_VISIBILITY.all,
    uid: '',
    pageSize: TEAM_TASKS_PAGE_SIZE,
    sources: []
};

function normalizeTaskDoc(taskDoc) {
    return { id: taskDoc.id, ...taskDoc.data() };
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

function createClientTaskId() {
    return `task-${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

/**
 * Normaliza los adjuntos de una tarea a la forma `{ url, name }`.
 * Solo se guardan URLs (Cloudinary): los binarios se suben antes de
 * persistir la tarea para que el documento siga siendo serializable
 * en la cola offline.
 */
export function normalizeTaskAttachments(attachments) {
    if (!Array.isArray(attachments)) return [];
    return attachments
        .filter((attachment) => attachment && typeof attachment.url === 'string' && attachment.url)
        .slice(0, MAX_TASK_ATTACHMENTS)
        .map((attachment) => ({
            url: String(attachment.url).slice(0, 600),
            name: String(attachment.name || 'Imagen').trim().slice(0, 160) || 'Imagen'
        }));
}

/**
 * Normaliza la lista de artículos de una compra a la forma
 * `{ id, text, done }`. Las compras se muestran como una lista TODO.
 */
export function normalizeTaskItems(items) {
    if (!Array.isArray(items)) return [];

    const normalized = [];
    const seenIds = new Set();

    items.forEach((item, index) => {
        const text = String(item?.text ?? item?.label ?? '').trim().slice(0, 120);
        if (!text) return;
        let id = String(item?.id || '').trim();
        if (!id || seenIds.has(id)) {
            id = `item-${index}-${text.slice(0, 12)}`;
        }
        if (seenIds.has(id)) return;
        seenIds.add(id);
        normalized.push({
            id,
            text,
            done: Boolean(item?.done)
        });
    });

    return normalized.slice(0, MAX_TASK_ITEMS);
}

/**
 * Masters de los fantasmas asignados a una tarea.
 *
 * Se guardan como lista de uids en la propia tarea porque las reglas de
 * Firestore no pueden recorrer listas: así el acceso de cada master se
 * comprueba con una simple pertenencia (`uid in resource.data.ghostMasterIds`).
 */
export function getTaskGhostMasterIds(team, assignedTo = []) {
    const masterIds = [];
    if (!team || !Array.isArray(assignedTo)) return masterIds;

    assignedTo
        .filter((assigneeId) => isGhostUserId(assigneeId))
        .forEach((ghostUserId) => {
            const ghostId = getGhostIdFromUserId(ghostUserId);
            const ghost = ghostId ? getGhostById(team, ghostId) : null;
            (ghost?.masters || []).forEach((masterId) => {
                if (masterId && !masterIds.includes(masterId)) masterIds.push(masterId);
            });
        });

    return masterIds;
}

/**
 * Tareas que un usuario puede ver según la visibilidad configurada para él:
 * "all" (todas las del equipo) u "own" (las suyas y las de sus fantasmas).
 */
export function getVisibleTasksVisibility(team, uid) {
    if (!team || !uid) return TASK_VISIBILITY.all;
    if (team.admin === uid) return TASK_VISIBILITY.all;
    const visibility = team.memberSettings?.[uid]?.tasksVisibility;
    return visibility === TASK_VISIBILITY.own ? TASK_VISIBILITY.own : TASK_VISIBILITY.all;
}

function buildTeamTaskDoc(taskData, user, team = null) {
    const assignedTo = Array.isArray(taskData.assignedTo) ? taskData.assignedTo : [];
    return {
        title: taskData.title,
        description: taskData.description || '',
        status: taskData.status || 'unassigned',
        assignedTo,
        dueDate: taskData.dueDate || null,
        attachments: normalizeTaskAttachments(taskData.attachments),
        createdAt: taskData.createdAt || new Date().toISOString(),
        createdBy: user.uid,
        ghostMasterIds: getTaskGhostMasterIds(team, assignedTo),
        items: normalizeTaskItems(taskData.items),
    };
}

function upsertOptimisticTeamTask(task) {
    teamTasksStore.update((currentTasks) => mergeTeamTasks([task], currentTasks));
}

function updateOptimisticTeamTask(taskId, data) {
    teamTasksStore.update((currentTasks) => currentTasks.map((task) => (
        task.id === taskId
            ? { ...task, ...data, updatedAt: data.updatedAt || new Date().toISOString(), _offlinePending: true }
            : task
    )));
}

function getTeamTasksConstraints(source, status = 'all', pageSize = TEAM_TASKS_PAGE_SIZE, cursor = null) {
    const constraints = [...(source?.constraints || [])];
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

/**
 * Fuentes de datos de la pantalla de tareas.
 *
 * Con visibilidad "all" se cargan todas las tareas del equipo. Con
 * visibilidad "own" el usuario solo accede a las suyas y a las de los
 * fantasmas que gestiona, por lo que se escuchan dos consultas que se
 * combinan (Firestore no permite consultas con OR).
 */
function buildTaskSources(visibility, uid) {
    if (visibility === TASK_VISIBILITY.own && uid) {
        return [
            {
                key: 'assigned',
                constraints: [where('assignedTo', 'array-contains', uid)]
            },
            {
                key: 'ghosts',
                constraints: [where('ghostMasterIds', 'array-contains', uid)]
            }
        ];
    }

    return [{ key: 'all', constraints: [] }];
}

function resetTeamTasksPagination(pageSize = TEAM_TASKS_PAGE_SIZE) {
    teamTasksQueryState.sources = [];
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
    const visibility = options.visibility || TASK_VISIBILITY.all;
    const uid = options.uid || '';
    resetTeamTasksPagination(pageSize);

    if (!teamId) {
        teamTasksStore.set([]);
        return () => {};
    }

    const sources = buildTaskSources(visibility, uid).map((source) => ({
        ...source,
        cursor: null,
        hasMore: true,
        firstPage: [],
        olderTasks: []
    }));

    teamTasksQueryState = {
        teamId,
        status,
        visibility,
        uid,
        pageSize,
        sources
    };

    const unsubscribers = [];

    sources.forEach((source) => {
        let tasksQuery;
        try {
            tasksQuery = query(
                collection(db, 'teams', teamId, 'tasks'),
                ...getTeamTasksConstraints(source, status, pageSize)
            );
        } catch (error) {
            console.error('Error starting team tasks listener:', error);
            return;
        }

        const unsubscribe = onSnapshot(tasksQuery, (snapshot) => {
            const firstPageTasks = snapshot.docs.map(normalizeTaskDoc);
            if (source.olderTasks.length === 0) {
                source.cursor = snapshot.docs[snapshot.docs.length - 1] || null;
                source.hasMore = snapshot.docs.length === pageSize;
            }
            // Las tareas eliminadas (o que dejan de cumplir el filtro) se
            // quitan de lo ya cargado: si no, su tarjeta volvería a aparecer.
            const removedIds = new Set(
                snapshot
                    .docChanges()
                    .filter((change) => change.type === 'removed')
                    .map((change) => change.doc.id)
            );
            if (removedIds.size > 0) {
                source.olderTasks = source.olderTasks.filter((task) => !removedIds.has(task.id));
            }
            source.firstPage = firstPageTasks;
            teamTasksStore.set(mergeSourcesTasks(sources));
            teamTasksPaginationStore.set({
                isLoadingMore: false,
                hasMore: sources.some((item) => item.hasMore),
                pageSize
            });
        }, (error) => {
            console.error('Error in team tasks listener:', error);
            teamTasksPaginationStore.set({
                isLoadingMore: false,
                hasMore: false,
                pageSize
            });
        });
        unsubscribers.push(unsubscribe);
    });

    const unsubscribeAll = () => {
        unsubscribers.forEach((unsubscribe) => unsubscribe());
    };
    teamTasksUnsubscribe = unsubscribeAll;

    return () => {
        unsubscribeAll();
        if (teamTasksUnsubscribe === unsubscribeAll) {
            teamTasksUnsubscribe = null;
            teamTasksStore.set([]);
            resetTeamTasksPagination(pageSize);
        }
    };
}

/**
 * Combina las tareas de todas las fuentes (mis tareas y las de mis fantasmas).
 *
 * Cada fuente aporta su primera página (la que llega por el listener) y las
 * tareas ya cargadas con "cargar más". La primera página se mantiene aparte
 * para que, al borrar una tarea, su tarjeta desaparezca del tablero.
 */
function mergeSourcesTasks(sources = []) {
    const tasksById = new Map();
    sources.forEach((source) => {
        [...(source.firstPage || []), ...(source.olderTasks || [])].forEach((task) => {
            if (!tasksById.has(task.id)) tasksById.set(task.id, task);
        });
    });
    return sortTeamTasks(Array.from(tasksById.values()));
}

export async function loadMoreTeamTasks() {
    const { teamId, status, pageSize, sources } = teamTasksQueryState;
    if (!teamId) return [];

    const paginationState = get(teamTasksPaginationStore);
    if (paginationState.isLoadingMore || !paginationState.hasMore) return [];

    const source = sources.find((item) => item.hasMore && item.cursor);
    if (!source) {
        teamTasksPaginationStore.set({ ...paginationState, hasMore: false });
        return [];
    }

    teamTasksPaginationStore.set({
        ...paginationState,
        isLoadingMore: true
    });

    try {
        const tasksQuery = query(
            collection(db, 'teams', teamId, 'tasks'),
            ...getTeamTasksConstraints(source, status, pageSize, source.cursor)
        );
        const snapshot = await getDocs(tasksQuery);
        const olderTasks = snapshot.docs.map(normalizeTaskDoc);
        source.cursor = snapshot.docs[snapshot.docs.length - 1] || source.cursor;
        source.olderTasks = mergeTeamTasks(source.olderTasks, olderTasks);
        source.hasMore = snapshot.docs.length === pageSize;
        teamTasksStore.set(mergeSourcesTasks(sources));
        teamTasksPaginationStore.set({
            isLoadingMore: false,
            hasMore: sources.some((item) => item.hasMore),
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

export async function executeAddTeamTask({ teamId, taskData, user, teamName = 'el equipo', taskId = null }) {
    if (!user || !teamId) return;
    const team = get(teamsStore).find((entry) => entry.id === teamId) || null;
    const newTask = buildTeamTaskDoc(taskData, user, team);
    let docRef = null;

    if (taskId) {
        docRef = doc(db, 'teams', teamId, 'tasks', taskId);
        await setDoc(docRef, newTask, { merge: true });
    } else {
        docRef = await addDoc(collection(db, 'teams', teamId, 'tasks'), newTask);
    }

    if (newTask.assignedTo.length > 0) {
        const creatorName = user.name || user.email;
        const notifPromises = newTask.assignedTo.map(uid =>
            createNotification(uid, 'Nueva tarea asignada', `"${newTask.title}" fue asignada a ti en ${teamName} por ${creatorName}.`, {
                url: `/teams/${teamId}/tasks`,
                type: 'task_assigned',
                sourceId: docRef.id,
                teamId,
            })
        );
        await Promise.all(notifPromises);
    }
    return docRef.id;
}

async function enqueueAddTeamTask(teamId, taskData, user, teamName) {
    const taskId = taskData.id || taskData.clientTaskId || createClientTaskId();
    const queuedTaskData = {
        ...taskData,
        createdAt: taskData.createdAt || new Date().toISOString(),
        clientTaskId: taskId
    };
    const newTask = {
        id: taskId,
        ...buildTeamTaskDoc(
            queuedTaskData,
            user,
            get(teamsStore).find((entry) => entry.id === teamId) || null
        ),
        _offlinePending: true
    };

    await enqueueOfflineOperation(
        ADD_TEAM_TASK_OPERATION,
        { teamId, taskData: queuedTaskData, user, teamName, taskId },
        { id: taskId, label: `Tarea: ${queuedTaskData.title || ''}`.trim() }
    );
    upsertOptimisticTeamTask(newTask);
    scheduleOfflineSync();
    return { queued: true, id: taskId };
}

export async function addTeamTask(teamId, taskData, user, teamName = 'el equipo') {
    if (!user || !teamId) return;
    if (isBrowserOffline()) {
        return enqueueAddTeamTask(teamId, taskData, user, teamName);
    }

    try {
        const id = await executeAddTeamTask({ teamId, taskData, user, teamName });
        return { queued: false, id };
    } catch (error) {
        if (isOfflineError(error)) {
            return enqueueAddTeamTask(teamId, taskData, user, teamName);
        }
        console.error('Error adding team task:', error);
        throw error;
    }
}

export async function executeUpdateTeamTask({ teamId, taskId, data }) {
    if (!teamId || !taskId) return;
    const taskRef = doc(db, 'teams', teamId, 'tasks', taskId);
    const payload = { ...data };
    // Los masters de los fantasmas asignados se recalculan siempre que cambia
    // la asignación para que el acceso de cada master siga siendo coherente.
    if (Array.isArray(data.assignedTo)) {
        const team = get(teamsStore).find((entry) => entry.id === teamId) || null;
        payload.ghostMasterIds = getTaskGhostMasterIds(team, data.assignedTo);
    }
    await updateDoc(taskRef, { ...payload, updatedAt: data.updatedAt || new Date().toISOString() });
}

async function enqueueUpdateTeamTask(teamId, taskId, data) {
    const updatedAt = data.updatedAt || new Date().toISOString();
    const queuedData = { ...data, updatedAt };
    if (Array.isArray(data.assignedTo)) {
        const team = get(teamsStore).find((entry) => entry.id === teamId) || null;
        queuedData.ghostMasterIds = getTaskGhostMasterIds(team, data.assignedTo);
    }
    await enqueueOfflineOperation(
        UPDATE_TEAM_TASK_OPERATION,
        { teamId, taskId, data: queuedData },
        {
            id: `update-${teamId}-${taskId}-${Date.now()}`,
            label: 'Actualizar tarea'
        }
    );
    updateOptimisticTeamTask(taskId, queuedData);
    scheduleOfflineSync();
    return { queued: true, id: taskId };
}

export async function updateTeamTask(teamId, taskId, data) {
    if (!teamId || !taskId) return;
    if (isBrowserOffline()) {
        return enqueueUpdateTeamTask(teamId, taskId, data);
    }

    try {
        await executeUpdateTeamTask({ teamId, taskId, data });
        return { queued: false, id: taskId };
    } catch (error) {
        if (isOfflineError(error)) {
            return enqueueUpdateTeamTask(teamId, taskId, data);
        }
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

/**
 * Quita la tarea del tablero al instante (después de borrarla en Firestore),
 * para que su tarjeta desaparezca sin esperar al siguiente snapshot.
 */
export function removeTeamTaskFromStore(taskId) {
    if (!taskId) return;
    teamTasksStore.update((tasks) => tasks.filter((task) => task.id !== taskId));
}
