/**
 * Cliente OCR para el navegador.
 *
 * El navegador NO contiene la clave de InteliOCR: habla exclusivamente
 * con el endpoint serverless `/api/ocr`, que añade la cabecera
 * `X-API-Key` y reenvía la imagen al upstream.
 *
 * El endpoint devuelve la respuesta cruda de InteliOCR
 * (`{ success, data, meta }`); aquí la mapeamos a la forma
 * `{ text, confidence, fields, raw, meta }` que espera
 * `applyOcrFields()` en `team-expenses.svelte`.
 *
 * Variables de entorno del servidor (NO expuestas al cliente):
 *   OCR_API_KEY    - clave InteliOCR (`ioc_<prefix>_<secret>`)
 *   OCR_ENDPOINT   - URL base opcional
 *
 * El cliente `InteliOCR` ya no se usa directamente desde el navegador.
 */

const OCR_LOG_PREFIX = '[OCR]';
const OCR_ENDPOINT_PATH = '/api/ocr';

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

function classifyError(status, message) {
    if (status === 401 || status === 403) return OCR_ERROR_CODES.AUTH;
    if (status === 404 || status === 405) return OCR_ERROR_CODES.MODEL;
    if (status >= 500 || /network|fetch|abort|timeout/i.test(message || '')) {
        return OCR_ERROR_CODES.NETWORK;
    }
    return OCR_ERROR_CODES.UNKNOWN;
}

// -------------------- API pública --------------------

let progressListeners = new Set();

function notifyProgress(payload) {
    for (const listener of progressListeners) {
        try { listener(payload); } catch (error) {
            console.warn(OCR_LOG_PREFIX, 'Listener de progreso falló:', error);
        }
    }
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
 * Reconoce un recibo y devuelve `{ text, confidence, fields, raw, meta }`.
 * `source` debe ser un Blob/File/URL http(s). Si es una URL, el servidor
 * la descarga; si es un Blob, se envía directamente como multipart.
 */
export async function recognizeImage(source, options = {}) {
    if (typeof window === 'undefined') {
        throw new OcrError(OCR_ERROR_CODES.UNSUPPORTED, 'OCR no disponible en este entorno');
    }
    notifyProgress({ status: 'loading model', progress: 0 });
    try {
        const type = options.type || 'receipt';
        const payload = await postToProxy(source, type);
        const data = payload?.data || {};
        const meta = payload?.meta || {};
        const fields = mapDataToFields(data);
        const text = buildRawText(data);
        // La API no expone confidence por campo; calculamos un proxy a
        // partir del número de campos extraídos (con `total` pondera más).
        const hasTotal = fields.amount != null;
        const filledCount = Object.keys(fields).length;
        const confidence = hasTotal
            ? Math.min(95, 70 + filledCount * 4)
            : Math.max(40, filledCount * 15);
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
            : classifyError(error?.status, error?.message);
        console.warn(OCR_LOG_PREFIX, 'Error en OCR:', error);
        notifyProgress({ status: 'error', progress: 0, code });
        throw new OcrError(
            code,
            error?.message || 'Error desconocido en OCR',
            error
        );
    }
}

async function postToProxy(source, type) {
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(new Error('timeout')), 60_000);
    try {
        // Si `source` es una URL http(s), la pasamos como JSON.
        // Si es Blob/File, la enviamos como multipart/form-data directo
        // al proxy (que la reenviará a InteliOCR).
        if (typeof source === 'string') {
            const response = await fetch(OCR_ENDPOINT_PATH, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ url: source, type }),
                signal: ctrl.signal
            });
            return await readJson(response);
        }
        const fd = new FormData();
        fd.append('file', source, source?.name || 'receipt');
        fd.append('type', type);
        const response = await fetch(OCR_ENDPOINT_PATH, {
            method: 'POST',
            body: fd,
            signal: ctrl.signal
        });
        return await readJson(response);
    } catch (error) {
        if (error?.name === 'AbortError') {
            const err = new Error('OCR: petición cancelada por timeout');
            err.code = 'ABORTED';
            throw err;
        }
        if (error instanceof OcrError) throw error;
        const err = new Error(`OCR: error de red — ${error?.message || error}`);
        err.code = 'NETWORK';
        throw err;
    } finally {
        clearTimeout(timer);
    }
}

async function readJson(response) {
    let payload = null;
    try { payload = await response.json(); } catch (_) { /* non-JSON */ }
    if (!response.ok) {
        const err = new Error(payload?.error || `HTTP ${response.status}`);
        err.status = response.status;
        err.code = payload?.code;
        err.requestId = payload?.requestId || null;
        throw err;
    }
    return payload;
}

/**
 * Probe simple: ¿está configurado el OCR? En el cliente esto siempre
 * devuelve `true` si el proxy está disponible — la clave vive solo en
 * el servidor. La comprobación real se hace en tiempo de petición.
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
    return {
        configured: true,
        supported: true,
        ready: true,
        endpoint: OCR_ENDPOINT_PATH
    };
}

export { OcrError, OCR_ERROR_CODES };
