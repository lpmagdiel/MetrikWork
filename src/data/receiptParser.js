/**
 * Parser heurístico para tickets / facturas.
 *
 * Recibe el texto crudo devuelto por el OCR y extrae los campos principales
 * del formulario de gastos. Las heurísticas son conservadoras: ante la duda,
 * no se rellena nada.
 *
 * Campos extraídos:
 * - amount        Importe total (prioriza líneas con "TOTAL" / "IMPORTE").
 * - date          Fecha del ticket (formato español DD/MM/YYYY o similar).
 * - vendorName    Nombre del proveedor (primera línea significativa).
 * - vendorTaxId   NIF/CIF del proveedor.
 * - invoiceNumber Nº de factura o ticket.
 * - category      Categoría sugerida (palabras clave).
 */

import { getExpenseDateKey } from './teamExpenseUtils.js';

const CURRENCY_SYMBOLS = ['€', '$', 'EUR', 'USD', 'GBP', 'MXN'];

const TOTAL_KEYWORDS = [
    'total a pagar',
    'importe total',
    'total factura',
    'total ticket',
    'total €',
    'total eur',
    'a pagar',
    'total'
];

const INVOICE_KEYWORDS = [
    'factura',
    'ticket',
    'nº factura',
    'num factura',
    'num. factura',
    'n factura',
    'ref',
    'referencia',
    'albaran',
    'albarán'
];

const TAX_ID_PATTERNS = [
    /\b[ABCDEFGHJKLMNPQSUVW]\d{7}[A-Z0-9]\b/i,
    /\b[XYZ]\d{7}[A-Z]\b/i,
    /\b\d{8}[A-Z]\b/i,
    /\bES\d{8}[A-Z]\b/i,
    /\bES\d{9}\b/i
];

const CATEGORY_KEYWORDS = {
    transport: ['gasolinera', 'gasolina', 'diesel', 'gasoil', 'combustible', 'peaje', 'aparcamiento', 'parking', 'taxi', 'uber', 'cabify', 'metro', 'autobus', 'autobús', 'tren', 'renfe', 'avión', 'avion', 'repsol', 'cepsa', 'bp ', 'shell'],
    food: ['restaurante', 'bar ', 'cafeteria', 'cafetería', 'menu', 'menú', 'comida', 'cena', 'almuerzo', 'merienda', 'panaderia', 'panadería', 'supermercado', 'mercadona', 'carrefour', 'lidl', 'aldi', 'consum', 'dia '],
    lodging: ['hotel', 'hostal', 'alojamiento', 'apartamento', 'airbnb', 'booking', 'reserva', 'hostal'],
    supplies: ['ferreteria', 'ferretería', 'material', 'suministro', 'oficina', 'papeleria', 'papelería', 'boligrafo', 'bolígrafo', 'toner', 'tóner'],
    utilities: ['luz', 'agua', 'gas ', 'internet', 'telefono', 'teléfono', 'movil', 'móvil', 'fibra', 'vodafone', 'movistar', 'orange', 'endesa', 'iberdrola', 'naturgy'],
    rent: ['alquiler', 'renta', 'arrendamiento', 'local'],
    maintenance: ['reparacion', 'reparación', 'taller', 'mecanico', 'mecánico', 'revision', 'revisión', 'mantenimiento'],
    insurance: ['seguro', 'poliza', 'póliza', 'mutua'],
    professional: ['asesoria', 'asesoría', 'gestoria', 'gestoría', 'abogado', 'abogada', 'notario', 'notaria', 'consultoria', 'consultoría'],
    taxes: ['impuesto', 'tasa', 'iva ', 'aeat', 'hacienda', 'ayuntamiento']
};

function normalizeLines(text = '') {
    return String(text)
        .replace(/\r/g, '')
        .split('\n')
        .map((line) => line.replace(/\s+/g, ' ').trim())
        .filter(Boolean);
}

function normalizeDecimalAmount(rawAmount) {
    if (rawAmount == null) return null;
    let value = String(rawAmount).trim();
    if (!value) return null;
    value = value.replace(/\s/g, '')
        .replace(/[€$£¥]/g, '')
        .replace(/(?:EUR|USD|GBP|MXN|eur|usd|gbp|mxn)\b/g, '')
        .replace(/\b(?:EUR|USD|GBP|MXN)$/i, '');
    if (!/\d/.test(value)) return null;

    const hasComma = value.includes(',');
    const hasDot = value.includes('.');
    if (hasComma && hasDot) {
        if (value.lastIndexOf(',') > value.lastIndexOf('.')) {
            value = value.replace(/\./g, '').replace(',', '.');
        } else {
            value = value.replace(/,/g, '');
        }
    } else if (hasComma) {
        value = value.replace(',', '.');
    }
    const amount = Number(value);
    if (!Number.isFinite(amount)) return null;
    if (amount < 0 || amount > 1000000) return null;
    return Math.round(amount * 100) / 100;
}

function lineMatchesTotalKeyword(line, keyword) {
    const lower = line.toLowerCase();
    if (!lower.includes(keyword)) return false;
    if (keyword === 'total') {
        // Excluir "subtotal", "total parcial" si aparecen justo antes.
        const idx = lower.indexOf(keyword);
        const prev = lower[idx - 1] || '';
        const before = lower.slice(Math.max(0, idx - 5), idx);
        if (/(?:sub|parc)$/.test(before)) return false;
        if (prev && /[a-z0-9]/.test(prev)) return false;
    }
    return true;
}

function extractAmount(text) {
    const lines = normalizeLines(text);
    const amountRegex = /(\d{1,6}(?:[.,]\d{2}))/g;

    // 1) Priorizar líneas con palabras clave de total (ordenadas por
    // especificidad: las más concretas primero).
    for (const keyword of TOTAL_KEYWORDS) {
        for (const line of lines) {
            if (!lineMatchesTotalKeyword(line, keyword)) continue;
            const matches = [...line.matchAll(amountRegex)];
            if (matches.length) {
                const value = normalizeDecimalAmount(matches[matches.length - 1][1]);
                if (value != null) return value;
            }
        }
    }

    // 2) Fallback: el último importe con 2 decimales del texto
    const allMatches = [...text.matchAll(amountRegex)];
    for (let i = allMatches.length - 1; i >= 0; i -= 1) {
        const value = normalizeDecimalAmount(allMatches[i][1]);
        if (value != null && value > 0) return value;
    }
    return null;
}

function extractDate(text) {
    const patterns = [
        /\b(\d{1,2})[\/\-\.](\d{1,2})[\/\-\.](\d{2,4})\b/g,
        /\b(\d{1,2})\s+de\s+([a-záéíóúñ]+)\s+de\s+(\d{2,4})\b/gi,
        /\b(\d{4})[\/\-\.](\d{1,2})[\/\-\.](\d{1,2})\b/g
    ];

    const months = {
        enero: 1, febrero: 2, marzo: 3, abril: 4, mayo: 5, junio: 6,
        julio: 7, agosto: 8, septiembre: 9, octubre: 10, noviembre: 11, diciembre: 12
    };

    for (const pattern of patterns) {
        const matches = [...text.matchAll(pattern)];
        for (const match of matches) {
            let day, month, year;
            if (months[String(match[2] || '').toLowerCase()]) {
                day = Number(match[1]);
                month = months[String(match[2]).toLowerCase()];
                year = Number(match[3]);
            } else if (match[1].length === 4) {
                year = Number(match[1]);
                month = Number(match[2]);
                day = Number(match[3]);
            } else {
                day = Number(match[1]);
                month = Number(match[2]);
                year = Number(match[3]);
            }
            if (year < 100) year += 2000;
            if (year < 1990 || year > 2100) continue;
            if (month < 1 || month > 12) continue;
            if (day < 1 || day > 31) continue;
            const key = `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
            if (getExpenseDateKey(key) === key) return key;
        }
    }
    return null;
}

function extractTaxId(text) {
    for (const pattern of TAX_ID_PATTERNS) {
        const match = text.match(pattern);
        if (match) return match[0].toUpperCase();
    }
    return null;
}

function extractInvoiceNumber(text) {
    const lines = normalizeLines(text);
    const numberRegex = /([A-Z]{0,3}-?\d[\w\-\/]{1,20})/g;
    for (const line of lines) {
        const lower = line.toLowerCase();
        const hasKeyword = INVOICE_KEYWORDS.some((kw) => lower.includes(kw));
        if (!hasKeyword) continue;
        const matches = [...line.matchAll(numberRegex)];
        for (const match of matches) {
            const candidate = (match[1] || '').trim();
            if (candidate.length >= 3 && /\d/.test(candidate)) {
                return candidate.toUpperCase();
            }
        }
    }
    return null;
}

function extractVendorName(text) {
    const lines = normalizeLines(text);
    const ignored = new Set([
        'ticket', 'factura', 'factura simplificada', 'recibo', 'albaran', 'albarán',
        'caja', 'cambio', 'gracias', 'gracias por su visita', 'iva incluido'
    ]);
    for (const line of lines.slice(0, 6)) {
        const clean = line.replace(/[^A-Za-z0-9ÁÉÍÓÚÑáéíóúñ&'.\-\s]/g, '').trim();
        if (clean.length < 3 || clean.length > 60) continue;
        const lower = clean.toLowerCase();
        if (ignored.has(lower)) continue;
        if (/^\d/.test(clean)) continue;
        if (/^[\W_]+$/.test(clean)) continue;
        if (CURRENCY_SYMBOLS.some((sym) => clean.includes(sym))) continue;
        if (!/[A-Za-zÁÉÍÓÚÑáéíóúñ]/.test(clean)) continue;
        return clean;
    }
    return null;
}

function extractCategory(text) {
    const lower = text.toLowerCase();
    for (const [category, keywords] of Object.entries(CATEGORY_KEYWORDS)) {
        for (const keyword of keywords) {
            if (lower.includes(keyword)) return category;
        }
    }
    return null;
}

function parseReceiptText(text = '') {
    const safeText = String(text || '').trim();
    if (!safeText) {
        return {
            fields: {
                amount: null,
                date: null,
                vendorName: null,
                vendorTaxId: null,
                invoiceNumber: null,
                category: null
            },
            rawText: '',
            summary: { hasContent: false, filledFields: 0, totalFields: 6 }
        };
    }
    const fields = {
        amount: extractAmount(safeText),
        date: extractDate(safeText),
        vendorName: extractVendorName(safeText),
        vendorTaxId: extractTaxId(safeText),
        invoiceNumber: extractInvoiceNumber(safeText),
        category: extractCategory(safeText)
    };
    const filled = Object.values(fields).filter((value) => value !== null && value !== undefined && value !== '').length;
    return {
        fields,
        rawText: safeText,
        summary: {
            hasContent: true,
            filledFields: filled,
            totalFields: Object.keys(fields).length
        }
    };
}

export {
    parseReceiptText,
    extractAmount,
    extractDate,
    extractTaxId,
    extractInvoiceNumber,
    extractVendorName,
    extractCategory,
    normalizeDecimalAmount
};
