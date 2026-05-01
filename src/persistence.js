/**
 * Save & load piece positions to localStorage so visitors can curate their own studio.
 */

const KEY = 'drifting-atelier:layout:v1';
const MODE_KEY = 'drifting-atelier:mode:v1';
const SAVE_DEBOUNCE_MS = 800;

let saveTimer = null;

export function loadLayout() {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return null;
    const data = JSON.parse(raw);
    if (!data || !data.pieces) return null;
    return data; // { pieces: { [id]: { x, y, rot } }, savedAt }
  } catch (e) {
    return null;
  }
}

export function applySavedLayout(pieces, saved) {
  if (!saved || !saved.pieces) return 0;
  let applied = 0;
  for (const p of pieces) {
    const s = saved.pieces[p.id];
    if (!s) continue;
    p.x = s.x;
    p.y = s.y;
    p.rot = s.rot;
    if (typeof s.zIndex === 'number') p.zIndex = s.zIndex;
    applied++;
  }
  return applied;
}

export function scheduleSave(pieces) {
  if (saveTimer) clearTimeout(saveTimer);
  saveTimer = setTimeout(() => saveNow(pieces), SAVE_DEBOUNCE_MS);
}

export function saveNow(pieces) {
  try {
    const map = {};
    for (const p of pieces) {
      map[p.id] = { x: p.x, y: p.y, rot: p.rot, zIndex: p.zIndex };
    }
    localStorage.setItem(KEY, JSON.stringify({ pieces: map, savedAt: Date.now() }));
  } catch (e) {
    console.warn('Could not save layout', e);
  }
}

export function clearLayout() {
  try { localStorage.removeItem(KEY); } catch {}
}

export function loadMode() {
  try { return localStorage.getItem(MODE_KEY); } catch { return null; }
}

export function saveMode(mode) {
  try { localStorage.setItem(MODE_KEY, mode); } catch {}
}
