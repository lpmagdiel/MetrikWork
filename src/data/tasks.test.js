import { describe, expect, it } from 'vitest';
import { MAX_TASK_ATTACHMENTS, normalizeTaskAttachments } from './tasks.js';

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
