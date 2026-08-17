// Netlify Function: reads/writes one JSON "progress" blob per sync code.
// Uses Netlify Blobs — a key-value store that's automatically provisioned for
// every Netlify site, with zero extra accounts or config. This is what powers
// cross-device sync: two devices that share the same sync code read/write the
// same blob.
//
// GET  /.netlify/functions/progress?code=ABCD2345      -> returns stored JSON (or null)
// POST /.netlify/functions/progress?code=ABCD2345       -> body: JSON progress object, saves it

const { getStore } = require('@netlify/blobs');

// Normally Netlify injects Blobs credentials automatically. On some sites/deploys
// that automatic wiring doesn't attach, which throws "MissingBlobsEnvironmentError".
// If a BLOBS_TOKEN env var is set (Site settings -> Environment variables), use it
// to configure the store explicitly as a guaranteed-to-work fallback.
function openStore(name) {
  if (process.env.BLOBS_TOKEN) {
    return getStore({ name, consistency: 'strong', siteID: process.env.SITE_ID, token: process.env.BLOBS_TOKEN });
  }
  return getStore({ name, consistency: 'strong' });
}

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
  const store = openStore('mav-progress');

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
      if (event.body && event.body.length >
