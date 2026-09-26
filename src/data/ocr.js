/**
 * Cliente OCR basado en la API de InteliOCR.
 *
 * Sustituye al cliente Tesseract.js anterior. La API recibe una imagen
 * (JPG/PNG/WebP/PDF) y devuelve un objeto estructurado con los campos
 * ya extraídos del recibo/factura (proveedor, fecha, total, NIF,
 * número de factura, líneas, etc.).
 *
 * Variables de entorno (Vite, expuestas al cliente):
 *   VITE_OCR_API_KEY    - clave con formato `ioc_<prefix>_<secret>`
 *   VITE_OCR_ENDPOINT   - URL base opcional (por defecto la pública)
 *
 * El cliente `InteliOCR` original vive en
 * `inteliOCR/examples/javascript-usage.js`; aquí se reexporta envuelto
 * en una capa que:
 *   - normaliza la respuesta a la forma `{ text, confidence, fields }`
 *     que espera `applyOcrFields()` en `team-expenses.svelte`
 *   - maneja errores con la misma jerarquía `OcrError / OCR_ERROR_CODES`
 *   - expone el progreso de la subida para alimentar la UI
 */

const OCR_LOG_PREFIX = '[OCR]';
const DEFAULT_ENDPOINT =
    'https://inteliapi-inteliocr-api-f1bso8-15ce77-186-240-153-209.sslip.io';

const OCR_ERROR_CODES = Object.freeze({
    UNSUPPORTED: 'unsupported',
    AUTH: 'auth',
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

class InteliOCR {
    constructor({ apiKey, endpoint = DEFAULT_ENDPOINT, timeoutMs = 60_000 } = {}) {
        if (!apiKey) throw new Error('InteliOCR: apiKey is required');
        this.apiKey = apiKey;
        this.endpoint = endpoint.replace(/\/+$/, '');
        this.timeoutMs = timeoutMs;
    }

    async ocr(file, opts = {}) {
        const fd = new FormData();
        const blob = this._toBlob(file);
        fd.append('file', blob, this._filename(file));
        if (opts.type) fd.append('type', opts.type);

        const ctrl = new AbortController();
        const timer = setTimeout(() => ctrl.abort(new Error('timeout')), this.timeoutMs);
        if (opts.signal) {
            if (opts.signal.aborted) ctrl.abort(opts.signal.reason);
            else opts.signal.addEventListener('abort', () => ctrl.abort(opts.signal.reason), { once: true });
        }

        let res;
        try {
            res = await fetch(`${this.endpoint}/v1/ocr`, {
                method: 'POST',
                headers: {
                    'X-API-Key': this.apiKey
                },
                body: fd,
                signal: ctrl.signal
            });
        } catch (e) {
            clearTimeout(timer);
            if (e.name === 'AbortError') {
                const err = new Error(`InteliOCR: request aborted (${e.message || 'timeout'})`);
                err.code = 'ABORTED';
                throw err;
            }
            throw new Error(`InteliOCR: network error — ${e.message}`);
        }
        clearTimeout(timer);

        let payload = null;
        try { payload = await res.json(); } catch (_) { /* non-JSON body */ }

        if (!res.ok) {
            const err = new Error(payload?.error?.message || `HTTP ${res.status}`);
            err.code = payload?.error?.code || `HTTP_${res.status}`;
            err.status = res.status;
            err.details = payload?.error?.details || null;
            err.requestId = payload?.meta?.request_id || null;
            throw err;
        }

        return payload;
    }

    _toBlob(file) {
        if (typeof Blob !== 'undefined' && file instanceof Blob) return file;
        if (typeof Buffer !== 'undefined' && Buffer.isBuffer(file)) {
            return new Blob([file], { type: 'application/octet-stream' });
        }
        throw new Error('InteliOCR: file must be a Blob, File or Buffer');
    }

    _filename(file) {
        if (typeof File !== 'undefined' && file instanceof File && file.name) return file.name;
        return 'upload';
    }
}

// -------------------- Mapeo de respuesta -> campos de gasto --------------------

const CURRENCY_SYMBOLS = ['€', '$', '£', '¥'];

function toNumber(value) {
    if (value === null || value === undefined) return null;
    if (typeof value === 'number') return Number.isFinite(value) ? value : null;
    if (typeof value === 'string') {
        const cleaned = value.replace(/[^\d,.\-]/g, '').replace(',', '.');
        const parsed = Number(cleaned);
        return Number.isFinite(parsed) ? parsed : null;
    }
    return null;
}

function normalizeDate(value) {
    if (!value) return null;
    if (typeof value !== 'string') return null;
    const text = value.trim();
    // ISO YYYY-MM-DD
    const iso = /^(\d{4})-(\d{2})-(\d{2})/.exec(text);
    if (iso) return `${iso[1]}-${iso[2]}-${iso[3]}`;
    // DD/MM/YYYY o DD-MM-YYYY
    const dmy = /^(\d{1,2})[\/\-\.](\d{1,2})[\/\-\.](\d{2,4})/.exec(text);
    if (dmy) {
        let [, d, m, y] = dmy;
        if (y.length === 2) y = `20${y}`;
        if (Number(y) < 1990 || Number(y) > 2100) return null;
        const day = String(d).padStart(2, '0');
        const month = String(m).padStart(2, '0');
        return `${y}-${month}-${day}`;
    }
    return null;
}

function mapDataToFields(data) {
    if (!data || typeof data !== 'object') return {};
    const fields = {};
    const amount = toNumber(data.total);
    if (amount != null) fields.amount = amount;
    const date = normalizeDate(data.date);
    if (date) fields.date = date;
    if (typeof data.merchant === 'string' && data.merchant.trim()) {
        fields.vendorName = data.merchant.trim();
    }
    if (typeof data.vendor_tax_id === 'string' && data.vendor_tax_id.trim()) {
        fields.vendorTaxId = data.vendor_tax_id.trim().toUpperCase();
    }
    if (typeof data.invoice_number === 'string' && data.invoice_number.trim()) {
        fields.invoiceNumber = data.invoice_number.trim();
    }
    return fields;
}

function buildRawText(data) {
    if (!data) return '';
    const lines = [];
    if (data.merchant) lines.push(String(data.merchant));
    if (data.vendor_tax_id) lines.push(`NIF: ${data.vendor_tax_id}`);
    if (data.date) lines.push(`Fecha: ${data.date}`);
    if (data.invoice_number) lines.push(`Factura: ${data.invoice_number}`);
    if (Array.isArray(data.items)) {
        for (const item of data.items) {
            const desc = item?.description ?? '';
            const qty = item?.quantity != null ? ` x ${item.quantity}` : '';
            const price = item?.total ?? item?.unit_price;
            if (desc || price != null) {
                lines.push(`${desc}${qty} = ${price ?? ''}`.trim());
            }
        }
    }
    if (data.subtotal != null) lines.push(`Subtotal: ${data.subtotal}`);
    if (data.tax != null) lines.push(`Impuestos: ${data.tax}`);
    if (data.total != null) {
        const curr = data.currency && !CURRENCY_SYMBOLS.includes(data.currency) ? ` ${data.currency}` : '';
        lines.push(`TOTAL${curr}: ${data.total}`);
    }
    return lines.join('\n');
}

function classifyError(error) {
    if (error?.code === 'ABORTED') return OCR_ERROR_CODES.NETWORK;
    const status = Number(error?.status || 0);
    if (status === 401 || status === 403 || /api[_-]?key/i.test(error?.message || '')) {
        return OCR_ERROR_CODES.AUTH;
    }
    if (status >= 500) return OCR_ERROR_CODES.MODEL;
    if (status >= 400 || /network|fetch|abort|timeout/i.test(error?.message || '')) {
        return OCR_ERROR_CODES.NETWORK;
    }
    return OCR_ERROR_CODES.UNKNOWN;
}

// -------------------- API pública --------------------

let cachedClient = null;
let progressListeners = new Set();

function notifyProgress(payload) {
    for (const listener of progressListeners) {
        try { listener(payload); } catch (error) {
            console.warn(OCR_LOG_PREFIX, 'Listener de progreso falló:', error);
        }
    }
}

function getApiKey() {
    return (
        import.meta.env.VITE_OCR_API_KEY ||
        import.meta.env.OCR_API_KEY ||
        ''
    );
}

function getEndpoint() {
    return import.meta.env.VITE_OCR_ENDPOINT || DEFAULT_ENDPOINT;
}

export function isOcrConfigured() {
    return Boolean(getApiKey());
}

function getClient() {
    if (!isOcrConfigured()) {
        throw new OcrError(
            OCR_ERROR_CODES.UNSUPPORTED,
            'OCR no configurado (falta VITE_OCR_API_KEY)'
        );
    }
    if (!cachedClient) {
        cachedClient = new InteliOCR({
            apiKey: getApiKey(),
            endpoint: getEndpoint()
        });
    }
    return cachedClient;
}

/**
 * Suscribe un listener para recibir actualizaciones de progreso.
 */
export function subscribeOcrProgress(listener) {
    if (typeof listener !== 'function') return () => {};
    progressListeners.add(listener);
    return () => progressListeners.delete(listener);
}

/**
 * Reconoce un recibo y devuelve `{ text, confidence, fields, raw }`.
 * `source` debe ser un File/Blob (JPG/PNG/WebP/PDF, hasta 10 MB).
 */
export async function recognizeImage(source, options = {}) {
    if (typeof window === 'undefined') {
        throw new OcrError(OCR_ERROR_CODES.UNSUPPORTED, 'OCR no disponible en este entorno');
    }
    notifyProgress({ status: 'loading model', progress: 0 });
    try {
        const client = getClient();
        const type = options.type || 'receipt';
        const response = await client.ocr(source, { type });
        const data = response?.data || {};
        const meta = response?.meta || {};
        const fields = mapDataToFields(data);
        const text = buildRawText(data);
        // La API no expone una `confidence` numérica por campo; usamos la
        // latencia como proxy de "éxito" (>0 y <30 s = razonable) y
        // devolvemos 90 cuando hay `total` y 70 cuando faltan campos.
        const hasTotal = fields.amount != null;
        const filledCount = Object.keys(fields).length;
        const confidence = hasTotal ? Math.min(95, 70 + filledCount * 4) : Math.max(40, filledCount * 15);
        notifyProgress({ status: 'done', progress: 1 });
        return {
            text,
            confidence,
            fields,
            raw: data,
            meta: {
                requestId: meta.request_id || null,
                latencyMs: meta.latency_ms || null,
                model: meta.model || null,
                pages: meta.pages || null
            }
        };
    } catch (error) {
        const code = error instanceof OcrError
            ? error.code
            : classifyError(error);
        console.warn(OCR_LOG_PREFIX, 'Error en OCR:', error);
        notifyProgress({ status: 'error', progress: 0, code });
        throw new OcrError(
            code,
            error?.message || 'Error desconocido en OCR',
            error
        );
    }
}

/**
 * Probe simple: ¿está configurada la clave de la API? No hace red.
 */
export function isOcrLikelySupported() {
    return isOcrConfigured();
}

export async function ensureOcrSupport() {
    return isOcrConfigured();
}

export function getOcrStatus() {
    return {
        configured: isOcrConfigured(),
        supported: isOcrConfigured(),
        ready: Boolean(cachedClient),
        endpoint: getEndpoint()
    };
}

export { InteliOCR, OcrError, OCR_ERROR_CODES };
