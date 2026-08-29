import { beforeEach, describe, expect, it, vi } from 'vitest';

const firestoreMocks = vi.hoisted(() => ({
  addDoc: vi.fn(),
  getDoc: vi.fn(),
  getDocs: vi.fn(),
}));

vi.mock('firebase/firestore', () => ({
  addDoc: firestoreMocks.addDoc,
  collection: vi.fn((_db, ...segments) => segments.join('/')),
  doc: vi.fn(),
  getDoc: firestoreMocks.getDoc,
  getDocs: firestoreMocks.getDocs,
  query: vi.fn(),
  where: vi.fn()
}));
vi.mock('./firebase.js', () => ({ db: {} }));
vi.mock('./works.js', () => ({ getWorksByTeamId: vi.fn() }));
vi.mock('./teams.js', () => ({
  getTeamGhosts: vi.fn((team) => (team && Array.isArray(team.ghosts)) ? team.ghosts : []),
}));
vi.mock('../helpers/banks.js', () => ({ getBankName: vi.fn(() => '') }));

import { getTeamPaymentsData, registerTeamPayment } from './teamPayments.js';
import { getWorksByTeamId } from './works.js';

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

describe('team payments with ghost members', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    firestoreMocks.getDocs.mockImplementation(() => ({ forEach: () => {} }));
  });

  it('lista fantasmas como entradas separadas con saldo y ganancias en cero', async () => {
    const ghosts = [
      {
        id: 'g1',
        name: 'Fantasma 1',
        masters: ['member-1'],
        worksdays: [
          { id: 'wd-1', date: '2026-01-10', type: 'full-day', overtimeHours: 0, hours: 0, paid: false }
        ],
        overtime: [
          { id: 'ot-1', date: '2026-01-12', type: 'overtime', overtimeHours: 2, hours: 2, paid: false }
        ]
      }
    ];

    getWorksByTeamId.mockResolvedValue({
      'member-1': [],
      'ghost-g1': [
        {
          id: 'wd-1',
          userId: 'ghost-g1',
          type: 'full-day',
          date: '2026-01-10',
          overtimeHours: 0,
          isGhost: true,
          ghostId: 'g1'
        },
        {
          id: 'ot-1',
          userId: 'ghost-g1',
          type: 'overtime',
          date: '2026-01-12',
          overtimeHours: 2,
          isGhost: true,
          ghostId: 'g1'
        }
      ]
    });

    firestoreMocks.getDoc.mockResolvedValue({
      exists: () => true,
      data: () => ({
        membersData: [{ id: 'member-1', name: 'Miembro Uno' }],
        memberSettings: { 'member-1': { dailyRate: 100, extraHourRate: 20 } },
        ghosts,
      })
    });

    const balances = await getTeamPaymentsData('team-1');

    const ghostEntry = balances.find((b) => b.id === 'ghost-g1');
    expect(ghostEntry).toBeTruthy();
    expect(ghostEntry.isGhost).toBe(true);
    expect(ghostEntry.name).toBe('Fantasma 1');
    expect(ghostEntry.masterNames).toEqual(['Miembro Uno']);
    expect(ghostEntry.totalEarned).toBe(0);
    expect(ghostEntry.totalPaid).toBe(0);
    expect(ghostEntry.balance).toBe(0);
    expect(ghostEntry.pendingWorkDays).toBeGreaterThan(0);
    expect(ghostEntry.pendingOvertimeHours).toBe(2);
  });

  it('excluye jornadas de fantasmas del cálculo de un master', async () => {
    getWorksByTeamId.mockResolvedValue({
      'member-1': [
        { id: 'w-1', userId: 'member-1', type: 'full-day', date: '2026-01-05', overtimeHours: 0 }
      ],
      // Aunque la jornada viva bajo la misma clave del miembro, debe
      // descartarse para evitar que se sume al saldo del master.
      'member-1': [
        { id: 'w-1', userId: 'member-1', type: 'full-day', date: '2026-01-05', overtimeHours: 0 },
        {
          id: 'ghost-w-1',
          userId: 'member-1',
          type: 'full-day',
          date: '2026-01-06',
          overtimeHours: 0,
          isGhost: true,
          ghostId: 'g-1'
        }
      ]
    });

    firestoreMocks.getDoc.mockResolvedValue({
      exists: () => true,
      data: () => ({
        membersData: [{ id: 'member-1', name: 'Miembro Uno' }],
        memberSettings: { 'member-1': { dailyRate: 100, extraHourRate: 20 } },
        ghosts: []
      })
    });

    const balances = await getTeamPaymentsData('team-1');
    const member = balances.find((b) => b.id === 'member-1');

    expect(member).toBeTruthy();
    // Si la jornada del fantasma se filtró correctamente, las unidades
    // pendientes equivalen sólo a la jornada real.
    expect(member.works.find((w) => w.id === 'ghost-w-1')).toBeUndefined();
    expect(member.totalEarned).toBe(100);
  });
});
