import { beforeEach, describe, expect, it, vi } from 'vitest';

const firestoreMocks = vi.hoisted(() => ({ addDoc: vi.fn() }));

vi.mock('firebase/firestore', () => ({
  addDoc: firestoreMocks.addDoc,
  collection: vi.fn((_db, ...segments) => segments.join('/')),
  doc: vi.fn(),
  getDoc: vi.fn(),
  getDocs: vi.fn(),
  query: vi.fn(),
  where: vi.fn()
}));
vi.mock('./firebase.js', () => ({ db: {} }));
vi.mock('./works.js', () => ({ getWorksByTeamId: vi.fn() }));
vi.mock('../helpers/banks.js', () => ({ getBankName: vi.fn(() => '') }));

import { registerTeamPayment } from './teamPayments.js';

describe('team payment validation', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    firestoreMocks.addDoc.mockResolvedValue({ id: 'payment-1' });
  });

  it('normaliza y registra pagos positivos con trazabilidad', async () => {
    const payment = await registerTeamPayment(
      'team-1',
      'member-1',
      20.129,
      'total',
      { uid: 'admin-1', name: 'Administración' },
      'transfer'
    );

    expect(firestoreMocks.addDoc).toHaveBeenCalledWith(
      'team_payments',
      expect.objectContaining({
        teamId: 'team-1',
        userId: 'member-1',
        amount: 20.13,
        registeredBy: 'admin-1',
        method: 'transfer'
      })
    );
    expect(payment.id).toBe('payment-1');
  });

  it('rechaza importes nulos, negativos, desbordados o no numéricos', async () => {
    const actor = { uid: 'admin-1' };
    await expect(registerTeamPayment('team-1', 'member-1', 0, 'partial', actor)).rejects.toThrow(/mayor/i);
    await expect(registerTeamPayment('team-1', 'member-1', -2, 'partial', actor)).rejects.toThrow(/mayor/i);
    await expect(registerTeamPayment('team-1', 'member-1', 'no', 'partial', actor)).rejects.toThrow(/mayor/i);
    await expect(registerTeamPayment('team-1', 'member-1', 1000000001, 'partial', actor)).rejects.toThrow(/límite/i);
    expect(firestoreMocks.addDoc).not.toHaveBeenCalled();
  });

  it('rechaza pagos sin equipo, miembro o usuario autenticado', async () => {
    await expect(registerTeamPayment('', 'member-1', 10, 'partial', { uid: 'admin-1' })).rejects.toThrow(/miembro/i);
    await expect(registerTeamPayment('team-1', '', 10, 'partial', { uid: 'admin-1' })).rejects.toThrow(/miembro/i);
    await expect(registerTeamPayment('team-1', 'member-1', 10, 'partial')).rejects.toThrow(/autenticado/i);
  });
});
