import { beforeEach, describe, expect, it, vi } from 'vitest';

const firestoreMocks = vi.hoisted(() => ({
    addDoc: vi.fn(async () => ({ id: 'call-1' })),
    collection: vi.fn((_db, ...segments) => segments.join('/')),
    doc: vi.fn((_db, ...segments) => segments.join('/')),
    updateDoc: vi.fn(),
    onSnapshot: vi.fn(() => vi.fn()),
    getDocs: vi.fn(),
    getDoc: vi.fn(),
    query: vi.fn((value) => value),
    where: vi.fn(),
    orderBy: vi.fn(),
    limit: vi.fn(),
    startAfter: vi.fn(),
    setDoc: vi.fn(),
    deleteDoc: vi.fn()
}));

vi.mock('firebase/firestore', () => ({
    addDoc: firestoreMocks.addDoc,
    collection: firestoreMocks.collection,
    doc: firestoreMocks.doc,
    updateDoc: firestoreMocks.updateDoc,
    onSnapshot: firestoreMocks.onSnapshot,
    getDocs: firestoreMocks.getDocs,
    getDoc: firestoreMocks.getDoc,
    query: firestoreMocks.query,
    where: firestoreMocks.where,
    orderBy: firestoreMocks.orderBy,
    limit: firestoreMocks.limit,
    startAfter: firestoreMocks.startAfter,
    setDoc: firestoreMocks.setDoc,
    deleteDoc: firestoreMocks.deleteDoc
}));

vi.mock('./firebase.js', () => ({ db: {} }));

vi.mock('./notifications.js', () => ({
    createNotification: vi.fn(async () => null)
}));

import { createPrivateCall } from './chat.js';

const CALLER = { uid: 'caller-1', name: 'Ana', email: 'ana@example.com' };
const RECEIVER = { id: 'receiver-1', name: 'Luis', email: 'luis@example.com' };

function getCreatedCall() {
    return firestoreMocks.addDoc.mock.calls[0][1];
}

describe('createPrivateCall', () => {
    beforeEach(() => {
        vi.clearAllMocks();
        firestoreMocks.addDoc.mockResolvedValue({ id: 'call-1' });
    });

    it('publica la oferta SDP en el documento inicial de la llamada', async () => {
        const callId = await createPrivateCall('chat-1', 'team-1', CALLER, RECEIVER, {
            offer: { type: 'offer', sdp: 'v=0...' },
            videoEnabled: true,
            audioEnabled: true
        });

        expect(callId).toBe('call-1');

        const created = getCreatedCall();
        expect(created.offer).toEqual({ type: 'offer', sdp: 'v=0...' });
        expect(created.status).toBe('ringing');
        expect(created.participants).toEqual(['caller-1', 'receiver-1']);
        expect(created.media['caller-1']).toEqual({ videoEnabled: true, audioEnabled: true });
    });

    it('nunca publica una llamada sin oferta para evitar aceptar una llamada inexistente', async () => {
        await createPrivateCall('chat-1', 'team-1', CALLER, RECEIVER, {
            offer: { type: 'offer', sdp: '' },
            videoEnabled: false,
            audioEnabled: true
        });

        const created = getCreatedCall();
        expect(created.offer).toBeUndefined();
        expect(created.media['caller-1']).toEqual({ videoEnabled: false, audioEnabled: true });
    });

    it('sigue funcionando cuando no se pasan opciones', async () => {
        const callId = await createPrivateCall('chat-1', 'team-1', CALLER, RECEIVER);

        expect(callId).toBe('call-1');
        expect(getCreatedCall().status).toBe('ringing');
    });

    it('no crea la llamada si falta el chat o alguno de los participantes', async () => {
        expect(await createPrivateCall('', 'team-1', CALLER, RECEIVER)).toBeNull();
        expect(await createPrivateCall('chat-1', 'team-1', null, RECEIVER)).toBeNull();
        expect(await createPrivateCall('chat-1', 'team-1', CALLER, null)).toBeNull();
        expect(firestoreMocks.addDoc).not.toHaveBeenCalled();
    });
});
