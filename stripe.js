/**
 * SLOPSHOP STRIPE INTEGRATION
 *
 * Real payment processing. Mounts onto Express app.
 * Requires: STRIPE_SECRET_KEY and STRIPE_WEBHOOK_SECRET env vars.
 *
 * Flow:
 *   1. User calls POST /v1/checkout { amount: 10000 }
 *   2. Server creates Stripe Checkout session
 *   3. User pays on Stripe-hosted page
 *   4. Stripe sends webhook to POST /v1/stripe/webhook
 *   5. Server adds credits to user's API key
 *
 * Usage: require('./stripe')(app, db, apiKeys, persistKey)
 */

module.exports = function mountStripe(app, db, apiKeys, persistKey) {
  const STRIPE_KEY = process.env.STRIPE_SECRET_KEY;
  const WEBHOOK_SECRET = process.env.STRIPE_WEBHOOK_SECRET;

  if (!STRIPE_KEY) {
    console.log('  💳 Stripe: NOT CONFIGURED (set STRIPE_SECRET_KEY to enable real payments)');

    // Stub endpoints that explain what's needed
    app.post('/v1/checkout', (req, res) => {
      res.status(503).json({
        error: {
          code: 'payments_not_configured',
          message: 'Real payments require STRIPE_SECRET_KEY. Set it and restart.',
          setup: {
            step1: 'Create account at https://dashboard.stripe.com',
            step2: 'Get your secret key from Developers → API Keys',
            step3: 'Set STRIPE_SECRET_KEY=sk_test_... and restart server',
          },
        },
      });
    });
    app.get('/v1/payments', (req, res) => {
      res.json({
        status: 'payments_not_configured',
        tiers: { 1000: '$9', 10000: '$49', 100000: '$299', 1000000: '$1,999' },
        setup: 'Set STRIPE_SECRET_KEY env var to enable real payments',
      });
    });
    return;
  }

  const stripe = require('stripe')(STRIPE_KEY);
  const BASE_URL = process.env.BASE_URL || 'https://slopshop.gg';

  // Credit tier → Stripe price mapping
  const TIERS = {
    1000:   { price_cents: 900,    name: 'Baby Lobster - 1K Credits',    credits: 1000 },
    10000:  { price_cents: 4900,   name: 'Shore Crawler - 10K Credits',  credits: 10000 },
    100000: { price_cents: 29900,  name: 'Reef Boss - 100K Credits',     credits: 100000 },
    1000000:{ price_cents: 199900, name: 'Leviathan - 1M Credits',       credits: 1000000 },
  };

  // Create Checkout session
  app.post('/v1/checkout', async (req, res) => {
    const auth = req.headers.authorization;
    if (!auth || !auth.startsWith('Bearer ')) {
      return res.status(401).json({ error: { code: 'auth_required' } });
    }
    const apiKey = auth.slice(7);
    const acct = apiKeys.get(apiKey);
    if (!acct) return res.status(401).json({ error: { code: 'invalid_key' } });

    const amount = req.body.amount;
    const tier = TIERS[amount];
    if (!tier) {
      return res.status(400).json({
        error: { code: 'invalid_amount', valid_amounts: Object.keys(TIERS).map(Number) },
      });
    }

    try {
      const session = await stripe.checkout.sessions.create({
        payment_method_types: ['card'],
        line_items: [{
          price_data: {
            currency: 'usd',
            product_data: { name: tier.name, description: `${tier.credits.toLocaleString()} Slopshop credits` },
            unit_amount: tier.price_cents,
          },
          quantity: 1,
        }],
        mode: 'payment',
        success_url: `${BASE_URL}/?payment=success&credits=${tier.credits}`,
        cancel_url: `${BASE_URL}/?payment=cancelled`,
        metadata: {
          api_key: apiKey,
          credits: String(tier.credits),
          tier_name: tier.name,
        },
      });

      res.json({
        checkout_url: session.url,
        session_id: session.id,
        amount: tier.credits,
        price_usd: tier.price_cents / 100,
      });
    } catch (e) {
      res.status(500).json({ error: { code: 'stripe_error', message: e.message } });
    }
  });

  // Stripe webhook handler
  app.post('/v1/stripe/webhook', require('express').raw({ type: 'application/json' }), (req, res) => {
    let event;
    try {
      if (WEBHOOK_SECRET) {
        event = stripe.webhooks.constructEvent(req.body, req.headers['stripe-signature'], WEBHOOK_SECRET);
      } else {
        event = JSON.parse(req.body);
      }
    } catch (e) {
      return res.status(400).json({ error: 'Webhook signature verification failed' });
    }

    if (event.type === 'checkout.session.completed') {
      const session = event.data.object;
      const apiKey = session.metadata.api_key;
      const credits = parseInt(session.metadata.credits);

      const acct = apiKeys.get(apiKey);
      if (acct) {
        acct.balance += credits;
        acct.tier = credits >= 1000000 ? 'leviathan' : credits >= 100000 ? 'reef-boss' : credits >= 10000 ? 'shore-crawler' : 'baby-lobster';
        persistKey(apiKey);
        console.log(`💳 Payment: +${credits} credits to ${apiKey.slice(0, 15)}...`);
      }
    }

    res.json({ received: true });
  });

  // Get payment history (from Stripe)
  app.get('/v1/payments', async (req, res) => {
    const auth = req.headers.authorization;
    if (!auth || !auth.startsWith('Bearer ')) return res.status(401).json({ error: { code: 'auth_required' } });

    try {
      // Return basic info - full payment history would need customer mapping
      res.json({
        payment_methods: ['card'],
        tiers: Object.entries(TIERS).map(([amount, t]) => ({
          credits: t.credits,
          price_usd: t.price_cents / 100,
          name: t.name,
        })),
        checkout_endpoint: 'POST /v1/checkout { "amount": 10000 }',
      });
    } catch (e) {
      res.status(500).json({ error: e.message });
    }
  });

  console.log('  💳 Stripe: CONFIGURED (real payments enabled)');
};
