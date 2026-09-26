/**
 * Mock del módulo OCR para tests (jsdom no soporta WASM).
 * Las pruebas que necesiten OCR deben mockear `./ocr.js` con
 * `vi.mock('./ocr.js', () => import('./__mocks__/ocr.js'))`.
 */

export async function getOcrWorker() {
    return {
        recognize: async () => ({ data: { text: '', confidence: 0 } }),
        setParameters: async () => {},
        terminate: async () => {}
    };
}

export async function recognizeImage() {
    return { text: '', confidence: 0, language: 'spa' };
}

export async function recognizeImageRemote() {
    return { text: '', confidence: 0, language: 'spa', source: 'remote' };
}

export async function disposeOcrWorker() {
    return undefined;
}

export function getOcrStatus() {
    return { available: false, supported: false, language: 'spa', ready: false };
}

export function isOcrLikelySupported() {
    return false;
}

export async function ensureOcrSupport() {
    return false;
}

export function subscribeOcrProgress() {
    return () => {};
}

export class OcrError extends Error {
    constructor(code, message, cause) {
        super(message);
        this.name = 'OcrError';
        this.code = code;
        if (cause) this.cause = cause;
    }
}

export const OCR_ERROR_CODES = Object.freeze({
    UNSUPPORTED: 'unsupported',
    WORKER: 'worker',
    NETWORK: 'network',
    MODEL: 'model',
    UNKNOWN: 'unknown'
});