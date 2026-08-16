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

import {
    createTeam,
    setTeamActive,
    setTeamHidden,
    getTeamGhosts,
    getGhostById,
    getGhostWorkdayUserId,
    isGhostUserId,
    getGhostIdFromUserId,
    isGhostMaster,
    hasGhostControlPermission,
    hasGhostCreatePermission,
    addTeamGhost,
    updateTeamGhost,
    removeTeamGhost,
    addGhostWorkday,
    removeGhostWorkday,
    clearGhostWorkdays,
    getGhostWorkdays,
    findGhostRegularWorkday,
    teamsStore
} from './teams.js';

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

    it('extrae el ghostId desde un userId con prefijo', () => {
        expect(getGhostIdFromUserId('ghost-abc123')).toBe('abc123');
        expect(getGhostIdFromUserId('user-abc')).toBeNull();
        expect(getGhostIdFromUserId(undefined)).toBeNull();
    });

    it('reconoce masters[] como responsables del fantasma', () => {
        const team = {
            admin: 'admin-1',
            members: ['admin-1', 'master-1', 'other-1'],
            ghosts: [
                { id: 'g1', name: 'Fantasma', masters: ['master-1'] }
            ]
        };
        expect(isGhostMaster(team, 'g1', 'admin-1')).toBe(true);
        expect(isGhostMaster(team, 'g1', 'master-1')).toBe(true);
        expect(isGhostMaster(team, 'g1', 'other-1')).toBe(false);
        expect(isGhostMaster(team, 'g-none', 'master-1')).toBe(false);
    });

    it('normaliza los ghosts con masters, worksdays y overtime por defecto', () => {
        const team = {
            members: ['admin-1', 'master-1'],
            ghosts: [{ id: 'g1', name: 'Fantasma', masters: ['master-1'] }]
        };
        const ghosts = getTeamGhosts(team);
        expect(ghosts).toHaveLength(1);
        expect(ghosts[0]).toEqual(expect.objectContaining({
            id: 'g1',
            masters: ['master-1'],
            worksdays: [],
            overtime: []
        }));
    });

    it('descarta masters que no pertenezcan al equipo', () => {
        const team = {
            members: ['admin-1'],
            ghosts: [{ id: 'g1', name: 'Fantasma', masters: ['admin-1', 'intruder', 'admin-1'] }]
        };
        const ghosts = getTeamGhosts(team);
        expect(ghosts[0].masters).toEqual(['admin-1']);
    });
});

describe('team ghost mutators', () => {
    beforeEach(() => {
        vi.clearAllMocks();
        firestoreMocks.doc.mockImplementation((first, ...segments) => {
            const path = [first, ...segments].filter(Boolean).join('/');
            return { id: path.split('/').pop(), path };
        });
        firestoreMocks.updateDoc.mockResolvedValue();
    });

    function setTeamsStore(teams) {
        teamsStore.set(teams);
    }

    it('addTeamGhost requiere al menos un master válido', async () => {
        setUser({ uid: 'admin-1', name: 'Admin' });
        setTeamsStore([{ id: 'team-1', admin: 'admin-1', members: ['admin-1', 'master-1'], ghosts: [] }]);

        await expect(addTeamGhost('team-1', { name: 'Fantasma', masters: [] }))
            .rejects.toThrow(/master/i);
        expect(firestoreMocks.updateDoc).not.toHaveBeenCalled();

        await addTeamGhost('team-1', { name: 'Fantasma', masters: ['master-1'] });
        expect(firestoreMocks.updateDoc).toHaveBeenCalled();
        const payload = firestoreMocks.updateDoc.mock.calls[0][1];
        const ghosts = payload.ghosts;
        expect(ghosts[0]).toEqual(expect.objectContaining({
            name: 'Fantasma',
            masters: ['master-1'],
            worksdays: [],
            overtime: []
        }));
    });

    it('addTeamGhost rechaza sin nombre', async () => {
        setUser({ uid: 'admin-1', name: 'Admin' });
        setTeamsStore([{ id: 'team-1', admin: 'admin-1', members: ['admin-1'], ghosts: [] }]);

        await expect(addTeamGhost('team-1', { name: '   ', masters: ['admin-1'] }))
            .rejects.toThrow(/nombre/i);
        expect(firestoreMocks.updateDoc).not.toHaveBeenCalled();
    });

    it('addTeamGhost rechaza si el usuario no tiene permisos', async () => {
        setUser({ uid: 'stranger' });
        setTeamsStore([{ id: 'team-1', admin: 'admin-1', members: ['admin-1', 'stranger'], ghosts: [] }]);

        await expect(addTeamGhost('team-1', { name: 'Fantasma', masters: ['admin-1'] }))
            .rejects.toThrow(/permisos/i);
        expect(firestoreMocks.updateDoc).not.toHaveBeenCalled();
    });

    it('updateTeamGhost actualiza nombre y masters manteniendo obras', async () => {
        setUser({ uid: 'admin-1', name: 'Admin' });
        setTeamsStore([{
            id: 'team-1',
            admin: 'admin-1',
            members: ['admin-1', 'master-1', 'master-2'],
            ghosts: [{
                id: 'g1',
                name: 'Fantasma',
                masters: ['master-1'],
                worksdays: [{ id: 'w1', date: '2026-01-15', type: 'full-day' }],
                overtime: []
            }]
        }]);

        await updateTeamGhost('team-1', 'g1', { name: 'Nuevo', masters: ['master-2'] });
        const payload = firestoreMocks.updateDoc.mock.calls[0][1];
        const ghosts = payload.ghosts;
        expect(ghosts[0].name).toBe('Nuevo');
        expect(ghosts[0].masters).toEqual(['master-2']);
        expect(ghosts[0].worksdays).toHaveLength(1);
        expect(ghosts[0].worksdays[0].id).toBe('w1');
        expect(ghosts[0].worksdays[0].date).toBe('2026-01-15');
        expect(ghosts[0].worksdays[0].type).toBe('full-day');
    });

    it('removeTeamGhost elimina el fantasma del equipo', async () => {
        setUser({ uid: 'admin-1' });
        setTeamsStore([{
            id: 'team-1',
            admin: 'admin-1',
            members: ['admin-1'],
            ghosts: [{ id: 'g1', name: 'Fantasma' }]
        }]);

        await removeTeamGhost('team-1', 'g1');
        const payload = firestoreMocks.updateDoc.mock.calls[0][1];
        expect(payload.ghosts).toEqual([]);
    });

    it('addGhostWorkday añade obras a worksdays y overtime por separado', async () => {
        setUser({ uid: 'admin-1', name: 'Admin' });
        setTeamsStore([{
            id: 'team-1',
            admin: 'admin-1',
            members: ['admin-1'],
            ghosts: [{ id: 'g1', name: 'Fantasma', masters: ['admin-1'], worksdays: [], overtime: [] }]
        }]);

        const regular = await addGhostWorkday('team-1', 'g1', {
            date: '2026-01-15',
            type: 'full-day',
            taskTitle: 'Tarea'
        });
        expect(regular.type).toBe('full-day');
        expect(regular.assignedBy).toBe('admin-1');

        setTeamsStore([{
            id: 'team-1',
            admin: 'admin-1',
            members: ['admin-1'],
            ghosts: [{
                id: 'g1',
                name: 'Fantasma',
                masters: ['admin-1'],
                worksdays: [{ id: regular.id, date: '2026-01-15', type: 'full-day', assignedBy: 'admin-1' }],
                overtime: []
            }]
        }]);

        const overtime = await addGhostWorkday('team-1', 'g1', {
            date: '2026-01-16',
            type: 'overtime',
            hours: 3
        });
        expect(overtime.type).toBe('overtime');
        expect(overtime.hours).toBe(3);

        const payload = firestoreMocks.updateDoc.mock.calls[1][1];
        const ghost = payload.ghosts[0];
        expect(ghost.worksdays).toHaveLength(1);
        expect(ghost.overtime).toHaveLength(1);
    });

    it('addGhostWorkday permite asignar a un master declarado', async () => {
        setUser({ uid: 'master-1', name: 'Master' });
        setTeamsStore([{
            id: 'team-1',
            admin: 'admin-1',
            members: ['admin-1', 'master-1'],
            ghosts: [{ id: 'g1', name: 'Fantasma', masters: ['master-1'], worksdays: [], overtime: [] }]
        }]);

        const entry = await addGhostWorkday('team-1', 'g1', {
            date: '2026-01-15',
            type: 'full-day'
        });
        expect(entry.assignedBy).toBe('master-1');
    });

    it('addGhostWorkday rechaza a un usuario no autorizado', async () => {
        setUser({ uid: 'stranger' });
        setTeamsStore([{
            id: 'team-1',
            admin: 'admin-1',
            members: ['admin-1', 'master-1', 'stranger'],
            ghosts: [{ id: 'g1', name: 'Fantasma', masters: ['master-1'], worksdays: [], overtime: [] }]
        }]);

        await expect(addGhostWorkday('team-1', 'g1', { date: '2026-01-15', type: 'full-day' }))
            .rejects.toThrow(/permisos/i);
        expect(firestoreMocks.updateDoc).not.toHaveBeenCalled();
    });

    it('removeGhostWorkday elimina la obra del array correcto', async () => {
        setUser({ uid: 'admin-1' });
        setTeamsStore([{
            id: 'team-1',
            admin: 'admin-1',
            members: ['admin-1'],
            ghosts: [{
                id: 'g1',
                name: 'Fantasma',
                masters: ['admin-1'],
                worksdays: [{ id: 'w1', date: '2026-01-15', type: 'full-day' }],
                overtime: [{ id: 'o1', date: '2026-01-16', type: 'overtime', hours: 2 }]
            }]
        }]);

        await removeGhostWorkday('team-1', 'g1', 'w1');
        const payload = firestoreMocks.updateDoc.mock.calls[0][1];
        expect(payload.ghosts[0].worksdays).toEqual([]);
        expect(payload.ghosts[0].overtime).toHaveLength(1);
    });

    it('getGhostWorkdays combina worksdays y overtime', () => {
        const team = {
            members: ['admin-1'],
            ghosts: [{
                id: 'g1',
                name: 'Fantasma',
                masters: ['admin-1'],
                worksdays: [{ id: 'w1', date: '2026-01-15', type: 'full-day' }],
                overtime: [{ id: 'o1', date: '2026-01-16', type: 'overtime', hours: 2 }]
            }]
        };
        const works = getGhostWorkdays(team, 'g1');
        expect(works.map((w) => w.id)).toEqual(['w1', 'o1']);
    });

    it('findGhostRegularWorkday detecta duplicados por fecha', () => {
        const team = {
            members: ['admin-1'],
            ghosts: [{
                id: 'g1',
                name: 'Fantasma',
                masters: ['admin-1'],
                worksdays: [
                    { id: 'w1', date: '2026-01-15', type: 'full-day' },
                    { id: 'w2', date: '2026-01-16', type: 'half-day' },
                    { id: 'w3', date: '2026-01-17', type: 'overtime' }
                ],
                overtime: []
            }]
        };
        expect(findGhostRegularWorkday(team, 'g1', '2026-01-15')?.id).toBe('w1');
        expect(findGhostRegularWorkday(team, 'g1', '2026-01-16')?.id).toBe('w2');
        expect(findGhostRegularWorkday(team, 'g1', '2026-01-17')).toBeNull();
        expect(findGhostRegularWorkday(team, 'g1', '2026-01-15', { excludeId: 'w1' })).toBeNull();
    });

    it('clearGhostWorkdays vacía worksdays y overtime', async () => {
        setUser({ uid: 'admin-1' });
        setTeamsStore([{
            id: 'team-1',
            admin: 'admin-1',
            members: ['admin-1'],
            ghosts: [{
                id: 'g1',
                name: 'Fantasma',
                masters: ['admin-1'],
                worksdays: [
                    { id: 'w1', date: '2026-01-15', type: 'full-day' },
                    { id: 'w2', date: '2026-01-16', type: 'half-day' }
                ],
                overtime: [{ id: 'o1', date: '2026-01-17', type: 'overtime', hours: 3 }]
            }]
        }]);

        const result = await clearGhostWorkdays('team-1', 'g1');
        expect(result).toEqual({ removedWorksdays: 2, removedOvertime: 1 });
        const payload = firestoreMocks.updateDoc.mock.calls[0][1];
        expect(payload.ghosts[0].worksdays).toEqual([]);
        expect(payload.ghosts[0].overtime).toEqual([]);
    });

    it('clearGhostWorkdays permite al usuario con ghosts.create', async () => {
        setUser({ uid: 'creator' });
        setTeamsStore([{
            id: 'team-1',
            admin: 'admin-1',
            members: ['admin-1', 'creator'],
            memberPermissions: { creator: { ghosts: { create: true } } },
            ghosts: [{
                id: 'g1',
                name: 'Fantasma',
                masters: ['admin-1'],
                worksdays: [{ id: 'w1', date: '2026-01-15', type: 'full-day' }],
                overtime: []
            }]
        }]);

        const result = await clearGhostWorkdays('team-1', 'g1');
        expect(result.removedWorksdays).toBe(1);
        expect(firestoreMocks.updateDoc).toHaveBeenCalled();
    });

    it('clearGhostWorkdays rechaza a un usuario sin permisos', async () => {
        setUser({ uid: 'stranger' });
        setTeamsStore([{
            id: 'team-1',
            admin: 'admin-1',
            members: ['admin-1', 'stranger'],
            ghosts: [{
                id: 'g1',
                name: 'Fantasma',
                masters: ['admin-1'],
                worksdays: [{ id: 'w1', date: '2026-01-15', type: 'full-day' }],
                overtime: []
            }]
        }]);

        await expect(clearGhostWorkdays('team-1', 'g1')).rejects.toThrow(/permisos/i);
        expect(firestoreMocks.updateDoc).not.toHaveBeenCalled();
    });

    it('clearGhostWorkdays omite updateDoc cuando no hay registros', async () => {
        setUser({ uid: 'admin-1' });
        setTeamsStore([{
            id: 'team-1',
            admin: 'admin-1',
            members: ['admin-1'],
            ghosts: [{ id: 'g1', name: 'Fantasma', masters: ['admin-1'], worksdays: [], overtime: [] }]
        }]);

        const result = await clearGhostWorkdays('team-1', 'g1');
        expect(result).toEqual({ removedWorksdays: 0, removedOvertime: 0 });
        expect(firestoreMocks.updateDoc).not.toHaveBeenCalled();
    });
});
