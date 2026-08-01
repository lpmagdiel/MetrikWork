import { describe, expect, it } from 'vitest';
import {
    RCX_TYPES,
    RCXImportError,
    formatCurrency,
    formatNumber,
    importRCXProject,
    isRCXProject,
    rcxImporter,
    toNoteData,
    validateRCXProject,
} from './rcxImporter.js';

const sampleProject = {
    version: '1.0',
    type: 'rcx-project',
    source: { app: 'ReformaCalc', version: '1.3.0' },
    metadata: { exportedAt: '', currency: 'EUR', language: 'es' },
    project: {
        name: 'Pared salón',
        system: 'Pladur',
        area: 8.32,
        width: 3.2,
        height: 2.6,
    },
    calculation: {},
    summary: {
        materials: 209.53,
        labor: 166.4,
        total: 375.93,
        estimatedTime: 2.7,
    },
    materials: [
        { quantity: 7, unit: 'ud', name: 'Placa BA' },
        { quantity: 7, unit: 'ud', name: 'Perfil M48' },
        { quantity: 3, unit: 'ud', name: 'Canal C48' },
    ],
};

describe('isRCXProject', () => {
    it('acepta rcx-project', () => {
        expect(isRCXProject(sampleProject)).toBe(true);
    });

    it('acepta reformacalc-project (compatibilidad antigua)', () => {
        expect(isRCXProject({ ...sampleProject, type: 'reformacalc-project' })).toBe(true);
    });

    it('acepta un string JSON', () => {
        expect(isRCXProject(JSON.stringify(sampleProject))).toBe(true);
    });

    it('rechaza otros formatos', () => {
        expect(isRCXProject({ version: '1.0', type: 'csv' })).toBe(false);
        expect(isRCXProject({})).toBe(false);
        expect(isRCXProject(null)).toBe(false);
        expect(isRCXProject('no json')).toBe(false);
    });
});

describe('validateRCXProject', () => {
    it('devuelve valid=true sin errores para un proyecto correcto', () => {
        const result = validateRCXProject(sampleProject);
        expect(result).toEqual({ valid: true, errors: [] });
    });

    it('detecta version obligatoria', () => {
        const { errors } = validateRCXProject({ ...sampleProject, version: undefined });
        expect(errors.some((e) => e.includes('version'))).toBe(true);
    });

    it('detecta version con formato inválido', () => {
        const { errors } = validateRCXProject({ ...sampleProject, version: 'abc' });
        expect(errors.some((e) => e.includes('no es válida'))).toBe(true);
    });

    it('acepta versiones 2.x', () => {
        const result = validateRCXProject({ ...sampleProject, version: '2.0' });
        expect(result.valid).toBe(true);
    });

    it('detecta type no soportado', () => {
        const { errors } = validateRCXProject({ ...sampleProject, type: 'csv' });
        expect(errors.some((e) => e.includes('type'))).toBe(true);
    });

    it('detecta source.app obligatorio', () => {
        const { errors } = validateRCXProject({
            ...sampleProject,
            source: { version: '1.3.0' },
        });
        expect(errors.some((e) => e.includes('source.app'))).toBe(true);
    });

    it('valida el tipo de las secciones', () => {
        const { errors } = validateRCXProject({
            ...sampleProject,
            metadata: 'nope',
            project: [],
            calculation: null,
            summary: 5,
            materials: {},
        });
        for (const section of ['metadata', 'project', 'calculation', 'summary', 'materials']) {
            expect(errors.some((e) => e.includes(section))).toBe(true);
        }
    });

    it('devuelve errores si el contenido no es un objeto', () => {
        expect(validateRCXProject('{invalid').valid).toBe(false);
        expect(validateRCXProject([1, 2]).valid).toBe(false);
    });
});

describe('importRCXProject', () => {
    it('importa desde un objeto', () => {
        const project = importRCXProject(sampleProject);
        expect(project.title).toBe('Pared salón');
        expect(project.source).toBe('ReformaCalc');
        expect(project.imported).toBe(true);
        expect(project.category).toBe('Proyecto');
    });

    it('importa desde un string JSON', () => {
        const project = importRCXProject(JSON.stringify(sampleProject));
        expect(project.title).toBe('Pared salón');
    });

    it('construye el checklist desmarcado con todos los materiales', () => {
        const project = importRCXProject(sampleProject);
        expect(project.checklist).toEqual([
            { text: '7 ud - Placa BA', checked: false },
            { text: '7 ud - Perfil M48', checked: false },
            { text: '3 ud - Canal C48', checked: false },
        ]);
    });

    it('genera etiquetas RCX + aplicación + sistema', () => {
        const project = importRCXProject(sampleProject);
        expect(project.tags).toEqual(['RCX', 'ReformaCalc', 'Pladur']);
    });

    it('genera el resumen con el formato esperado', () => {
        const project = importRCXProject(sampleProject);
        expect(project.notes).toBe(
            [
                'Proyecto',
                'Pared salón',
                '----------------------------------------',
                'Aplicación origen',
                'ReformaCalc',
                '----------------------------------------',
                'Sistema',
                'Pladur',
                'Área',
                '8.32 m²',
                'Dimensiones',
                '3.2 × 2.6 m',
                '----------------------------------------',
                'Resumen económico',
                'Materiales',
                '209.53 €',
                'Mano de obra',
                '166.4 €',
                'Total',
                '375.93 €',
                'Tiempo estimado',
                '2.7 h',
                '----------------------------------------',
                'Materiales',
                '• 7 ud - Placa BA',
                '• 7 ud - Perfil M48',
                '• 3 ud - Canal C48',
            ].join('\n'),
        );
    });

    it('no asume que siempre hay materiales ni sistema', () => {
        const minimal = {
            version: '1.0',
            type: 'rcx-project',
            source: { app: 'OtraApp' },
            metadata: {},
            project: {},
            calculation: {},
            summary: {},
        };
        const project = importRCXProject(minimal);
        expect(project.checklist).toEqual([]);
        expect(project.notes).toContain('Materiales');
        expect(project.notes).toContain('Sin materiales');
        expect(project.tags).toEqual(['RCX', 'OtraApp']);
    });

    it('lanza RCXImportError si el proyecto no es válido', () => {
        expect(() => importRCXProject({ version: '1.0', type: 'csv' })).toThrow(RCXImportError);
        expect(() => importRCXProject('no es json')).toThrow(RCXImportError);
        expect(() => importRCXProject({})).toThrow(RCXImportError);
    });

    it('trata reformacalc-project igual que rcx-project', () => {
        const legacy = importRCXProject({ ...sampleProject, type: 'reformacalc-project' });
        const modern = importRCXProject(sampleProject);
        expect(legacy.title).toBe(modern.title);
        expect(legacy.notes).toBe(modern.notes);
        expect(legacy.tags).toEqual(modern.tags);
    });
});

describe('toNoteData', () => {
    it('convierte el proyecto importado en nota de MetricWork', () => {
        const project = importRCXProject(sampleProject);
        const note = toNoteData(project);
        expect(note.title).toBe('Pared salón');
        expect(note.type).toBe('todo');
        expect(note.items).toEqual([
            { text: '7 ud - Placa BA', completed: false },
            { text: '7 ud - Perfil M48', completed: false },
            { text: '3 ud - Canal C48', completed: false },
        ]);
        expect(note.content).toContain('Resumen económico');
        expect(note.content).toContain('Etiquetas\nRCX, ReformaCalc, Pladur');
        expect(note.color).toBe('#ffffff');
    });

    it('usa tipo text cuando no hay checklist', () => {
        const project = importRCXProject({
            version: '1.0',
            type: 'rcx-project',
            source: { app: 'ReformaCalc' },
        });
        const note = toNoteData(project);
        expect(note.type).toBe('text');
        expect(note.items).toEqual([]);
    });
});

describe('helpers de formato', () => {
    it('formatNumber recorta ceros finales', () => {
        expect(formatNumber(8.32)).toBe('8.32');
        expect(formatNumber(2.7)).toBe('2.7');
        expect(formatNumber(7)).toBe('7');
    });

    it('formatCurrency usa símbolo según ISO', () => {
        expect(formatCurrency(209.53, 'EUR')).toBe('209.53 €');
        expect(formatCurrency(166.4, 'USD')).toBe('166.4 $');
    });
});

describe('contrato de importador', () => {
    it('expone canImport e import para importManager', () => {
        expect(typeof rcxImporter.canImport).toBe('function');
        expect(typeof rcxImporter.import).toBe('function');
        expect(rcxImporter.id).toBe('rcx');
        expect(rcxImporter.supportedExtensions).toContain('.rcx.json');
        expect(rcxImporter.canImport(sampleProject)).toBe(true);
    });

    it('RCX_TYPES mantiene ambos formatos', () => {
        expect(RCX_TYPES).toContain('rcx-project');
        expect(RCX_TYPES).toContain('reformacalc-project');
    });
});
