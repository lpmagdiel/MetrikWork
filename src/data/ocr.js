/**
 * Cliente OCR basado en Tesseract.js.
 *
 * El worker se crea de forma lazy la primera vez que se necesita para no
 * penalizar el bundle ni el arranque de la app. Se reutiliza entre llamadas.
 *
 * Modelo de idioma por defecto: español (`spa`). Se cachea vía Workbox en
 * `vite.config.js` para que esté disponible offline.
 */

const DEFAULT_LANGUAGE = 'spa';
const OCR_LOG_PREFIX = '[OCR]';

let workerPromise = null;
let currentLanguage = null;
let progressListeners = new Set();

function isTesseractAvailable() {
    return typeof window !== 'undefined'
        && typeof document !== 'undefined'
        && typeof Worker !== 'undefined';
}

async function loadTesseract() {
    const mod = await import('tesseract.js');
    return mod.default || mod;
}

function notifyProgress(payload) {
    for (const listener of progressListeners) {
        try {
            listener(payload);
        } catch (error) {
            console.warn(OCR_LOG_PREFIX, 'Listener de progreso falló:', error);
        }
    }
}

/**
 * Suscribe un listener para recibir actualizaciones de progreso del OCR.
 * Devuelve una función para cancelar la suscripción.
 *
 * @param {(payload: { status: string, progress: number, source?: string }) => void} listener
 * @returns {() => void}
 */
export function subscribeOcrProgress(listener) {
    if (typeof listener !== 'function') return () => {};
    progressListeners.add(listener);
    return () => progressListeners.delete(listener);
}

/**
 * Garantiza que el worker esté cargado para el idioma pedido.
 *
 * @param {string} language
 * @returns {Promise<object>} instancia del worker
 */
export async function getOcrWorker(language = DEFAULT_LANGUAGE) {
    if (!isTesseractAvailable()) {
        throw new Error('OCR no disponible en este entorno');
    }
    if (workerPromise && currentLanguage === language) {
        return workerPromise;
    }
    if (workerPromise) {
        await disposeOcrWorker().catch(() => {});
    }
    currentLanguage = language;
    notifyProgress({ status: 'loading model', progress: 0 });
    workerPromise = (async () => {
        const tesseract = await loadTesseract();
        const worker = await tesseract.createWorker(language, 1, {
            logger: (message) => {
                if (!message?.status) return;
                notifyProgress({
                    status: message.status,
                    progress: Number(message.progress ?? 0)
                });
                if (typeof console !== 'undefined') {
                    console.debug(OCR_LOG_PREFIX, message.status, message.progress ?? '');
                }
            }
        });
        notifyProgress({ status: 'ready', progress: 1 });
        return worker;
    })();
    return workerPromise;
}

/**
 * Reconoce texto a partir de una imagen (URL, Blob o File).
 *
 * @param {string|Blob|File} source
 * @param {{ language?: string, label?: string }} [options]
 * @returns {Promise<{ text: string, confidence: number, language: string }>}
 */
export async function recognizeImage(source, options = {}) {
    const language = options.language || DEFAULT_LANGUAGE;
    const worker = await getOcrWorker(language);
    const result = await worker.recognize(source);
    const text = String(result?.data?.text || '').trim();
    const confidence = Number(result?.data?.confidence ?? 0);
    notifyProgress({ status: 'done', progress: 1 });
    return { text, confidence, language };
}

export async function disposeOcrWorker() {
    if (!workerPromise) return;
    try {
        const worker = await workerPromise;
        await worker.terminate();
    } catch (error) {
        console.warn(OCR_LOG_PREFIX, 'No se pudo terminar el worker:', error);
    } finally {
        workerPromise = null;
        currentLanguage = null;
        notifyProgress({ status: 'idle', progress: 0 });
    }
}

export function getOcrStatus() {
    return {
        available: isTesseractAvailable(),
        language: currentLanguage || DEFAULT_LANGUAGE,
        ready: Boolean(workerPromise)
    };
}
