import crypto from 'node:crypto';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import {
    authenticateAdmin,
    listAuthUsers,
    setUserPassword,
    validatePassword,
    verifyIdToken
} from './firebaseAdminApi.js';

const PROJECT_ID = 'metricwork-test';
const KEY_ID = 'test-key-id';
const ADMIN_EMAIL = 'fabiansolares719@gmail.com';

const { publicKey, privateKey } = crypto.generateKeyPairSync('rsa', { modulusLength: 2048 });
const publicJwk = publicKey.export({ format: 'jwk' });
const servicePrivateKey = privateKey.export({ format: 'pem', type: 'pkcs8' });

const base64url = (value) => Buffer.from(value).toString('base64url');

function signToken(payload, kid = KEY_ID, key = privateKey) {
    const header = base64url(JSON.stringify({ alg: 'RS256', kid, typ: 'JWT' }));
    const body = base64url(JSON.stringify(payload));
    const signer = crypto.createSign('RSA-SHA256');
    signer.update(`${header}.${body}`);
    signer.end();

    return `${header}.${body}.${signer.sign(key, 'base64url')}`;
}

function buildToken(email = ADMIN_EMAIL, overrides = {}, key = privateKey) {
    const now = Math.floor(Date.now() / 1000);

    return signToken({
        iss: `https://securetoken.google.com/${PROJECT_ID}`,
        aud: PROJECT_ID,
        sub: 'admin-uid',
        email,
        iat: now,
        exp: now + 3600,
        ...overrides,
    }, KEY_ID, key);
}

function jsonResponse(status, payload) {
    return {
        ok: status >= 200 && status < 300,
        status,
        json: async () => payload,
    };
}

/**
 * Responde con las claves públicas de Google y delega el resto de llamadas.
 */
function mockFetch(responses = {}) {
    return vi.fn(async (url, options = {}) => {
        if (String(url).includes('/service_accounts/v1/jwk/')) {
            return jsonResponse(200, {
                keys: [{ ...publicJwk, kid: KEY_ID, alg: 'RS256', use: 'sig' }],
            });
        }

        if (String(url).includes('oauth2.googleapis.com/token')) {
            return jsonResponse(200, { access_token: 'service-access-token', expires_in: 3600 });
        }

        for (const [pattern, response] of Object.entries(responses)) {
            if (String(url).includes(pattern)) {
                return typeof response === 'function' ? response(url, options) : response;
            }
        }

        return jsonResponse(404, { error: { message: 'Unexpected request' } });
    });
}

/**
 * Variables de entorno que necesita el helper de servidor.
 */
function stubServerEnv() {
    vi.stubEnv('VITE_FIREBASE_PROJECT_ID', PROJECT_ID);
    vi.stubEnv('FIREBASE_PROJECT_ID', '');
    vi.stubEnv('FIREBASE_CLIENT_EMAIL', 'service-account@metricwork-test.iam.gserviceaccount.com');
    vi.stubEnv('FIREBASE_PRIVATE_KEY', servicePrivateKey);
}

describe('validatePassword', () => {
    it('exige un mínimo de 8 caracteres', () => {
        expect(validatePassword('')).toEqual(['La contraseña es obligatoria.']);
        expect(validatePassword('1234567')).toEqual([
            'La contraseña debe tener al menos 8 caracteres.',
        ]);
        expect(validatePassword('12345678')).toEqual([]);
    });

    it('rechaza contraseñas de más de 100 caracteres', () => {
        expect(validatePassword('a'.repeat(101))).toHaveLength(1);
        expect(validatePassword('a'.repeat(100))).toEqual([]);
    });
});

describe('verifyIdToken', () => {
    beforeEach(() => {
        stubServerEnv();
        global.fetch = mockFetch();
    });

    afterEach(() => {
        vi.unstubAllEnvs();
        vi.restoreAllMocks();
    });

    it('rechaza tokens que no son JWT', async () => {
        await expect(verifyIdToken('no-es-un-jwt')).rejects.toMatchObject({ status: 401 });
        await expect(verifyIdToken('')).rejects.toMatchObject({ status: 401 });
    });

    it('rechaza algoritmos que no sean RS256', async () => {
        const token = `${base64url(JSON.stringify({ alg: 'none', kid: KEY_ID }))}.${base64url(JSON.stringify({}))}.firma`;

        await expect(verifyIdToken(token)).rejects.toMatchObject({ status: 401 });
    });

    it('rechaza firmas que no verifican', async () => {
        const otherKey = crypto.generateKeyPairSync('rsa', { modulusLength: 2048 }).privateKey;
        const token = buildToken(ADMIN_EMAIL, {}, otherKey);

        await expect(verifyIdToken(token)).rejects.toMatchObject({ status: 401 });
    });

    it('rechaza tokens de otro proyecto', async () => {
        const token = buildToken(ADMIN_EMAIL, { aud: 'otro-proyecto' });

        await expect(verifyIdToken(token)).rejects.toMatchObject({ status: 401 });
    });

    it('rechaza tokens emitidos por otra issuer', async () => {
        const token = buildToken(ADMIN_EMAIL, { iss: 'https://otro-issuer.example.com' });

        await expect(verifyIdToken(token)).rejects.toMatchObject({ status: 401 });
    });

    it('rechaza tokens caducados', async () => {
        const token = buildToken(ADMIN_EMAIL, { exp: Math.floor(Date.now() / 1000) - 60 });

        await expect(verifyIdToken(token)).rejects.toMatchObject({ status: 401 });
    });

    it('acepta un token válido y devuelve sus claims', async () => {
        const payload = await verifyIdToken(buildToken());

        expect(payload.sub).toBe('admin-uid');
        expect(payload.email).toBe(ADMIN_EMAIL);
        expect(payload.aud).toBe(PROJECT_ID);
    });
});

describe('authenticateAdmin', () => {
    beforeEach(() => {
        stubServerEnv();
        global.fetch = mockFetch();
    });

    afterEach(() => {
        vi.unstubAllEnvs();
        vi.restoreAllMocks();
    });

    function requestWith(token) {
        return { headers: token ? { authorization: `Bearer ${token}` } : {} };
    }

    it('devuelve 401 si falta el token', async () => {
        await expect(authenticateAdmin(requestWith(''))).rejects.toMatchObject({ status: 401 });
        await expect(authenticateAdmin({ headers: {} })).rejects.toMatchObject({ status: 401 });
    });

    it('devuelve 403 si el usuario no es administrador', async () => {
        const token = buildToken('usuario.normal@example.com');

        await expect(authenticateAdmin(requestWith(token))).rejects.toMatchObject({ status: 403 });
    });

    it('devuelve el uid y el email del administrador', async () => {
        const caller = await authenticateAdmin(requestWith(buildToken()));

        expect(caller).toEqual({ uid: 'admin-uid', email: ADMIN_EMAIL });
    });
});

describe('listAuthUsers', () => {
    beforeEach(() => {
        stubServerEnv();
    });

    afterEach(() => {
        vi.unstubAllEnvs();
        vi.restoreAllMocks();
    });

    it('normaliza los usuarios y nunca filtra el hash de la contraseña', async () => {
        global.fetch = mockFetch({
            'accounts:query': jsonResponse(200, {
                userInfo: [
                    {
                        localId: 'uid-1',
                        email: 'user@example.com',
                        displayName: 'Usuario Uno',
                        photoUrl: 'https://example.com/avatar.png',
                        passwordHash: 'UkVEQUNURUQ=',
                        passwordUpdatedAt: 1700000000000,
                        lastLoginAt: 1700000001000,
                        providerUserInfo: [{ providerId: 'password' }],
                        disabled: false,
                    },
                    {
                        localId: 'uid-2',
                        email: 'google@example.com',
                        providerUserInfo: [{ providerId: 'google.com' }],
                        disabled: true,
                    },
                ],
            }),
        });

        const users = await listAuthUsers();

        expect(users).toHaveLength(2);
        expect(users[0]).toMatchObject({
            uid: 'uid-1',
            email: 'user@example.com',
            displayName: 'Usuario Uno',
            photoURL: 'https://example.com/avatar.png',
            providers: ['password'],
            hasPassword: true,
            disabled: false,
        });
        expect(users[0].passwordUpdatedAt).toBe('2023-11-14T22:13:20.000Z');
        expect(users[1]).toMatchObject({
            uid: 'uid-2',
            providers: ['google.com'],
            hasPassword: false,
            disabled: true,
        });
        expect(JSON.stringify(users)).not.toContain('UkVEQUNURUQ');
    });
});

describe('setUserPassword', () => {
    beforeEach(() => {
        stubServerEnv();
    });

    afterEach(() => {
        vi.unstubAllEnvs();
        vi.restoreAllMocks();
    });

    it('envía la contraseña e invalida las sesiones del usuario', async () => {
        global.fetch = mockFetch({
            'accounts:update': jsonResponse(200, { localId: 'uid-1' }),
        });

        const result = await setUserPassword('uid-1', 'NuevaClave123');

        expect(result).toMatchObject({ uid: 'uid-1', sessionsRevoked: true });

        const [, options] = global.fetch.mock.calls.find(([url]) => String(url).includes('accounts:update'));
        const body = JSON.parse(options.body);

        expect(body.localId).toBe('uid-1');
        expect(body.password).toBe('NuevaClave123');
        expect(Number(body.validSince)).toBeGreaterThan(0);
    });

    it('no invalida las sesiones cuando se pide explícitamente', async () => {
        global.fetch = mockFetch({
            'accounts:update': jsonResponse(200, { localId: 'uid-1' }),
        });

        await setUserPassword('uid-1', 'NuevaClave123', { invalidateSessions: false });

        const [, options] = global.fetch.mock.calls.find(([url]) => String(url).includes('accounts:update'));
        expect(JSON.parse(options.body).validSince).toBeUndefined();
    });

    it('mapea USER_NOT_FOUND a un error 404', async () => {
        global.fetch = mockFetch({
            'accounts:update': jsonResponse(400, {
                error: { message: 'USER_NOT_FOUND' },
            }),
        });

        await expect(setUserPassword('uid-desconocido', 'NuevaClave123')).rejects.toMatchObject({
            status: 404,
        });
    });
});
