/**
 * Discovery glow — when you visit a zone for the first time, a soft warm
 * pulse fills the screen + chime plays. Tracked in localStorage so the
 * "first visit" feeling only happens once per zone, not every time you wander.
 */

const KEY = 'drifting-atelier:discovered:v1';

let visited = new Set();
let onFirstDiscoveryCallback = null;

export function setupDiscovery({ onFirstDiscovery }) {
  onFirstDiscoveryCallback = onFirstDiscovery;
  try {
    const raw = localStorage.getItem(KEY);
    if (raw) visited = new Set(JSON.parse(raw));
  } catch {}
}

export function checkDiscovery(zoneId, zoneName) {
  if (!zoneId || zoneId === 'unknown') return;
  if (visited.has(zoneId)) return;
  visited.add(zoneId);
  try { localStorage.setItem(KEY, JSON.stringify([...visited])); } catch {}
  triggerGlow();
  if (onFirstDiscoveryCallback) onFirstDiscoveryCallback(zoneName);
}

export function totalDiscovered() {
  return visited.size;
}

function triggerGlow() {
  let glow = document.getElementById('discovery-glow');
  if (!glow) {
    glow = document.createElement('div');
    glow.id = 'discovery-glow';
    glow.className = 'discovery-glow';
    document.body.appendChild(glow);
  }
  glow.classList.remove('on');
  // restart animation
  void glow.offsetWidth;
  glow.classList.add('on');
}

export function showDiscoveryToast(zoneName) {
  let toast = document.getElementById('discovery-toast');
  if (!toast) {
    toast = document.createElement('div');
    toast.id = 'discovery-toast';
    toast.className = 'discovery-toast';
    document.body.appendChild(toast);
  }
  toast.innerHTML = `<span class="dt-eyebrow">discovered</span><span class="dt-name">${escape(zoneName)}</span>`;
  toast.classList.remove('on');
  void toast.offsetWidth;
  toast.classList.add('on');
  setTimeout(() => toast.classList.remove('on'), 3200);
}

function escape(s) {
  return String(s).replace(/[<>&"']/g, c => ({ '<':'&lt;','>':'&gt;','&':'&amp;','"':'&quot;',"'":'&#39;' }[c]));
}
