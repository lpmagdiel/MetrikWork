import { beforeEach, describe, expect, it, vi } from 'vitest';

const firestoreMocks = vi.hoisted(() => ({
    getDocs: vi.fn(),
    onSnapshot: vi.fn(),
    orderBy: vi.fn((field) => ({ field })),
    limit: vi.fn((value) => ({ limit: value })),
    startAfter: vi.fn((cursor) => ({ startAfter: cursor })),
    where: vi.fn((field, op, value) => ({ field, op, value }))
}));

vi.mock('firebase/firestore', () => ({
    addDoc: vi.fn(),
    arrayUnion: vi.fn((value) => ({ operation: 'arrayUnion', value })),
    collection: vi.fn((...segments) => segments.join('/')),
    deleteDoc: vi.fn(),
    doc: vi.fn((_db, ...segments) => segments.join('/')),
    getDoc: vi.fn(),
    getDocs: firestoreMocks.getDocs,
    limit: firestoreMocks.limit,
    onSnapshot: firestoreMocks.onSnapshot,
    orderBy: firestoreMocks.orderBy,
    query: vi.fn((...args) => ({ args })),
    setDoc: vi.fn(),
    startAfter: firestoreMocks.startAfter,
    updateDoc: vi.fn(),
    where: firestoreMocks.where,
    writeBatch: vi.fn()
}));

vi.mock('./firebase.js', () => ({ db: {} }));
vi.mock('./auth.js', () => ({
    userStore: {
        subscribe(run) {
            run({ uid: 'miembro-1' });
            return () => {};
        }
    }
}));
vi.mock('./teams.js', () => ({
    teamsStore: {
        subscribe(run) {
            run([]);
            return () => {};
        }
    },
    getGhostById: vi.fn(() => null),
    getGhostIdFromUserId: vi.fn((userId) => userId.replace(/^ghost-/, '')),
    isGhostUserId: vi.fn((userId) => String(userId).startsWith('ghost-'))
}));
vi.mock('./notifications.js', () => ({
    createNotification: vi.fn().mockResolvedValue(null)
}));

import { get } from 'svelte/store';
import { subscribeToTeamTasks, teamTasksStore } from './tasks.js';

function makeSnapshot(docs, changes = []) {
    return {
        docs: docs.map((doc) => ({
            id: doc.id,
            data: () => doc
        })),
        docChanges: () => changes
    };
}

describe('listado de tareas del equipo', () => {
    let snapshotHandler;

    beforeEach(() => {
        vi.clearAllMocks();
        teamTasksStore.set([]);
        firestoreMocks.onSnapshot.mockImplementation((_query, handler) => {
            snapshotHandler = handler;
            return () => {};
        });
    });

    it('quita la tarjeta de una tarea eliminada', () => {
        subscribeToTeamTasks('team-1', { pageSize: 20, status: 'all' });

        snapshotHandler(makeSnapshot([
            { id: 'task-1', title: 'Tarea uno', createdAt: '2026-10-12T10:00:00.000Z' },
            { id: 'task-2', title: 'Tarea dos', createdAt: '2026-10-11T10:00:00.000Z' }
        ]));

        expect(get(teamTasksStore)).toHaveLength(2);

        // La tarea se borra: el listener la comunica como eliminada.
        snapshotHandler(
            makeSnapshot(
                [{ id: 'task-2', title: 'Tarea dos', createdAt: '2026-10-11T10:00:00.000Z' }],
                [{ type: 'removed', doc: { id: 'task-1' } }]
            )
        );

        const ids = get(teamTasksStore).map((task) => task.id);
        expect(ids).toEqual(['task-2']);
    });

    it('no recupera tareas eliminadas al cargar más', async () => {
        subscribeToTeamTasks('team-1', { pageSize: 1, status: 'all' });

        snapshotHandler(makeSnapshot([
            { id: 'task-1', title: 'Tarea uno', createdAt: '2026-10-12T10:00:00.000Z' }
        ]));

        firestoreMocks.getDocs.mockResolvedValue({
            docs: [{
                id: 'task-0',
                data: () => ({ id: 'task-0', title: 'Tarea antigua', createdAt: '2026-10-01T10:00:00.000Z' })
            }]
        });

        const { loadMoreTeamTasks } = await import('./tasks.js');
        await loadMoreTeamTasks();

        expect(get(teamTasksStore).map((task) => task.id).sort()).toEqual(['task-0', 'task-1']);

        // Si la tarea cargada con "cargar más" se borra, también desaparece.
        snapshotHandler(
            makeSnapshot(
                [{ id: 'task-1', title: 'Tarea uno', createdAt: '2026-10-12T10:00:00.000Z' }],
                [{ type: 'removed', doc: { id: 'task-0' } }]
            )
        );

        expect(get(teamTasksStore).map((task) => task.id)).toEqual(['task-1']);
    });
});
