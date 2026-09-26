/**
 * OCR server-side (fallback para dispositivos donde Tesseract.js no
 * puede ejecutarse en el navegador: iOS Safari standalone, WebViews
 * restrictivos, navegadores muy antiguos).
 *
 * POST /api/ocr
 *   Content-Type: application/json
 *   { "url": "https://res.cloudinary.com/...", "language": "spa" }
 *
 * Respuestas:
 *   200 { text, confidence, language }
 *   400 si falta `url` o la URL no es http(s)
 *   502 si la descarga de la imagen falla
 *   500 si Tesseract no puede procesar la imagen
 *
 * La primera invocación de cada instancia tarda ~5-8 s en cargar el
 * core WASM + modelo de idioma. Las invocaciones siguientes reutilizan
 * el worker cacheado.
 *
 * El modelo `spa.traineddata` se sirve desde `api/_assets/lang/` para
 * que Vercel lo incluya en el bundle de la función (la ruta
 * `tessdata.projectnaptha.com` quedó caída).
 */

import { createWorker } from 'tesseract.js';
import { resolve, dirname, extname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { mkdir, writeFile, stat, readFile, unlink } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { randomUUID } from 'node:crypto';

const __dirname = dirname(fileURLToPath(import.meta.url));
const LANG_DIR = resolve(__dirname, '_assets', 'lang');
const CACHE_DIR = resolve(tmpdir(), 'tesseract-cache');

const MAX_IMAGE_BYTES = 20 * 1024 * 1024;
const INIT_TIMEOUT_MS = 30_000;
const RECOGNIZE_TIMEOUT_MS = 30_000;

function sendJson(res, status, payload) {
    res.statusCode = status;
    res.setHeader('Content-Type', 'application/json; charset=utf-8');
    res.end(JSON.stringify(payload));
}

async function readJsonBody(req) {
    // En producción (Vercel) el body aún no se ha leído.
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

async function ensureCacheDir() {
    if (!existsSync(CACHE_DIR)) await mkdir(CACHE_DIR, { recursive: true });
}

let workerPromise = null;
let workerLanguage = null;

async function getWorker(language) {
    if (workerPromise && workerLanguage === language) return workerPromise;
    if (workerPromise) {
        try {
            const old = await workerPromise;
            await old.terminate();
        } catch {}
        workerPromise = null;
        workerLanguage = null;
    }
    await ensureCacheDir();
    workerLanguage = language;
    workerPromise = (async () => {
        // Validamos que el .traineddata esté presente para fallar rápido
        // con un mensaje claro si falta en el despliegue.
        const langFile = resolve(LANG_DIR, `${language}.traineddata`);
        try {
            await stat(langFile);
        } catch {
            throw new Error(`Modelo de idioma no desplegado: ${language}`);
        }
        const worker = await createWorker(language, 1, {
            langPath: LANG_DIR,
            cachePath: CACHE_DIR,
            cacheMethod: 'write',
            gzip: false,
            logger: (message) => {
                if (message?.status) {
                    console.log('[api/ocr]', message.status, message.progress ?? '');
                }
            },
            errorHandler: (err) => {
                console.warn('[api/ocr] error en worker:', err?.message || err);
            }
        });
        await worker.setParameters({
            tessedit_pageseg_mode: '6',
            preserve_interword_spaces: '1'
        });
        return worker;
    })();
    return workerPromise;
}

export default async function handler(req, res) {
    if (req.method !== 'POST') {
        res.setHeader('Allow', 'POST');
        return sendJson(res, 405, { error: 'Method not allowed' });
    }

    let body;
    try {
        body = await readJsonBody(req);
    } catch (error) {
        return sendJson(res, 400, { error: error.message || 'JSON inválido' });
    }

    const { url, language: requestedLanguage } = body;
    const language = requestedLanguage || 'spa';

    if (!isHttpUrl(url)) {
        return sendJson(res, 400, { error: 'Falta una URL http(s) válida en el campo "url"' });
    }

    let imageBuffer;
    let contentType = '';
    try {
        const imageResponse = await fetch(url);
        if (!imageResponse.ok) {
            return sendJson(res, 502, { error: `No se pudo descargar la imagen (HTTP ${imageResponse.status})` });
        }
        contentType = String(imageResponse.headers.get('content-type') || '').toLowerCase();
        const arrayBuffer = await imageResponse.arrayBuffer();
        if (arrayBuffer.byteLength > MAX_IMAGE_BYTES) {
            return sendJson(res, 413, { error: 'Imagen demasiado grande (máx 20 MB)' });
        }
        imageBuffer = Buffer.from(arrayBuffer);
    } catch (error) {
        console.error('[api/ocr] descarga de imagen fallida:', error);
        return sendJson(res, 502, { error: 'No se pudo descargar la imagen' });
    }

    try {
        const worker = await withTimeout(getWorker(language), INIT_TIMEOUT_MS, 'init');
        // Tesseract.js Node usa `worker.recognize(path)` donde path es
        // una ruta absoluta. Guardamos el buffer en /tmp y pasamos la
        // ruta. La extensión se deduce del Content-Type si está
        // disponible, por defecto `.png`.
        await ensureCacheDir();
        let ext = '.png';
        if (contentType.includes('jpeg') || contentType.includes('jpg')) ext = '.jpg';
        else if (contentType.includes('webp')) ext = '.webp';
        else if (contentType.includes('png')) ext = '.png';
        else if (contentType.includes('heic')) ext = '.heic';
        else if (contentType.includes('heif')) ext = '.heif';
        const tmpFile = resolve(CACHE_DIR, `receipt-${randomUUID()}${ext}`);
        await writeFile(tmpFile, imageBuffer);
        let result;
        try {
            result = await withTimeout(worker.recognize(tmpFile), RECOGNIZE_TIMEOUT_MS, 'recognize');
        } finally {
            unlink(tmpFile).catch(() => {});
        }
        const text = String(result?.data?.text || '').trim();
        const confidence = Number(result?.data?.confidence ?? 0);
        return sendJson(res, 200, { text, confidence, language });
    } catch (error) {
        console.error('[api/ocr] reconocimiento fallido:', error);
        // Si Tesseract falló por idioma/corpus, descartamos el worker
        // cacheado para que el siguiente intento lo reintente limpio.
        workerPromise = null;
        workerLanguage = null;
        return sendJson(res, 500, {
            error: 'No se pudo procesar la imagen',
            detail: error?.message || 'unknown'
        });
    }
}
