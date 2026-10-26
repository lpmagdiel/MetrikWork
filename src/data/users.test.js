import { beforeEach, describe, expect, it, vi } from 'vitest';
import { get } from 'svelte/store';

const authMocks = vi.hoisted(() => ({
    getIdToken: vi.fn(async () => 'firebase-id-token')
}));

const userState = vi.hoisted(() => ({ current: null }));

vi.mock('./firebase.js', () => ({
    auth: { currentUser: { getIdToken: authMocks.getIdToken } },
    db: {}
}));

vi.mock('./auth.js', () => ({
    userStore: {
        subscribe: (run) => {
            run(userState.current);
            return () => {};
        },
        set: (value) => {
            userState.current = value;
        },
        update: (fn) => {
            userState.current = fn(userState.current);
        }
    }
}));

let isAdminMock = vi.fn(() => true);

vi.mock('./systemAdminConfig.js', () => ({
    isConfiguredSystemAdmin: (email) => isAdminMock(email)
}));

import {
    adminUsersStateStore,
    adminUsersStore,
    loadAdminUsers,
    resetAdminUsersStore,
    setUserPassword,
    validateAdminPassword
} from './users.js';

function setUser(user) {
    userState.current = user;
}

function jsonResponse(status, payload) {
    return {
        ok: status >= 200 && status < 300,
        status,
        json: async () => payload
    };
}

describe('validateAdminPassword', () => {
    it('exige una contraseña con un mínimo de 8 caracteres', () => {
        expect(validateAdminPassword('')).toEqual(['Introduce la nueva contraseña.']);
        expect(validateAdminPassword('corta')).toEqual([
            'La contraseña debe tener al menos 8 caracteres.'
        ]);
        expect(validateAdminPassword('clave1234')).toEqual([]);
    });

    it('rechaza contraseñas demasiado largas', () => {
        const errors = validateAdminPassword('a'.repeat(101));
        expect(errors).toHaveLength(1);
        expect(errors[0]).toMatch(/100 caracteres/);
    });
});

describe('loadAdminUsers', () => {
    beforeEach(() => {
        vi.clearAllMocks();
        resetAdminUsersStore();
        isAdminMock = vi.fn(() => true);
        setUser({ uid: 'admin-uid', email: 'fabiansolares719@gmail.com' });
        authMocks.getIdToken.mockResolvedValue('firebase-id-token');
        global.fetch = vi.fn();
    });

    it('impide la consulta a usuarios que no son administradores', async () => {
        isAdminMock = vi.fn(() => false);

        await expect(loadAdminUsers()).rejects.toThrow(/administrador/i);
        expect(global.fetch).not.toHaveBeenCalled();
    });

    it('carga el listado de usuarios con el token del administrador', async () => {
        global.fetch.mockResolvedValue(
            jsonResponse(200, {
                users: [{ uid: 'u1', email: 'user@example.com', hasPassword: true }]
            })
        );

        const users = await loadAdminUsers();

        expect(global.fetch).toHaveBeenCalledWith('/api/admin-users', {
            headers: { Authorization: 'Bearer firebase-id-token' }
        });
        expect(users).toHaveLength(1);
        expect(get(adminUsersStore)).toHaveLength(1);
        expect(get(adminUsersStateStore)).toEqual({ loading: false, error: '' });
    });

    it('guarda el error y vacía el store cuando el servidor responde con error', async () => {
        global.fetch.mockResolvedValue(jsonResponse(403, { error: 'Sin acceso' }));

        await expect(loadAdminUsers()).rejects.toThrow('Sin acceso');
        expect(get(adminUsersStore)).toEqual([]);
        expect(get(adminUsersStateStore).error).toBe('Sin acceso');
    });
});

describe('setUserPassword', () => {
    beforeEach(() => {
        vi.clearAllMocks();
        resetAdminUsersStore();
        isAdminMock = vi.fn(() => true);
        setUser({ uid: 'admin-uid', email: 'fabiansolares719@gmail.com' });
        authMocks.getIdToken.mockResolvedValue('firebase-id-token');
        global.fetch = vi.fn();
    });

    it('impide el cambio de contraseña a usuarios que no son administradores', async () => {
        isAdminMock = vi.fn(() => false);

        await expect(setUserPassword('u1', 'nuevaclavede123')).rejects.toThrow(/administrador/i);
        expect(global.fetch).not.toHaveBeenCalled();
    });

    it('exige un usuario y una contraseña válida antes de llamar al servidor', async () => {
        await expect(setUserPassword('', 'nuevaclavede123')).rejects.toThrow(/obligatorio/i);
        await expect(setUserPassword('u1', 'corta')).rejects.toThrow(/8 caracteres/i);
        expect(global.fetch).not.toHaveBeenCalled();
    });

    it('envía el cambio de contraseña con el uid y el token del administrador', async () => {
        global.fetch.mockResolvedValue(jsonResponse(200, { ok: true, uid: 'u1' }));

        const result = await setUserPassword('u1', 'nuevaclavede123');

        expect(global.fetch).toHaveBeenCalledWith('/api/set-user-password', {
            method: 'POST',
            headers: {
                Authorization: 'Bearer firebase-id-token',
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({ uid: 'u1', password: 'nuevaclavede123' })
        });
        expect(result.ok).toBe(true);
    });

    it('propaga el mensaje de error del servidor', async () => {
        global.fetch.mockResolvedValue(jsonResponse(404, { error: 'USER_NOT_FOUND' }));

        await expect(setUserPassword('u1', 'nuevaclavede123')).rejects.toThrow('USER_NOT_FOUND');
    });
});
