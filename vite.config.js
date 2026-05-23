import { defineConfig, loadEnv } from 'vite'
import { svelte } from '@sveltejs/vite-plugin-svelte'
import { VitePWA } from 'vite-plugin-pwa'

function stripeApiPlugin() {
  let stripePrivateKey;

  return {
    name: 'stripe-api',
    configResolved(config) {
      // Load all env vars (including non-VITE_ prefixed ones)
      const env = loadEnv('', config.root, '');
      stripePrivateKey = env.STRIPE_PRIVATE;
    },
    configureServer(server) {
      server.middlewares.use('/api/create-payment-intent', async (req, res) => {
        if (req.method !== 'POST') {
          res.statusCode = 405;
          res.setHeader('Content-Type', 'application/json');
          res.end(JSON.stringify({ error: 'Method not allowed' }));
          return;
        }

        // Parse body
        let body = '';
        for await (const chunk of req) {
          body += chunk;
        }

        let parsed;
        try {
          parsed = JSON.parse(body);
        } catch {
          res.statusCode = 400;
          res.setHeader('Content-Type', 'application/json');
          res.end(JSON.stringify({ error: 'Invalid JSON' }));
          return;
        }

        const { amount, currency = 'usd', planName } = parsed;

        if (!amount || amount <= 0) {
          res.statusCode = 400;
          res.setHeader('Content-Type', 'application/json');
          res.end(JSON.stringify({ error: 'Invalid amount' }));
          return;
        }

        if (!stripePrivateKey) {
          res.statusCode = 500;
          res.setHeader('Content-Type', 'application/json');
          res.end(JSON.stringify({ error: 'STRIPE_PRIVATE key not configured' }));
          return;
        }

        try {
          const Stripe = (await import('stripe')).default;
          const stripe = new Stripe(stripePrivateKey);

          const paymentIntent = await stripe.paymentIntents.create({
            amount,
            currency,
            metadata: { planName },
            automatic_payment_methods: { enabled: true },
          });

          res.setHeader('Content-Type', 'application/json');
          res.end(JSON.stringify({ clientSecret: paymentIntent.client_secret }));
        } catch (error) {
          console.error('Stripe error:', error);
          res.statusCode = 500;
          res.setHeader('Content-Type', 'application/json');
          res.end(JSON.stringify({ error: error.message }));
        }
      });
    },
  };
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
      server.middlewares.use('/api/send-push-notification', async (req, res) => {
        let body = '';
        for await (const chunk of req) body += chunk;

        try {
          req.body = body ? JSON.parse(body) : {};
        } catch {
          res.statusCode = 400;
          res.setHeader('Content-Type', 'application/json');
          res.end(JSON.stringify({ error: 'Invalid JSON' }));
          return;
        }

        try {
          const { default: handler } = await import('./api/send-push-notification.js');
          await handler(req, res);
        } catch (error) {
          console.error('Push notification API error:', error);
          if (!res.headersSent) {
            res.statusCode = 500;
            res.setHeader('Content-Type', 'application/json');
            res.end(JSON.stringify({ error: error.message || 'Internal server error' }));
          }
        }
      });
    },
  };
}

// https://vite.dev/config/
export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), '');

  return {
    build: {
      sourcemap: true
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
          navigateFallback: '/index.html',
          globPatterns: ['**/*.{js,css,html,ico,png,svg,webp}'],
          runtimeCaching: [
            {
              urlPattern: ({ request }) => request.destination === 'image',
              handler: 'CacheFirst',
              options: {
                cacheName: 'metricwork-images',
                expiration: {
                  maxEntries: 80,
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
      stripeApiPlugin(),
      cloudinaryApiPlugin(),
      pushNotificationApiPlugin()
    ],
    server: {
      historyApiFallback: true,
    }
  };
})
