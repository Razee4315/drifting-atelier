/**
 * Drop your own images onto the canvas. They get washi-taped at the drop spot,
 * become draggable like any other piece, and persist in localStorage so they
 * come back next visit.
 *
 * Limits: PNG/JPEG/WebP, < 800KB after read (so localStorage doesn't choke).
 */

const KEY = 'drifting-atelier:user-pieces:v1';
const MAX_BYTES = 800 * 1024;

let onDropCallback = null;
let toastTimer = null;

export function setupUserDrop({ onDrop }) {
  onDropCallback = onDrop;

  // Prevent the browser from opening the dropped image as a tab
  ['dragenter', 'dragover', 'drop'].forEach(ev => {
    window.addEventListener(ev, (e) => e.preventDefault());
  });

  let dragDepth = 0;
  window.addEventListener('dragenter', (e) => {
    if (!hasImageItem(e.dataTransfer)) return;
    dragDepth++;
    document.body.classList.add('dragging-image');
  });
  window.addEventListener('dragleave', () => {
    dragDepth = Math.max(0, dragDepth - 1);
    if (dragDepth === 0) document.body.classList.remove('dragging-image');
  });
  window.addEventListener('drop', async (e) => {
    dragDepth = 0;
    document.body.classList.remove('dragging-image');
    const files = [...(e.dataTransfer?.files || [])].filter(f => f.type.startsWith('image/'));
    if (files.length === 0) return;
    for (const file of files) {
      await handleDroppedFile(file, e.clientX, e.clientY);
    }
  });
}

function hasImageItem(dt) {
  if (!dt) return false;
  for (const item of dt.items || []) {
    if (item.kind === 'file' && item.type.startsWith('image/')) return true;
  }
  return true; // be permissive on dragover (we don't always have type info)
}

async function handleDroppedFile(file, screenX, screenY) {
  if (file.size > MAX_BYTES) {
    showToast(`"${file.name}" is too big (${Math.round(file.size/1024)}KB > 800KB).`);
    return;
  }
  const dataUrl = await readAsDataUrl(file);
  // Get image dimensions
  const dims = await imageDims(dataUrl);
  const piece = {
    id: 'user-' + Date.now() + '-' + Math.floor(Math.random() * 1000),
    src: dataUrl,
    zone: 'user',
    w: dims.w,
    h: dims.h,
    isUser: true,
    droppedAtScreen: { x: screenX, y: screenY },
  };
  if (onDropCallback) onDropCallback(piece);
  persistUserPiece(piece);
  showToast('pinned to the wall');
}

function readAsDataUrl(file) {
  return new Promise((resolve, reject) => {
    const r = new FileReader();
    r.onload = () => resolve(r.result);
    r.onerror = reject;
    r.readAsDataURL(file);
  });
}
function imageDims(dataUrl) {
  return new Promise((resolve) => {
    const img = new Image();
    img.onload = () => resolve({ w: img.naturalWidth, h: img.naturalHeight });
    img.src = dataUrl;
  });
}

// ---------- Persistence ----------

export function loadUserPieces() {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return [];
    return JSON.parse(raw);
  } catch { return []; }
}

function persistUserPiece(piece) {
  try {
    const all = loadUserPieces();
    all.push({
      id: piece.id,
      src: piece.src,
      w: piece.w,
      h: piece.h,
      x: piece.x,
      y: piece.y,
      rot: piece.rot,
    });
    localStorage.setItem(KEY, JSON.stringify(all));
  } catch (e) {
    showToast('storage full — try removing something');
  }
}

export function clearUserPieces() {
  try { localStorage.removeItem(KEY); } catch {}
}

// ---------- Toast ----------

function showToast(message) {
  let toast = document.getElementById('user-toast');
  if (!toast) {
    toast = document.createElement('div');
    toast.id = 'user-toast';
    toast.className = 'user-toast';
    document.body.appendChild(toast);
  }
  toast.textContent = message;
  toast.classList.add('visible');
  if (toastTimer) clearTimeout(toastTimer);
  toastTimer = setTimeout(() => toast.classList.remove('visible'), 2400);
}
