import crypto from 'node:crypto';
import {
    isConfiguredSystemAdmin,
    normalizeSystemAdminEmail
} from '../src/data/systemAdminConfig.js';

/**
 * Utilidades de servidor para las acciones administrativas sobre Firebase Auth.
 *
 * El SDK de cliente de Firebase solo permite cambiar la contraseña del usuario
 * que ha iniciado sesión. Para que un administrador del sistema cambie la
 * contraseña de cualquier otro usuario hace falta la API de administración
 * (`identitytoolkit`), que requiere una cuenta de servicio.
 *
 * Siguiendo el patrón que ya usa `api/send-reminders.js` (REST crudo + JWT
 * firmado a mano) evitamos añadir la dependencia `firebase-admin` al bundle.
 */

const TOKEN_URL = 'https://oauth2.googleapis.com/token';
const GOOGLE_CERTS_URL = 'https://www.googleapis.com/robot/v1/metadata/x509/securetoken@system.gserviceaccount.com';
const GOOGLE_JWKS_URL = 'https://www.googleapis.com/service_accounts/v1/jwk/securetoken@system.gserviceaccount.com';
const IDENTITYTOOLKIT_URL = 'https://identitytoolkit.googleapis.com/v1';
const IDENTITYTOOLKIT_SCOPE = 'https://www.googleapis.com/auth/identitytoolkit';

// Firebase Auth exige un mínimo de 6 caracteres en las contraseñas.
const MAX_PASSWORD_LENGTH = 100;
const SIGNING_KEYS_TTL_MS = 60 * 60 * 1000;

let cachedAccessToken = '';
let cachedAccessTokenScope = '';
let cachedAccessTokenExpiresAt = 0;
let cachedSigningKeys = null;
let cachedSigningKeysAt = 0;

export function getHeader(req, name) {
    const headers = req.headers || {};
    return headers[name.toLowerCase()] || headers[name] || '';
}

export function sendJson(res, status, payload) {
    res.statusCode = status;
    res.setHeader('Content-Type', 'application/json');
    res.end(JSON.stringify(payload));
}

export function parseJsonBody(req) {
    if (!req.body) return {};
    if (typeof req.body === 'string') {
        try {
            return JSON.parse(req.body);
        } catch {
            return {};
        }
    }
    return req.body;
}

export function getBearerToken(req) {
    const header = getHeader(req, 'authorization');
    if (!header) return '';
    const match = header.match(/^Bearer\s+(.+)$/i);
    return match ? match[1].trim() : '';
}

export function getProjectId() {
    const projectId = process.env.FIREBASE_PROJECT_ID || process.env.VITE_FIREBASE_PROJECT_ID;
    if (!projectId) throw new Error('FIREBASE_PROJECT_ID is not configured');
    return projectId;
}

/**
 * Extrae el ID token de Firebase de la cabecera Authorization.
 */
export function requireIdToken(req) {
    const idToken = getBearerToken(req);
    if (!idToken) {
        const error = new Error('Missing authentication token');
        error.status = 401;
        throw error;
    }
    return idToken;
}

/**
 * Verifica el ID token de Firebase del llamante.
 *
 * Los ID tokens de Firebase son JWT RS256 firmados por las claves públicas de
 * Google, así que se validan localmente: no hace falta llamar a ningún servicio
 * externo de verificación (el endpoint `tokeninfo` de Google ya no existe).
 *
 * Devuelve el payload del token (`sub`, `email`, `aud`, `exp`, ...).
 */
export async function verifyIdToken(idToken) {
    const parts = String(idToken || '').split('.');
    if (parts.length !== 3) {
        const error = new Error('Invalid authentication token');
        error.status = 401;
        throw error;
    }

    let header;
    let payload;

    try {
        header = JSON.parse(decodeBase64url(parts[0]));
        payload = JSON.parse(decodeBase64url(parts[1]));
    } catch {
        const error = new Error('Invalid authentication token');
        error.status = 401;
        throw error;
    }

    if (header.alg !== 'RS256') {
        const error = new Error('Unsupported authentication token algorithm');
        error.status = 401;
        throw error;
    }

    const signingKeys = await getGoogleSigningKeys();
    const signingKey = signingKeys[header.kid];
    if (!signingKey) {
        const error = new Error('Unknown authentication token key');
        error.status = 401;
        throw error;
    }

    const verifier = crypto.createVerify('RSA-SHA256');
    verifier.update(`${parts[0]}.${parts[1]}`);
    const signatureValid = verifier.verify(signingKey, Buffer.from(parts[2], 'base64url'));

    if (!signatureValid) {
        const error = new Error('Invalid authentication token signature');
        error.status = 401;
        throw error;
    }

    const projectId = getProjectId();

    if (payload.aud !== projectId) {
        const error = new Error('Token issued for a different project');
        error.status = 401;
        throw error;
    }

    // Firebase usa `securetoken.google.com` como emisor y `securetoken.googleapis.com`
    // en los tokens emitidos por versiones antiguas de la plataforma.
    const validIssuers = [
        `https://securetoken.google.com/${projectId}`,
        `https://securetoken.googleapis.com/${projectId}`
    ];

    if (!validIssuers.includes(payload.iss)) {
        const error = new Error('Token issued by an unexpected issuer');
        error.status = 401;
        throw error;
    }

    if (!payload.sub) {
        const error = new Error('Token without a subject');
        error.status = 401;
        throw error;
    }

    if (payload.exp && Number(payload.exp) * 1000 <= Date.now()) {
        const error = new Error('Authentication token expired');
        error.status = 401;
        throw error;
    }

    return payload;
}

/**
 * Descarga (y cachea una hora) las claves públicas con las que Google firma
 * los ID tokens de Firebase.
 */
async function getGoogleSigningKeys() {
    if (cachedSigningKeys && Date.now() - cachedSigningKeysAt < SIGNING_KEYS_TTL_MS) {
        return cachedSigningKeys;
    }

    const jwks = await fetchJson(GOOGLE_JWKS_URL);
    const keys = {};

    for (const jwk of jwks?.keys || []) {
        if (jwk.kty !== 'RSA' || !jwk.kid) continue;
        try {
            keys[jwk.kid] = crypto.createPublicKey({ key: jwk, format: 'jwk' });
        } catch {
            // Ignoramos las claves que no se puedan convertir.
        }
    }

    if (!Object.keys(keys).length) {
        const certificates = await fetchJson(GOOGLE_CERTS_URL);

        for (const [kid, certificate] of Object.entries(certificates || {})) {
            try {
                keys[kid] = new crypto.X509Certificate(certificate).publicKey;
            } catch {
                // Ignoramos los certificados que no se puedan convertir.
            }
        }
    }

    if (!Object.keys(keys).length) {
        throw new Error('Could not fetch the Google public signing keys');
    }

    cachedSigningKeys = keys;
    cachedSigningKeysAt = Date.now();

    return keys;
}

async function fetchJson(url) {
    const response = await fetch(url);
    if (!response.ok) {
        throw new Error(`Could not fetch ${url}`);
    }
    return response.json().catch(() => ({}));
}

/**
 * Comprueba que el llamante es un administrador del sistema.
 *
 * La lista de administradores vive en `src/data/systemAdminConfig.js`, que es
 * la misma fuente de verdad que usan el frontend y las reglas de Firestore.
 */
export async function authenticateAdmin(req) {
    let payload;

    try {
        payload = await verifyIdToken(requireIdToken(req));
    } catch (error) {
        const authError = new Error('Sesión no válida. Vuelve a iniciar sesión.');
        authError.status = 401;
        throw authError;
    }

    const email = normalizeSystemAdminEmail(payload.email);
    if (!isConfiguredSystemAdmin(email)) {
        const forbidden = new Error('Solo un administrador puede gestionar las contraseñas de los usuarios.');
        forbidden.status = 403;
        throw forbidden;
    }

    return {
        uid: payload.sub || '',
        email
    };
}

/**
 * Valida la contraseña que se va a asignar a un usuario.
 *
 * Firebase Auth exige un mínimo de 6 caracteres, pero aplicamos 8 para no
 * debilitar cuentas que el usuario haya creado con una contraseña corta.
 */
export function validatePassword(password) {
    const errors = [];
    const value = String(password ?? '');

    if (!value) {
        errors.push('La contraseña es obligatoria.');
    } else if (value.length < 8) {
        errors.push('La contraseña debe tener al menos 8 caracteres.');
    } else if (value.length > MAX_PASSWORD_LENGTH) {
        errors.push(`La contraseña no puede superar los ${MAX_PASSWORD_LENGTH} caracteres.`);
    }

    return errors;
}

/**
 * Lista todas las cuentas de Firebase Auth de la aplicación.
 *
 * Se usa `projects.accounts.query` (y no `accounts.lookup`) para no depender de
 * Firestore: así también aparecen los usuarios que todavía no tienen perfil
 * guardado en la colección `users`.
 */
export async function listAuthUsers() {
    const projectId = getProjectId();
    const accessToken = await getAccessToken(IDENTITYTOOLKIT_SCOPE);
    const users = [];
    let nextPageToken = '';

    do {
        const body = { returnUserInfo: true, limit: '500' };
        if (nextPageToken) body.nextPageToken = nextPageToken;

        const response = await fetch(
            `${IDENTITYTOOLKIT_URL}/projects/${projectId}/accounts:query`,
            {
                method: 'POST',
                headers: {
                    Authorization: `Bearer ${accessToken}`,
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify(body)
            }
        );

        const payload = await response.json().catch(() => ({}));
        if (!response.ok) {
            throw new Error(payload.error?.message || 'Could not list the Firebase users');
        }

        for (const user of payload.userInfo || []) {
            users.push(normalizeAuthUser(user));
        }

        nextPageToken = payload.nextPageToken || '';
    } while (nextPageToken);

    return users;
}

/**
 * Normaliza la información de una cuenta de Firebase Auth.
 *
 * El `passwordHash` nunca sale del servidor: solo se usa para saber si la
 * cuenta tiene proveedor de contraseña.
 */
function normalizeAuthUser(user = {}) {
    // La API devuelve los proveedores en `providerUserInfo[].providerId`.
    const providers = Array.isArray(user.providerUserInfo)
        ? user.providerUserInfo
            .map((info) => info?.providerId)
            .filter(Boolean)
        : [];

    return {
        uid: user.localId || '',
        email: user.email || '',
        displayName: user.displayName || '',
        photoURL: user.photoUrl || '',
        disabled: user.disabled === true,
        emailVerified: user.emailVerified === true,
        providers,
        hasPassword: providers.includes('password') || Boolean(user.passwordHash),
        passwordUpdatedAt: normalizeTimestamp(user.passwordUpdatedAt),
        lastLoginAt: normalizeTimestamp(user.lastLoginAt),
        createdAt: normalizeTimestamp(user.createdAt)
    };
}

/**
 * Asigna una contraseña a un usuario y cierra sus sesiones abiertas.
 *
 * `validSince` invalida los tokens emitidos antes del cambio, de modo que el
 * usuario tenga que iniciar sesión de nuevo con la contraseña nueva.
 */
export async function setUserPassword(uid, password, { invalidateSessions = true } = {}) {
    const accessToken = await getAccessToken(IDENTITYTOOLKIT_SCOPE);

    const body = { localId: uid, password };
    if (invalidateSessions) {
        body.validSince = String(Math.floor(Date.now() / 1000));
    }

    const response = await fetch(`${IDENTITYTOOLKIT_URL}/accounts:update`, {
        method: 'POST',
        headers: {
            Authorization: `Bearer ${accessToken}`,
            'Content-Type': 'application/json'
        },
        body: JSON.stringify(body)
    });

    const payload = await response.json().catch(() => ({}));

    if (!response.ok) {
        const message = payload.error?.message || 'Could not update the user password';
        const error = new Error(message);
        error.status = mapIdentityToolkitErrorStatus(message);
        throw error;
    }

    return { uid, sessionsRevoked: invalidateSessions };
}

function mapIdentityToolkitErrorStatus(message = '') {
    const normalized = String(message).toUpperCase();

    if (normalized.includes('USER_NOT_FOUND') || normalized.includes('EMAIL_NOT_FOUND')) return 404;
    if (normalized.includes('INVALID_PASSWORD') || normalized.includes('WEAK_PASSWORD')) return 400;
    if (normalized.includes('FEDERATED_USER') || normalized.includes('NO_PASSWORD_PROVIDER')) return 409;

    return 400;
}

/**
 * Normaliza las marcas de tiempo de Firebase Auth (milisegundos) a ISO.
 */
function normalizeTimestamp(value) {
    const timestamp = Number(value);
    if (!Number.isFinite(timestamp) || timestamp <= 0) return '';
    return new Date(timestamp).toISOString();
}
function getServiceAccountConfig() {
    const clientEmail = process.env.FIREBASE_CLIENT_EMAIL;
    const privateKey = normalizePrivateKey(
        process.env.FIREBASE_PRIVATE_KEY,
        process.env.FIREBASE_PRIVATE_KEY_BASE64
    );
    if (!clientEmail || !privateKey) {
        throw new Error('FIREBASE_CLIENT_EMAIL and FIREBASE_PRIVATE_KEY are required');
    }
    return { clientEmail, privateKey };
}

function normalizePrivateKey(rawPrivateKey, base64PrivateKey) {
    let privateKey = (rawPrivateKey || '').trim();
    const base64Key = (base64PrivateKey || '').trim();

    if (!privateKey && base64Key) {
        privateKey = Buffer.from(base64Key, 'base64').toString('utf8').trim();
    }

    if (!privateKey) return '';

    if (
        (privateKey.startsWith('"') && privateKey.endsWith('"')) ||
        (privateKey.startsWith("'") && privateKey.endsWith("'"))
    ) {
        privateKey = privateKey.slice(1, -1);
    }

    privateKey = privateKey
        .replace(/\\n/g, '\n')
        .replace(/\r\n/g, '\n')
        .replace(/\r/g, '\n');

    if (privateKey.includes('-----BEGIN PRIVATE KEY-----') && !privateKey.includes('\n')) {
        privateKey = privateKey
            .replace('-----BEGIN PRIVATE KEY-----', '-----BEGIN PRIVATE KEY-----\n')
            .replace('-----END PRIVATE KEY-----', '\n-----END PRIVATE KEY-----')
            .replace(/([A-Za-z0-9+/=]{64})/g, '$1\n');
    }

    try {
        return crypto.createPrivateKey(privateKey).export({
            format: 'pem',
            type: 'pkcs8'
        });
    } catch {
        const compactKey = privateKey.replace(/\s/g, '');
        if (/^[A-Za-z0-9+/]+={0,2}$/.test(compactKey)) {
            try {
                return crypto.createPrivateKey(wrapPemBody(compactKey)).export({
                    format: 'pem',
                    type: 'pkcs8'
                });
            } catch {
                // Puede ser una clave PKCS8 en DER codificada en base64.
            }

            try {
                return crypto.createPrivateKey({
                    key: Buffer.from(compactKey, 'base64'),
                    format: 'der',
                    type: 'pkcs8'
                }).export({
                    format: 'pem',
                    type: 'pkcs8'
                });
            } catch {
                // Se muestra el siguiente mensaje de configuración.
            }
        }
    }

    throw new Error(
        'FIREBASE_PRIVATE_KEY is not a valid private key. Use the full service account private_key with escaped newlines (\\n), PEM/DER base64, or FIREBASE_PRIVATE_KEY_BASE64.'
    );
}

function wrapPemBody(base64Body) {
    const lines = base64Body.match(/.{1,64}/g) || [];
    return `-----BEGIN PRIVATE KEY-----\n${lines.join('\n')}\n-----END PRIVATE KEY-----\n`;
}

async function getAccessToken(scope = IDENTITYTOOLKIT_SCOPE) {
    const now = Math.floor(Date.now() / 1000);
    if (cachedAccessToken && cachedAccessTokenScope === scope && cachedAccessTokenExpiresAt - 60 > now) {
        return cachedAccessToken;
    }

    const { clientEmail, privateKey } = getServiceAccountConfig();
    const header = base64url(JSON.stringify({ alg: 'RS256', typ: 'JWT' }));
    const claims = base64url(JSON.stringify({
        iss: clientEmail,
        sub: clientEmail,
        aud: TOKEN_URL,
        scope,
        iat: now,
        exp: now + 3600
    }));
    const unsignedToken = `${header}.${claims}`;
    const signer = crypto.createSign('RSA-SHA256');
    signer.update(unsignedToken);
    signer.end();
    const signature = signer.sign(privateKey, 'base64url');
    const assertion = `${unsignedToken}.${signature}`;

    const response = await fetch(TOKEN_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: new URLSearchParams({
            grant_type: 'urn:ietf:params:oauth:grant-type:jwt-bearer',
            assertion
        })
    });

    const payload = await response.json().catch(() => ({}));
    if (!response.ok) {
        throw new Error(payload.error_description || payload.error || 'Could not get Google access token');
    }

    cachedAccessToken = payload.access_token;
    cachedAccessTokenScope = scope;
    cachedAccessTokenExpiresAt = now + Number(payload.expires_in || 3600);
    return cachedAccessToken;
}

function base64url(value) {
    return Buffer.from(value).toString('base64url');
}

function decodeBase64url(value) {
    return Buffer.from(String(value), 'base64url').toString('utf8');
}
