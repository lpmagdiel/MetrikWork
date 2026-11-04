import { beforeEach, describe, expect, it, vi } from 'vitest';

const firestoreMocks = vi.hoisted(() => ({
    doc: vi.fn((...segments) => ({ id: segments.filter(Boolean).join('/') })),
    getDoc: vi.fn(),
    updateDoc: vi.fn(),
    getDocs: vi.fn()
}));

const teamsMocks = vi.hoisted(() => ({
    findGhostRegularWorkday: vi.fn(),
    updateGhostWorkday: vi.fn(),
    teamsStore: (() => {
        let teams = [];
        return {
            subscribe: (fn) => {
                fn(teams);
                return () => {};
            },
            set: (value) => {
                teams = value;
            }
        };
    })()
}));

vi.mock('firebase/firestore', () => ({
    addDoc: vi.fn(),
    collection: vi.fn((_db, ...segments) => segments.join('/')),
    doc: firestoreMocks.doc,
    getDoc: firestoreMocks.getDoc,
    getDocs: firestoreMocks.getDocs,
    query: vi.fn(),
    runTransaction: vi.fn(),
    setDoc: vi.fn(),
    updateDoc: firestoreMocks.updateDoc,
    where: vi.fn()
}));

vi.mock('./firebase.js', () => ({ db: {} }));
vi.mock('./auth.js', () => ({
    userStore: { subscribe: vi.fn(), set: vi.fn(), update: vi.fn() }
}));
vi.mock('./offlineQueue.js', () => ({
    enqueueOfflineOperation: vi.fn(async () => ({ id: 'op-1' })),
    getQueuedOperationsByType: vi.fn(async () => []),
    isBrowserOffline: vi.fn(() => false),
    isOfflineError: vi.fn(() => false),
    scheduleOfflineSync: vi.fn()
}));
vi.mock('../helpers/navigation.js', () => ({
    geocodeAddress: vi.fn(),
    getStoredUserGpsLocation: vi.fn(() => null),
    normalizeCoordinates: vi.fn(() => null)
}));
vi.mock('./teams.js', () => ({
    getTeamGhosts: vi.fn(() => []),
    getGhostById: vi.fn(),
    getGhostIdFromUserId: vi.fn((userId) => String(userId).replace(/^ghost-/, '')),
    hasGhostControlPermission: vi.fn(() => true),
    isGhostMaster: vi.fn(() => true),
    isGhostUserId: vi.fn((userId) => String(userId).startsWith('ghost-')),
    addGhostWorkday: vi.fn(),
    removeGhostWorkday: vi.fn(),
    updateGhostWorkday: teamsMocks.updateGhostWorkday,
    findGhostRegularWorkday: teamsMocks.findGhostRegularWorkday,
    teamsStore: teamsMocks.teamsStore
}));

import { executeUpdateWorkdayShiftVariation } from './works.js';

describe('executeUpdateWorkdayShiftVariation', () => {
    beforeEach(() => {
        vi.clearAllMocks();
        firestoreMocks.updateDoc.mockResolvedValue();
    });

    it('aplica la variación sobre la jornada determinista del día', async () => {
        firestoreMocks.getDoc.mockResolvedValue({
            exists: () => true,
            data: () => ({ type: 'full-day' })
        });

        const id = await executeUpdateWorkdayShiftVariation({
            teamId: 'team-1',
            userId: 'member-1',
            workDay: { date: '2026-01-15', shiftVariationHours: -2 }
        });

        expect(id).toContain('regular-workday');
        expect(firestoreMocks.updateDoc).toHaveBeenCalledWith(
            expect.objectContaining({ id: expect.stringContaining('works/regular-workday') }),
            expect.objectContaining({ shiftVariationHours: -2 })
        );
    });

    it('busca jornadas antiguas cuando no existe el id determinista', async () => {
        firestoreMocks.getDoc.mockResolvedValue({ exists: () => false, data: () => null });
        firestoreMocks.getDocs.mockResolvedValue({
            docs: [
                { id: 'legacy-1', data: () => ({ type: 'half-day', date: '2026-01-15' }) },
                { id: 'legacy-ot', data: () => ({ type: 'overtime', date: '2026-01-15' }) }
            ]
        });

        const id = await executeUpdateWorkdayShiftVariation({
            teamId: 'team-1',
            userId: 'member-1',
            workDay: { date: '2026-01-15', shiftVariationHours: 3 }
        });

        expect(id).toBe('legacy-1');
        expect(firestoreMocks.updateDoc).toHaveBeenCalledWith(
            expect.objectContaining({ id: expect.stringContaining('legacy-1') }),
            expect.objectContaining({ shiftVariationHours: 3 })
        );
    });

    it('falla cuando no hay ninguna jornada que ajustar', async () => {
        firestoreMocks.getDoc.mockResolvedValue({ exists: () => false, data: () => null });
        firestoreMocks.getDocs.mockResolvedValue({ docs: [] });

        await expect(
            executeUpdateWorkdayShiftVariation({
                teamId: 'team-1',
                userId: 'member-1',
                workDay: { date: '2026-01-15', shiftVariationHours: -2 }
            })
        ).rejects.toThrow(/no se encontró la jornada/i);
    });

    it('actualiza la jornada del fantasma', async () => {
        teamsMocks.teamsStore.set([{
            id: 'team-1',
            ghosts: [{ id: 'g1', name: 'Fantasma', masters: ['admin-1'], worksdays: [], overtime: [] }]
        }]);
        teamsMocks.findGhostRegularWorkday.mockReturnValue({ id: 'gd-1', date: '2026-01-15' });
        teamsMocks.updateGhostWorkday.mockResolvedValue('gd-1');

        const id = await executeUpdateWorkdayShiftVariation({
            teamId: 'team-1',
            userId: 'ghost-g1',
            workDay: { date: '2026-01-15', shiftVariationHours: -1 }
        });

        expect(id).toBe('gd-1');
        expect(teamsMocks.updateGhostWorkday).toHaveBeenCalledWith(
            'team-1',
            'g1',
            'gd-1',
            expect.objectContaining({ shiftVariationHours: -1 })
        );
    });
});
