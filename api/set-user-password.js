import {
    authenticateAdmin,
    parseJsonBody,
    sendJson,
    setUserPassword,
    validatePassword
} from '../server/firebaseAdminApi.js';

/**
 * POST /api/set-user-password
 *
 * Body: { uid: string, password: string }
 *
 * Cambia la contraseña de cualquier usuario de la aplicación. El SDK de cliente
 * de Firebase solo permite cambiar la contraseña propia, por eso esta acción
 * se realiza en el servidor con la API de administración de Firebase Auth.
 *
 * Al cambiar la contraseña se invalidan las sesiones del usuario afectado
 * (salvo que el propio administrador se cambie la suya) para que tenga que
 * iniciar sesión de nuevo con la contraseña nueva.
 */
export default async function handler(req, res) {
    if (req.method !== 'POST') {
        return sendJson(res, 405, { error: 'Method not allowed' });
    }

    try {
        const caller = await authenticateAdmin(req);
        const body = parseJsonBody(req);

        const uid = String(body.uid || '').trim();
        const password = String(body.password ?? '');

        if (!uid) {
            return sendJson(res, 400, { error: 'El usuario es obligatorio.' });
        }

        const passwordErrors = validatePassword(password);
        if (passwordErrors.length) {
            return sendJson(res, 400, { error: passwordErrors[0] });
        }

        const result = await setUserPassword(uid, password, {
            invalidateSessions: uid !== caller.uid
        });

        console.log(`[admin] contraseña actualizada por ${caller.email} para ${uid}`);

        return sendJson(res, 200, {
            ok: true,
            uid: result.uid,
            sessionsRevoked: result.sessionsRevoked
        });
    } catch (error) {
        const status = error.status || 500;

        if (status >= 500) {
            console.error('set-user-password error:', error);
        } else {
            console.warn('set-user-password rejected:', status, error.message);
        }

        return sendJson(res, status, {
            error: getPublicErrorMessage(status, error.message)
        });
    }
}

function getPublicErrorMessage(status, fallback) {
    if (status === 404) return 'El usuario no existe en Firebase Authentication.';
    return fallback || 'No se pudo cambiar la contraseña.';
}
