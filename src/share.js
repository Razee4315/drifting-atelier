/**
 * Share modal — serializes the current canvas (positions + custom user
 * pieces + sticky notes) and produces a shareable URL.
 */
import { saveCanvas, uploadImage, hasWorker } from './storage.js';

let getPiecesFn = null;

export function setupShare({ getPieces }) {
  getPiecesFn = getPieces;

  const shareBtn = document.getElementById('btn-share');
  const modal = document.getElementById('share-modal');
  const makeBtn = document.getElementById('share-make');
  const copyBtn = document.getElementById('share-copy');
  const linkInput = document.getElementById('share-link');
  const linkRow = document.getElementById('share-link-row');
  const status = document.getElementById('share-status');

  if (!shareBtn || !modal) return;

  const open = () => {
    modal.classList.remove('hidden');
    status.textContent = '';
    status.classList.remove('error');
    linkRow.classList.add('hidden');
  };
  const close = () => modal.classList.add('hidden');

  shareBtn.addEventListener('click', open);
  modal.addEventListener('click', (e) => {
    if (e.target === modal || e.target.matches('[data-close]')) close();
  });
  window.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && !modal.classList.contains('hidden')) close();
  });

  makeBtn.addEventListener('click', async () => {
    makeBtn.disabled = true;
    status.classList.remove('error');
    status.textContent = 'packing your studio…';
    try {
      const fromName = document.getElementById('share-from').value.trim();
      const toName = document.getElementById('share-to').value.trim();
      const message = document.getElementById('share-message').value.trim();
      const canvas = await serializeCanvas(getPiecesFn(), { from: fromName, to: toName, message });
      status.textContent = hasWorker()
        ? 'uploading to the cloud…'
        : 'packing into a self-contained URL…';
      const url = await saveCanvas(canvas);
      linkInput.value = url;
      linkRow.classList.remove('hidden');
      status.textContent = 'link is ready — copy and send it';
    } catch (e) {
      console.error(e);
      status.classList.add('error');
      status.textContent = e.message || 'something broke. try again?';
    } finally {
      makeBtn.disabled = false;
    }
  });

  copyBtn.addEventListener('click', async () => {
    const v = linkInput.value;
    if (!v) return;
    try {
      await navigator.clipboard.writeText(v);
      copyBtn.textContent = 'copied!';
      setTimeout(() => (copyBtn.textContent = 'copy'), 1600);
    } catch {
      linkInput.select();
      document.execCommand('copy');
      copyBtn.textContent = 'copied!';
      setTimeout(() => (copyBtn.textContent = 'copy'), 1600);
    }
  });
}

/**
 * Build a portable canvas JSON. Includes:
 *   - positions of every built-in piece (so the recipient sees the same arrangement)
 *   - all user-uploaded pieces (with image data uploaded to backend if available)
 *   - all sticky notes
 *   - greeting metadata (from / to / message)
 */
async function serializeCanvas(pieces, meta) {
  const out = {
    v: 1,
    createdAt: Date.now(),
    from: meta.from || null,
    to: meta.to || null,
    message: meta.message || null,
    builtin: [],   // [{id, x, y, rot, scale, z}]
    custom: [],    // [{kind, src, w, h, x, y, rot, scale, z, text?, colorIdx?}]
  };

  for (const p of pieces) {
    if (p.isUser || p.isNote) {
      // Upload the image so it lives on the backend (or inline as dataURL if no worker)
      let src = p.src;
      try {
        if (src && src.startsWith('data:')) {
          src = await uploadImage(src, p.id + '.png');
        }
      } catch (e) {
        // Keep the dataURL — it will be inlined
      }
      out.custom.push({
        kind: p.isNote ? 'note' : 'image',
        src,
        w: p.w, h: p.h,
        x: round2(p.x), y: round2(p.y),
        rot: round2(p.rot),
        scale: round2(p.scale),
        z: p.zIndex,
        text: p.text || null,
        colorIdx: p.colorIdx ?? null,
      });
    } else {
      out.builtin.push({
        id: p.id,
        x: round2(p.x), y: round2(p.y),
        rot: round2(p.rot),
        scale: round2(p.scale),
        z: p.zIndex,
      });
    }
  }
  return out;
}

function round2(n) { return Math.round(n * 100) / 100; }
