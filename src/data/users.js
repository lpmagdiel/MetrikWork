import { get, writable } from 'svelte/store';
import { auth } from './firebase.js';
import { userStore } from './auth.js';
import { isConfiguredSystemAdmin } from './systemAdminConfig.js';

/**
 * Gestión de usuarios desde el panel de administración del sistema.
 *
 * El SDK de cliente de Firebase solo permite cambiar la contraseña del usuario
 * que ha iniciado sesión. Para que el administrador cambie la contraseña de
 * cualquier usuario se usan los endpoints de servidor, que validan el ID token
 * del llamante antes de tocar Firebase Auth.
 */

export const MIN_ADMIN_PASSWORD_LENGTH = 8;
export const MAX_ADMIN_PASSWORD_LENGTH = 100;

export const adminUsersStore = writable([]);
export const adminUsersStateStore = writable({ loading: false, error: '' });

export function validateAdminPassword(password) {
    const errors = [];
    const value = String(password ?? '');

    if (!value) {
        errors.push('Introduce la nueva contraseña.');
    } else if (value.length < MIN_ADMIN_PASSWORD_LENGTH) {
        errors.push(`La contraseña debe tener al menos ${MIN_ADMIN_PASSWORD_LENGTH} caracteres.`);
    } else if (value.length > MAX_ADMIN_PASSWORD_LENGTH) {
        errors.push(`La contraseña no puede superar los ${MAX_ADMIN_PASSWORD_LENGTH} caracteres.`);
    }

    return errors;
}

export function isCurrentUserSystemAdmin() {
    const user = get(userStore);
    return Boolean(user?.uid) && isConfiguredSystemAdmin(user.email);
}

/**
 * Carga el listado de usuarios de la aplicación con sus proveedores de acceso.
 */
export async function loadAdminUsers() {
    if (!isCurrentUserSystemAdmin()) {
        throw new Error('Solo un administrador puede consultar los usuarios.');
    }

    adminUsersStateStore.set({ loading: true, error: '' });

    try {
        const response = await fetch('/api/admin-users', {
            headers: { Authorization: `Bearer ${await getAuthIdToken()}` }
        });
        const payload = await response.json().catch(() => ({}));

        if (!response.ok) {
            throw new Error(payload.error || 'No se pudieron cargar los usuarios.');
        }

        const users = Array.isArray(payload.users) ? payload.users : [];
        adminUsersStore.set(users);
        adminUsersStateStore.set({ loading: false, error: '' });

        return users;
    } catch (error) {
        adminUsersStore.set([]);
        adminUsersStateStore.set({ loading: false, error: error.message || 'No se pudieron cargar los usuarios.' });
        throw error;
    }
}

/**
 * Cambia la contraseña de un usuario desde el panel de administración.
 */
export async function setUserPassword(uid, password) {
    if (!isCurrentUserSystemAdmin()) {
        throw new Error('Solo un administrador puede cambiar contraseñas de usuarios.');
    }

    const targetUid = String(uid || '').trim();
    if (!targetUid) {
        throw new Error('El usuario es obligatorio.');
    }

    const errors = validateAdminPassword(password);
    if (errors.length) {
        throw new Error(errors[0]);
    }

    const response = await fetch('/api/set-user-password', {
        method: 'POST',
        headers: {
            Authorization: `Bearer ${await getAuthIdToken()}`,
            'Content-Type': 'application/json'
        },
        body: JSON.stringify({ uid: targetUid, password })
    });
    const payload = await response.json().catch(() => ({}));

    if (!response.ok) {
        throw new Error(payload.error || 'No se pudo cambiar la contraseña.');
    }

    return payload;
}

export function resetAdminUsersStore() {
    adminUsersStore.set([]);
    adminUsersStateStore.set({ loading: false, error: '' });
}

async function getAuthIdToken() {
    const currentUser = auth.currentUser;
    if (!currentUser) {
        throw new Error('Debes iniciar sesión para continuar.');
    }
    return currentUser.getIdToken();
}
