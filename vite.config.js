import { defineConfig, loadEnv } from 'vite'
import { svelte } from '@sveltejs/vite-plugin-svelte'

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

// https://vite.dev/config/
export default defineConfig({
  plugins: [svelte(), stripeApiPlugin()],
})
