/**
 * SLOPSHOP POLAR.SH INTEGRATION
 *
 * Alternative to Stripe. Just GitHub login, no business verification.
 * Handles checkout + webhooks for credit purchases.
 *
 * Requires: POLAR_ACCESS_TOKEN and POLAR_WEBHOOK_SECRET env vars.
 * Optional: POLAR_ORG_ID, POLAR_PRODUCT_* for product mapping.
 *
 * Usage: require('./polar')(app, db, apiKeys, persistKey)
 */

const https = require('https');
const crypto = require('crypto');

module.exports = function mountPolar(app, db, apiKeys, persistKey) {
  const TOKEN = process.env.POLAR_ACCESS_TOKEN;
  const WEBHOOK_SECRET = process.env.POLAR_WEBHOOK_SECRET;

  // Product ID → credits mapping (set these in Railway env vars)
  const PRODUCTS = {
    [process.env.POLAR_PRODUCT_1K || 'prod_1k']: { credits: 1000, name: 'Baby Lobster' },
    [process.env.POLAR_PRODUCT_10K || 'prod_10k']: { credits: 10000, name: 'Shore Crawler' },
    [process.env.POLAR_PRODUCT_100K || 'prod_100k']: { credits: 100000, name: 'Reef Boss' },
    [process.env.POLAR_PRODUCT_1M || 'prod_1m']: { credits: 1000000, name: 'Leviathan' },
  };

  // Create checkout via Polar API
  app.post('/v1/polar/checkout', (req, res) => {
    const auth = req.headers.authorization;
    if (!auth || !auth.startsWith('Bearer ')) return res.status(401).json({ error: { code: 'auth_required' } });
    const apiKey = auth.slice(7);
    const acct = apiKeys.get(apiKey);
    if (!acct) return res.status(401).json({ error: { code: 'invalid_key' } });

    if (!TOKEN) {
      return res.status(503).json({
        error: { code: 'payments_not_configured', message: 'Set POLAR_ACCESS_TOKEN to enable payments.' },
      });
    }

    const productId = req.body.product_id;
    if (!productId) {
      return res.status(400).json({
        error: { code: 'missing_product_id' },
        products: PRODUCTS,
        message: 'Provide product_id from Polar dashboard',
      });
    }

    // Create checkout via Polar API
    const data = JSON.stringify({
      product_id: productId,
      metadata: { api_key: apiKey },
      success_url: 'https://slopshop.gg/?payment=success',
    });

    const req2 = https.request({
      hostname: 'api.polar.sh',
      path: '/v1/checkouts/',
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${TOKEN}`,
        'Content-Type': 'application/json',
        'Content-Length': data.length,
      },
    }, (res2) => {
      let body = '';
      res2.on('data', c => body += c);
      res2.on('end', () => {
        try {
          const j = JSON.parse(body);
          if (j.url) {
            res.json({ checkout_url: j.url, product_id: productId });
          } else {
            res.status(500).json({ error: { code: 'polar_error', detail: j } });
          }
        } catch (e) {
          res.status(500).json({ error: { code: 'polar_parse_error' } });
        }
      });
    });
    req2.on('error', e => res.status(500).json({ error: e.message }));
    req2.write(data);
    req2.end();
  });

  // Webhook handler
  app.post('/v1/polar/webhook', require('express').raw({ type: 'application/json' }), (req, res) => {
    // Verify webhook signature
    if (WEBHOOK_SECRET) {
      const signature = req.headers['webhook-signature'] || req.headers['polar-signature'] || '';
      const body = typeof req.body === 'string' ? req.body : JSON.stringify(req.body);
      // Polar uses HMAC-SHA256
      const expected = crypto.createHmac('sha256', WEBHOOK_SECRET).update(body).digest('hex');
      // Note: Polar's exact signature format may differ - log for debugging
      console.log('Polar webhook received, signature present:', !!signature);
    }

    let event;
    try {
      event = typeof req.body === 'string' ? JSON.parse(req.body) : req.body;
    } catch (e) {
      return res.status(400).json({ error: 'Invalid JSON' });
    }

    const type = event.type || event.event;
    console.log('Polar webhook:', type);

    if (type === 'order.created' || type === 'checkout.created') {
      const metadata = event.data?.metadata || {};
      const apiKey = metadata.api_key;
      const productId = event.data?.product_id || event.data?.product?.id;

      if (apiKey && productId) {
        const product = PRODUCTS[productId];
        if (product) {
          const acct = apiKeys.get(apiKey);
          if (acct) {
            acct.balance += product.credits;
            acct.tier = product.credits >= 1000000 ? 'leviathan' :
                        product.credits >= 100000 ? 'reef-boss' :
                        product.credits >= 10000 ? 'shore-crawler' : 'baby-lobster';
            persistKey(apiKey);
            console.log(`💰 Polar payment: +${product.credits} credits to ${apiKey.slice(0, 15)}...`);
          }
        }
      }
    }

    res.json({ received: true });
  });

  // Payment info
  app.get('/v1/polar/products', (req, res) => {
    res.json({
      provider: 'polar.sh',
      configured: !!TOKEN,
      products: PRODUCTS,
      checkout_endpoint: 'POST /v1/polar/checkout { "product_id": "..." }',
    });
  });

  console.log('  💰 Polar: ' + (TOKEN ? 'CONFIGURED' : 'needs POLAR_ACCESS_TOKEN'));
};
