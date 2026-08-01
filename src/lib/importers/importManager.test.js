import { describe, expect, it } from 'vitest';
import {
    ImportError,
    canImport,
    getRegisteredImporters,
    getSupportedExtensions,
    importData,
    importFromFile,
    importFromString,
} from './importManager.js';

const sampleProject = {
    version: '1.0',
    type: 'rcx-project',
    source: { app: 'ReformaCalc', version: '1.3.0' },
    metadata: {},
    project: { name: 'Pared salón', system: 'Pladur' },
    calculation: {},
    summary: {},
    materials: [{ quantity: 7, unit: 'ud', name: 'Placa BA' }],
};

describe('importManager', () => {
    it('detecta y delega en el importador RCX', () => {
        const result = importData(sampleProject);
        expect(result.importer).toBe('rcx');
        expect(result.project.title).toBe('Pared salón');
    });

    it('detecta el formato antiguo reformacalc-project', () => {
        const result = importData({ ...sampleProject, type: 'reformacalc-project' });
        expect(result.importer).toBe('rcx');
        expect(result.project.imported).toBe(true);
    });

    it('lanza ImportError si ningún importador reconoce el contenido', () => {
        expect(() => importData({ version: '1.0', type: 'csv' })).toThrow(ImportError);
        expect(() => importData('garbage')).toThrow(ImportError);
    });

    it('canImport devuelve true solo si hay un importador capaz', () => {
        expect(canImport(sampleProject)).toBe(true);
        expect(canImport({ foo: 1 })).toBe(false);
    });

    it('importFromString procesa JSON válido', async () => {
        const result = await importFromString(JSON.stringify(sampleProject));
        expect(result.project.title).toBe('Pared salón');
    });

    it('importFromString rechaza JSON inválido y contenido vacío', async () => {
        await expect(importFromString('{not json')).rejects.toThrow(ImportError);
        await expect(importFromString('')).rejects.toThrow(ImportError);
        await expect(importFromString('   ')).rejects.toThrow(ImportError);
    });

    it('importFromFile lee el archivo y lo importa', async () => {
        const file = { text: async () => JSON.stringify(sampleProject) };
        const result = await importFromFile(file);
        expect(result.importer).toBe('rcx');
        expect(result.project.source).toBe('ReformaCalc');
    });

    it('importFromFile rechaza archivos vacíos', async () => {
        await expect(importFromFile(null)).rejects.toThrow(ImportError);
        await expect(importFromFile({ text: async () => '' })).rejects.toThrow(ImportError);
    });

    it('expone extensiones soportadas incluyendo .rcx.json', () => {
        const extensions = getSupportedExtensions();
        expect(extensions).toContain('.rcx.json');
        expect(extensions).toContain('.json');
    });

    it('registra los importadores actuales y futuros', () => {
        const registered = getRegisteredImporters();
        const ids = registered.map((r) => r.id);
        expect(ids).toContain('rcx');
        expect(ids).toContain('csv');
        expect(ids).toContain('excel');
        expect(ids).toContain('pdf');
    });
});
