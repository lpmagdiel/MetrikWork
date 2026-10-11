/**
 * Proxy server-side para el servicio público de inteliOCR.
 *
 * POST /api/ocr
 *   application/json:    { "url": "https://res.cloudinary.com/...", "type": "receipt"|"invoice", "lang": "spa"|"eng", "engine": "basic"|"vision"|"auto" }
 *   multipart/form-data: file=<binario JPG/PNG/WebP/PDF>, type, lang, engine
 *
 * El servicio upstream vive en `OCR_ENDPOINT` (por defecto la instancia
 * pública desplegada en Dockploy). NO requiere clave: el endpoint
 * `/health`, `/ocr` y `/basic` son abiertos, con rate-limit por IP.
 *
 *  - `engine=basic` (por defecto): upstream `POST /basic` -> texto crudo
 *    via tesseract.js. Lo parseamos en el servidor con `receiptParser`
 *    para extraer importe, fecha, proveedor, NIF y nº de factura.
 *  - `engine=vision`: upstream `POST /ocr` -> JSON estructurado via
 *    MiniMax Vision. Devolvemos los campos tal cual.
 *  - `engine=auto`: prueba `/ocr` y, si responde 5xx del upstream,
 *    cae automaticamente a `/basic`.
 *
 * Respuestas:
 *   200 { success, data, meta }   - campos normalizados al esquema que
 *                                   espera `src/data/ocr.js` del cliente.
 *   400 cuerpo invalido o formato no soportado.
 *   413 imagen demasiado grande.
 *   502 no se pudo descargar la imagen o el upstream fallo.
 *   504 el upstream agoto el tiempo de espera.
 *   500 error inesperado.
 */

import { parseReceiptText } from '../src/data/receiptParser.js';

const DEFAULT_ENDPOINT =
    'https://inteliapi-inteliocr-api-f1bso8-15ce77-186-240-153-209.sslip.io';

const MAX_IMAGE_BYTES = 15 * 1024 * 1024;
const UPSTREAM_TIMEOUT_MS = 60_000;

const SUPPORTED_ENGINES = new Set(['basic', 'vision', 'auto']);
const SUPPORTED_LANGS = new Set(['spa', 'eng']);
const SUPPORTED_IMAGE_MIME = new Set([
    'image/jpeg', 'image/jpg', 'image/png', 'image/webp', 'application/pdf'
]);

function sendJson(res, status, payload) {
    res.statusCode = status;
    res.setHeader('Content-Type', 'application/json; charset=utf-8');
    res.end(JSON.stringify(payload));
}

async function readJsonBody(req) {
    if (req.body && typeof req.body === 'object' && !Buffer.isBuffer(req.body)) {
        return req.body;
    }
    let total = 0;
    const chunks = [];
    for await (const chunk of req) {
        total += chunk.length;
        if (total > 64 * 1024) throw new Error('BODY_TOO_LARGE');
        chunks.push(chunk);
    }
    const raw = Buffer.concat(chunks, total).toString('utf8');
    return raw ? JSON.parse(raw) : {};
}

function isHttpUrl(value) {
    if (typeof value !== 'string') return false;
    try {
        const parsed = new URL(value);
        return parsed.protocol === 'https:' || parsed.protocol === 'http:';
    } catch {
        return false;
    }
}

function normalizeContentType(contentType) {
    const ct = String(contentType || '').toLowerCase().split(';')[0].trim();
    if (!ct) return 'application/octet-stream';
    if (ct === 'image/jpg') return 'image/jpeg';
    return ct;
}

function extensionFromContentType(contentType) {
    const ct = normalizeContentType(contentType);
    if (ct === 'image/jpeg') return '.jpg';
    if (ct === 'image/webp') return '.webp';
    if (ct === 'image/png') return '.png';
    if (ct === 'application/pdf') return '.pdf';
    if (ct.includes('heic')) return '.heic';
    if (ct.includes('heif')) return '.heif';
    return '.bin';
}

function sanitizeEngine(value, fallback = 'basic') {
    const candidate = String(value || '').toLowerCase().trim();
    return SUPPORTED_ENGINES.has(candidate) ? candidate : fallback;
}

function sanitizeLang(value, fallback = 'spa') {
    const candidate = String(value || '').toLowerCase().trim();
    return SUPPORTED_LANGS.has(candidate) ? candidate : fallback;
}

function withTimeout(promise, ms, label) {
    return new Promise((resolve, reject) => {
        const timer = setTimeout(() => {
            reject(Object.assign(new Error(`${label} timeout after ${ms}ms`), { code: 'TIMEOUT' }));
        }, ms);
        promise.then(
            (value) => { clearTimeout(timer); resolve(value); },
            (error) => { clearTimeout(timer); reject(error) }
        );
    });
}

function okEnvelope(data, meta = {}) {
    return {
        success: true,
        data,
        meta: {
            timestamp: new Date().toISOString(),
            ...meta
        }
    };
}

function errorEnvelope(code, message, extras = {}) {
    return {
        success: false,
        error: { code, message, ...extras },
        meta: { timestamp: new Date().toISOString() }
    };
}

// -------------------- Construccion del multipart para el upstream --------------------

function buildMultipart({ buffer, contentType, filename, type, lang }) {
    const boundary = `----metricwork${Date.now().toString(36)}${Math.random().toString(36).slice(2, 8)}`;
    const enc = (str) => Buffer.from(str, 'utf8');
    const parts = [
        enc(`--${boundary}\r\n`),
        enc(`Content-Disposition: form-data; name="file"; filename="${filename}"\r\n`),
        enc(`Content-Type: ${normalizeContentType(contentType)}\r\n\r\n`),
        buffer,
        enc('\r\n')
    ];
    if (type) {
        parts.push(
            enc(`--${boundary}\r\n`),
            enc(`Content-Disposition: form-data; name="type"\r\n\r\n`),
            enc(type),
            enc('\r\n')
        );
    }
    if (lang) {
        parts.push(
            enc(`--${boundary}\r\n`),
            enc(`Content-Disposition: form-data; name="lang"\r\n\r\n`),
            enc(lang),
            enc('\r\n')
        );
    }
    parts.push(enc(`--${boundary}--\r\n`));
    return { boundary, body: Buffer.concat(parts) };
}

// -------------------- Mapeo a la forma esperada por el cliente --------------------

/**
 * Convierte los campos crudos del receiptParser (amount, vendorName, ...)
 * al esquema del upstream /ocr (total, merchant, ...) para que
 * `src/data/ocr.js` siga funcionando sin cambios.
 */
function textFieldsToStructured(parsedFields) {
    if (!parsedFields) return {};
    const out = {};
    if (parsedFields.amount != null) out.total = parsedFields.amount;
    if (parsedFields.date) out.date = parsedFields.date;
    if (parsedFields.vendorName) out.merchant = parsedFields.vendorName;
    if (parsedFields.vendorTaxId) out.vendor_tax_id = parsedFields.vendorTaxId;
    if (parsedFields.invoiceNumber) out.invoice_number = parsedFields.invoiceNumber;
    if (parsedFields.category) out.suggested_category = parsedFields.category;
    out.extra = {};
    return out;
}

function buildUnifiedData({ structuredData, rawText, language, engine, pages, items }) {
    const data = { ...(structuredData || {}) };
    if (rawText) data.text = rawText;
    if (language) data.language = language;
    if (engine) data.engine = engine;
    if (pages) data.pages = pages;
    if (Array.isArray(items) && items.length) data.items = items;
    return data;
}

// -------------------- Llamadas al upstream --------------------

async function callUpstream({ endpoint, routePath, buffer, contentType, filename, type, lang }) {
    const { boundary, body } = buildMultipart({ buffer, contentType, filename, type, lang });
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), UPSTREAM_TIMEOUT_MS);
    try {
        const response = await fetch(`${endpoint}${routePath}`, {
            method: 'POST',
            headers: {
                'Content-Type': `multipart/form-data; boundary=${boundary}`,
                'Content-Length': String(body.length)
            },
            body,
            signal: controller.signal
        });
        let payload = null;
        try { payload = await response.json(); } catch (_) { /* non-JSON */ }
        return { response, payload };
    } catch (error) {
        if (error?.name === 'AbortError' || error?.code === 'TIMEOUT') {
            const err = new Error(`upstream timeout after ${UPSTREAM_TIMEOUT_MS}ms`);
            err.code = 'TIMEOUT';
            throw err;
        }
        throw error;
    } finally {
        clearTimeout(timer);
    }
}

/**
 * Ejecuta el OCR con el engine solicitado. Devuelve `{ data, meta, status, upstream }`
 * donde `status` es el HTTP del upstream para poder distinguir fallos
 * recuperables (5xx) al hacer `engine=auto`.
 */
async function runEngine({ engine, endpoint, buffer, contentType, filename, type, lang }) {
    const start = Date.now();
    const tryOrder = engine === 'auto'
        ? ['vision', 'basic']
        : [engine];

    let lastError = null;
    for (const candidate of tryOrder) {
        const routePath = candidate === 'vision' ? '/ocr' : '/basic';
        let result;
        try {
            result = await callUpstream({
                endpoint,
                routePath,
                buffer,
                contentType,
                filename,
                type,
                lang
            });
        } catch (error) {
            lastError = { error, route: routePath };
            // Solo seguimos probando el siguiente motor si el motor
            // elegido era `auto` y el fallo fue del tipo "no
            // contactable" / timeout. Para 4xx (formato invalido, etc.)
            // no tiene sentido caer al otro motor.
            continue;
        }

        const { response, payload } = result;
        if (!response.ok) {
            const upstreamCode = payload?.error?.code || `HTTP_${response.status}`;
            // Solo auto-fallback cuando el upstream devuelve 5xx real
            // (p. ej. configuracion rota del modelo vision). 4xx son
            // errores de cliente que tambien romperan en /basic.
            const fallbackEligible = engine === 'auto' && response.status >= 500;
            if (!fallbackEligible) {
                return {
                    status: response.status,
                    upstreamCode,
                    payload,
                    meta: { attempted: candidate, elapsed_ms: Date.now() - start }
                };
            }
            lastError = {
                error: new Error(`upstream ${candidate} -> ${upstreamCode}`),
                route: routePath,
                status: response.status,
                upstreamCode
            };
            continue;
        }

        return {
            status: 200,
            payload,
            meta: {
                attempted: candidate,
                elapsed_ms: Date.now() - start,
                upstream_status: response.status
            }
        };
    }
    // Agotamos todos los intentos sin exito.
    if (lastError?.error) {
        const err = lastError.error;
        return {
            status: lastError.status && lastError.status >= 500 ? 504 : 502,
            upstreamCode: lastError.upstreamCode || 'UPSTREAM_ERROR',
            errorMessage: err.message || 'upstream error',
            meta: { attempted: engine, elapsed_ms: Date.now() - start }
        };
    }
    return {
        status: 502,
        upstreamCode: 'UPSTREAM_ERROR',
        errorMessage: 'upstream error',
        meta: { attempted: engine, elapsed_ms: Date.now() - start }
    };
}

// -------------------- Normalizacion final --------------------

async function resolveInputs(req) {
    const contentType = String(req.headers['content-type'] || '').toLowerCase();
    if (contentType.includes('multipart/form-data')) {
        const file = await readMultipartFile(req);
        if (!file?.buffer) return { error: { status: 400, body: errorEnvelope('MISSING_FILE', 'Falta el campo "file" en el multipart') } };
        return {
            buffer: file.buffer,
            contentType: file.contentType,
            filename: file.filename,
            type: file.fields.type || 'receipt',
            lang: file.fields.lang,
            engine: file.fields.engine
        };
    }

    let body;
    try {
        body = await readJsonBody(req);
    } catch (error) {
        return { error: { status: 400, body: errorEnvelope('INVALID_BODY', error.message || 'JSON inválido') } };
    }

    const { url, type, lang, engine } = body;
    if (!isHttpUrl(url)) {
        return { error: { status: 400, body: errorEnvelope('MISSING_FILE', 'Falta una URL http(s) válida en el campo "url"') } };
    }
    const downloaded = await downloadFromUrl(url);
    if (downloaded.error) return { error: downloaded.error };

    return {
        buffer: downloaded.buffer,
        contentType: downloaded.contentType,
        filename: downloaded.filename,
        type: type || 'receipt',
        lang,
        engine
    };
}

async function readMultipartFile(req) {
    // Vercel / runtime serverless normalmente parsea multipart antes
    // de llegar aqui, pero algunos entornos lo dejan crudo. Soportamos
    // ambos casos para que el contrato sea estable.
    if (req.body && typeof req.body === 'object' && !Buffer.isBuffer(req.body)) {
        const file = req.body.file;
        if (!file) return null;
        const buffer = Buffer.isBuffer(file) ? file : (file?.buffer || Buffer.from(file));
        return {
            buffer,
            contentType: req.body.contentType || file?.mimetype || 'image/jpeg',
            filename: req.body.filename || file?.originalname || 'receipt',
            fields: req.body
        };
    }

    let total = 0;
    const chunks = [];
    for await (const chunk of req) {
        total += chunk.length;
        if (total > 64 * 1024 * 1024) {
            throw new Error('BODY_TOO_LARGE');
        }
        chunks.push(chunk);
    }
    const raw = Buffer.concat(chunks, total);
    const contentType = String(req.headers['content-type'] || '').toLowerCase();
    const boundaryMatch = contentType.match(/boundary=(?:"([^"]+)"|([^;]+))/i);
    if (!boundaryMatch) return null;
    const boundary = `--${boundaryMatch[1] || boundaryMatch[2]}`;
    return parseMultipart(raw, boundary);
}

function parseMultipart(buffer, boundary) {
    const segments = buffer.toString('binary').split(boundary);
    const fields = {};
    let fileEntry = null;
    for (const segment of segments) {
        if (!segment || segment === '--\r\n' || segment === '--') continue;
        const headerEnd = segment.indexOf('\r\n\r\n');
        if (headerEnd < 0) continue;
        const rawHeaders = segment.slice(0, headerEnd);
        const body = segment.slice(headerEnd + 4).replace(/\r\n$/, '');
        const nameMatch = rawHeaders.match(/name="([^"]+)"/i);
        const filenameMatch = rawHeaders.match(/filename="([^"]*)"/i);
        const contentTypeMatch = rawHeaders.match(/Content-Type:\s*([^\r\n]+)/i);
        if (!nameMatch) continue;
        const name = nameMatch[1];
        if (filenameMatch) {
            fileEntry = {
                buffer: Buffer.from(body, 'binary'),
                contentType: contentTypeMatch ? contentTypeMatch[1].trim() : 'application/octet-stream',
                filename: filenameMatch[1] || 'receipt'
            };
        } else {
            fields[name] = body;
        }
    }
    if (!fileEntry) return null;
    return { ...fileEntry, fields };
}

async function downloadFromUrl(url) {
    try {
        const response = await fetch(url);
        if (!response.ok) {
            return {
                error: {
                    status: 502,
                    body: errorEnvelope('IMAGE_FETCH_FAILED', `No se pudo descargar la imagen (HTTP ${response.status})`)
                }
            };
        }
        const contentType = response.headers.get('content-type') || 'image/jpeg';
        if (!SUPPORTED_IMAGE_MIME.has(normalizeContentType(contentType))) {
            return {
                error: {
                    status: 415,
                    body: errorEnvelope('UNSUPPORTED_FORMAT', `Formato no soportado por el OCR: ${contentType}`)
                }
            };
        }
        const arrayBuffer = await response.arrayBuffer();
        if (arrayBuffer.byteLength > MAX_IMAGE_BYTES) {
            return {
                error: {
                    status: 413,
                    body: errorEnvelope('FILE_TOO_LARGE', 'Imagen demasiado grande (máx 15 MB)')
                }
            };
        }
        const ext = extensionFromContentType(contentType);
        let filename = 'receipt';
        try {
            const parsed = new URL(url);
            const base = parsed.pathname.split('/').pop() || 'receipt';
            filename = /\.[a-z0-9]+$/i.test(base) ? base : `${base}${ext}`;
        } catch {
            filename = `receipt${ext}`;
        }
        return {
            buffer: Buffer.from(arrayBuffer),
            contentType,
            filename
        };
    } catch (error) {
        console.error('[api/ocr] descarga de imagen fallida:', error);
        return {
            error: {
                status: 502,
                body: errorEnvelope('IMAGE_FETCH_FAILED', 'No se pudo descargar la imagen')
            }
        };
    }
}

// -------------------- Handler --------------------

export default async function handler(req, res) {
    if (req.method !== 'POST') {
        res.setHeader('Allow', 'POST');
        return sendJson(res, 405, errorEnvelope('METHOD_NOT_ALLOWED', 'Método no permitido', { allowed: ['POST'] }));
    }

    const endpoint = (process.env.OCR_ENDPOINT || DEFAULT_ENDPOINT).replace(/\/+$/, '');
    const defaultEngine = sanitizeEngine(process.env.OCR_ENGINE, 'basic');
    const defaultLang = sanitizeLang(process.env.OCR_LANG, 'spa');

    const inputs = await resolveInputs(req);
    if (inputs.error) return sendJson(res, inputs.error.status, inputs.error.body);

    const engine = sanitizeEngine(inputs.engine, defaultEngine);
    const lang = sanitizeLang(inputs.lang, defaultLang);
    const type = sanitizeType(inputs.type);

    let result;
    try {
        result = await runEngine({
            engine,
            endpoint,
            buffer: inputs.buffer,
            contentType: inputs.contentType,
            filename: inputs.filename,
            type,
            lang
        });
    } catch (error) {
        console.error('[api/ocr] error inesperado en el proxy:', error);
        const status = error?.code === 'TIMEOUT' ? 504 : 502;
        return sendJson(res, status, errorEnvelope(
            error?.code === 'TIMEOUT' ? 'OCR_TIMEOUT' : 'OCR_PROVIDER_ERROR',
            error?.message || 'upstream error'
        ));
    }

    if (result.status !== 200) {
        const code = result.upstreamCode || 'OCR_PROVIDER_ERROR';
        const message = result.payload?.error?.message || result.errorMessage || `HTTP ${result.status}`;
        const httpStatus = result.status === 504 ? 504 : 502;
        return sendJson(res, httpStatus, errorEnvelope(code, message, {
            engine: result.meta?.attempted || engine
        }));
    }

    const upstreamData = result.payload?.data || {};
    const upstreamMeta = result.payload?.meta || {};

    let structuredData = {};
    let rawText = '';
    let outEngine = upstreamData.engine || result.meta?.attempted || engine;
    let outLang = upstreamData.language || lang;
    let pages = upstreamData.pages || upstreamMeta.pages || 1;

    if (outEngine === 'tesseract.js' || outEngine === 'basic') {
        rawText = upstreamData.text || '';
        const parsed = parseReceiptText(rawText);
        structuredData = textFieldsToStructured(parsed.fields);
        structuredData.raw_text = rawText;
        structuredData.parser_summary = parsed.summary;
    } else {
        // /ocr -> ya viene estructurado, lo dejamos tal cual.
        structuredData = { ...upstreamData };
        if (upstreamData.text) rawText = upstreamData.text;
    }

    const data = buildUnifiedData({
        structuredData,
        rawText,
        language: outLang,
        engine: outEngine,
        pages,
        items: structuredData.items
    });

    const meta = {
        request_id: upstreamMeta.request_id || null,
        timestamp: upstreamMeta.timestamp || new Date().toISOString(),
        latency_ms: upstreamMeta.latency_ms ?? result.meta?.elapsed_ms ?? null,
        model: upstreamMeta.model || null,
        pages,
        engine: outEngine,
        language: outLang,
        finish_reason: upstreamMeta.finish_reason || 'stop'
    };

    return sendJson(res, 200, okEnvelope(data, meta));
}

function sanitizeType(value) {
    const v = String(value || '').toLowerCase().trim();
    if (v === 'invoice') return 'invoice';
    if (v === 'receipt') return 'receipt';
    return undefined;
}
