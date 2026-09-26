import { defineConfig, loadEnv } from 'vite'
import { svelte } from '@sveltejs/vite-plugin-svelte'
import { VitePWA } from 'vite-plugin-pwa'
import { resolve } from 'node:path'
import { pathToFileURL } from 'node:url'
import { copyFile, mkdir, stat } from 'node:fs/promises'
import { existsSync } from 'node:fs'
import https from 'node:https'

const TESSERACT_LANG = 'spa'
// El CDN tessdata.projectnaptha.com ya no aloja los modelos. Usamos el
// repositorio oficial de Tesseract OCR (tessdata_fast) en GitHub raw.
const TESSERACT_TRAINEDDATA_URL =
    `https://raw.githubusercontent.com/tesseract-ocr/tessdata_fast/main/${TESSERACT_LANG}.traineddata`
const TESSERACT_TRAINEDDATA_LOCAL = `public/tesseract/lang/${TESSERACT_LANG}.traineddata`

function tesseractAssetsPlugin() {
    const coreDir = resolve(
        process.cwd(),
        'node_modules/tesseract.js-core'
    )
    const workerSrc = resolve(
        process.cwd(),
        'node_modules/tesseract.js/dist/worker.min.js'
    )
    const targetDir = resolve(process.cwd(), 'public/tesseract')

    async function ensureDir(dir) {
        if (!existsSync(dir)) await mkdir(dir, { recursive: true })
    }

    async function copyIfMissing(src, dest) {
        try {
            await stat(dest)
        } catch {
            await copyFile(src, dest)
        }
    }

    async function copyAllAssets() {
        if (!existsSync(coreDir)) {
            console.warn('[tesseract-assets] tesseract.js-core no está instalado; se omiten los assets.')
            return
        }
        if (!existsSync(workerSrc)) {
            console.warn('[tesseract-assets] tesseract.js/dist/worker.min.js no encontrado.')
            return
        }
        await ensureDir(targetDir)
        await ensureDir(resolve(targetDir, 'lang'))
        await copyIfMissing(workerSrc, resolve(targetDir, 'worker.min.js'))
        const coreFiles = [
            'tesseract-core.wasm',
            'tesseract-core.wasm.js',
            'tesseract-core-simd.wasm',
            'tesseract-core-simd.wasm.js',
            'tesseract-core-simd-lstm.wasm',
            'tesseract-core-simd-lstm.wasm.js',
            'tesseract-core-lstm.wasm',
            'tesseract-core-lstm.wasm.js'
        ]
        for (const file of coreFiles) {
            const src = resolve(coreDir, file)
            if (!existsSync(src)) continue
            await copyIfMissing(src, resolve(targetDir, file))
        }
        await fetchTraineddata()
    }

    function fetchTraineddata() {
        const localDest = resolve(process.cwd(), TESSERACT_TRAINEDDATA_LOCAL)
        if (existsSync(localDest)) return Promise.resolve()
        return new Promise((resolveFetch) => {
            const request = https.get(TESSERACT_TRAINEDDATA_URL, (response) => {
                if (response.statusCode === 301 || response.statusCode === 302) {
                    https.get(response.headers.location, (redirected) => writeStream(redirected, localDest, resolveFetch))
                        .on('error', () => resolveFetch())
                    return
                }
                if (response.statusCode !== 200) {
                    console.warn('[tesseract-assets] No se pudo descargar el modelo de idioma (HTTP ' + response.statusCode + ').')
                    response.resume()
                    resolveFetch()
                    return
                }
                writeStream(response, localDest, resolveFetch)
            })
            request.on('error', (error) => {
                console.warn('[tesseract-assets] Falló la descarga del modelo de idioma:', error.message)
                resolveFetch()
            })
        })
    }

    async function writeStream(response, dest, done) {
        const fs = await import('node:fs')
        const stream = fs.createWriteStream(dest)
        response.pipe(stream)
        stream.on('finish', () => stream.close(() => done()))
        stream.on('error', () => done())
    }

    return {
        name: 'tesseract-assets',
        async buildStart() {
            await copyAllAssets()
        },
        async configureServer(server) {
            await copyAllAssets()
            const fs = await import('node:fs')
            server.middlewares.use('/tesseract', (req, res, next) => {
                const url = req.url.split('?')[0]
                const candidates = [
                    resolve(targetDir, url === '/' ? 'worker.min.js' : url.slice(1)),
                    resolve(coreDir, url.slice(1))
                ]
                for (const candidate of candidates) {
                    if (existsSync(candidate)) {
                        res.setHeader('Cache-Control', 'public, max-age=31536000, immutable')
                        fs.createReadStream(candidate).pipe(res)
                        return
                    }
                }
                next()
            })
        }
    }
}

function cloudinaryApiPlugin() {
  let cloudName, apiKey, apiSecret;

  return {
    name: 'cloudinary-api',
    configResolved(config) {
      const env = loadEnv('', config.root, '');
      cloudName = env.CLOUDINARY_CLOUD_NAME;
      apiKey = env.CLOUDINARY_API_PUBLIC || env.CLOUDINARY_API_KEY;
      apiSecret = env.CLOUDINARY_API_SECRET;
    },
    configureServer(server) {
      server.middlewares.use('/api/delete-cloudinary', async (req, res) => {
        if (req.method !== 'POST') {
          res.statusCode = 405;
          res.end(JSON.stringify({ error: 'Method not allowed' }));
          return;
        }

        let body = '';
        for await (const chunk of req) body += chunk;
        const { publicId } = JSON.parse(body);

        if (!cloudName || !apiKey || !apiSecret) {
          res.statusCode = 500;
          res.setHeader('Content-Type', 'application/json');
          res.end(JSON.stringify({ error: 'Cloudinary credentials not configured in .env' }));
          return;
        }

        try {
          const timestamp = Math.round(new Date().getTime() / 1000);
          const crypto = await import('node:crypto');
          
          // Generate signature: public_id=...&timestamp=...API_SECRET
          const str = `public_id=${publicId}&timestamp=${timestamp}${apiSecret}`;
          const signature = crypto.createHash('sha1').update(str).digest('hex');

          const formData = new URLSearchParams();
          formData.append('public_id', publicId);
          formData.append('timestamp', timestamp.toString());
          formData.append('api_key', apiKey);
          formData.append('signature', signature);

          const response = await fetch(`https://api.cloudinary.com/v1_1/${cloudName}/image/destroy`, {
            method: 'POST',
            body: formData,
          });

          const result = await response.json();
          res.setHeader('Content-Type', 'application/json');
          res.end(JSON.stringify(result));
        } catch (error) {
          console.error('Cloudinary delete error:', error);
          res.statusCode = 500;
          res.setHeader('Content-Type', 'application/json');
          res.end(JSON.stringify({ error: error.message }));
        }
      });
    },
  };
}

function pushNotificationApiPlugin() {
  async function readJsonBody(req, res) {
    let body = '';
    for await (const chunk of req) body += chunk;

    try {
      req.body = body ? JSON.parse(body) : {};
      return true;
    } catch {
      res.statusCode = 400;
      res.setHeader('Content-Type', 'application/json');
      res.end(JSON.stringify({ error: 'Invalid JSON' }));
      return false;
    }
  }

  function mountApiHandler(server, route, modulePath, label) {
    server.middlewares.use(route, async (req, res) => {
      if (!(await readJsonBody(req, res))) return;

      try {
        const { default: handler } = await import(/* @vite-ignore */ modulePath);
        await handler(req, res);
      } catch (error) {
        console.error(`${label} API error:`, error);
        if (!res.headersSent) {
          res.statusCode = 500;
          res.setHeader('Content-Type', 'application/json');
          res.end(JSON.stringify({ error: error.message || 'Internal server error' }));
        }
      }
    });
  }

  function mountRawBodyApiHandler(server, route, modulePath, label) {
    server.middlewares.use(route, async (req, res) => {
      try {
        const { default: handler } = await import(/* @vite-ignore */ modulePath);
        await handler(req, res);
      } catch (error) {
        console.error(`${label} API error:`, error);
        if (!res.headersSent) {
          res.statusCode = 500;
          res.setHeader('Content-Type', 'application/json');
          res.end(JSON.stringify({ error: error.message || 'Internal server error' }));
        }
      }
    });
  }

  return {
    name: 'push-notification-api',
    configResolved(config) {
      const env = loadEnv('', config.root, '');
      Object.entries(env).forEach(([key, value]) => {
        if (typeof process.env[key] === 'undefined') {
          process.env[key] = value;
        }
      });
    },
    configureServer(server) {
      const apiModuleUrl = (filename) =>
        pathToFileURL(resolve(server.config.root, 'api', filename)).href;

      mountApiHandler(
        server,
        '/api/send-push-notification',
        apiModuleUrl('send-push-notification.js'),
        'Push notification'
      );
      mountApiHandler(
        server,
        '/api/send-reminders',
        apiModuleUrl('send-reminders.js'),
        'Reminder'
      );
      mountRawBodyApiHandler(
        server,
        '/api/heic-convert',
        apiModuleUrl('heic-convert.js'),
        'HEIC convert'
      );
      mountApiHandler(
        server,
        '/api/ocr',
        apiModuleUrl('ocr.js'),
        'OCR'
      );
    },
  };
}

// https://vite.dev/config/
export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), '');

  return {
    build: {
      sourcemap: true,
      rollupOptions: {
        output: {
          manualChunks(id) {
            if (!id.includes('node_modules')) return;
            if (id.includes('/firebase/') || id.includes('/@firebase/')) return 'firebase';
            if (id.includes('/svelte/') || id.includes('/svelte@')) return 'svelte';
            if (id.includes('/lucide') || id.includes('/lucide-svelte')) return 'icons';
            return 'vendor';
          }
        }
      }
    },
    define: {
      'import.meta.env.CLOUDINARY_CLOUD_NAME': JSON.stringify(
        env.CLOUDINARY_CLOUD_NAME || 'lpzmagdiel'
      ),
      'import.meta.env.CLOUDINARY_PRESET': JSON.stringify(
        env.CLOUDINARY_PRESET || 'MetricWork'
      ),
      'import.meta.env.CLOUDINARY_PRESET_AVATAR': JSON.stringify(
        env.CLOUDINARY_PRESET_AVATAR || 'MetricWorkProfile'
      ),
      'import.meta.env.CLOUDINARY_PRESET_TEAM': JSON.stringify(
        env.CLOUDINARY_PRESET_TEAM || env.CLOUDINARY_PRESET_AVATAR || 'MetricWorkProfile'
      ),
      'import.meta.env.CLOUDINARY_PRESET_INVENTARY': JSON.stringify(
        env.CLOUDINARY_PRESET_INVENTARY || 'MetricWorkInventary'
      ),
      'import.meta.env.CLOUDINARY_PRESET_GALLERY': JSON.stringify(
        env.CLOUDINARY_PRESET_GALLERY || env.CLOUDINARY_PRESET || 'MetricWork'
      ),
    },
    plugins: [
      svelte(),
      tesseractAssetsPlugin(),
      VitePWA({
        registerType: 'autoUpdate',
        includeAssets: [
          'icon.png',
          'icons/android/launchericon-192x192.png',
          'icons/android/launchericon-512x512.png'
        ],
        manifest: {
          name: 'MetricWork',
          short_name: 'MetricWork',
          description: 'Gestión de jornadas, tareas y equipos para operarios de campo.',
          theme_color: '#e3654e',
          background_color: '#ffffff',
          display: 'standalone',
          start_url: '/',
          lang: 'es',
          icons: [
            {
              src: '/icons/android/launchericon-192x192.png',
              sizes: '192x192',
              type: 'image/png'
            },
            {
              src: '/icons/android/launchericon-512x512.png',
              sizes: '512x512',
              type: 'image/png'
            },
            {
              src: '/icons/android/launchericon-512x512.png',
              sizes: '512x512',
              type: 'image/png',
              purpose: 'maskable'
            }
          ]
        },
        workbox: {
          cleanupOutdatedCaches: true,
          navigateFallback: '/index.html',
          // Evita que el fallback SPA se aplique a endpoints de Firebase.
          // Si Workbox los tratara como navegaciones devolvería index.html
          // y rompería las conexiones HTTP/2 streaming de Firestore.
          navigateFallbackDenylist: [
            /^\/api\//,
            /^https:\/\/firestore\.googleapis\.com\//,
            /^https:\/\/fcm\.googleapis\.com\//,
            /^https:\/\/fcmregistrations\.googleapis\.com\//,
            /^https:\/\/identitytoolkit\.googleapis\.com\//,
            /^https:\/\/securetoken\.googleapis\.com\//,
            /^https:\/\/firebasestorage\.googleapis\.com\//
          ],
          globPatterns: ['**/*.{js,css,html,ico,png,svg,webp}'],
          // Los `.wasm` de Tesseract no se precachean (varios MB cada
          // uno): se cachean bajo demanda con la regla `CacheFirst`
          // definida más abajo para `/tesseract/*`.
          globIgnores: ['**/*.wasm', '**/*.wasm.js'],
          runtimeCaching: [
            {
              urlPattern: ({ url, request }) => (
                request.destination === 'image' &&
                url.origin === self.location.origin
              ),
              handler: 'CacheFirst',
              options: {
                cacheName: 'metricwork-local-images',
                cacheableResponse: {
                  statuses: [200]
                },
                expiration: {
                  maxEntries: 80,
                  maxAgeSeconds: 60 * 60 * 24 * 30
                }
              }
            },
            {
              urlPattern: ({ url, request }) => (
                request.destination === 'image' &&
                url.origin === 'https://res.cloudinary.com'
              ),
              handler: 'CacheFirst',
              options: {
                cacheName: 'metricwork-cloudinary-images',
                cacheableResponse: {
                  statuses: [0, 200]
                },
                expiration: {
                  maxEntries: 120,
                  maxAgeSeconds: 60 * 60 * 24 * 30
                }
              }
            },
            // Activos de Tesseract.js servidos por la propia PWA
            // (`/tesseract/*`). El core WASM y el modelo de idioma se
            // self-hostean para evitar restricciones de CSP, fallos de
            // CORS y bloqueos del Worker en iOS Safari standalone.
            {
              urlPattern: ({ url }) => (
                url.origin === self.location.origin &&
                url.pathname.startsWith('/tesseract/')
              ),
              handler: 'CacheFirst',
              options: {
                cacheName: 'metricwork-ocr-core',
                cacheableResponse: { statuses: [0, 200] },
                expiration: {
                  maxEntries: 32,
                  maxAgeSeconds: 60 * 60 * 24 * 365
                }
              }
            },
            // Las peticiones a Firebase usan HTTP/2 streaming (canales
            // /Write/channel) que los Service Workers no pueden cachear.
            // Las dejamos pasar tal cual con NetworkOnly para evitar el
            // error "A ServiceWorker intercepted the request and encountered
            // an unexpected error".
            {
              urlPattern: ({ url }) => (
                url.hostname === 'firestore.googleapis.com' ||
                url.hostname === 'fcm.googleapis.com' ||
                url.hostname === 'fcmregistrations.googleapis.com' ||
                url.hostname === 'identitytoolkit.googleapis.com' ||
                url.hostname === 'securetoken.googleapis.com' ||
                url.hostname === 'firebasestorage.googleapis.com'
              ),
              handler: 'NetworkOnly',
              method: 'GET'
            },
            {
              urlPattern: ({ url }) => (
                url.hostname === 'firestore.googleapis.com' ||
                url.hostname === 'fcm.googleapis.com' ||
                url.hostname === 'fcmregistrations.googleapis.com' ||
                url.hostname === 'identitytoolkit.googleapis.com' ||
                url.hostname === 'securetoken.googleapis.com' ||
                url.hostname === 'firebasestorage.googleapis.com'
              ),
              handler: 'NetworkOnly',
              method: 'POST'
            }
          ]
        },
        devOptions: {
          enabled: false
        }
      }),
      cloudinaryApiPlugin(),
      pushNotificationApiPlugin()
    ],
    server: {
      historyApiFallback: true,
      watch: {
        // Evita que el servidor de desarrollo falle cuando VS Code agota
        // el limite de observadores inotify de Linux.
        usePolling: process.platform === 'linux',
        interval: 300
      }
    }
  };
})
