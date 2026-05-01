/**
 * Drifting Atelier — share backend.
 *
 * Endpoints:
 *
 *   POST /upload          multipart/form-data { file }   → { url }
 *   POST /canvas          JSON canvas state               → { id }
 *   GET  /canvas/:id      Returns the canvas JSON
 *   GET  /i/:filename     Serves an uploaded image (with caching)
 *   GET  /  or /health    Health check
 *   OPTIONS *             CORS preflight
 *
 * Free tier limits at the time of writing:
 *   - Workers: 100K requests/day
 *   - R2: 10 GB storage, 1M class-A reads/month, $0 egress
 *   - KV: 100K reads/day, 1K writes/day
 *
 * That's enough for ~500 canvases shared per day before hitting limits.
 *
 * BINDINGS expected (configure in wrangler.toml):
 *   env.MEMORY_BUCKET  → R2 bucket
 *   env.MEMORY_KV      → KV namespace
 */

const ALLOWED_ORIGINS = [
  'https://razee4315.github.io',
  'http://localhost:5173',
  'http://localhost:4173',
];

const MAX_IMAGE_BYTES = 1.5 * 1024 * 1024;   // 1.5 MB per upload
const MAX_CANVAS_BYTES = 64 * 1024;           // 64 KB canvas JSON
const CANVAS_TTL_SECONDS = 60 * 60 * 24 * 365; // 1 year

export default {
  async fetch(req, env) {
    const url = new URL(req.url);
    const origin = req.headers.get('Origin') || '';
    const cors = makeCors(origin);

    if (req.method === 'OPTIONS') return new Response(null, { headers: cors });

    try {
      // --- API routes ---
      if (url.pathname === '/upload' && req.method === 'POST') {
        return wrap(cors, await handleUpload(req, env));
      }
      if (url.pathname === '/canvas' && req.method === 'POST') {
        return wrap(cors, await handleSaveCanvas(req, env));
      }
      const m = url.pathname.match(/^\/canvas\/([A-Za-z0-9_-]{4,32})$/);
      if (m && req.method === 'GET') {
        return wrap(cors, await handleGetCanvas(m[1], env));
      }
      // --- Image proxy ---
      const imgMatch = url.pathname.match(/^\/i\/([A-Za-z0-9_-]+\.[a-z]+)$/);
      if (imgMatch && req.method === 'GET') {
        return wrap(cors, await handleGetImage(imgMatch[1], env));
      }
      // --- Health ---
      if (url.pathname === '/' || url.pathname === '/health') {
        return wrap(cors, json({ ok: true, service: 'drifting-atelier' }));
      }
      return wrap(cors, json({ error: 'not found' }, 404));
    } catch (e) {
      return wrap(cors, json({ error: e.message || 'internal error' }, 500));
    }
  },
};

// ---------- Routes ----------

async function handleUpload(req, env) {
  const form = await req.formData();
  const file = form.get('file');
  if (!file || typeof file === 'string') return json({ error: 'no file' }, 400);
  if (file.size > MAX_IMAGE_BYTES) {
    return json({ error: `file too large (${Math.round(file.size / 1024)}KB > ${MAX_IMAGE_BYTES / 1024}KB)` }, 413);
  }
  const ext = sanitizeExt((file.type || '').split('/')[1] || 'bin');
  if (!['png', 'jpeg', 'jpg', 'webp', 'gif'].includes(ext)) {
    return json({ error: `unsupported type: ${file.type}` }, 415);
  }
  const id = randomId(20);
  const key = `i/${id}.${ext}`;
  await env.MEMORY_BUCKET.put(key, file.stream(), {
    httpMetadata: { contentType: file.type },
  });
  return json({
    url: `${new URL(req.url).origin}/i/${id}.${ext}`,
    key,
  });
}

async function handleSaveCanvas(req, env) {
  const text = await req.text();
  if (text.length > MAX_CANVAS_BYTES) {
    return json({ error: `canvas too large (${text.length} > ${MAX_CANVAS_BYTES} bytes)` }, 413);
  }
  let body;
  try { body = JSON.parse(text); } catch { return json({ error: 'invalid JSON' }, 400); }
  if (!body || typeof body !== 'object') return json({ error: 'invalid canvas' }, 400);
  const id = randomId(8);
  await env.MEMORY_KV.put(`c/${id}`, text, { expirationTtl: CANVAS_TTL_SECONDS });
  return json({ id });
}

async function handleGetCanvas(id, env) {
  const text = await env.MEMORY_KV.get(`c/${id}`);
  if (!text) return json({ error: 'not found' }, 404);
  return new Response(text, {
    status: 200,
    headers: { 'Content-Type': 'application/json', 'Cache-Control': 'public, max-age=300' },
  });
}

async function handleGetImage(filename, env) {
  const obj = await env.MEMORY_BUCKET.get(`i/${filename}`);
  if (!obj) return json({ error: 'not found' }, 404);
  const headers = new Headers();
  obj.writeHttpMetadata(headers);
  headers.set('Cache-Control', 'public, max-age=31536000, immutable');
  headers.set('etag', obj.httpEtag);
  return new Response(obj.body, { status: 200, headers });
}

// ---------- Helpers ----------

function makeCors(origin) {
  const allowed = ALLOWED_ORIGINS.includes(origin) ? origin : ALLOWED_ORIGINS[0];
  return {
    'Access-Control-Allow-Origin': allowed,
    'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type',
    'Access-Control-Max-Age': '86400',
    'Vary': 'Origin',
  };
}

function wrap(cors, response) {
  const newHeaders = new Headers(response.headers);
  for (const [k, v] of Object.entries(cors)) newHeaders.set(k, v);
  return new Response(response.body, { status: response.status, headers: newHeaders });
}

function json(obj, status = 200) {
  return new Response(JSON.stringify(obj), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}

function sanitizeExt(s) {
  return String(s).toLowerCase().replace(/[^a-z0-9]/g, '').slice(0, 5);
}

function randomId(len = 8) {
  const alphabet = 'abcdefghjkmnpqrstuvwxyz23456789'; // no ambiguous chars
  let out = '';
  const bytes = new Uint8Array(len);
  crypto.getRandomValues(bytes);
  for (let i = 0; i < len; i++) out += alphabet[bytes[i] % alphabet.length];
  return out;
}
