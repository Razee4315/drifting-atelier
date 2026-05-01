/**
 * Storage adapter — saves a shared canvas (positions + custom images + notes)
 * and returns a URL that opens it on any device.
 *
 * Two backends, picked at runtime:
 *
 *   1. **Cloudflare Worker** (preferred) — if WORKER_URL is set, uploads
 *      blobs to R2 and stores canvas JSON in KV. Returns a short ID URL like
 *      "?c=abc123". Supports any number of images.
 *
 *   2. **URL fragment fallback** — if no worker is configured (or it errors),
 *      we LZ-compress the entire canvas (including base64 images) and stuff
 *      it into the URL hash. Works for ~3-4 small images max before the URL
 *      gets too long (most browsers cap around 2KB).
 */

// Read worker URL from a global set in index.html, or from build-time env.
// Empty string = no worker, falls back to URL fragment.
const WORKER_URL = (
  (typeof window !== 'undefined' && window.__DRIFTING_WORKER_URL__) ||
  import.meta.env.VITE_WORKER_URL ||
  ''
).replace(/\/$/, '');

const FRAGMENT_MAX_BYTES = 8000; // browsers vary; ~8KB is safe

export function hasWorker() {
  return Boolean(WORKER_URL);
}

/**
 * Upload an image blob/dataURL to the worker; returns a permanent URL.
 * If no worker is configured, returns the dataURL itself (will be embedded
 * inline when the canvas is serialized).
 */
export async function uploadImage(blobOrDataUrl, filename = 'image.png') {
  if (!WORKER_URL) {
    // No worker: pass through the dataURL; serialize() will inline it.
    return typeof blobOrDataUrl === 'string'
      ? blobOrDataUrl
      : await blobToDataUrl(blobOrDataUrl);
  }
  let blob = blobOrDataUrl;
  if (typeof blobOrDataUrl === 'string') blob = await dataUrlToBlob(blobOrDataUrl);

  const fd = new FormData();
  fd.append('file', blob, filename);
  const res = await fetch(`${WORKER_URL}/upload`, { method: 'POST', body: fd });
  if (!res.ok) throw new Error(`upload failed: ${res.status}`);
  const json = await res.json();
  return json.url;
}

/**
 * Save a canvas JSON. Returns a share URL.
 * Tries the worker first; falls back to URL fragment for tiny canvases.
 */
export async function saveCanvas(canvasJson) {
  const baseUrl = `${location.origin}${location.pathname}`;

  if (WORKER_URL) {
    try {
      const res = await fetch(`${WORKER_URL}/canvas`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(canvasJson),
      });
      if (res.ok) {
        const { id } = await res.json();
        return `${baseUrl}?c=${id}`;
      }
    } catch (e) {
      console.warn('worker save failed, falling back to URL fragment', e);
    }
  }

  // URL fragment fallback — only viable if compressed payload fits
  const compressed = await compressJson(canvasJson);
  if (compressed.length > FRAGMENT_MAX_BYTES) {
    throw new Error(
      `Canvas is too big to share via URL alone (${Math.round(compressed.length / 1024)}KB). ` +
      'Configure a Cloudflare Worker backend to share larger canvases.'
    );
  }
  return `${baseUrl}#s=${compressed}`;
}

/**
 * Try to load a shared canvas from the current URL.
 * Returns null if no shared canvas in the URL.
 */
export async function loadFromUrl() {
  // Worker-backed: ?c=ID
  const params = new URLSearchParams(location.search);
  const id = params.get('c');
  if (id && WORKER_URL) {
    try {
      const res = await fetch(`${WORKER_URL}/canvas/${encodeURIComponent(id)}`);
      if (res.ok) return await res.json();
    } catch (e) {
      console.warn('worker load failed', e);
    }
  }

  // Fragment-backed: #s=DATA
  const hash = location.hash.replace(/^#/, '');
  if (hash.startsWith('s=')) {
    try {
      return await decompressJson(hash.slice(2));
    } catch (e) {
      console.warn('fragment decode failed', e);
    }
  }
  return null;
}

// ---------- helpers ----------

async function compressJson(obj) {
  const json = JSON.stringify(obj);
  // Use built-in CompressionStream + base64
  const stream = new Blob([json]).stream().pipeThrough(new CompressionStream('deflate-raw'));
  const buf = await new Response(stream).arrayBuffer();
  return base64UrlEncode(new Uint8Array(buf));
}
async function decompressJson(b64) {
  const bytes = base64UrlDecode(b64);
  const stream = new Blob([bytes]).stream().pipeThrough(new DecompressionStream('deflate-raw'));
  const text = await new Response(stream).text();
  return JSON.parse(text);
}

function base64UrlEncode(bytes) {
  let bin = '';
  for (let i = 0; i < bytes.length; i++) bin += String.fromCharCode(bytes[i]);
  return btoa(bin).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}
function base64UrlDecode(s) {
  s = s.replace(/-/g, '+').replace(/_/g, '/');
  while (s.length % 4) s += '=';
  const bin = atob(s);
  const bytes = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
  return bytes;
}

function blobToDataUrl(blob) {
  return new Promise((resolve, reject) => {
    const r = new FileReader();
    r.onload = () => resolve(r.result);
    r.onerror = reject;
    r.readAsDataURL(blob);
  });
}
async function dataUrlToBlob(dataUrl) {
  const r = await fetch(dataUrl);
  return await r.blob();
}
