import { describe, expect, it, vi, beforeEach } from 'vitest';
import { render } from '@testing-library/svelte';
import TeamSettings from './team-settings.svelte';
import { selectedTeamId, teamsStore, userStore } from '../data/stores.js';

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

describe('ajustes de fantasmas', () => {
  beforeEach(() => {
    userStore.set({ uid: 'admin-1', name: 'Admin', email: 'a@b.c' });
    teamsStore.set([
      {
        id: 'team-1',
        name: 'Equipo Uno',
        admin: 'admin-1',
        members: ['admin-1', 'member-2'],
        membersData: [
          { id: 'admin-1', name: 'Admin', email: 'a@b.c' },
          { id: 'member-2', name: 'Beto', email: 'beto@b.c' },
        ],
        ghosts: [
          {
            id: 'ghost-1',
            name: 'Juan',
            masters: ['admin-1'],
            worksdays: [],
            overtime: [],
          },
        ],
      },
    ]);
    selectedTeamId.set('team-1');
  });

  it('usa el icono Ghost de Lucide en vez del emoji', async () => {
    const { container } = render(TeamSettings);
    await new Promise((resolve) => setTimeout(resolve, 200));

    const html = container.innerHTML;
    expect(html).not.toContain('👻');
    expect(html).toContain('lucide-ghost');
    expect(html).toContain('Fantasmas');
  });

  it('muestra el cuadro de masters con contador y chips', async () => {
    const { container } = render(TeamSettings);
    await new Promise((resolve) => setTimeout(resolve, 200));

    const html = container.innerHTML;
    expect(html).toContain('ghost-masters');
    expect(html).toContain('ghost-masters-count');
    expect(html).toContain('ghost-master-chip');
    expect(html).toContain('Admin');
    expect(html).toContain('Beto');
    // La etiqueta antigua "Masters (al menos uno)" ya no existe.
    expect(html).not.toContain('Masters (al menos uno)');
  });
});
