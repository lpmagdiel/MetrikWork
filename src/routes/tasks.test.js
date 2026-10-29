import { describe, expect, it, vi, beforeEach } from 'vitest';
import { render } from '@testing-library/svelte';
import Tasks from './tasks.svelte';
import { selectedTeamId, teamTasksStore, teamsStore, userStore } from '../data/stores.js';

vi.mock('../data/firebase.js', () => ({
  db: {},
  auth: {},
  googleProvider: {},
}));

// La suscripción real necesita Firestore: en el test se sustituye para poder
// inyectar tareas en el store y comprobar el render de los adjuntos.
vi.mock('../data/tasks.js', async (importOriginal) => {
  const actual = await importOriginal();
  return {
    ...actual,
    subscribeToTeamTasks: () => () => {},
  };
});

describe('adjuntos en las tareas', () => {
  beforeEach(() => {
    userStore.set({ uid: 'admin-1', name: 'Admin', email: 'a@b.c' });
    teamsStore.set([
      {
        id: 'team-1',
        name: 'Equipo Uno',
        admin: 'admin-1',
        members: ['admin-1'],
        membersData: [{ id: 'admin-1', name: 'Admin', email: 'a@b.c' }],
      },
    ]);
    selectedTeamId.set('team-1');
    teamTasksStore.set([]);
  });

  it('muestra las miniaturas de las imágenes adjuntas en la tarjeta', async () => {
    teamTasksStore.set([
      {
        id: 'task-1',
        title: 'Colocar bordillo',
        description: 'Zona norte',
        status: 'pending',
        assignedTo: ['admin-1'],
        dueDate: null,
        attachments: [
          {
            url: 'https://res.cloudinary.com/demo/image/upload/terreno.jpg',
            name: 'terreno.jpg',
          },
          {
            url: 'https://res.cloudinary.com/demo/image/upload/resultado.jpg',
            name: 'resultado.jpg',
          },
        ],
        createdAt: '2026-10-12T10:00:00.000Z',
        createdBy: 'admin-1',
      },
    ]);

    const { container } = render(Tasks);
    await new Promise((resolve) => setTimeout(resolve, 100));

    const html = container.innerHTML;
    expect(html).toContain('Colocar bordillo');
    expect(html).toContain('Ver imagen 1 de 2');
    expect(html).toContain('Ver imagen 2 de 2');
    expect(html).toContain('alt="terreno.jpg"');
    expect(html).toContain('alt="resultado.jpg"');
    // La miniatura se sirve optimizada desde Cloudinary.
    expect(html).toContain('w_120,h_120,c_fill');
  });

  it('no muestra la tira de adjuntos cuando la tarea no tiene imágenes', async () => {
    teamTasksStore.set([
      {
        id: 'task-2',
        title: 'Tarea sin fotos',
        status: 'pending',
        assignedTo: [],
        attachments: [],
        createdAt: '2026-10-12T10:00:00.000Z',
        createdBy: 'admin-1',
      },
    ]);

    const { container } = render(Tasks);
    await new Promise((resolve) => setTimeout(resolve, 100));

    expect(container.innerHTML).toContain('Tarea sin fotos');
    expect(container.innerHTML).not.toContain('attachment-strip');
  });
});
