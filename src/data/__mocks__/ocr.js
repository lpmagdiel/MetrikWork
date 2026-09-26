/**
 * Mock del módulo OCR para tests.
 * jsdom + Vitest no pueden hacer fetch al proxy serverless.
 */

export function isOcrConfigured() {
    return true;
}

export function isOcrLikelySupported() {
    return true;
}

export async function ensureOcrSupport() {
    return true;
}

export function getOcrStatus() {
    return { configured: true, supported: true, ready: true, endpoint: '/api/ocr' };
}

export async function recognizeImage() {
    return {
        text: '',
        confidence: 0,
        fields: {},
        raw: {},
        meta: { requestId: null, latencyMs: null, model: null, pages: null }
    };
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
    AUTH: 'auth',
    NETWORK: 'network',
    MODEL: 'model',
    UNKNOWN: 'unknown'
});
