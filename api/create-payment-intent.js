import Stripe from 'stripe';

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST');
    res.status(405).json({ error: 'Method not allowed' });
    return;
  }

  const stripePrivateKey = process.env.STRIPE_PRIVATE;

  if (!stripePrivateKey) {
    res.status(500).json({ error: 'STRIPE_PRIVATE key not configured' });
    return;
  }

  const stripe = new Stripe(stripePrivateKey);

  try {
    const { amount, currency = 'usd', planName } = req.body;

    if (!amount || amount <= 0) {
      res.status(400).json({ error: 'Invalid amount' });
      return;
    }

    const paymentIntent = await stripe.paymentIntents.create({
      amount,
      currency,
      metadata: { planName },
      automatic_payment_methods: { enabled: true },
    });

    res.status(200).json({ clientSecret: paymentIntent.client_secret });
  } catch (error) {
    console.error('Stripe error:', error);
    res.status(500).json({ error: error.message });
  }
}
