/**
 * Mock del módulo OCR para tests (jsdom no soporta WASM).
 * Las pruebas que necesiten OCR deben mockear `./ocr.js` con
 * `vi.mock('./ocr.js', () => import('./__mocks__/ocr.js'))`.
 */

export async function getOcrWorker() {
    return {
        recognize: async () => ({ data: { text: '', confidence: 0 } }),
        terminate: async () => {}
    };
}

export async function recognizeImage() {
    return { text: '', confidence: 0, language: 'spa' };
}

export async function disposeOcrWorker() {
    return undefined;
}

export function getOcrStatus() {
    return { available: false, language: 'spa', ready: false };
}

export function subscribeOcrProgress() {
    return () => {};
}
