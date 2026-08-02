// Netlify Function: reads/writes one JSON "progress" blob per sync code.
// Uses Netlify Blobs — a key-value store that's automatically provisioned for
// every Netlify site, with zero extra accounts or config. This is what powers
// cross-device sync: two devices that share the same sync code read/write the
// same blob.
//
// GET  /.netlify/functions/progress?code=ABCD2345      -> returns stored JSON (or null)
// POST /.netlify/functions/progress?code=ABCD2345       -> body: JSON progress object, saves it

const { getStore } = require('@netlify/blobs');

const CODE_RE = /^[A-Z2-9]{8}$/; // matches the codes generated client-side
const MAX_BODY_BYTES = 300000; // generous ceiling; a typical progress payload is a few KB

const CORS_HEADERS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'Content-Type',
  'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
};

exports.handler = async (event) => {
  if (event.httpMethod === 'OPTIONS') {
    return { statusCode: 204, headers: CORS_HEADERS, body: '' };
  }

  const code = ((event.queryStringParameters && event.queryStringParameters.code) || '')
    .trim()
    .toUpperCase();

  if (!CODE_RE.test(code)) {
    return {
      statusCode: 400,
      headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' },
      body: JSON.stringify({ error: 'Invalid or missing sync code' }),
    };
  }

  // Strong consistency avoids the (up to ~60s) eventual-consistency propagation
  // window — worth the small overhead given how infrequently this is called.
  const store = getStore({ name: 'mav-progress', consistency: 'strong' });

  try {
    if (event.httpMethod === 'GET') {
      const data = await store.get(code, { type: 'json' });
      return {
        statusCode: 200,
        headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' },
        body: JSON.stringify(data || null),
      };
    }

    if (event.httpMethod === 'POST') {
      if (event.body && event.body.length > MAX_BODY_BYTES) {
        return {
          statusCode: 413,
          headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' },
          body: JSON.stringify({ error: 'Payload too large' }),
        };
      }
      let payload;
      try {
        payload = JSON.parse(event.body || '{}');
      } catch (e) {
        return {
          statusCode: 400,
          headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' },
          body: JSON.stringify({ error: 'Body must be valid JSON' }),
        };
      }
      payload.updatedAt = Date.now();
      await store.setJSON(code, payload);
      return {
        statusCode: 200,
        headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' },
        body: JSON.stringify({ ok: true, updatedAt: payload.updatedAt }),
      };
    }

    return {
      statusCode: 405,
      headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' },
      body: JSON.stringify({ error: 'Method not allowed' }),
    };
  } catch (err) {
    return {
      statusCode: 500,
      headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' },
      body: JSON.stringify({ error: 'Server error', detail: String(err && err.message || err) }),
    };
  }
};
