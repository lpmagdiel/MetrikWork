import { describe, expect, it, vi, beforeEach } from 'vitest';
import { render } from '@testing-library/svelte';
import TeamStats from './team-stats.svelte';
import {
  expenseInventoryMovementsStore,
  expensePaymentsStore,
  manualTeamExpensesStore,
  selectedTeamId,
  teamsStore,
  userStore,
} from '../data/stores.js';

vi.mock('../data/firebase.js', () => ({
  db: {},
  auth: {},
  googleProvider: {},
}));

vi.mock('../data/teamStats.js', () => ({
  getTeamAdvancedStatsData: async () => ({
    works: [],
    payments: [],
    inventory: [],
    locations: [],
    absenceRequests: [],
  }),
  updateTeamBudget: async () => {},
}));

// La suscripción real necesita Firestore: se sustituye para poder alimentar
// los stores del libro de gastos y comprobar el render del panel.
vi.mock('../data/teamExpenses.js', async (importOriginal) => {
  const actual = await importOriginal();
  return {
    ...actual,
    subscribeToTeamExpenses: () => () => {},
  };
});

function buildTeam() {
  teamsStore.set([
    {
      id: 'team-1',
      name: 'Equipo Uno',
      admin: 'admin-1',
      members: ['admin-1'],
      membersData: [{ id: 'admin-1', name: 'Admin', email: 'a@b.c' }],
      projectBudget: 1000,
      projectBudgetCurrency: 'EUR',
    },
  ]);
  selectedTeamId.set('team-1');
}

function buildLedgerStores() {
  manualTeamExpensesStore.set([
    {
      id: 'exp-1',
      source: 'manual',
      title: 'Gasolina',
      description: 'Repostaje',
      category: 'transport',
      categoryLabel: 'Transporte y combustible',
      amount: 42.5,
      currency: 'EUR',
      status: 'paid',
      method: 'card',
      date: '2026-10-12',
      vendorName: 'Repsol',
      invoiceNumber: 'F-22',
      locationId: '',
      locationName: '',
      deductible: true,
      notes: '',
      receipts: [],
      createdBy: 'admin-1',
      createdByName: 'Admin',
      createdAt: '2026-10-12T10:00:00.000Z',
      updatedAt: '2026-10-12T10:00:00.000Z',
    },
  ]);
  expensePaymentsStore.set([
    {
      id: 'pay-1',
      teamId: 'team-1',
      userId: 'admin-1',
      amount: 300,
      type: 'total',
      method: 'transfer',
      date: '2026-10-15',
      createdAt: '2026-10-15T10:00:00.000Z',
      registeredBy: 'admin-1',
      registeredByName: 'Admin',
    },
  ]);
  expenseInventoryMovementsStore.set([]);
}

describe('libro de gastos en estadísticas avanzadas', () => {
  beforeEach(() => {
    userStore.set({ uid: 'admin-1', name: 'Admin', email: 'a@b.c' });
    buildTeam();
    buildLedgerStores();
  });

  it('unifica gastos manuales y pagos en una tabla', async () => {
    const { container } = render(TeamStats);
    await new Promise((resolve) => setTimeout(resolve, 200));

    const html = container.innerHTML;
    expect(html).toContain('Libro de gastos');
    expect(html).toContain('Gastos unificados del equipo');
    expect(html).toContain('Gasolina');
    expect(html).toContain('Repsol');
    expect(html).toContain('Transporte y combustible');
    expect(html).toContain('Pago a Admin');
    expect(html).toContain('Evolución mensual');
    expect(html).toContain('Por categoría');
  });

  it('muestra el estado vacio cuando no hay apuntes', async () => {
    manualTeamExpensesStore.set([]);
    expensePaymentsStore.set([]);

    const { container } = render(TeamStats);
    await new Promise((resolve) => setTimeout(resolve, 200));

    const html = container.innerHTML;
    expect(html).toContain('Libro de gastos');
    expect(html).toContain('Sin gastos registrados en este periodo');
  });
});
