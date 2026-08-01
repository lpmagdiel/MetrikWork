import { writable } from 'svelte/store';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const firestoreMocks = vi.hoisted(() => ({
    collection: vi.fn((_db, ...segments) => segments.join('/')),
    doc: vi.fn((_db, ...segments) => segments.join('/')),
    getDoc: vi.fn(),
    onSnapshot: vi.fn(),
    teamChargesStore: null
}));

vi.mock('firebase/firestore', () => ({
    collection: firestoreMocks.collection,
    doc: firestoreMocks.doc,
    getDoc: firestoreMocks.getDoc,
    onSnapshot: firestoreMocks.onSnapshot
}));

vi.mock('./firebase.js', () => ({ db: {} }));

vi.mock('./teamCharges.js', () => ({
    get teamChargesStore() { return firestoreMocks.teamChargesStore; }
}));

import {
    createInvoiceNumber,
    deriveInvoicesFromChargesStore,
    filterInvoicesByClient,
    getCurrentInvoiceTotal,
    getInvoicesFromCharges,
    resetInvoiceStore,
    subscribeToTeamInvoices,
    teamInvoicesStore
} from './invoices.js';
import { get } from 'svelte/store';

describe('invoices helpers', () => {
    it('genera número de factura con prefijo MW y fecha', () => {
        const number = createInvoiceNumber(new Date('2026-07-03T12:00:00Z'));
        expect(number).toMatch(/^MW-\d{8}-[A-Z0-9]{5}$/);
    });

    it('genera números distintos en sucesivas llamadas', () => {
        const a = createInvoiceNumber();
        const b = createInvoiceNumber();
        expect(a).not.toBe(b);
    });

    it('extrae solo los cobros con invoiceNumber como facturas', () => {
        const charges = [
            { id: 'c1', invoiceNumber: 'MW-001' },
            { id: 'c2' },
            { id: 'c3', invoiceNumber: 'MW-002' }
        ];
        const invoices = getInvoicesFromCharges(charges);
        expect(invoices).toHaveLength(2);
        expect(invoices.map((i) => i.id)).toEqual(['c1', 'c3']);
    });

    it('filtra facturas por cliente (id, nombre o taxId)', () => {
        const invoices = [
            { id: 'i1', client: { taxId: 'B111', name: 'A' } },
            { id: 'i2', client: { name: 'B' } },
            { id: 'i3', clientId: 'client-x' },
            { id: 'i4', client: { name: 'C' } }
        ];

        expect(filterInvoicesByClient(invoices, 'B111')).toHaveLength(1);
        expect(filterInvoicesByClient(invoices, 'B')).toHaveLength(1);
        expect(filterInvoicesByClient(invoices, 'client-x')).toHaveLength(1);
        expect(filterInvoicesByClient(invoices, 'no-existe')).toHaveLength(0);
        expect(filterInvoicesByClient(invoices, '')).toEqual(invoices);
    });

    it('suma correctamente el total facturado', () => {
        const invoices = [
            { amount: 100 },
            { amount: 50.5 },
            { amount: 'no-number' },
            { amount: null }
        ];
        expect(getCurrentInvoiceTotal(invoices)).toBe(150.5);
    });

    it('tolera entradas inválidas en la lista de facturas', () => {
        expect(getInvoicesFromCharges(null)).toEqual([]);
        expect(getCurrentInvoiceTotal(undefined)).toBe(0);
        expect(filterInvoicesByClient(undefined, 'x')).toEqual([]);
    });

    it('deriva facturas vacías desde el store cuando no hay cobros con invoiceNumber', () => {
        expect(deriveInvoicesFromChargesStore()).toEqual([]);
    });
});

describe('invoices subscriptions', () => {
    beforeEach(async () => {
        resetInvoiceStore();
        vi.clearAllMocks();
        // Inicializa el writable compartido entre tests.
        const mod = await import('svelte/store');
        firestoreMocks.teamChargesStore = mod.writable([]);
        firestoreMocks.onSnapshot.mockImplementation(() => vi.fn());
        firestoreMocks.getDoc.mockResolvedValue({ exists: () => false });
    });

    it('no inicia listener sin teamId', () => {
        const stop = subscribeToTeamInvoices(null);
        expect(firestoreMocks.onSnapshot).not.toHaveBeenCalled();
        expect(get(teamInvoicesStore)).toEqual([]);
        stop();
    });

    it('alimenta el store solo con cobros que tienen invoiceNumber', () => {
        firestoreMocks.onSnapshot.mockImplementation((_ref, onNext) => {
            onNext({
                docs: [
                    { id: 'c1', data: () => ({ invoiceNumber: 'MW-001', amount: 100 }) },
                    { id: 'c2', data: () => ({ amount: 50 }) },
                    { id: 'c3', data: () => ({ invoiceNumber: 'MW-002', amount: 200 }) }
                ]
            });
            return vi.fn();
        });

        subscribeToTeamInvoices('team-1');
        const invoices = get(teamInvoicesStore);
        expect(invoices).toHaveLength(2);
        expect(invoices.map((i) => i.id)).toEqual(['c1', 'c3']);
    });

    it('limpia el store ante error de listener', () => {
        firestoreMocks.onSnapshot.mockImplementation((_ref, _onNext, onError) => {
            onError(new Error('permission-denied'));
            return vi.fn();
        });

        subscribeToTeamInvoices('team-1');
        expect(get(teamInvoicesStore)).toEqual([]);
    });

    it('cancela la suscripción anterior al cambiar de equipo', () => {
        const unsub1 = vi.fn();
        const unsub2 = vi.fn();
        firestoreMocks.onSnapshot
            .mockReturnValueOnce(unsub1)
            .mockReturnValueOnce(unsub2);

        subscribeToTeamInvoices('team-1');
        const stop = subscribeToTeamInvoices('team-2');

        expect(unsub1).toHaveBeenCalledOnce();
        expect(get(teamInvoicesStore)).toEqual([]);
        stop();
    });
});