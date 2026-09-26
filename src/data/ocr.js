/**
 * Cliente OCR basado en Tesseract.js.
 *
 * El worker se crea de forma lazy la primera vez que se necesita para no
 * penalizar el bundle ni el arranque de la app. Se reutiliza entre llamadas.
 *
 * Los activos de Tesseract (core WASM + modelos de idioma) se sirven desde
 * la propia PWA en `/tesseract/*` (plugin `tesseractAssetsPlugin` en
 * `vite.config.js`) en lugar del CDN. Esto evita:
 *   - restricciones del CSP (production no permite `cdn.jsdelivr.net`)
 *   - bloqueos del Worker desde Blob URL en iOS Safari standalone
 *   - fallos de CORS cuando el modelo .traineddata no incluye ACAO
 *
 * Modelo de idioma por defecto: español (`spa`).
 */

const DEFAULT_LANGUAGE = 'spa';
const OCR_LOG_PREFIX = '[OCR]';

const TESSERACT_WORKER_PATH = '/tesseract/worker.min.js';
const TESSERACT_CORE_PATH = '/tesseract';
const TESSERACT_LANG_PATH = '/tesseract/lang';

const OCR_ERROR_CODES = Object.freeze({
    UNSUPPORTED: 'unsupported',
    WORKER: 'worker',
    NETWORK: 'network',
    MODEL: 'model',
    UNKNOWN: 'unknown'
});

class OcrError extends Error {
    constructor(code, message, cause) {
        super(message);
        this.name = 'OcrError';
        this.code = code;
        if (cause) this.cause = cause;
    }
}

let workerPromise = null;
let currentLanguage = null;
let progressListeners = new Set();

function isTesseractAvailable() {
    return typeof window !== 'undefined'
        && typeof document !== 'undefined'
        && typeof Worker !== 'undefined';
}

function isOcrLikelySupported() {
    if (!isTesseractAvailable()) return false;
    try {
        const probe = new Worker(
            URL.createObjectURL(new Blob(['self.onmessage=()=>{}'], { type: 'application/javascript' }))
        );
        probe.terminate();
        URL.revokeObjectURL(probe.objectURL || '');
        return true;
    } catch (error) {
        console.warn(OCR_LOG_PREFIX, 'No se pudo instanciar Worker:', error);
        return false;
    }
}

async function loadTesseract() {
    const mod = await import('tesseract.js');
    return mod.default || mod;
}

async function probeTesseractWorker() {
    if (!isOcrLikelySupported()) return false;
    try {
        const tesseract = await loadTesseract();
        const worker = await tesseract.createWorker(DEFAULT_LANGUAGE, 1, {
            workerPath: TESSERACT_WORKER_PATH,
            corePath: TESSERACT_CORE_PATH,
            langPath: TESSERACT_LANG_PATH,
            workerBlobURL: false,
            logger: () => {}
        });
        await worker.terminate();
        return true;
    } catch (error) {
        console.warn(OCR_LOG_PREFIX, 'Probe de worker Tesseract falló:', error);
        return false;
    }
}

let supportProbePromise = null;
async function ensureOcrSupport() {
    if (!isOcrLikelySupported()) return false;
    if (!supportProbePromise) {
        supportProbePromise = probeTesseractWorker().catch(() => false);
    }
    return supportProbePromise;
}

function classifyWorkerError(err) {
    const message = String(err?.message || err || '').toLowerCase();
    if (!message) return OCR_ERROR_CODES.UNKNOWN;
    if (/failed to fetch|networkerror|network request failed|load failed|cors/i.test(message)) {
        return OCR_ERROR_CODES.NETWORK;
    }
    if (/worker|importscripts|blob|security/i.test(message)) {
        return OCR_ERROR_CODES.WORKER;
    }
    if (/traineddata|model|language|404|not found/i.test(message)) {
        return OCR_ERROR_CODES.MODEL;
    }
    return OCR_ERROR_CODES.UNKNOWN;
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
        throw new OcrError(
            OCR_ERROR_CODES.UNSUPPORTED,
            'OCR no disponible en este entorno'
        );
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
            workerPath: TESSERACT_WORKER_PATH,
            corePath: TESSERACT_CORE_PATH,
            langPath: TESSERACT_LANG_PATH,
            workerBlobURL: false,
            logger: (message) => {
                if (!message?.status) return;
                notifyProgress({
                    status: message.status,
                    progress: Number(message.progress ?? 0)
                });
                if (typeof console !== 'undefined') {
                    console.debug(OCR_LOG_PREFIX, message.status, message.progress ?? '');
                }
            },
            errorHandler: (err) => {
                const code = classifyWorkerError(err);
                console.warn(OCR_LOG_PREFIX, 'Error en worker:', err);
                notifyProgress({ status: 'error', progress: 0, code });
            }
        });
        // Configuración optimizada para tickets de recibo: bloque
        // uniforme de texto en lugar del PSM "fully automatic" por
        // defecto (más robusto con fotos de móvil y tickets doblados).
        try {
            await worker.setParameters({
                tessedit_pageseg_mode: '6',
                preserve_interword_spaces: '1'
            });
        } catch (error) {
            console.warn(OCR_LOG_PREFIX, 'No se pudo ajustar PSM:', error);
        }
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
    let worker;
    try {
        worker = await getOcrWorker(language);
        const result = await worker.recognize(source);
        const text = String(result?.data?.text || '').trim();
        const confidence = Number(result?.data?.confidence ?? 0);
        notifyProgress({ status: 'done', progress: 1 });
        return { text, confidence, language };
    } catch (error) {
        const code = error?.code
            || (error instanceof OcrError ? error.code : null)
            || classifyWorkerError(error);
        if (!isTesseractAvailable()) {
            throw new OcrError(
                OCR_ERROR_CODES.UNSUPPORTED,
                'OCR no disponible en este entorno',
                error
            );
        }
        if (code === OCR_ERROR_CODES.WORKER || code === OCR_ERROR_CODES.NETWORK) {
            workerPromise = null;
            currentLanguage = null;
            supportProbePromise = null;
        }
        throw new OcrError(
            code,
            error?.message || 'Error desconocido en OCR',
            error
        );
    }
}

/**
 * Reconoce texto delegando al endpoint server-side `/api/ocr`. Pensado
 * como fallback para navegadores donde Tesseract.js no puede correr
 * localmente (típicamente iOS Safari standalone / WebView restrictivo).
 *
 * El parámetro `source` debe ser una URL http(s) absoluta (por ejemplo
 * la URL de Cloudinary ya subida). La función descarga la imagen en el
 * servidor y devuelve el texto extraído.
 *
 * @param {string} url
 * @param {{ language?: string }} [options]
 * @returns {Promise<{ text: string, confidence: number, language: string, source: 'remote' }>}
 */
export async function recognizeImageRemote(url, options = {}) {
    if (!url || typeof url !== 'string') {
        throw new OcrError(OCR_ERROR_CODES.UNKNOWN, 'recognizeImageRemote requiere una URL http(s)');
    }
    const language = options.language || DEFAULT_LANGUAGE;
    notifyProgress({ status: 'loading model', progress: 0 });
    let response;
    try {
        response = await fetch('/api/ocr', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ url, language })
        });
    } catch (error) {
        throw new OcrError(
            OCR_ERROR_CODES.NETWORK,
            `OCR remoto sin conexión: ${error?.message || error}`,
            error
        );
    }
    if (!response.ok) {
        let detail = `HTTP ${response.status}`;
        try {
            const data = await response.json();
            if (data?.error) detail = data.error;
            if (data?.detail) detail = `${data.error}: ${data.detail}`;
        } catch {}
        const code = response.status >= 500 ? OCR_ERROR_CODES.MODEL : OCR_ERROR_CODES.NETWORK;
        throw new OcrError(code, `OCR remoto falló: ${detail}`);
    }
    let payload;
    try {
        payload = await response.json();
    } catch (error) {
        throw new OcrError(OCR_ERROR_CODES.UNKNOWN, 'OCR remoto devolvió respuesta no-JSON', error);
    }
    notifyProgress({ status: 'done', progress: 1 });
    return {
        text: String(payload?.text || ''),
        confidence: Number(payload?.confidence ?? 0),
        language: String(payload?.language || language),
        source: 'remote'
    };
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
        supported: isOcrLikelySupported(),
        language: currentLanguage || DEFAULT_LANGUAGE,
        ready: Boolean(workerPromise)
    };
}

/**
 * Probe pesado (carga el módulo Tesseract e intenta crear el worker).
 * Se usa en la UI antes de mostrar el primer ticket para no declarar
 * "no soportado" en navegadores donde el probe rápido falla pero el
 * worker real sí funciona (caso típico de iOS Safari standalone).
 *
 * @returns {Promise<boolean>}
 */
export { ensureOcrSupport };

export { isOcrLikelySupported, OcrError, OCR_ERROR_CODES };
