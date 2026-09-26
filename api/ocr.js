/**
 * Proxy server-side para InteliOCR.
 *
 * POST /api/ocr
 *   { "url": "https://res.cloudinary.com/...", "type": "receipt" | "invoice" }
 *
 * La clave de InteliOCR (`OCR_API_KEY`) vive solo en el servidor: el
 * cliente nunca la ve. Este endpoint:
 *   1. Descarga la imagen desde la URL proporcionada (ya subida a
 *      Cloudinary por el cliente).
 *   2. La reenvía como multipart/form-data a InteliOCR con la cabecera
 *      `X-API-Key`.
 *   3. Devuelve la respuesta de InteliOCR tal cual.
 *
 * Respuestas:
 *   200 { success, data, meta }   - respuesta de InteliOCR
 *   400 falta `url` o URL no http(s)
 *   502 error descargando la imagen
 *   500 OCR_API_KEY no configurado o error inesperado en upstream
 */

const DEFAULT_ENDPOINT =
    'https://inteliapi-inteliocr-api-f1bso8-15ce77-186-240-153-209.sslip.io';
const MAX_IMAGE_BYTES = 15 * 1024 * 1024;
const UPSTREAM_TIMEOUT_MS = 60_000;

function sendJson(res, status, payload) {
    res.statusCode = status;
    res.setHeader('Content-Type', 'application/json; charset=utf-8');
    res.end(JSON.stringify(payload));
}

async function readJsonBody(req) {
    if (req.body && typeof req.body === 'object') return req.body;
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

function extensionFromContentType(contentType) {
    const ct = String(contentType || '').toLowerCase();
    if (ct.includes('jpeg') || ct.includes('jpg')) return '.jpg';
    if (ct.includes('webp')) return '.webp';
    if (ct.includes('png')) return '.png';
    if (ct.includes('pdf')) return '.pdf';
    if (ct.includes('heic')) return '.heic';
    if (ct.includes('heif')) return '.heif';
    return '.bin';
}

function withTimeout(promise, ms, label) {
    return new Promise((resolve, reject) => {
        const timer = setTimeout(() => {
            reject(new Error(`${label} timeout after ${ms}ms`));
        }, ms);
        promise.then(
            (value) => { clearTimeout(timer); resolve(value); },
            (error) => { clearTimeout(timer); reject(error); }
        );
    });
}

export default async function handler(req, res) {
    if (req.method !== 'POST') {
        res.setHeader('Allow', 'POST');
        return sendJson(res, 405, { error: 'Method not allowed' });
    }

    const apiKey = process.env.OCR_API_KEY;
    if (!apiKey) {
        return sendJson(res, 500, { error: 'OCR_API_KEY no configurado en el servidor' });
    }
    const endpoint = (process.env.OCR_ENDPOINT || DEFAULT_ENDPOINT).replace(/\/+$/, '');

    let body;
    try {
        body = await readJsonBody(req);
    } catch (error) {
        return sendJson(res, 400, { error: error.message || 'JSON inválido' });
    }

    const { url, type } = body;
    if (!isHttpUrl(url)) {
        return sendJson(res, 400, { error: 'Falta una URL http(s) válida en el campo "url"' });
    }

    // 1) Descargar la imagen desde Cloudinary.
    let imageBuffer;
    let contentType = '';
    try {
        const imageResponse = await fetch(url);
        if (!imageResponse.ok) {
            return sendJson(res, 502, {
                error: `No se pudo descargar la imagen (HTTP ${imageResponse.status})`
            });
        }
        contentType = imageResponse.headers.get('content-type') || '';
        const arrayBuffer = await imageResponse.arrayBuffer();
        if (arrayBuffer.byteLength > MAX_IMAGE_BYTES) {
            return sendJson(res, 413, { error: 'Imagen demasiado grande (máx 15 MB)' });
        }
        imageBuffer = Buffer.from(arrayBuffer);
    } catch (error) {
        console.error('[api/ocr] descarga de imagen fallida:', error);
        return sendJson(res, 502, { error: 'No se pudo descargar la imagen' });
    }

    // 2) Reenviar a InteliOCR como multipart/form-data.
    const ext = extensionFromContentType(contentType);
    const boundary = `----metricwork${Date.now().toString(36)}${Math.random().toString(36).slice(2, 8)}`;
    const parts = [];
    const enc = (str) => Buffer.from(str, 'utf8');

    parts.push(
        enc(`--${boundary}\r\n`),
        enc(`Content-Disposition: form-data; name="file"; filename="receipt${ext}"\r\n`),
        enc(`Content-Type: ${contentType || 'application/octet-stream'}\r\n\r\n`),
        imageBuffer,
        enc('\r\n')
    );
    if (type) {
        parts.push(
            enc(`--${boundary}\r\n`),
            enc(`Content-Disposition: form-data; name="type"\r\n\r\n`),
            enc(type),
            enc('\r\n')
        );
    }
    parts.push(enc(`--${boundary}--\r\n`));
    const bodyBuffer = Buffer.concat(parts);

    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), UPSTREAM_TIMEOUT_MS);

    let upstreamResponse;
    try {
        upstreamResponse = await fetch(`${endpoint}/v1/ocr`, {
            method: 'POST',
            headers: {
                'X-API-Key': apiKey,
                'Content-Type': `multipart/form-data; boundary=${boundary}`,
                'Content-Length': String(bodyBuffer.length)
            },
            body: bodyBuffer,
            signal: ctrl.signal
        });
    } catch (error) {
        clearTimeout(timer);
        console.error('[api/ocr] upstream fetch falló:', error);
        return sendJson(res, 502, {
            error: 'No se pudo contactar con el servicio de OCR',
            detail: error?.message || 'unknown'
        });
    }
    clearTimeout(timer);

    let payload = null;
    try { payload = await upstreamResponse.json(); } catch (_) { /* non-JSON */ }

    if (!upstreamResponse.ok) {
        const message = payload?.error?.message || `HTTP ${upstreamResponse.status}`;
        const code = payload?.error?.code || `HTTP_${upstreamResponse.status}`;
        // 401/403 del upstream -> auth
        const status = (upstreamResponse.status === 401 || upstreamResponse.status === 403) ? 401 : 502;
        return sendJson(res, status, {
            error: `OCR upstream: ${message}`,
            code,
            requestId: payload?.meta?.request_id || null
        });
    }

    return sendJson(res, 200, payload);
}
