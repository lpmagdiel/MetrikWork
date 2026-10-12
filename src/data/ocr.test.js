import { describe, expect, it } from 'vitest';
import { getRawOcrText, hasDetectedItemList } from './ocr.js';

describe('OCR receipt fallback data', () => {
    it('keeps the literal scanned text', () => {
        expect(getRawOcrText({ text: 'Tienda\r\nPan 1,20' }))
            .toBe('Tienda\nPan 1,20');
    });

    it('uses raw_text in preference to the compatibility text field', () => {
        expect(getRawOcrText({ raw_text: 'Original OCR', text: 'Resumen' }))
            .toBe('Original OCR');
    });

    it('only considers a non-empty item description an item list', () => {
        expect(hasDetectedItemList({ items: [] })).toBe(false);
        expect(hasDetectedItemList({ items: [{ quantity: 2, total: 4 }] })).toBe(false);
        expect(hasDetectedItemList({ items: [{ description: 'Tornillos', quantity: 2 }] })).toBe(true);
    });
});
