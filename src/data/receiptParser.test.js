import { describe, expect, it } from 'vitest';
import {
    parseReceiptText,
    extractAmount,
    extractDate,
    extractTaxId,
    extractInvoiceNumber,
    extractVendorName,
    extractCategory,
    normalizeDecimalAmount
} from './receiptParser.js';

const SAMPLE_RECEIPT = `RESTAURANTE LA ABUELA
Calle Mayor 12, Madrid
NIF: B12345678
Tel: 912345678
Factura nº: F-2026/00123
Fecha: 15/01/2026
------------------------------
Menu del día           12,50 €
Bebida                  2,00 €
------------------------------
Subtotal:              14,50 €
IVA 10%:                1,45 €
TOTAL:                 15,95 €
Efectivo`;

describe('normalizeDecimalAmount', () => {
    it('parsea importes europeos con coma decimal', () => {
        expect(normalizeDecimalAmount('15,95')).toBe(15.95);
        expect(normalizeDecimalAmount('1.234,56')).toBe(1234.56);
    });

    it('parsea importes anglosajones con punto decimal', () => {
        expect(normalizeDecimalAmount('15.95')).toBe(15.95);
        expect(normalizeDecimalAmount('1,234.56')).toBe(1234.56);
    });

    it('ignora símbolos de moneda y espacios', () => {
        expect(normalizeDecimalAmount('€ 15,95 €')).toBe(15.95);
        expect(normalizeDecimalAmount('15.95 EUR')).toBe(15.95);
    });

    it('rechaza importes fuera de rango o no numéricos', () => {
        expect(normalizeDecimalAmount('abc')).toBe(null);
        expect(normalizeDecimalAmount('-5,00')).toBe(null);
        expect(normalizeDecimalAmount('9999999,99')).toBe(null);
    });
});

describe('extractAmount', () => {
    it('prioriza la línea con TOTAL cuando existe', () => {
        const text = `Subtotal 14,50
IVA 1,45
TOTAL 15,95`;
        expect(extractAmount(text)).toBe(15.95);
    });

    it('acepta variantes en mayúsculas/minúsculas', () => {
        expect(extractAmount('Importe Total: 99,99 €')).toBe(99.99);
        expect(extractAmount('A pagar  42,00')).toBe(42);
    });

    it('hace fallback al último importe con dos decimales', () => {
        const text = `Línea 1  12,50
Otra cosa  3,00
Importe final  75,30`;
        expect(extractAmount(text)).toBe(75.30);
    });

    it('devuelve null cuando no hay importes', () => {
        expect(extractAmount('Texto sin importes')).toBe(null);
    });
});

describe('extractDate', () => {
    it('reconoce formato DD/MM/YYYY', () => {
        expect(extractDate('Fecha: 15/01/2026')).toBe('2026-01-15');
        expect(extractDate('Fecha: 5-3-26')).toBe('2026-03-05');
    });

    it('reconoce formato con mes en texto', () => {
        expect(extractDate('15 de enero de 2026')).toBe('2026-01-15');
        expect(extractDate('3 de febrero de 2025')).toBe('2025-02-03');
    });

    it('reconoce formato ISO YYYY-MM-DD', () => {
        expect(extractDate('Emitido el 2026-12-31')).toBe('2026-12-31');
    });

    it('rechaza fechas inválidas', () => {
        expect(extractDate('99/99/9999')).toBe(null);
        expect(extractDate('31/02/2026')).toBe(null);
    });
});

describe('extractTaxId', () => {
    it('reconoce un NIF español', () => {
        expect(extractTaxId('NIF: 12345678Z')).toBe('12345678Z');
    });

    it('reconoce un CIF con letra inicial', () => {
        expect(extractTaxId('CIF B12345678')).toBe('B12345678');
    });

    it('reconoce un NIE', () => {
        expect(extractTaxId('Pasaporte X1234567A')).toBe('X1234567A');
    });

    it('reconoce NIF intracomunitario con prefijo ES', () => {
        expect(extractTaxId('ES12345678Z')).toBe('ES12345678Z');
    });

    it('devuelve null cuando no hay identificador fiscal', () => {
        expect(extractTaxId('Texto sin NIF')).toBe(null);
    });
});

describe('extractInvoiceNumber', () => {
    it('extrae número tras la palabra Factura', () => {
        expect(extractInvoiceNumber('Factura nº: F-2026/00123')).toBe('F-2026/00123');
    });

    it('extrae número tras Ticket', () => {
        expect(extractInvoiceNumber('Ticket: 001-0025')).toBe('001-0025');
    });

    it('devuelve null si no hay palabra clave', () => {
        expect(extractInvoiceNumber('Línea sin contexto')).toBe(null);
    });
});

describe('extractVendorName', () => {
    it('toma la primera línea significativa', () => {
        const text = `RESTAURANTE LA ABUELA
Calle Mayor 12, Madrid
Fecha: 15/01/2026`;
        expect(extractVendorName(text)).toBe('RESTAURANTE LA ABUELA');
    });

    it('ignora líneas de tipo "ticket" o "factura"', () => {
        const text = `TICKET
HOTEL SOL
Fecha: 15/01/2026`;
        expect(extractVendorName(text)).toBe('HOTEL SOL');
    });

    it('devuelve null si no hay nombre claro', () => {
        expect(extractVendorName('12345678')).toBe(null);
        expect(extractVendorName('€ 12,50')).toBe(null);
    });
});

describe('extractCategory', () => {
    it('detecta transporte por palabras clave', () => {
        expect(extractCategory('Gasolinera Repsol')).toBe('transport');
        expect(extractCategory('Ticket de parking')).toBe('transport');
    });

    it('detecta alimentación', () => {
        expect(extractCategory('Restaurante La Abuela')).toBe('food');
        expect(extractCategory('Mercadona')).toBe('food');
    });

    it('detecta alojamiento', () => {
        expect(extractCategory('Hotel Avenida')).toBe('lodging');
        expect(extractCategory('Reserva Booking')).toBe('lodging');
    });

    it('detecta suministros / servicios', () => {
        expect(extractCategory('Recibo de luz Endesa')).toBe('utilities');
        expect(extractCategory('Factura Vodafone')).toBe('utilities');
    });

    it('devuelve null si no encaja con ninguna categoría', () => {
        expect(extractCategory('Algún texto no clasificado')).toBe(null);
    });
});

describe('parseReceiptText (integración)', () => {
    it('extrae los campos principales de un ticket realista', () => {
        const result = parseReceiptText(SAMPLE_RECEIPT);
        expect(result.fields.amount).toBe(15.95);
        expect(result.fields.date).toBe('2026-01-15');
        expect(result.fields.vendorTaxId).toBe('B12345678');
        expect(result.fields.invoiceNumber).toBe('F-2026/00123');
        expect(result.fields.vendorName).toBe('RESTAURANTE LA ABUELA');
        expect(result.fields.category).toBe('food');
        expect(result.summary.filledFields).toBeGreaterThanOrEqual(5);
    });

    it('devuelve campos vacíos con texto vacío', () => {
        const result = parseReceiptText('');
        expect(result.fields.amount).toBe(null);
        expect(result.summary.hasContent).toBe(false);
    });

    it('no rellena nada si el OCR devuelve texto sin estructura', () => {
        const result = parseReceiptText('aaaaaaaaaa');
        expect(result.fields.amount).toBe(null);
        expect(result.fields.date).toBe(null);
        expect(result.fields.vendorTaxId).toBe(null);
    });
});
