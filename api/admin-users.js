import {
    authenticateAdmin,
    listAuthUsers,
    sendJson
} from '../server/firebaseAdminApi.js';

/**
 * GET /api/admin-users
 *
 * Devuelve el listado de usuarios de la aplicación con la información de sus
 * proveedores de acceso (correo/contraseña, Google, ...).
 *
 * Solo el administrador del sistema puede consultar este endpoint: se valida
 * el ID token de Firebase del llamante y se comprueba que su email esté en la
 * lista de administradores configurada en `src/data/systemAdminConfig.js`.
 */
export default async function handler(req, res) {
    if (req.method !== 'GET') {
        return sendJson(res, 405, { error: 'Method not allowed' });
    }

    try {
        const caller = await authenticateAdmin(req);
        const authUsers = await listAuthUsers();

        const users = authUsers
            .map((user) => ({
                uid: user.uid,
                email: user.email,
                name: user.displayName,
                photoURL: user.photoURL,
                providers: user.providers,
                hasPassword: user.hasPassword,
                disabled: user.disabled,
                emailVerified: user.emailVerified,
                passwordUpdatedAt: user.passwordUpdatedAt,
                lastLoginAt: user.lastLoginAt,
                createdAt: user.createdAt,
                isSelf: user.uid === caller.uid
            }))
            .sort((a, b) => a.email.localeCompare(b.email, 'es', { sensitivity: 'base' }));

        return sendJson(res, 200, { users });
    } catch (error) {
        const status = error.status || 500;

        if (status >= 500) {
            console.error('admin-users error:', error);
        } else {
            console.warn('admin-users rejected:', status, error.message);
        }

        return sendJson(res, status, {
            error: error.message || 'Internal server error'
        });
    }
}
