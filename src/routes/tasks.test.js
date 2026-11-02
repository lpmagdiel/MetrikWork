import { describe, expect, it, vi, beforeEach } from 'vitest';
import { fireEvent, render } from '@testing-library/svelte';
import Tasks from './tasks.svelte';
import { selectedTeamId, teamTasksStore, teamsStore, userStore } from '../data/stores.js';
import { confirmAlert } from '../data/alerts.js';
import { deleteTeamTask } from '../data/tasks.js';

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
    deleteTeamTask: vi.fn().mockResolvedValue(true),
  };
});

vi.mock('../data/alerts.js', () => ({
  confirmAlert: vi.fn().mockResolvedValue(false),
  showErrorAlert: vi.fn(),
  showInfoAlert: vi.fn(),
}));

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

describe('interacción con las tarjetas de tarea', () => {
  beforeEach(() => {
    vi.clearAllMocks();
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
    teamTasksStore.set([
      {
        id: 'task-1',
        title: 'Colocar bordillo',
        description: 'Zona norte',
        status: 'pending',
        assignedTo: ['admin-1'],
        dueDate: '2026-10-20T00:00:00.000Z',
        attachments: [],
        createdAt: '2026-10-12T10:00:00.000Z',
        createdBy: 'admin-1',
      },
    ]);
  });

  it('abre el detalle de la tarea (sin editar) al tocarla', async () => {
    const { container } = render(Tasks);
    await new Promise((resolve) => setTimeout(resolve, 100));

    await fireEvent.click(container.querySelector('.task-card'));
    await new Promise((resolve) => setTimeout(resolve, 100));

    const html = container.innerHTML;
    expect(html).toContain('Fecha límite');
    expect(html).toContain('Descripción');
    expect(html).toContain('Zona norte');
    // La vista de detalle no permite editar la tarea.
    expect(html).not.toContain('Actualizar Tarea');
  });

  it('muestra el botón flotante de eliminar al mantener pulsada la tarjeta', async () => {
    const { container } = render(Tasks);
    await new Promise((resolve) => setTimeout(resolve, 100));

    expect(container.querySelector('.delete-fab')).toBeNull();

    await fireEvent.pointerDown(container.querySelector('.task-card'));
    await new Promise((resolve) => setTimeout(resolve, 700));

    expect(container.querySelector('.delete-fab')).toBeTruthy();
  });

  it('pide confirmación antes de eliminar la tarea', async () => {
    const { container } = render(Tasks);
    await new Promise((resolve) => setTimeout(resolve, 100));

    await fireEvent.pointerDown(container.querySelector('.task-card'));
    await new Promise((resolve) => setTimeout(resolve, 700));

    await fireEvent.click(container.querySelector('.delete-fab'));
    await new Promise((resolve) => setTimeout(resolve, 100));

    expect(confirmAlert).toHaveBeenCalledTimes(1);
    expect(deleteTeamTask).not.toHaveBeenCalled();
  });

  it('elimina la tarea cuando se confirma', async () => {
    confirmAlert.mockResolvedValueOnce(true);
    const { container } = render(Tasks);
    await new Promise((resolve) => setTimeout(resolve, 100));

    await fireEvent.pointerDown(container.querySelector('.task-card'));
    await new Promise((resolve) => setTimeout(resolve, 700));

    await fireEvent.click(container.querySelector('.delete-fab'));
    await new Promise((resolve) => setTimeout(resolve, 100));

    expect(deleteTeamTask).toHaveBeenCalledWith('team-1', 'task-1');
  });

  it('no deja la tarjeta de papelera en la tarjeta', async () => {
    const { container } = render(Tasks);
    await new Promise((resolve) => setTimeout(resolve, 100));

    expect(container.querySelector('.task-card .action-btn.danger')).toBeNull();
    expect(container.innerHTML).toContain('Ver detalle');
  });
});

describe('apartado de compras', () => {
  beforeEach(() => {
    vi.clearAllMocks();
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
    teamTasksStore.set([
      {
        id: 'task-compra',
        title: 'Comprar cemento',
        status: 'purchases',
        assignedTo: [],
        purchased: false,
        attachments: [],
        createdAt: '2026-10-12T10:00:00.000Z',
        createdBy: 'admin-1',
      },
    ]);
  });

  it('muestra el apartado de compras antes del de sin asignar', async () => {
    const { container } = render(Tasks);
    await new Promise((resolve) => setTimeout(resolve, 100));

    const html = container.innerHTML;
    expect(html).toContain('Compras');
    expect(html.indexOf('Compras')).toBeLessThan(html.indexOf('Sin asignar'));
  });

  it('ofrece la casilla para marcar cada compra', async () => {
    const { container } = render(Tasks);
    await new Promise((resolve) => setTimeout(resolve, 100));

    expect(container.querySelector('.purchase-check')).toBeTruthy();
    expect(container.innerHTML).toContain('Marcar compra como realizada');
  });

  it('muestra los artículos como lista TODO en lugar de la descripción', async () => {
    teamTasksStore.set([
      {
        id: 'task-compra',
        title: 'Comprar material',
        description: 'Descripción que no se muestra',
        status: 'purchases',
        assignedTo: [],
        purchased: false,
        items: [
          { id: 'i1', text: 'Cemento', done: false },
          { id: 'i2', text: 'Arena', done: true },
        ],
        attachments: [],
        createdAt: '2026-10-12T10:00:00.000Z',
        createdBy: 'admin-1',
      },
    ]);

    const { container } = render(Tasks);
    await new Promise((resolve) => setTimeout(resolve, 100));

    const html = container.innerHTML;
    expect(html).toContain('Cemento');
    expect(html).toContain('Arena');
    expect(html).toContain('purchase-items');
    // En el apartado de compras se muestra la lista de artículos, no la descripción.
    expect(html).not.toContain('Descripción que no se muestra');
  });
});
