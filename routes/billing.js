// routes/billing.js — Stripe checkout for credit packs
'use strict';

const PACKS = {
  baby:       { credits: 1_000,     amount: 900,    name: 'Baby Lobster — 1K Credits' },
  lobster:    { credits: 10_000,    amount: 4900,   name: 'Lobster — 10K Credits' },
  big:        { credits: 100_000,   amount: 29900,  name: 'Big Lobster — 100K Credits' },
  tank:       { credits: 1_000_000, amount: 199900, name: 'Lobster Tank — 1M Credits' },
};

module.exports = function(app, db, apiKeys) {
  const stripeKey = process.env.STRIPE_SECRET_KEY;
  if (!stripeKey) {
    console.warn('[billing] STRIPE_SECRET_KEY not set — billing routes disabled');
    return;
  }

  const Stripe = require('stripe');
  const stripe = Stripe(stripeKey);

  const baseUrl = process.env.BASE_URL || 'https://slopshop.gg';

  // Schema
  try {
    db.exec(`
      CREATE TABLE IF NOT EXISTS billing_orders (
        id TEXT PRIMARY KEY,
        session_id TEXT UNIQUE NOT NULL,
        user_id TEXT,
        api_key TEXT,
        email TEXT,
        pack TEXT NOT NULL,
        credits INTEGER NOT NULL,
        amount INTEGER NOT NULL,
        status TEXT DEFAULT 'pending',
        created INTEGER NOT NULL,
        fulfilled INTEGER
      );
      CREATE INDEX IF NOT EXISTS idx_billing_session ON billing_orders(session_id);
      CREATE INDEX IF NOT EXISTS idx_billing_apikey ON billing_orders(api_key);
    `);
  } catch (e) {
    console.warn('[billing] schema warn:', e.message);
  }

  // POST /v1/billing/checkout — create Stripe checkout session
  app.post('/v1/billing/checkout', async (req, res) => {
    try {
      const { pack } = req.body || {};
      const packInfo = PACKS[pack];
      if (!packInfo) {
        return res.status(422).json({ ok: false, error: 'invalid_pack', valid: Object.keys(PACKS) });
      }

      // Grab identity from session or key
      const apiKey = req.apiKey || null;
      const email = req.sessionEmail || null;
      const userId = req.sessionUserId || null;

      const session = await stripe.checkout.sessions.create({
        mode: 'payment',
        line_items: [{
          quantity: 1,
          price_data: {
            currency: 'usd',
            unit_amount: packInfo.amount,
            product_data: {
              name: packInfo.name,
              description: `${packInfo.credits.toLocaleString()} credits for Slopshop API — never expire`,
              images: [`${baseUrl}/og.png`],
            },
          },
        }],
        customer_email: email || undefined,
        metadata: {
          pack,
          credits: String(packInfo.credits),
          api_key: apiKey || '',
          user_id: userId || '',
        },
        success_url: `${baseUrl}/brain?purchase=success&pack=${pack}`,
        cancel_url: `${baseUrl}/pricing`,
        allow_promotion_codes: true,
      });

      // Record pending order
      try {
        const orderId = 'ord-' + require('crypto').randomBytes(8).toString('hex');
        db.prepare(`INSERT INTO billing_orders (id, session_id, user_id, api_key, email, pack, credits, amount, status, created)
          VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'pending', ?)`
        ).run(orderId, session.id, userId, apiKey, email, pack, packInfo.credits, packInfo.amount, Date.now());
      } catch (e) { /* non-fatal */ }

      res.json({ ok: true, url: session.url, session_id: session.id });
    } catch (e) {
      console.error('[billing] checkout error:', e.message);
      res.status(500).json({ ok: false, error: e.message });
    }
  });

  // POST /v1/billing/webhook — Stripe webhook to fulfill orders
  app.post('/v1/billing/webhook', require('express').raw({ type: 'application/json' }), async (req, res) => {
    const sig = req.headers['stripe-signature'];
    const webhookSecret = process.env.STRIPE_WEBHOOK_SECRET;

    let event;
    try {
      if (webhookSecret) {
        event = stripe.webhooks.constructEvent(req.body, sig, webhookSecret);
      } else {
        event = JSON.parse(req.body);
      }
    } catch (e) {
      return res.status(400).json({ error: e.message });
    }

    if (event.type === 'checkout.session.completed') {
      const session = event.data.object;
      const { pack, credits, api_key, user_id } = session.metadata || {};
      const creditCount = parseInt(credits || '0', 10);
      const email = session.customer_email || session.customer_details?.email;

      try {
        // Find the order
        const order = db.prepare('SELECT * FROM billing_orders WHERE session_id = ?').get(session.id);
        if (order && order.status === 'fulfilled') {
          return res.json({ ok: true, already: true });
        }

        // Top up credits on api_key
        if (api_key) {
          db.prepare('UPDATE api_keys SET balance = balance + ? WHERE key = ?').run(creditCount, api_key);
        } else if (email) {
          // Find user by email, top up their key
          const user = db.prepare('SELECT api_key FROM users WHERE email = ?').get(email);
          if (user) {
            db.prepare('UPDATE api_keys SET balance = balance + ? WHERE key = ?').run(creditCount, user.api_key);
          }
        }

        // Mark fulfilled
        db.prepare('UPDATE billing_orders SET status = ?, fulfilled = ? WHERE session_id = ?')
          .run('fulfilled', Date.now(), session.id);

        console.log(`[billing] fulfilled ${creditCount} credits → ${api_key || email}`);
      } catch (e) {
        console.error('[billing] webhook fulfillment error:', e.message);
      }
    }

    res.json({ received: true });
  });

  // GET /v1/billing/orders — list user's past orders
  app.get('/v1/billing/orders', (req, res) => {
    const apiKey = req.apiKey;
    if (!apiKey) return res.status(401).json({ ok: false, error: 'unauthorized' });
    try {
      const orders = db.prepare(
        'SELECT id, pack, credits, amount, status, created, fulfilled FROM billing_orders WHERE api_key = ? ORDER BY created DESC LIMIT 50'
      ).all(apiKey);
      res.json({ ok: true, orders });
    } catch (e) {
      res.status(500).json({ ok: false, error: e.message });
    }
  });

  console.log('[billing] Stripe billing routes loaded');
};
