import { beforeEach, describe, expect, it, vi } from 'vitest';

const firestoreMocks = vi.hoisted(() => ({
    collection: vi.fn((_db, ...segments) => segments.join('/')),
    doc: vi.fn((_db, ...segments) => segments.join('/')),
    getDoc: vi.fn(),
    updateDoc: vi.fn(),
    deleteDoc: vi.fn(),
    arrayUnion: vi.fn((v) => v)
}));

const writableMock = vi.hoisted(() => {
    return {
        subscribe: vi.fn(),
        set: vi.fn(),
        update: vi.fn()
    };
});

vi.mock('firebase/firestore', () => ({
    collection: firestoreMocks.collection,
    doc: firestoreMocks.doc,
    getDoc: firestoreMocks.getDoc,
    updateDoc: firestoreMocks.updateDoc,
    deleteDoc: firestoreMocks.deleteDoc,
    arrayUnion: firestoreMocks.arrayUnion
}));

vi.mock('./firebase.js', () => ({ db: {} }));

vi.mock('./auth.js', () => ({
    userStore: writableMock,
    getProfileImage: vi.fn(() => '')
}));

vi.mock('./permissions.js', () => ({
    createTeamPermissions: vi.fn(() => ({})),
    normalizeTeamPermissions: vi.fn((v) => v || {}),
    normalizeCustomTeamRoles: vi.fn((v) => v || [])
}));

vi.mock('./teamSizes.js', () => ({
    assertTeamMemberLimit: vi.fn(),
    getTeamMonthlyPrice: vi.fn(() => 0),
    normalizeTeamSizeData: vi.fn(() => ({ teamSize: 'S', maxMembers: 4 }))
}));

vi.mock('./workLimits.js', () => ({
    normalizeNonWorkingDays: vi.fn((v) => v || [])
}));

vi.mock('./systemAdminConfig.js', () => ({
    isConfiguredSystemAdmin: vi.fn(() => true)
}));

vi.mock('./notifications.js', () => ({
    createNotification: vi.fn()
}));

import { setTeamActive, setTeamHidden } from './teams.js';

describe('team active/hidden state', () => {
    beforeEach(() => {
        vi.clearAllMocks();
        firestoreMocks.updateDoc.mockResolvedValue();
        // Por defecto, el usuario es admin del equipo.
        writableMock.subscribe.mockImplementation((fn) => {
            fn({ uid: 'admin-1' });
            return () => {};
        });
    });

    function mockTeam(team) {
        firestoreMocks.getDoc.mockResolvedValue({
            exists: () => true,
            data: () => team,
            id: team.id
        });
    }

    it('permite al admin activar un equipo', async () => {
        mockTeam({ id: 'team-1', admin: 'admin-1' });

        await setTeamActive('team-1', true);

        expect(firestoreMocks.updateDoc).toHaveBeenCalledWith(
            'teams/team-1',
            expect.objectContaining({ active: true })
        );
    });

    it('permite al admin desactivar un equipo', async () => {
        mockTeam({ id: 'team-1', admin: 'admin-1', active: true });

        await setTeamActive('team-1', false);

        expect(firestoreMocks.updateDoc).toHaveBeenCalledWith(
            'teams/team-1',
            expect.objectContaining({ active: false })
        );
    });

    it('permite al admin ocultar un equipo', async () => {
        mockTeam({ id: 'team-1', admin: 'admin-1' });

        await setTeamHidden('team-1', true);

        expect(firestoreMocks.updateDoc).toHaveBeenCalledWith(
            'teams/team-1',
            expect.objectContaining({ hidden: true })
        );
    });

    it('rechaza cambiar el estado si el usuario no es admin', async () => {
        mockTeam({ id: 'team-1', admin: 'admin-1' });
        writableMock.subscribe.mockImplementation((fn) => {
            fn({ uid: 'member-1' });
            return () => {};
        });

        await expect(setTeamActive('team-1', false))
            .rejects.toThrow(/administrador/i);
        expect(firestoreMocks.updateDoc).not.toHaveBeenCalled();

        await expect(setTeamHidden('team-1', true))
            .rejects.toThrow(/administrador/i);
    });

    it('rechaza si el equipo no existe', async () => {
        firestoreMocks.getDoc.mockResolvedValue({ exists: () => false });

        await expect(setTeamActive('team-1', false))
            .rejects.toThrow(/equipo no encontrado/i);
        await expect(setTeamHidden('team-1', true))
            .rejects.toThrow(/equipo no encontrado/i);
    });

    it('rechaza si faltan teamId o usuario', async () => {
        await expect(setTeamActive('', true)).rejects.toThrow();
    });

    it('rechaza si falta el usuario autenticado', async () => {
        writableMock.subscribe.mockImplementation((fn) => {
            fn(null);
            return () => {};
        });
        await expect(setTeamActive('team-1', true)).rejects.toThrow();
    });

    it('normaliza el valor activo a booleano estricto', async () => {
        mockTeam({ id: 'team-1', admin: 'admin-1' });

        await setTeamActive('team-1', 'true');
        expect(firestoreMocks.updateDoc.mock.calls[0][1].active).toBe(true);

        await setTeamActive('team-1', 0);
        expect(firestoreMocks.updateDoc.mock.calls[1][1].active).toBe(false);

        await setTeamActive('team-1', null);
        expect(firestoreMocks.updateDoc.mock.calls[2][1].active).toBe(false);
    });
});