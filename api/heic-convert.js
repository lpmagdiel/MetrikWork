/**
 * Convierte una imagen HEIC/HEIF (formato nativo del iPhone) a JPEG.
 *
 * POST /api/heic-convert
 *   multipart/form-data con campo "file"
 *
 * Respuestas:
 *   200 { buffer: <JPEG bytes>, contentType: "image/jpeg" }
 *   400 si falta el archivo o el formato no es HEIC/HEIF
 *   500 si falla la conversión
 *
 * Se usa desde `src/data/fileHelper.js#convertHeicToJpeg()`.
 */

import heicConvert from 'heic-convert';

const MAX_INPUT_BYTES = 20 * 1024 * 1024;

function sendJson(res, status, payload) {
    res.statusCode = status;
    res.setHeader('Content-Type', 'application/json');
    res.end(JSON.stringify(payload));
}

async function readRawBody(req) {
    const chunks = [];
    let total = 0;
    for await (const chunk of req) {
        total += chunk.length;
        if (total > MAX_INPUT_BYTES) {
            throw new Error('FILE_TOO_LARGE');
        }
        chunks.push(chunk);
    }
    return Buffer.concat(chunks, total);
}

function parseMultipart(buffer, contentType) {
    const boundaryMatch = /boundary=(?:(?:"([^"]+)")|([^;]+))/i.exec(contentType || '');
    if (!boundaryMatch) throw new Error('INVALID_MULTIPART');
    const boundary = `--${boundaryMatch[1] || boundaryMatch[2]}`;
    const parts = [];
    let cursor = 0;
    while (cursor < buffer.length) {
        const headerEnd = buffer.indexOf(`${boundary}\r\n`, cursor);
        if (headerEnd === -1) break;
        const headerStart = headerEnd + boundary.length + 2;
        const bodyStart = buffer.indexOf('\r\n\r\n', headerStart);
        if (bodyStart === -1) break;
        const bodyEnd = buffer.indexOf(`\r\n${boundary}`, bodyStart + 4);
        const partEnd = bodyEnd === -1 ? buffer.length : bodyEnd;
        const headerBlock = buffer.slice(headerStart, bodyStart).toString('utf8');
        const body = buffer.slice(bodyStart + 4, partEnd);
        parts.push({ headers: headerBlock, body });
        cursor = partEnd;
    }
    return parts;
}

export default async function handler(req, res) {
    if (req.method !== 'POST') {
        res.setHeader('Allow', 'POST');
        return sendJson(res, 405, { error: 'Method not allowed' });
    }

    const contentType = String(req.headers['content-type'] || '');
    if (!contentType.toLowerCase().startsWith('multipart/form-data')) {
        return sendJson(res, 400, { error: 'Se esperaba multipart/form-data' });
    }

    let raw;
    try {
        raw = await readRawBody(req);
    } catch (error) {
        if (error.message === 'FILE_TOO_LARGE') {
            return sendJson(res, 413, { error: 'Archivo demasiado grande (máx 20 MB)' });
        }
        return sendJson(res, 400, { error: 'No se pudo leer el archivo' });
    }

    let parts;
    try {
        parts = parseMultipart(raw, contentType);
    } catch {
        return sendJson(res, 400, { error: 'multipart/form-data inválido' });
    }

    const filePart = parts.find((part) =>
        /filename=/i.test(part.headers) && /Content-Type:\s*image\//i.test(part.headers)
    );
    if (!filePart) {
        return sendJson(res, 400, { error: 'Falta el campo "file" con la imagen' });
    }

    const filenameMatch = /filename=(?:"([^"]+)"|([^;\r\n]+))/i.exec(filePart.headers);
    const filename = (filenameMatch && (filenameMatch[1] || filenameMatch[2])) || 'image.heic';

    try {
        const jpegBuffer = Buffer.from(await heicConvert({
            buffer: filePart.body,
            format: 'JPEG',
            quality: 0.9
        }));
        res.statusCode = 200;
        res.setHeader('Content-Type', 'image/jpeg');
        res.setHeader('Content-Length', String(jpegBuffer.length));
        res.setHeader('X-Original-Filename', encodeURIComponent(filename));
        res.end(jpegBuffer);
    } catch (error) {
        console.error('[api/heic-convert] conversión fallida:', error);
        return sendJson(res, 500, {
            error: 'No se pudo convertir la imagen HEIC',
            detail: error?.message || 'unknown'
        });
    }
}
