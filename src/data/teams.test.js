import { beforeEach, describe, expect, it, vi } from 'vitest';

const firestoreMocks = vi.hoisted(() => ({
    collection: vi.fn((_db, ...segments) => segments.join('/')),
    doc: vi.fn((_db, ...segments) => segments.join('/')),
    setDoc: vi.fn(),
    getDoc: vi.fn(),
    updateDoc: vi.fn(),
    deleteDoc: vi.fn(),
    arrayUnion: vi.fn((v) => v)
}));

const userMock = vi.hoisted(() => ({
    subscribe: vi.fn(),
    set: vi.fn(),
    update: vi.fn()
}));

vi.mock('firebase/firestore', () => ({
    collection: firestoreMocks.collection,
    doc: firestoreMocks.doc,
    getDoc: firestoreMocks.getDoc,
    setDoc: firestoreMocks.setDoc,
    updateDoc: firestoreMocks.updateDoc,
    deleteDoc: firestoreMocks.deleteDoc,
    arrayUnion: firestoreMocks.arrayUnion,
    onSnapshot: vi.fn(),
    query: vi.fn(),
    where: vi.fn(),
    getDocs: vi.fn()
}));

vi.mock('./firebase.js', () => ({ db: {} }));

vi.mock('./auth.js', () => ({
    userStore: userMock,
    getProfileImage: vi.fn(() => 'avatar.png')
}));

vi.mock('./permissions.js', () => ({
    createTeamPermissions: vi.fn(() => ({ all: true })),
    normalizeTeamPermissions: vi.fn((v) => v || {}),
    normalizeCustomTeamRoles: vi.fn((v) => v || [])
}));

vi.mock('./workLimits.js', () => ({
    normalizeNonWorkingDays: vi.fn((v) => v || [])
}));

let isAdminMock = vi.fn(() => true);

vi.mock('./systemAdminConfig.js', () => ({
    isConfiguredSystemAdmin: (email) => isAdminMock(email)
}));

vi.mock('./notifications.js', () => ({
    createNotification: vi.fn()
}));

import { createTeam, setTeamActive, setTeamHidden, getTeamGhosts, getGhostById, getGhostWorkdayUserId, isGhostUserId, hasGhostControlPermission, hasGhostCreatePermission } from './teams.js';

function setUser(user) {
    userMock.subscribe.mockImplementation((fn) => {
        fn(user);
        return () => {};
    });
}

describe('createTeam', () => {
    beforeEach(() => {
        vi.clearAllMocks();
        isAdminMock = vi.fn(() => true);
        setUser({ uid: 'admin-uid', email: 'fabiansolares719@gmail.com', name: 'Fabián' });
        firestoreMocks.doc.mockImplementation((first, ...segments) => {
            // Cuando se invoca `doc(collection(db, 'teams'))`, el primer argumento
            // es la salida del mock de `collection` (cadena "teams") y debe devolver
            // una referencia con un id autogenerado.
            const path = [first, ...segments].filter(Boolean).join('/');
            return { id: `${path}/new-id`, path };
        });
        firestoreMocks.setDoc.mockResolvedValue();
    });

    it('crea un equipo solo con un nombre válido', async () => {
        const id = await createTeam('  Equipo de prueba  ');

        expect(id).toBe('teams/new-id');
        expect(firestoreMocks.setDoc).toHaveBeenCalledWith(
            expect.objectContaining({ id: 'teams/new-id', path: 'teams' }),
            expect.objectContaining({
                team: 'Equipo de prueba',
                admin: 'admin-uid',
                adminEmail: 'fabiansolares719@gmail.com',
                members: ['admin-uid'],
                projectBudget: 0,
                projectBudgetCurrency: 'MXN',
                active: true,
                hidden: false
            })
        );
    });

    it('no incluye campos de plan ni de facturación en el documento creado', async () => {
        await createTeam('Equipo');

        const payload = firestoreMocks.setDoc.mock.calls[0][1];
        expect(payload).not.toHaveProperty('teamSize');
        expect(payload).not.toHaveProperty('maxMembers');
        expect(payload).not.toHaveProperty('billingAmountEur');
        expect(payload).not.toHaveProperty('billingDate');
    });

    it('rechaza la creación cuando el nombre está vacío', async () => {
        await expect(createTeam('   ')).rejects.toThrow(/nombre/i);
        expect(firestoreMocks.setDoc).not.toHaveBeenCalled();
    });

    it('rechaza la creación si no hay usuario autenticado', async () => {
        setUser(null);
        await expect(createTeam('Equipo')).rejects.toThrow(/autenticado/i);
        expect(firestoreMocks.setDoc).not.toHaveBeenCalled();
    });

    it('rechaza la creación si el usuario no es administrador del sistema', async () => {
        isAdminMock = vi.fn(() => false);
        await expect(createTeam('Equipo'))
            .rejects.toThrow(/administrador/i);
        expect(firestoreMocks.setDoc).not.toHaveBeenCalled();
    });

    it('permite crear a fabiansolares719@gmail.com como system admin', async () => {
        isAdminMock = vi.fn(() => true);
        const id = await createTeam('Equipo Fabian');
        expect(id).toBe('teams/new-id');
        expect(firestoreMocks.setDoc).toHaveBeenCalled();
    });
});

describe('team active/hidden state', () => {
    beforeEach(() => {
        vi.clearAllMocks();
        firestoreMocks.doc.mockImplementation((first, ...segments) => {
            const path = [first, ...segments].filter(Boolean).join('/');
            return { id: path.split('/').pop(), path };
        });
        firestoreMocks.updateDoc.mockResolvedValue();
        setUser({ uid: 'admin-1' });
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
            expect.objectContaining({ id: 'team-1' }),
            expect.objectContaining({ active: true })
        );
    });

    it('permite al admin desactivar un equipo', async () => {
        mockTeam({ id: 'team-1', admin: 'admin-1', active: true });

        await setTeamActive('team-1', false);

        expect(firestoreMocks.updateDoc).toHaveBeenCalledWith(
            expect.objectContaining({ id: 'team-1' }),
            expect.objectContaining({ active: false })
        );
    });

    it('permite al admin ocultar un equipo', async () => {
        mockTeam({ id: 'team-1', admin: 'admin-1' });

        await setTeamHidden('team-1', true);

        expect(firestoreMocks.updateDoc).toHaveBeenCalledWith(
            expect.objectContaining({ id: 'team-1' }),
            expect.objectContaining({ hidden: true })
        );
    });

    it('rechaza cambiar el estado si el usuario no es admin', async () => {
        mockTeam({ id: 'team-1', admin: 'admin-1' });
        setUser({ uid: 'member-1' });

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
        setUser(null);
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

describe('team ghosts', () => {
    it('detecta ids de usuario fantasma por prefijo', () => {
        expect(isGhostUserId('ghost-123')).toBe(true);
        expect(isGhostUserId('user-123')).toBe(false);
        expect(isGhostUserId(undefined)).toBe(false);
    });

    it('genera el id de workday de un fantasma con prefijo "ghost-"', () => {
        expect(getGhostWorkdayUserId('abc')).toBe('ghost-abc');
    });

    it('normaliza la lista de fantasmas descartando entradas inválidas', () => {
        const team = {
            ghosts: [
                { id: 'g1', name: 'Fantasma Uno', createdAt: '2026-01-01' },
                { id: 'g1', name: 'Fantasma Duplicado' },
                { id: '', name: 'Sin id' },
                { id: 'g2', name: '' },
                { id: 'g3', name: 'Fantasma Tres' }
            ]
        };

        const ghosts = getTeamGhosts(team);
        expect(ghosts.map((ghost) => ghost.name)).toEqual(['Fantasma Uno', 'Fantasma Tres']);
    });

    it('recupera un fantasma por id', () => {
        const team = { ghosts: [{ id: 'g1', name: 'Fantasma' }] };
        const ghost = getGhostById(team, 'g1');
        expect(ghost?.name).toBe('Fantasma');
        expect(getGhostById(team, 'nope')).toBeNull();
        expect(getGhostById(null, 'g1')).toBeNull();
    });

    it('concede control total de fantasmas al administrador', () => {
        const team = { admin: 'admin-1', memberPermissions: {} };
        expect(hasGhostControlPermission(team, 'admin-1')).toBe(true);
        expect(hasGhostCreatePermission(team, 'admin-1')).toBe(true);
    });

    it('respeta los permisos ghosts.create y ghosts.control de cada miembro', () => {
        const team = {
            admin: 'admin-1',
            memberPermissions: {
                creator: { ghosts: { create: true } },
                controller: { ghosts: { control: true } },
                stranger: {}
            }
        };
        expect(hasGhostCreatePermission(team, 'creator')).toBe(true);
        expect(hasGhostControlPermission(team, 'creator')).toBe(false);
        expect(hasGhostCreatePermission(team, 'controller')).toBe(true);
        expect(hasGhostControlPermission(team, 'controller')).toBe(true);
        expect(hasGhostCreatePermission(team, 'stranger')).toBe(false);
        expect(hasGhostControlPermission(team, 'stranger')).toBe(false);
    });
});
