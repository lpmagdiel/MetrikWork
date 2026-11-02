import { describe, expect, it } from 'vitest';
import {
    MAX_TASK_ATTACHMENTS,
    TASK_VISIBILITY,
    getTaskGhostMasterIds,
    getVisibleTasksVisibility,
    normalizeTaskAttachments
} from './tasks.js';

describe('asignación de tareas a fantasmas', () => {
    const team = {
        id: 'team-1',
        admin: 'admin-1',
        members: ['admin-1', 'master-1', 'otro-1'],
        ghosts: [
            { id: 'ghost-a', name: 'Fantasma A', masters: ['master-1'] },
            { id: 'ghost-b', name: 'Fantasma B', masters: ['master-1', 'otro-1'] }
        ]
    };

    it('devuelve los masters de los fantasmas asignados', () => {
        expect(getTaskGhostMasterIds(team, ['ghost-ghost-a'])).toEqual(['master-1']);
        expect(getTaskGhostMasterIds(team, ['ghost-ghost-b'])).toEqual(['master-1', 'otro-1']);
    });

    it('no devuelve masters cuando la tarea no está asignada a fantasmas', () => {
        expect(getTaskGhostMasterIds(team, ['admin-1'])).toEqual([]);
        expect(getTaskGhostMasterIds(team, [])).toEqual([]);
        expect(getTaskGhostMasterIds(null, ['ghost-ghost-a'])).toEqual([]);
    });

    it('ignora fantasmas que no existen en el equipo', () => {
        expect(getTaskGhostMasterIds(team, ['ghost-ghost-inexistente'])).toEqual([]);
    });

    it('no repite masters cuando hay varios fantasmas asignados', () => {
        expect(getTaskGhostMasterIds(team, ['ghost-ghost-a', 'ghost-ghost-b'])).toEqual(['master-1', 'otro-1']);
    });
});

describe('visibilidad de tareas por miembro', () => {
    it('devuelve "all" por defecto y para el administrador', () => {
        expect(getVisibleTasksVisibility({ id: 'team-1', admin: 'admin-1' }, 'admin-1')).toBe(TASK_VISIBILITY.all);
        expect(getVisibleTasksVisibility({ id: 'team-1', admin: 'admin-1' }, 'miembro-1')).toBe(TASK_VISIBILITY.all);
    });

    it('respeta la configuración "own" del miembro', () => {
        const team = {
            id: 'team-1',
            admin: 'admin-1',
            memberSettings: { 'miembro-1': { tasksVisibility: 'own' } }
        };
        expect(getVisibleTasksVisibility(team, 'miembro-1')).toBe(TASK_VISIBILITY.own);
        expect(getVisibleTasksVisibility(team, 'miembro-2')).toBe(TASK_VISIBILITY.all);
    });
});

describe('adjuntos de tareas', () => {
  it('normaliza los adjuntos a url y nombre', () => {
    expect(normalizeTaskAttachments([
      { url: 'https://res.cloudinary.com/demo/image/upload/terreno.jpg', name: '  Terreno.jpg  ' },
      { url: 'https://res.cloudinary.com/demo/image/upload/resultado.jpg' }
    ])).toEqual([
      { url: 'https://res.cloudinary.com/demo/image/upload/terreno.jpg', name: 'Terreno.jpg' },
      { url: 'https://res.cloudinary.com/demo/image/upload/resultado.jpg', name: 'Imagen' }
    ]);
  });

  it('descarta entradas invalidas y limita el numero de imagenes', () => {
    expect(normalizeTaskAttachments(null)).toEqual([]);
    expect(normalizeTaskAttachments([
      { name: 'sin url' },
      null,
      { url: '' }
    ])).toEqual([]);

    const many = Array.from({ length: MAX_TASK_ATTACHMENTS + 3 }, (_, index) => ({
      url: `https://res.cloudinary.com/demo/image/upload/imagen-${index}.jpg`,
      name: `Imagen ${index}`
    }));

    expect(normalizeTaskAttachments(many)).toHaveLength(MAX_TASK_ATTACHMENTS);
  });

  it('recorta url y nombre a longitudes seguras', () => {
    const [attachment] = normalizeTaskAttachments([
      { url: `https://res.cloudinary.com/demo/image/upload/${'a'.repeat(900)}.jpg`, name: 'b'.repeat(400) }
    ]);

    expect(attachment.url.length).toBe(600);
    expect(attachment.name.length).toBe(160);
  });
});
