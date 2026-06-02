import { defineConfig, loadEnv } from 'vite'
import { svelte } from '@sveltejs/vite-plugin-svelte'
import { VitePWA } from 'vite-plugin-pwa'

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
        const { default: handler } = await import(modulePath);
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
      mountApiHandler(server, '/api/send-push-notification', './api/send-push-notification.js', 'Push notification');
      mountApiHandler(server, '/api/send-reminders', './api/send-reminders.js', 'Reminder');
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
    },
    plugins: [
      svelte(),
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
          globPatterns: ['**/*.{js,css,html,ico,png,svg,webp}'],
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
    }
  };
})
